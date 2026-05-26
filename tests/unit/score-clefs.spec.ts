/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildMusicXmlClefXml,
  extractMusicXmlClefFeature,
  normalizeClefFeature,
} from "../../src/ts/score-features/clefs";

const parseClef = (xml: string): Element => {
  const doc = new DOMParser().parseFromString(`<root>${xml}</root>`, "application/xml");
  const clef = doc.querySelector("clef");
  expect(clef).not.toBeNull();
  if (!clef) throw new Error("Missing clef fixture.");
  return clef;
};

describe("score clef feature model", () => {
  it("normalizes clef sign, line, and optional number", () => {
    expect(normalizeClefFeature({ sign: " G ", line: 2.2, number: " 1 " })).toEqual({
      sign: "G",
      line: 2,
      number: "1",
    });
    expect(normalizeClefFeature({ sign: "", line: 2 })).toBeNull();
  });

  it("builds MusicXML clef features", () => {
    expect(buildMusicXmlClefXml({ sign: "F", line: 4, number: 2 })).toBe(
      '<clef number="2"><sign>F</sign><line>4</line></clef>'
    );
  });

  it("extracts MusicXML clef features", () => {
    const clef = parseClef('<clef number="1"><sign>C</sign><line>3</line></clef>');
    expect(extractMusicXmlClefFeature(clef)).toEqual({
      sign: "C",
      line: 3,
      number: "1",
    });
  });
});
