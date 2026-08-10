/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MidiWriterRuntime } from "./midi-io";

declare global {
  interface Window {
    MidiWriter?: MidiWriterRuntime;
  }
}

export const getBrowserMidiWriterRuntime = (): MidiWriterRuntime | null => {
  if (typeof window === "undefined") return null;
  return window.MidiWriter ?? null;
};
