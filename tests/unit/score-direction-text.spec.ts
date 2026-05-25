/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildMusicXmlTempoDirectionXml,
  buildMusicXmlWordsDirectionXml,
  extractMusicXmlDirectionPlacement,
  extractMusicXmlDirectionWords,
  extractMusicXmlSoundTempoBpm,
  formatTempoBpm,
} from "../../src/ts/score-features/direction-text";

const parseDirection = (xml: string): Element => {
  const doc = new DOMParser().parseFromString(`<root>${xml}</root>`, "application/xml");
  const direction = doc.querySelector("direction");
  expect(direction).not.toBeNull();
  if (!direction) throw new Error("Missing direction fixture.");
  return direction;
};

describe("score direction text feature model", () => {
  it("formats tempo bpm values", () => {
    expect(formatTempoBpm(120)).toBe("120");
    expect(formatTempoBpm(116.5)).toBe("116.5");
  });

  it("builds and extracts MusicXML words directions", () => {
    const xml = buildMusicXmlWordsDirectionXml({
      text: "sempre legato",
      placement: "above",
      fontStyle: "italic",
      tempoBpm: 96,
    });
    expect(xml).toBe(
      '<direction placement="above"><direction-type><words font-style="italic">sempre legato</words></direction-type><sound tempo="96"/></direction>'
    );
    const direction = parseDirection(xml);
    expect(extractMusicXmlDirectionPlacement(direction)).toBe("above");
    expect(extractMusicXmlDirectionWords(direction)).toEqual([{ text: "sempre legato", fontStyle: "italic" }]);
    expect(extractMusicXmlSoundTempoBpm(direction)).toBe(96);
  });

  it("builds MusicXML tempo directions with optional quarter metronome", () => {
    expect(buildMusicXmlTempoDirectionXml({ bpm: 132, includeQuarterMetronome: true })).toBe(
      '<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>132</per-minute></metronome></direction-type><sound tempo="132"/></direction>'
    );
  });
});
