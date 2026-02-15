import type { CoreCommand, Diagnostic, VoiceId, Warning } from "./interfaces";
import { getMeasureTimingForVoice } from "./timeIndex";
import {
  findAncestorMeasure,
  getVoiceText,
  isUnsupportedNoteKind,
} from "./xmlUtils";

export const validateVoice = (
  command: CoreCommand,
  editableVoice?: VoiceId | null
): Diagnostic | null => {
  if (command.type === "ui_noop") return null;
  if (!editableVoice) return null;
  if (command.voice === editableVoice) return null;
  return {
    code: "MVP_UNSUPPORTED_NON_EDITABLE_VOICE",
    message: `Voice ${command.voice} is not editable in MVP.`,
  };
};

export const validateCommandPayload = (command: CoreCommand): Diagnostic | null => {
  if (command.type === "ui_noop") return null;
  if (command.type === "change_duration") {
    if (!isPositiveInteger(command.duration)) {
      return {
        code: "MVP_INVALID_COMMAND_PAYLOAD",
        message: "change_duration.duration must be a positive integer.",
      };
    }
    return null;
  }
  if (command.type === "insert_note_after") {
    if (!isPositiveInteger(command.note.duration)) {
      return {
        code: "MVP_INVALID_COMMAND_PAYLOAD",
        message: "insert_note_after.note.duration must be a positive integer.",
      };
    }
    if (!isValidPitch(command.note.pitch)) {
      return {
        code: "MVP_INVALID_COMMAND_PAYLOAD",
        message: "insert_note_after.note.pitch is invalid.",
      };
    }
    return null;
  }
  if (command.type === "change_to_pitch") {
    if (!isValidPitch(command.pitch)) {
      return {
        code: "MVP_INVALID_COMMAND_PAYLOAD",
        message: "change_to_pitch.pitch is invalid.",
      };
    }
  }
  return null;
};

export const validateSupportedNoteKind = (
  command: CoreCommand,
  note: Element
): Diagnostic | null => {
  // Allow rest -> pitched note conversion via change_to_pitch.
  if (command.type === "change_to_pitch") {
    const hasUnsupportedExceptRest =
      note.querySelector(":scope > grace") !== null ||
      note.querySelector(":scope > cue") !== null ||
      note.querySelector(":scope > chord") !== null;
    if (!hasUnsupportedExceptRest) return null;
  } else if (!isUnsupportedNoteKind(note)) {
    return null;
  }

  if (!isUnsupportedNoteKind(note)) return null;
  return {
    code: "MVP_UNSUPPORTED_NOTE_KIND",
    message: "Editing grace/cue/chord/rest notes is not supported in MVP.",
  };
};

export const validateTargetVoiceMatch = (
  command: CoreCommand,
  targetNote: Element
): Diagnostic | null => {
  if (command.type === "ui_noop") return null;
  const targetVoice = getVoiceText(targetNote);
  if (targetVoice === command.voice) return null;
  return {
    code: "MVP_UNSUPPORTED_NON_EDITABLE_VOICE",
    message: `Target note voice (${targetVoice ?? "none"}) does not match command voice (${command.voice}).`,
  };
};

export const validateInsertLaneBoundary = (
  command: CoreCommand,
  anchorNote: Element
): Diagnostic | null => {
  if (command.type !== "insert_note_after") return null;

  const measure = findAncestorMeasure(anchorNote);
  if (!measure) return null;

  const children = Array.from(measure.children);
  const anchorIndex = children.indexOf(anchorNote);
  if (anchorIndex < 0) return null;

  for (let i = anchorIndex + 1; i < children.length; i += 1) {
    const node = children[i];
    if (node.tagName !== "note") continue;

    const nextVoice = getVoiceText(node);
    if (nextVoice !== command.voice) {
      return {
        code: "MVP_UNSUPPORTED_NON_EDITABLE_VOICE",
        message:
          "Insert is restricted to a continuous local voice lane in MVP.",
      };
    }
    break;
  }

  return null;
};

export const validateBackupForwardBoundaryForStructuralEdit = (
  command: CoreCommand,
  anchorOrTarget: Element
): Diagnostic | null => {
  if (
    command.type !== "insert_note_after" &&
    command.type !== "delete_note" &&
    command.type !== "split_note"
  ) {
    return null;
  }

  const prev = anchorOrTarget.previousElementSibling;
  const next = anchorOrTarget.nextElementSibling;

  if (command.type === "insert_note_after") {
    if (next && isBackupOrForward(next)) {
      return {
        code: "MVP_UNSUPPORTED_NON_EDITABLE_VOICE",
        message: "Insert point crosses a backup/forward boundary in MVP.",
      };
    }
    return null;
  }

  if (command.type === "split_note") {
    if (next && isBackupOrForward(next)) {
      return {
        code: "MVP_UNSUPPORTED_NON_EDITABLE_VOICE",
        message: "Split point crosses a backup/forward boundary in MVP.",
      };
    }
    return null;
  }

  // delete_note
  if ((prev && isBackupOrForward(prev)) || (next && isBackupOrForward(next))) {
    return {
      code: "MVP_UNSUPPORTED_NON_EDITABLE_VOICE",
      message: "Delete point crosses a backup/forward boundary in MVP.",
    };
  }

  return null;
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

const isBackupOrForward = (node: Element): boolean =>
  node.tagName === "backup" || node.tagName === "forward";

const isPositiveInteger = (value: number): boolean =>
  Number.isFinite(value) && Number.isInteger(value) && value > 0;

const isValidPitch = (pitch: {
  step: string;
  alter?: number;
  octave: number;
}): boolean => {
  const stepOk = ["A", "B", "C", "D", "E", "F", "G"].includes(pitch.step);
  if (!stepOk) return false;
  if (!Number.isFinite(pitch.octave) || !Number.isInteger(pitch.octave)) return false;
  if (typeof pitch.alter === "number") {
    if (!Number.isInteger(pitch.alter)) return false;
    if (pitch.alter < -2 || pitch.alter > 2) return false;
  }
  return true;
};
