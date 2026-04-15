/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";

import {
  exportMusicXmlToAbc,
  exportMusicXmlToMidi,
  exportMusicXmlToMuseScore,
  importAbcToMusicXml,
  importMidiToMusicXml,
  importMuseScoreToMusicXml,
} from "../../src/ts/cli-api";

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