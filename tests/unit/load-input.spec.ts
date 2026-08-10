/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";
import {
  convertLoadInputToMusicXml,
  type LoadInputConverters,
} from "../../src/ts/load-input";
import { makeMsczBytes, makeMxlBytes } from "../../src/ts/zip-io";

const scoreXml = '<score-partwise version="4.0"><part-list/></score-partwise>';

const baseConverters = (): LoadInputConverters => ({
  formatImportedMusicXml: (xml) => `FORMATTED:${xml}`,
  convertAbcToMusicXml: () => scoreXml,
  convertMeiToMusicXml: () => scoreXml,
  convertLilyPondToMusicXml: () => scoreXml,
  convertMuseScoreToMusicXml: () => scoreXml,
  convertVsqxToMusicXml: () => ({
    ok: true,
    xml: scoreXml,
    diagnostics: [],
    warnings: [],
  }),
  convertMidiToMusicXml: () => ({
    ok: true,
    xml: scoreXml,
    diagnostics: [],
    warnings: [],
  }),
});

describe("value-based load input conversion", () => {
  it("normalizes declared MusicXML text without browser file objects", async () => {
    const result = await convertLoadInputToMusicXml(
      { format: "musicxml", data: scoreXml },
      baseConverters()
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.xml).toBe(`FORMATTED:${scoreXml}`);
    expect(result.diagnostics).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("delegates declared ABC text to the supplied product converter", async () => {
    let sourceSeen = "";
    const result = await convertLoadInputToMusicXml(
      { format: "abc", data: "X:1\nK:C\nC|" },
      {
        ...baseConverters(),
        convertAbcToMusicXml: (source) => {
          sourceSeen = source;
          return scoreXml;
        },
      }
    );

    expect(sourceSeen).toBe("X:1\nK:C\nC|");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.xml).toBe(`FORMATTED:${scoreXml}`);
  });

  it("preserves structured MIDI diagnostics and warnings on conversion failure", async () => {
    const result = await convertLoadInputToMusicXml(
      { format: "midi", data: Uint8Array.of(0x00) },
      {
        ...baseConverters(),
        convertMidiToMusicXml: () => ({
          ok: false,
          xml: "",
          diagnostics: [{ code: "MIDI_INVALID_FILE", message: "invalid header" }],
          warnings: [{ code: "MIDI_PARTIAL_READ", message: "partial input" }],
        }),
      }
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnosticMessage).toContain("MIDI_INVALID_FILE");
    expect(result.diagnostics).toEqual([
      { code: "MIDI_INVALID_FILE", message: "invalid header" },
    ]);
    expect(result.warnings).toEqual([
      { code: "MIDI_PARTIAL_READ", message: "partial input" },
    ]);
  });

  it("decodes MXL bytes before normalizing MusicXML", async () => {
    const result = await convertLoadInputToMusicXml(
      { format: "mxl", data: await makeMxlBytes(scoreXml) },
      baseConverters()
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.xml).toContain("FORMATTED:<score-partwise");
  });

  it("prefers the MSCX entry when decoding MSCZ bytes", async () => {
    const mscx = '<museScore version="4.0"><Score/></museScore>';
    let sourceSeen = "";
    const result = await convertLoadInputToMusicXml(
      { format: "mscz", data: await makeMsczBytes(mscx) },
      {
        ...baseConverters(),
        convertMuseScoreToMusicXml: (source) => {
          sourceSeen = source;
          return scoreXml;
        },
      }
    );

    expect(sourceSeen).toContain("<museScore");
    expect(result.ok).toBe(true);
  });

  it("accepts an MXL-compatible archive supplied through the MSCZ path", async () => {
    let museScoreConverterCalled = false;
    const result = await convertLoadInputToMusicXml(
      { format: "mscz", data: await makeMxlBytes(scoreXml) },
      {
        ...baseConverters(),
        convertMuseScoreToMusicXml: () => {
          museScoreConverterCalled = true;
          return scoreXml;
        },
      }
    );

    expect(museScoreConverterCalled).toBe(false);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.xml).toContain("FORMATTED:<score-partwise");
  });

  it("rejects a payload kind that does not match the declared format", async () => {
    const textAsMidi = await convertLoadInputToMusicXml(
      { format: "midi", data: "not bytes" },
      baseConverters()
    );
    const bytesAsAbc = await convertLoadInputToMusicXml(
      { format: "abc", data: Uint8Array.of(0x41) },
      baseConverters()
    );

    expect(textAsMidi.ok).toBe(false);
    if (!textAsMidi.ok) expect(textAsMidi.diagnosticMessage).toContain("Expected binary input");
    expect(bytesAsAbc.ok).toBe(false);
    if (!bytesAsAbc.ok) expect(bytesAsAbc.diagnosticMessage).toContain("Expected text input");
  });
});
