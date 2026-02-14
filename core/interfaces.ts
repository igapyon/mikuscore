export type NodeId = string;
export type VoiceId = string;

export type DiagnosticCode =
  | "MEASURE_OVERFULL"
  | "MVP_UNSUPPORTED_NON_EDITABLE_VOICE"
  | "MVP_UNSUPPORTED_NOTE_KIND"
  | "MVP_SCORE_NOT_LOADED"
  | "MVP_COMMAND_TARGET_MISSING"
  | "MVP_TARGET_NOT_FOUND"
  | "MVP_COMMAND_EXECUTION_FAILED"
  | "MVP_INVALID_COMMAND_PAYLOAD"
  | "MVP_INVALID_NOTE_DURATION"
  | "MVP_INVALID_NOTE_VOICE"
  | "MVP_INVALID_NOTE_PITCH";

export type WarningCode = "MEASURE_UNDERFULL";

export type Diagnostic = {
  code: DiagnosticCode;
  message: string;
};

export type Warning = {
  code: WarningCode;
  message: string;
};

export type DispatchResult = {
  ok: boolean;
  dirtyChanged: boolean;
  changedNodeIds: NodeId[];
  affectedMeasureNumbers: string[];
  diagnostics: Diagnostic[];
  warnings: Warning[];
};

export type SaveMode = "original_noop" | "serialized_dirty";

export type SaveResult = {
  ok: boolean;
  mode: SaveMode;
  xml: string;
  diagnostics: Diagnostic[];
};

export type Pitch = {
  step: "A" | "B" | "C" | "D" | "E" | "F" | "G";
  alter?: -2 | -1 | 0 | 1 | 2;
  octave: number;
};

export type ChangePitchCommand = {
  type: "change_pitch";
  targetNodeId: NodeId;
  voice: VoiceId;
  pitch: Pitch;
};

export type ChangeDurationCommand = {
  type: "change_duration";
  targetNodeId: NodeId;
  voice: VoiceId;
  duration: number;
};

export type InsertNoteAfterCommand = {
  type: "insert_note_after";
  anchorNodeId: NodeId;
  voice: VoiceId;
  note: {
    duration: number;
    pitch: Pitch;
  };
};

export type DeleteNoteCommand = {
  type: "delete_note";
  targetNodeId: NodeId;
  voice: VoiceId;
};

export type UiNoopCommand = {
  type: "ui_noop";
  reason: "selection_change" | "cursor_move" | "viewport_change";
};

export type CoreCommand =
  | ChangePitchCommand
  | ChangeDurationCommand
  | InsertNoteAfterCommand
  | DeleteNoteCommand
  | UiNoopCommand;

export type ScoreCoreOptions = {
  editableVoice?: VoiceId;
};
