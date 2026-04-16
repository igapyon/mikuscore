/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";

import {
  decodeCliMuseScoreInput,
  decodeCliMusicXmlInput,
  encodeCliMuseScoreOutput,
  encodeCliMusicXmlOutput,
  exportMusicXmlToAbc,
  exportMusicXmlToMidi,
  exportMusicXmlToMuseScore,
  importAbcToMusicXml,
  importMidiToMusicXml,
  importMuseScoreToMusicXml,
} from "../../src/ts/cli-api";
import { extractMusicXmlTextFromMxl, extractTextFromZipByExtensions } from "../../src/ts/zip-io";

describe("cli-api", () => {
  it("imports ABC to MusicXML", () => {
    const result = importAbcToMusicXml("X:1\nT:CLI\nM:4/4\nL:1/4\nK:C\nC D E F|\n");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toContain("<score-partwise");
    expect(result.output).toContain("<work-title>CLI</work-title>");
  });

  it("fails on invalid ABC", () => {
    const result = importAbcToMusicXml("");

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]).toContain("Failed to parse ABC");
  });

  it("exports MusicXML to ABC", () => {
    const result = exportMusicXmlToAbc(`<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
 <part-list>
  <score-part id="P1"><part-name>Music</part-name></score-part>
 </part-list>
 <part id="P1">
  <measure number="1">
   <attributes>
    <divisions>1</divisions>
    <key><fifths>0</fifths></key>
    <time><beats>4</beats><beat-type>4</beat-type></time>
    <clef><sign>G</sign><line>2</line></clef>
   </attributes>
   <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
   <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
   <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
   <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
  </measure>
 </part>
</score-partwise>`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toContain("K:C");
  });

  it("fails on invalid MusicXML", () => {
    const result = exportMusicXmlToAbc("<not-xml");

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]).toContain("Failed to parse MusicXML");
  });

  it("imports MIDI to MusicXML", () => {
    const result = importMidiToMusicXml(buildSimpleMidi());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.output).toBe("string");
    expect(result.output).toContain("<score-partwise");
  });

  it("exports MusicXML to MIDI bytes", () => {
    const result = exportMusicXmlToMidi(validMusicXml("MIDI export"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output).toBeInstanceOf(Uint8Array);
    const bytes = result.output as Uint8Array;
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x4d, 0x54, 0x68, 0x64]);
  });

  it("imports MuseScore to MusicXML", () => {
    const result = importMuseScoreToMusicXml(validMuseScoreXml("Muse import"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.output).toBe("string");
    expect(result.output).toContain("<score-partwise");
    expect(result.output).toContain("<work-title>Muse import</work-title>");
  });

  it("exports MusicXML to MuseScore text", () => {
    const result = exportMusicXmlToMuseScore(validMusicXml("Muse export"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.output).toBe("string");
    expect(result.output).toContain("<museScore version=\"4.0\">");
    expect(result.output).toContain("<metaTag name=\"workTitle\">Muse export</metaTag>");
  });

  it("decodes .mxl input for CLI file reads", async () => {
    const encoded = await encodeCliMusicXmlOutput(validMusicXml("CLI MXL"), "score.mxl");
    expect(encoded.ok).toBe(true);
    if (!encoded.ok || typeof encoded.output === "string") return;

    const decoded = await decodeCliMusicXmlInput(encoded.output, "score.mxl");
    expect(decoded.ok).toBe(true);
    if (!decoded.ok || typeof decoded.output !== "string") return;
    expect(decoded.output).toContain("<work-title>CLI MXL</work-title>");
  });

  it("encodes .mxl output for CLI file writes", async () => {
    const result = await encodeCliMusicXmlOutput(validMusicXml("CLI MXL out"), "score.mxl");
    expect(result.ok).toBe(true);
    if (!result.ok || typeof result.output === "string") return;
    const extracted = await extractMusicXmlTextFromMxl(result.output.buffer.slice(
      result.output.byteOffset,
      result.output.byteOffset + result.output.byteLength
    ));
    expect(extracted).toContain("<work-title>CLI MXL out</work-title>");
  });

  it("decodes .mscz input for CLI file reads", async () => {
    const encoded = await encodeCliMuseScoreOutput(validMuseScoreXml("CLI MSCZ"), "score.mscz");
    expect(encoded.ok).toBe(true);
    if (!encoded.ok || typeof encoded.output === "string") return;

    const decoded = await decodeCliMuseScoreInput(encoded.output, "score.mscz");
    expect(decoded.ok).toBe(true);
    if (!decoded.ok || typeof decoded.output !== "string") return;
    expect(decoded.output).toContain("<museScore version=\"4.0\">");
    expect(decoded.output).toContain("\n  <Score>");
  });

  it("encodes .mscz output for CLI file writes", async () => {
    const result = await encodeCliMuseScoreOutput(validMuseScoreXml("CLI MSCZ out"), "score.mscz");
    expect(result.ok).toBe(true);
    if (!result.ok || typeof result.output === "string") return;
    const extracted = await extractTextFromZipByExtensions(
      result.output.buffer.slice(result.output.byteOffset, result.output.byteOffset + result.output.byteLength),
      [".mscx"]
    );
    expect(extracted).toContain("<museScore version=\"4.0\">");
    expect(extracted).toContain("\n  <Score>");
  });
});

function buildSimpleMidi() {
  return Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    0x01, 0xe0,
    0x4d, 0x54, 0x72, 0x6b,
    0x00, 0x00, 0x00, 0x0d,
    0x00, 0x90, 0x3c, 0x60,
    0x83, 0x60, 0x80, 0x3c, 0x00,
    0x00, 0xff, 0x2f, 0x00,
  ]);
}

function validMusicXml(title: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
 <work><work-title>${title}</work-title></work>
 <part-list>
  <score-part id="P1"><part-name>Music</part-name></score-part>
 </part-list>
 <part id="P1">
  <measure number="1">
   <attributes>
    <divisions>1</divisions>
    <key><fifths>0</fifths></key>
    <time><beats>4</beats><beat-type>4</beat-type></time>
    <clef><sign>G</sign><line>2</line></clef>
   </attributes>
   <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
   <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
   <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
   <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
  </measure>
 </part>
</score-partwise>`;
}

function validMuseScoreXml(title: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.0">
  <Score>
    <metaTag name="workTitle">${title}</metaTag>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <Chord>
            <durationType>quarter</durationType>
            <Note><pitch>60</pitch></Note>
          </Chord>
          <Rest>
            <durationType>quarter</durationType>
          </Rest>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
}
