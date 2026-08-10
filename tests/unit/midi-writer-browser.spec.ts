/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { MidiWriterRuntime } from "../../src/ts/midi-io";
import { getBrowserMidiWriterRuntime } from "../../src/ts/midi-writer-browser";

const initialRuntime = window.MidiWriter;

afterEach(() => {
  if (initialRuntime === undefined) {
    delete window.MidiWriter;
  } else {
    window.MidiWriter = initialRuntime;
  }
});

describe("browser MIDI writer capability", () => {
  it("returns null when the browser bundle has not been installed", () => {
    delete window.MidiWriter;
    expect(getBrowserMidiWriterRuntime()).toBeNull();
  });

  it("returns the explicitly installed browser runtime", () => {
    const runtime = {} as MidiWriterRuntime;
    window.MidiWriter = runtime;
    expect(getBrowserMidiWriterRuntime()).toBe(runtime);
  });
});
