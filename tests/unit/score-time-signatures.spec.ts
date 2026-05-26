/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildMusicXmlTimeSignatureXml,
  extractMusicXmlTimeSignatureFeature,
  normalizeTimeSignatureFeature,
} from "../../src/ts/score-features/time-signatures";

const parseTime = (xml: string): Element => {
  const doc = new DOMParser().parseFromString(`<root>${xml}</root>`, "application/xml");
  const time = doc.querySelector("time");
  expect(time).not.toBeNull();
  if (!time) throw new Error("Missing time signature fixture.");
  return time;
};

describe("score time signature feature model", () => {
  it("normalizes positive beats and beat-type values", () => {
    expect(normalizeTimeSignatureFeature({ beats: 3.2, beatType: "4", symbol: "cut" })).toEqual({
      beats: 3,
      beatType: 4,
      symbol: "cut",
    });
    expect(normalizeTimeSignatureFeature({ beats: 0, beatType: 4 })).toBeNull();
  });

  it("builds MusicXML time signature features", () => {
    expect(buildMusicXmlTimeSignatureXml({ beats: 6, beatType: 8, symbol: "common" })).toBe(
      '<time symbol="common"><beats>6</beats><beat-type>8</beat-type></time>'
    );
  });

  it("extracts MusicXML time signature features", () => {
    const time = parseTime('<time symbol="cut"><beats>2</beats><beat-type>2</beat-type></time>');
    expect(extractMusicXmlTimeSignatureFeature(time)).toEqual({
      beats: 2,
      beatType: 2,
      symbol: "cut",
    });
  });
});
