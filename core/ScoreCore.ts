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
  getDurationValue,
  parseXml,
  reindexNodeIds,
  serializeXml,
  setDurationValue,
  setPitch,
} from "./xmlUtils";
import {
  validateBackupForwardBoundaryForStructuralEdit,
  validateProjectedMeasureTiming,
  validateSupportedNoteKind,
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
      return this.fail("MVP_INVALID_TARGET", "Score is not loaded.");
    }
    if (isUiOnlyCommand(command)) {
      return { ok: true, dirtyChanged: false, diagnostics: [], warnings: [] };
    }

    const voiceDiagnostic = validateVoice(command, this.editableVoice);
    if (voiceDiagnostic) return this.failWith(voiceDiagnostic);

    const targetId = getCommandNodeId(command);
    if (!targetId) return this.fail("MVP_INVALID_TARGET", "Command target is missing.");
    const target = this.idToNode.get(targetId);
    if (!target) return this.fail("MVP_INVALID_TARGET", `Unknown nodeId: ${targetId}`);

    const noteKindDiagnostic = validateSupportedNoteKind(target);
    if (noteKindDiagnostic) return this.failWith(noteKindDiagnostic);

    const bfDiagnostic = validateBackupForwardBoundaryForStructuralEdit(command, target);
    if (bfDiagnostic) return this.failWith(bfDiagnostic);

    const snapshot = serializeXml(this.doc);
    const warnings: Warning[] = [];

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
      } else if (command.type === "delete_note") {
        const duration = getDurationValue(target) ?? 0;
        const timing = getMeasureTimingForVoice(target, command.voice);
        if (timing) {
          const projected = timing.occupied - duration;
          const result = validateProjectedMeasureTiming(target, command.voice, projected);
          if (result.diagnostic) return this.failWith(result.diagnostic);
          if (result.warning) warnings.push(result.warning);
        }
        target.remove();
      }
    } catch {
      this.restoreFrom(snapshot);
      return this.fail("MVP_INVALID_TARGET", "Command failed unexpectedly.");
    }

    this.reindex();
    const dirtyBefore = this.dirty;
    this.dirty = true;
    return {
      ok: true,
      dirtyChanged: !dirtyBefore,
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
        diagnostics: [{ code: "MVP_INVALID_TARGET", message: "Score is not loaded." }],
      };
    }

    if (!this.dirty) {
      return {
        ok: true,
        mode: "original_noop",
        xml: this.originalXml,
        diagnostics: [],
      };
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

  private fail(code: Diagnostic["code"], message: string): DispatchResult {
    return this.failWith({ code, message });
  }

  private failWith(diagnostic: Diagnostic): DispatchResult {
    return {
      ok: false,
      dirtyChanged: false,
      diagnostics: [diagnostic],
      warnings: [],
    };
  }
}
