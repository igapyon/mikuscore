/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";
import {
  encodeAbcOutput,
  encodeMidiOutput,
  encodeMuseScoreOutput,
  encodeMusicXmlOutput,
  encodeVsqxOutput,
  encodeZipBundleOutput,
} from "../../src/ts/output-encoding";
import {
  bytesToArrayBuffer,
  extractMusicXmlTextFromMxl,
  extractTextFromZipByExtensions,
} from "../../src/ts/zip-io";

const playableMusicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Output boundary</work-title></work>
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <attributes>
      <divisions>480</divisions>
      <time><beats>4</beats><beat-type>4</beat-type></time>
      <clef><sign>G</sign><line>2</line></clef>
    </attributes>
    <note>
      <pitch><step>C</step><octave>4</octave></pitch>
      <duration>480</duration><voice>1</voice><type>quarter</type>
    </note>
  </measure></part>
</score-partwise>`;

describe("value-based output encoding", () => {
  it("returns plain MusicXML text without Blob or filename policy", async () => {
    const encoded = await encodeMusicXmlOutput(playableMusicXml);

    expect(typeof encoded).toBe("string");
    expect(encoded).toContain("\n<score-partwise");
  });

  it("returns MXL bytes that preserve the formatted MusicXML", async () => {
    const encoded = await encodeMusicXmlOutput(playableMusicXml, { compressed: true });

    expect(encoded).toBeInstanceOf(Uint8Array);
    if (typeof encoded === "string") return;
    const extracted = await extractMusicXmlTextFromMxl(bytesToArrayBuffer(encoded));
    expect(extracted).toContain("<work-title>Output boundary</work-title>");
  });

  it("formats VSQX and converts text formats as plain strings", () => {
    const vsqx = encodeVsqxOutput("<vsq4><vVoiceTable><vVoice/></vVoiceTable></vsq4>");
    const abc = encodeAbcOutput(playableMusicXml, () => "X:1\nK:C\nC|");

    expect(vsqx).toContain("\n  <vVoiceTable>");
    expect(abc).toBe("X:1\nK:C\nC|");
    expect(encodeAbcOutput("<invalid", () => "X:1")).toBeNull();
  });

  it("builds MIDI bytes using explicit runtime options", () => {
    const encoded = encodeMidiOutput(playableMusicXml, {
      ticksPerQuarter: 480,
      exportProfile: "safe",
      rawWriter: true,
    });

    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(Array.from(encoded?.slice(0, 4) ?? [])).toEqual([0x4d, 0x54, 0x68, 0x64]);
  });

  it("returns plain MSCX or compressed MSCZ data from the same conversion", async () => {
    const convert = () => '<museScore version="4.0"><Score/></museScore>';
    const plain = await encodeMuseScoreOutput(playableMusicXml, convert);
    const compressed = await encodeMuseScoreOutput(playableMusicXml, convert, { compressed: true });

    expect(typeof plain).toBe("string");
    expect(plain).toContain("\n  <Score/>");
    expect(compressed).toBeInstanceOf(Uint8Array);
    if (!compressed || typeof compressed === "string") return;
    const extracted = await extractTextFromZipByExtensions(
      bytesToArrayBuffer(compressed),
      [".mscx"]
    );
    expect(extracted).toContain("<museScore version=\"4.0\">");
  });

  it("builds ZIP bytes from string and byte entries without Blob", async () => {
    const encoded = await encodeZipBundleOutput([
      { path: "score.musicxml", data: playableMusicXml },
      { path: "score.mid", data: Uint8Array.of(0x4d, 0x54, 0x68, 0x64) },
    ], { compressed: false });

    const xml = await extractTextFromZipByExtensions(bytesToArrayBuffer(encoded), [".musicxml"]);
    expect(xml).toContain("<score-partwise");
  });
});
