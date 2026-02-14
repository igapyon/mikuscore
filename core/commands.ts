import type { CoreCommand, NodeId } from "./interfaces";

export const isUiOnlyCommand = (command: CoreCommand): boolean =>
  command.type === "ui_noop";

export const getCommandNodeId = (command: CoreCommand): NodeId | null => {
  switch (command.type) {
    case "change_pitch":
    case "change_duration":
    case "delete_note":
      return command.targetNodeId;
    case "insert_note_after":
      return command.anchorNodeId;
    case "ui_noop":
      return null;
  }
};
