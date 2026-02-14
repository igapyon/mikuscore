import type { CoreCommand, Diagnostic, VoiceId, Warning } from "./interfaces";
import { getMeasureTimingForVoice } from "./timeIndex";
import {
  findAncestorMeasure,
  isUnsupportedNoteKind,
  measureHasBackupOrForward,
} from "./xmlUtils";

export const validateVoice = (
  command: CoreCommand,
  editableVoice: VoiceId
): Diagnostic | null => {
  if (command.type === "ui_noop") return null;
  if (command.voice === editableVoice) return null;
  return {
    code: "MVP_UNSUPPORTED_NON_EDITABLE_VOICE",
    message: `Voice ${command.voice} is not editable in MVP.`,
  };
};

export const validateSupportedNoteKind = (note: Element): Diagnostic | null => {
  if (!isUnsupportedNoteKind(note)) return null;
  return {
    code: "MVP_UNSUPPORTED_NOTE_KIND",
    message: "Editing grace/cue/chord/rest notes is not supported in MVP.",
  };
};

export const validateBackupForwardBoundaryForStructuralEdit = (
  command: CoreCommand,
  anchorOrTarget: Element
): Diagnostic | null => {
  if (command.type !== "insert_note_after" && command.type !== "delete_note") {
    return null;
  }
  const measure = findAncestorMeasure(anchorOrTarget);
  if (!measure) return null;
  if (!measureHasBackupOrForward(measure)) return null;

  return {
    code: "MVP_UNSUPPORTED_NON_EDITABLE_VOICE",
    message: "Operation requires backup/forward restructuring in MVP.",
  };
};

export const validateProjectedMeasureTiming = (
  noteInMeasure: Element,
  voice: string,
  projectedOccupiedTime: number
): { diagnostic: Diagnostic | null; warning: Warning | null } => {
  const timing = getMeasureTimingForVoice(noteInMeasure, voice);
  if (!timing) return { diagnostic: null, warning: null };

  if (projectedOccupiedTime > timing.capacity) {
    return {
      diagnostic: {
        code: "MEASURE_OVERFULL",
        message: `Projected occupied time ${projectedOccupiedTime} exceeds capacity ${timing.capacity}.`,
      },
      warning: null,
    };
  }

  if (projectedOccupiedTime < timing.capacity) {
    return {
      diagnostic: null,
      warning: {
        code: "MEASURE_UNDERFULL",
        message: `Projected occupied time ${projectedOccupiedTime} is below capacity ${timing.capacity}.`,
      },
    };
  }

  return { diagnostic: null, warning: null };
};
