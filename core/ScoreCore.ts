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
  createNoteElement,
  findAncestorMeasure,
  getDurationValue,
  getVoiceText,
  replaceWithRestNote,
  parseXml,
  reindexNodeIds,
  serializeXml,
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

const DEFAULT_EDITABLE_VOICE = "1";

export class ScoreCore {
  private readonly editableVoice: string;
  private originalXml = "";
  private doc: XMLDocument | null = null;
  private dirty = false;

  // Node identity is kept outside XML with WeakMap as required by spec.
  private nodeToId = new WeakMap<Node, NodeId>();
  private idToNode = new Map<NodeId, Element>();
  private nodeCounter = 0;

  public constructor(options: ScoreCoreOptions = {}) {
    this.editableVoice = options.editableVoice ?? DEFAULT_EDITABLE_VOICE;
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

    const noteKindDiagnostic = validateSupportedNoteKind(target);
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
      if (command.type === "change_pitch") {
        setPitch(target, command.pitch);
      } else if (command.type === "change_duration") {
        const oldDuration = getDurationValue(target) ?? 0;
        const timing = getMeasureTimingForVoice(target, command.voice);
        if (timing) {
          const projected = timing.occupied - oldDuration + command.duration;
          const result = validateProjectedMeasureTiming(target, command.voice, projected);
          if (result.diagnostic) return this.failWith(result.diagnostic);
          if (result.warning) warnings.push(result.warning);
        }
        setDurationValue(target, command.duration);
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

    const integrity = this.findInvalidNoteDiagnostic();
    if (integrity) {
      return { ok: false, mode: "serialized_dirty", xml: "", diagnostics: [integrity] };
    }

    const overfull = this.findOverfullDiagnostic();
    if (overfull) {
      return { ok: false, mode: "serialized_dirty", xml: "", diagnostics: [overfull] };
    }

    if (!this.dirty) {
      return {
        ok: true,
        mode: "original_noop",
        xml: this.originalXml,
        diagnostics: [],
      };
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
      const timing = getMeasureTimingForVoice(note, this.editableVoice);
      if (!timing) continue;
      if (timing.occupied > timing.capacity) {
        return {
          code: "MEASURE_OVERFULL",
          message: `Occupied time ${timing.occupied} exceeds capacity ${timing.capacity}.`,
        };
      }
    }
    return null;
  }

  private findInvalidNoteDiagnostic(): Diagnostic | null {
    if (!this.doc) return null;
    const notes = this.doc.querySelectorAll("note");
    for (const note of notes) {
      const voice = getVoiceText(note);
      if (!voice) {
        return {
          code: "MVP_INVALID_NOTE_VOICE",
          message: "Note is missing a valid <voice> value.",
        };
      }
      const duration = getDurationValue(note);
      if (duration === null || duration <= 0) {
        return {
          code: "MVP_INVALID_NOTE_DURATION",
          message: "Note is missing a valid positive <duration> value.",
        };
      }
      const pitchDiagnostic = this.validateNotePitch(note);
      if (pitchDiagnostic) return pitchDiagnostic;
    }
    return null;
  }

  private fail(code: Diagnostic["code"], message: string): DispatchResult {
    return this.failWith({ code, message });
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
