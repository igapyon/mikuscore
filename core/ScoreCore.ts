import { getCommandNodeId, isUiOnlyCommand } from "./commands";
import type {
  CoreCommand,
  DispatchResult,
  Diagnostic,
  NodeId,
  SaveResult,
  ScoreCoreOptions,
  Warning,
} from "./interfaces";
import { getMeasureTimingForVoice } from "./timeIndex";
import {
  createRestElement,
  createNoteElement,
  ensureVoiceValue,
  findAncestorMeasure,
  getDurationValue,
  getVoiceText,
  measureHasBackupOrForward,
  replaceWithRestNote,
  parseXml,
  reindexNodeIds,
  serializeXml,
  getDurationNotationHint,
  setDurationValue,
  setPitch,
} from "./xmlUtils";
import {
  validateBackupForwardBoundaryForStructuralEdit,
  validateCommandPayload,
  validateInsertLaneBoundary,
  validateProjectedMeasureTiming,
  validateSupportedNoteKind,
  validateTargetVoiceMatch,
  validateVoice,
} from "./validators";
import { pickStaffByPitchWithHysteresis } from "./staffClefPolicy";

export class ScoreCore {
  private readonly editableVoice: string | null;
  private originalXml = "";
  private doc: XMLDocument | null = null;
  private dirty = false;

  // Node identity is kept outside XML with WeakMap as required by spec.
  private nodeToId = new WeakMap<Node, NodeId>();
  private idToNode = new Map<NodeId, Element>();
  private nodeCounter = 0;

  public constructor(options: ScoreCoreOptions = {}) {
    const rawEditableVoice = String(options.editableVoice ?? "").trim();
    this.editableVoice = rawEditableVoice || null;
  }

  public load(xml: string): void {
    this.originalXml = xml;
    this.doc = parseXml(xml);
    this.dirty = false;
    this.reindex();
  }

  public dispatch(command: CoreCommand): DispatchResult {
    if (!this.doc) {
      return this.fail("MVP_SCORE_NOT_LOADED", "Score is not loaded.");
    }
    if (isUiOnlyCommand(command)) {
      return {
        ok: true,
        dirtyChanged: false,
        changedNodeIds: [],
        affectedMeasureNumbers: [],
        diagnostics: [],
        warnings: [],
      };
    }

    const voiceDiagnostic = validateVoice(command, this.editableVoice);
    if (voiceDiagnostic) return this.failWith(voiceDiagnostic);

    const payloadDiagnostic = validateCommandPayload(command);
    if (payloadDiagnostic) return this.failWith(payloadDiagnostic);

    const targetId = getCommandNodeId(command);
    if (!targetId) {
      return this.fail("MVP_COMMAND_TARGET_MISSING", "Command target is missing.");
    }
    const target = this.idToNode.get(targetId);
    if (!target) return this.fail("MVP_TARGET_NOT_FOUND", `Unknown nodeId: ${targetId}`);

    const noteKindDiagnostic = validateSupportedNoteKind(command, target);
    if (noteKindDiagnostic) return this.failWith(noteKindDiagnostic);

    const targetVoiceDiagnostic = validateTargetVoiceMatch(command, target);
    if (targetVoiceDiagnostic) return this.failWith(targetVoiceDiagnostic);

    const bfDiagnostic = validateBackupForwardBoundaryForStructuralEdit(command, target);
    if (bfDiagnostic) return this.failWith(bfDiagnostic);

    const laneDiagnostic = validateInsertLaneBoundary(command, target);
    if (laneDiagnostic) return this.failWith(laneDiagnostic);

    const snapshot = serializeXml(this.doc);
    const warnings: Warning[] = [];
    let insertedNode: Element | null = null;
    let removedNodeId: NodeId | null = null;
    const affectedMeasureNumbers = this.collectAffectedMeasureNumbers(target);

    try {
      if (
        command.type === "change_to_pitch" ||
        command.type === "change_duration" ||
        command.type === "delete_note" ||
        command.type === "split_note"
      ) {
        ensureVoiceValue(target, command.voice);
      }
      if (command.type === "change_to_pitch") {
        setPitch(target, command.pitch);
        autoAssignGrandStaffByPitch(target);
      } else if (command.type === "change_duration") {
        const durationNotation = getDurationNotationHint(target, command.duration);
        if (
          durationNotation?.triplet &&
          !measureVoiceHasTupletContext(target, command.voice)
        ) {
          return this.fail(
            "MVP_INVALID_COMMAND_PAYLOAD",
            "Tuplet durations are not allowed because this measure/voice has no tuplet context."
          );
        }
        const oldDuration = getDurationValue(target) ?? 0;
        const timing = getMeasureTimingForVoice(target, command.voice);
        let underfullDelta = 0;
        let projectedWarning: Warning | null = null;
        if (timing) {
          const projected = timing.occupied - oldDuration + command.duration;
          const overflow = projected - timing.capacity;
          if (overflow > 0) {
            const consumedAfter = consumeFollowingRestsForDurationExpansion(
              target,
              command.voice,
              overflow
            );
            const remainingAfter = overflow - consumedAfter;
            const consumedBefore = remainingAfter > 0
              ? consumePrecedingRestsForDurationExpansion(target, command.voice, remainingAfter)
              : 0;
            const consumed = consumedAfter + consumedBefore;
            if (consumed < overflow) {
              const result = validateProjectedMeasureTiming(target, command.voice, projected);
              if (result.diagnostic) {
                this.restoreFrom(snapshot);
                return this.failWith(result.diagnostic);
              }
            }
          }
          const timingAfterRestAdjust = getMeasureTimingForVoice(target, command.voice);
          const adjustedProjected = timingAfterRestAdjust
            ? timingAfterRestAdjust.occupied - oldDuration + command.duration
            : projected;
          const result = validateProjectedMeasureTiming(
            target,
            command.voice,
            adjustedProjected
          );
          if (result.diagnostic) {
            this.restoreFrom(snapshot);
            return this.failWith(result.diagnostic);
          }
          projectedWarning = result.warning;
          if (adjustedProjected < timing.capacity) {
            underfullDelta = timing.capacity - adjustedProjected;
          }
        }
        setDurationValue(target, command.duration);
        if (underfullDelta > 0) {
          const filled = fillUnderfullGapAfterTarget(target, command.voice, underfullDelta);
          if (!filled && projectedWarning) {
            warnings.push(projectedWarning);
          }
        } else if (projectedWarning) {
          warnings.push(projectedWarning);
        }
      } else if (command.type === "split_note") {
        const timingBeforeSplit = getMeasureTimingForVoice(target, command.voice);
        const currentDuration = getDurationValue(target);
        if (!Number.isInteger(currentDuration) || (currentDuration ?? 0) <= 1) {
          return this.fail(
            "MVP_INVALID_COMMAND_PAYLOAD",
            "split_note requires duration >= 2."
          );
        }
        if ((currentDuration as number) % 2 !== 0) {
          return this.fail(
            "MVP_INVALID_COMMAND_PAYLOAD",
            "split_note requires an even duration value."
          );
        }
        const half = (currentDuration as number) / 2;
        const duplicated = target.cloneNode(true) as Element;
        // Attach clone first so duration->notation sync can resolve measure divisions.
        target.after(duplicated);
        setDurationValue(target, half);
        setDurationValue(duplicated, half);
        insertedNode = duplicated;
        if (timingBeforeSplit) {
          const timingAfterSplit = getMeasureTimingForVoice(target, command.voice);
          if (!timingAfterSplit) {
            this.restoreFrom(snapshot);
            return this.fail("MVP_COMMAND_EXECUTION_FAILED", "Failed to validate split timing.");
          }
          if (timingAfterSplit.occupied !== timingBeforeSplit.occupied) {
            this.restoreFrom(snapshot);
            return this.fail(
              "MVP_COMMAND_EXECUTION_FAILED",
              "Split changed lane timing unexpectedly near backup/forward boundary."
            );
          }
          const timingValidation = validateProjectedMeasureTiming(
            target,
            command.voice,
            timingAfterSplit.occupied
          );
          if (timingValidation.diagnostic) {
            this.restoreFrom(snapshot);
            return this.failWith(timingValidation.diagnostic);
          }
        }
      } else if (command.type === "insert_note_after") {
        const timing = getMeasureTimingForVoice(target, command.voice);
        if (timing) {
          const projected = timing.occupied + command.note.duration;
          const result = validateProjectedMeasureTiming(target, command.voice, projected);
          if (result.diagnostic) return this.failWith(result.diagnostic);
          if (result.warning) warnings.push(result.warning);
        }
        const note = createNoteElement(
          this.doc,
          command.voice,
          command.note.duration,
          command.note.pitch
        );
        target.after(note);
        insertedNode = note;
      } else if (command.type === "delete_note") {
        const nextChordTone = findImmediateNextChordTone(target);
        if (nextChordTone) {
          // Deleting a chord head must not inject a timed rest.
          // Promote the next chord tone to chord head and remove only target pitch.
          const chordMarker = nextChordTone.querySelector(":scope > chord");
          if (chordMarker) chordMarker.remove();
          target.remove();
          removedNodeId = targetId;
        } else {
          const duration = getDurationValue(target);
          if (duration === null || duration <= 0) {
            return this.fail("MVP_INVALID_NOTE_DURATION", "Target note has invalid duration.");
          }
          replaceWithRestNote(target, command.voice, duration);
        }
      }
    } catch {
      this.restoreFrom(snapshot);
      return this.fail("MVP_COMMAND_EXECUTION_FAILED", "Command failed unexpectedly.");
    }

    this.reindex();
    const dirtyBefore = this.dirty;
    this.dirty = true;
    const changedNodeIds = this.buildChangedNodeIds(command, targetId, insertedNode, removedNodeId);
    return {
      ok: true,
      dirtyChanged: !dirtyBefore,
      changedNodeIds,
      affectedMeasureNumbers,
      diagnostics: [],
      warnings,
    };
  }

  public save(): SaveResult {
    if (!this.doc) {
      return {
        ok: false,
        mode: "original_noop",
        xml: "",
        diagnostics: [{ code: "MVP_SCORE_NOT_LOADED", message: "Score is not loaded." }],
      };
    }

    if (!this.dirty) {
      const integrityNoVoice = this.findInvalidNoteDiagnostic({ ignoreMissingVoice: true });
      if (integrityNoVoice) {
        return { ok: false, mode: "serialized_dirty", xml: "", diagnostics: [integrityNoVoice] };
      }
      const overfullNoop = this.findOverfullDiagnostic();
      if (overfullNoop) {
        return { ok: false, mode: "serialized_dirty", xml: "", diagnostics: [overfullNoop] };
      }
      return {
        ok: true,
        mode: "original_noop",
        xml: this.originalXml,
        diagnostics: [],
      };
    }

    const integrity = this.findInvalidNoteDiagnostic({ ignoreMissingVoice: false });
    if (integrity) {
      return { ok: false, mode: "serialized_dirty", xml: "", diagnostics: [integrity] };
    }

    const overfull = this.findOverfullDiagnostic();
    if (overfull) {
      return { ok: false, mode: "serialized_dirty", xml: "", diagnostics: [overfull] };
    }

    return {
      ok: true,
      mode: "serialized_dirty",
      xml: serializeXml(this.doc),
      diagnostics: [],
    };
  }

  public isDirty(): boolean {
    return this.dirty;
  }

  public listNoteNodeIds(): NodeId[] {
    return Array.from(this.idToNode.keys());
  }

  /**
   * Debug-only helper for UI diagnostics.
   * Returns current in-memory XML regardless of dirty/validation state.
   */
  public debugSerializeCurrentXml(): string | null {
    if (!this.doc) return null;
    return serializeXml(this.doc);
  }

  private nextNodeId(): NodeId {
    this.nodeCounter += 1;
    return `n${this.nodeCounter}`;
  }

  private reindex(): void {
    if (!this.doc) return;
    reindexNodeIds(this.doc, this.nodeToId, this.idToNode, () => this.nextNodeId());
  }

  private restoreFrom(xmlSnapshot: string): void {
    this.doc = parseXml(xmlSnapshot);
    this.reindex();
  }

  private findOverfullDiagnostic(): Diagnostic | null {
    if (!this.doc) return null;
    const measures = this.doc.querySelectorAll("measure");
    for (const measure of measures) {
      const note = measure.querySelector("note");
      if (!note) continue;
      const voices = this.editableVoice
        ? [this.editableVoice]
        : Array.from(
            new Set(
              Array.from(measure.querySelectorAll("note"))
                .map((measureNote) => getVoiceText(measureNote))
                .filter((voice): voice is string => Boolean(voice))
            )
          );
      for (const voice of voices) {
        const timing = getMeasureTimingForVoice(note, voice);
        if (!timing) continue;
        const tolerance = this.computeTupletRoundingTolerance(measure, voice);
        if (timing.occupied > timing.capacity + tolerance) {
          return {
            code: "MEASURE_OVERFULL",
            message: `Occupied time ${timing.occupied} exceeds capacity ${timing.capacity}.`,
          };
        }
      }
    }
    return null;
  }

  private findInvalidNoteDiagnostic(options?: { ignoreMissingVoice?: boolean }): Diagnostic | null {
    if (!this.doc) return null;
    const ignoreMissingVoice = Boolean(options?.ignoreMissingVoice);
    const notes = this.doc.querySelectorAll("note");
    for (const note of notes) {
      const voice = getVoiceText(note);
      if (!voice && !ignoreMissingVoice) {
        return {
          code: "MVP_INVALID_NOTE_VOICE",
          message: "Note is missing a valid <voice> value.",
        };
      }
      const duration = getDurationValue(note);
      const hasGrace = Array.from(note.children).some((c) => c.tagName === "grace");
      if (!hasGrace && (duration === null || duration <= 0)) {
        const context = this.describeNoteContext(note);
        const noteXml = this.compactNodeXml(note);
        if (typeof console !== "undefined") {
          console.error("[mikuscore][save][invalid-duration]", context, noteXml);
        }
        return {
          code: "MVP_INVALID_NOTE_DURATION",
          message: `Note is missing a valid positive <duration> value. ${context}`,
        };
      }
      const pitchDiagnostic = this.validateNotePitch(note);
      if (pitchDiagnostic) return pitchDiagnostic;
    }
    return null;
  }

  private computeTupletRoundingTolerance(measure: Element, voice: string): number {
    // Tuplet durations are integer-rounded in many MusicXML files.
    // Allow a small overrun proportional to the number of non-chord tuplet onsets.
    let tupletOnsetCount = 0;
    for (const note of Array.from(measure.querySelectorAll(":scope > note"))) {
      const noteVoice = getVoiceText(note);
      if (noteVoice !== voice) continue;
      if (note.querySelector(":scope > chord")) continue;
      if (note.querySelector(":scope > time-modification") === null) continue;
      const duration = getDurationValue(note);
      if (duration === null || duration <= 0) continue;
      tupletOnsetCount += 1;
    }
    if (tupletOnsetCount <= 0) return 0;
    return Math.floor(tupletOnsetCount / 2);
  }

  private fail(code: Diagnostic["code"], message: string): DispatchResult {
    return this.failWith({ code, message });
  }

  private describeNoteContext(note: Element): string {
    const measure = findAncestorMeasure(note);
    const part = note.closest("part");
    const partId = part?.getAttribute("id")?.trim() || "(unknown-part)";
    const measureNo = measure?.getAttribute("number")?.trim() || "(unknown-measure)";
    const voice = getVoiceText(note) || "(missing-voice)";
    const nodeId = this.nodeToId.get(note) ?? "(no-node-id)";
    const hasGrace = Array.from(note.children).some((c) => c.tagName === "grace");
    const hasCue = Array.from(note.children).some((c) => c.tagName === "cue");
    const hasChord = Array.from(note.children).some((c) => c.tagName === "chord");
    const hasRest = Array.from(note.children).some((c) => c.tagName === "rest");
    return `part=${partId} measure=${measureNo} voice=${voice} nodeId=${nodeId} grace=${hasGrace} cue=${hasCue} rest=${hasRest} chord=${hasChord}`;
  }

  private compactNodeXml(node: Element): string {
    const raw = node.outerHTML || "";
    const compact = raw.replace(/\s+/g, " ").trim();
    if (compact.length <= 280) return compact;
    return `${compact.slice(0, 280)}...`;
  }

  private failWith(diagnostic: Diagnostic): DispatchResult {
    return {
      ok: false,
      dirtyChanged: false,
      changedNodeIds: [],
      affectedMeasureNumbers: [],
      diagnostics: [diagnostic],
      warnings: [],
    };
  }

  private collectAffectedMeasureNumbers(note: Element): string[] {
    const measure = findAncestorMeasure(note);
    if (!measure) return [];
    const number = measure.getAttribute("number") ?? "";
    return number ? [number] : [];
  }

  private validateNotePitch(note: Element): Diagnostic | null {
    const hasRest = Array.from(note.children).some((c) => c.tagName === "rest");
    const hasChord = Array.from(note.children).some((c) => c.tagName === "chord");
    const pitch = Array.from(note.children).find((c) => c.tagName === "pitch") ?? null;

    if (hasRest && hasChord) {
      return {
        code: "MVP_INVALID_NOTE_PITCH",
        message: "Note must not contain both <rest> and <chord>.",
      };
    }
    if (hasRest && pitch) {
      return {
        code: "MVP_INVALID_NOTE_PITCH",
        message: "Rest note must not contain <pitch>.",
      };
    }
    if (hasChord && !pitch) {
      return {
        code: "MVP_INVALID_NOTE_PITCH",
        message: "Chord note must contain a valid <pitch>.",
      };
    }

    if (!pitch) {
      if (hasRest) return null;
      return {
        code: "MVP_INVALID_NOTE_PITCH",
        message: "Non-rest note is missing a valid <pitch>.",
      };
    }

    const step = pitch.querySelector("step")?.textContent?.trim() ?? "";
    if (!["A", "B", "C", "D", "E", "F", "G"].includes(step)) {
      return {
        code: "MVP_INVALID_NOTE_PITCH",
        message: "Pitch step is invalid.",
      };
    }
    const octaveText = pitch.querySelector("octave")?.textContent?.trim() ?? "";
    const octave = Number(octaveText);
    if (!Number.isInteger(octave)) {
      return {
        code: "MVP_INVALID_NOTE_PITCH",
        message: "Pitch octave is invalid.",
      };
    }
    const alterText = pitch.querySelector("alter")?.textContent?.trim();
    if (alterText !== undefined) {
      const alter = Number(alterText);
      if (!Number.isInteger(alter) || alter < -2 || alter > 2) {
        return {
          code: "MVP_INVALID_NOTE_PITCH",
          message: "Pitch alter is invalid.",
        };
      }
    }
    return null;
  }

  private buildChangedNodeIds(
    command: CoreCommand,
    targetId: NodeId,
    insertedNode: Element | null,
    removedNodeId: NodeId | null
  ): NodeId[] {
    if (command.type === "insert_note_after") {
      const insertedId = insertedNode ? this.nodeToId.get(insertedNode) ?? null : null;
      return insertedId ? [targetId, insertedId] : [targetId];
    }
    if (command.type === "delete_note") {
      return removedNodeId ? [removedNodeId] : [targetId];
    }
    if (command.type === "split_note") {
      const insertedId = insertedNode ? this.nodeToId.get(insertedNode) ?? null : null;
      return insertedId ? [targetId, insertedId] : [targetId];
    }
    return [targetId];
  }
}

const hasDirectChild = (node: Element, tagName: string): boolean =>
  Array.from(node.children).some((child) => child.tagName === tagName);

const findImmediateNextChordTone = (note: Element): Element | null => {
  const next = note.nextElementSibling;
  if (!next || next.tagName !== "note") return null;
  if (!hasDirectChild(next, "chord")) return null;
  return next;
};

const consumeFollowingRestsForDurationExpansion = (
  target: Element,
  voice: string,
  overflow: number
): number => {
  if (!Number.isInteger(overflow) || overflow <= 0) return 0;
  let remaining = overflow;
  let cursor: Element | null = target.nextElementSibling;
  while (cursor && remaining > 0) {
    const next = cursor.nextElementSibling;
    if (cursor.tagName === "backup" || cursor.tagName === "forward") break;
    if (cursor.tagName !== "note") {
      cursor = next;
      continue;
    }

    const noteVoice = getVoiceText(cursor);
    if (noteVoice !== voice) {
      cursor = next;
      continue;
    }

    const isRest = cursor.querySelector(":scope > rest") !== null;
    const isChord = cursor.querySelector(":scope > chord") !== null;
    const duration = getDurationValue(cursor) ?? 0;
    if (!isRest || isChord || duration <= 0) {
      cursor = next;
      continue;
    }

    if (duration <= remaining) {
      remaining -= duration;
      cursor.remove();
    } else {
      setDurationValue(cursor, duration - remaining);
      remaining = 0;
    }
    cursor = next;
  }
  return overflow - remaining;
};

const consumePrecedingRestsForDurationExpansion = (
  target: Element,
  voice: string,
  overflow: number
): number => {
  if (!Number.isInteger(overflow) || overflow <= 0) return 0;
  let remaining = overflow;
  let cursor: Element | null = target.previousElementSibling;
  while (cursor && remaining > 0) {
    const prev = cursor.previousElementSibling;
    if (cursor.tagName === "backup" || cursor.tagName === "forward") break;
    if (cursor.tagName !== "note") {
      cursor = prev;
      continue;
    }

    const noteVoice = getVoiceText(cursor);
    if (noteVoice !== voice) {
      cursor = prev;
      continue;
    }

    const isRest = cursor.querySelector(":scope > rest") !== null;
    const isChord = cursor.querySelector(":scope > chord") !== null;
    const duration = getDurationValue(cursor) ?? 0;
    if (!isRest || isChord || duration <= 0) {
      cursor = prev;
      continue;
    }

    if (duration <= remaining) {
      remaining -= duration;
      cursor.remove();
    } else {
      setDurationValue(cursor, duration - remaining);
      remaining = 0;
    }
    cursor = prev;
  }
  return overflow - remaining;
};

const fillUnderfullGapAfterTarget = (
  target: Element,
  voice: string,
  deficit: number
): boolean => {
  if (!Number.isInteger(deficit) || deficit <= 0) return true;
  const measure = findAncestorMeasure(target);
  if (!measure) return false;
  if (measureHasBackupOrForward(measure)) return false;

  // Keep rhythmic gap close to the edited note to avoid visual/timing drift.
  const next = target.nextElementSibling;
  if (next && next.tagName === "note" && getVoiceText(next) === voice) {
    const isRest = next.querySelector(":scope > rest") !== null;
    const isChord = next.querySelector(":scope > chord") !== null;
    if (isRest && !isChord) {
      const current = getDurationValue(next) ?? 0;
      setDurationValue(next, current + deficit);
      return true;
    }
  }

  const rest = createRestElement(target.ownerDocument, voice, deficit);
  target.after(rest);
  // Ensure notation metadata (<type>/<dot>/<time-modification>) is consistent for Verovio.
  setDurationValue(rest, deficit);
  return true;
};

const measureVoiceHasTupletContext = (target: Element, voice: string): boolean => {
  const measure = findAncestorMeasure(target);
  if (!measure) return false;
  const notes = Array.from(measure.children).filter((child) => child.tagName === "note");
  for (const note of notes) {
    if (getVoiceText(note) !== voice) continue;
    if (note.querySelector(":scope > time-modification")) return true;
    if (note.querySelector(":scope > notations > tuplet")) return true;
  }
  return false;
};

const autoAssignGrandStaffByPitch = (note: Element): void => {
  const context = resolveGrandStaffContext(note);
  if (!context) return;
  const midi = notePitchToMidi(note);
  if (midi === null) return;
  let staffNode = note.querySelector(":scope > staff");
  const existingStaffText = staffNode?.textContent?.trim() ?? "";
  const previousStaff = existingStaffText === "1" ? 1 : existingStaffText === "2" ? 2 : null;
  const desiredStaff = pickStaffByPitchWithHysteresis(midi, previousStaff);
  if (!staffNode) {
    staffNode = note.ownerDocument.createElement("staff");
    note.appendChild(staffNode);
  }
  staffNode.textContent = String(desiredStaff);
};

const resolveGrandStaffContext = (note: Element): { part: Element; measure: Element } | null => {
  const measure = findAncestorMeasure(note);
  if (!measure) return null;
  const part = measure.parentElement;
  if (!part || part.tagName !== "part") return null;
  const measures = Array.from(part.children).filter((child): child is Element => child.tagName === "measure");
  const targetIndex = measures.indexOf(measure);
  if (targetIndex < 0) return null;

  let staves = 1;
  let clef1 = "";
  let clef2 = "";
  for (let i = 0; i <= targetIndex; i += 1) {
    const attrs = measures[i].querySelector(":scope > attributes");
    if (!attrs) continue;
    const stavesText = attrs.querySelector(":scope > staves")?.textContent?.trim() ?? "";
    const parsedStaves = Number(stavesText);
    if (Number.isInteger(parsedStaves) && parsedStaves > 0) {
      staves = parsedStaves;
    }
    const nextClef1 = attrs.querySelector(':scope > clef[number="1"] > sign')?.textContent?.trim() ?? "";
    const nextClef2 = attrs.querySelector(':scope > clef[number="2"] > sign')?.textContent?.trim() ?? "";
    if (nextClef1) clef1 = nextClef1;
    if (nextClef2) clef2 = nextClef2;
  }
  if (staves < 2) return null;
  if (clef1 !== "G" || clef2 !== "F") return null;
  return { part, measure };
};

const notePitchToMidi = (note: Element): number | null => {
  const pitch = note.querySelector(":scope > pitch");
  if (!pitch) return null;
  const step = pitch.querySelector(":scope > step")?.textContent?.trim() ?? "";
  const octaveText = pitch.querySelector(":scope > octave")?.textContent?.trim() ?? "";
  const alterText = pitch.querySelector(":scope > alter")?.textContent?.trim() ?? "0";
  const semitoneByStep: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  const base = semitoneByStep[step];
  const octave = Number(octaveText);
  const alter = Number(alterText);
  if (base === undefined || !Number.isInteger(octave) || !Number.isFinite(alter)) return null;
  return (octave + 1) * 12 + base + Math.round(alter);
};
