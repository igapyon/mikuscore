/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildMusicXmlPitchXml,
  extractMusicXmlPitchFeature,
  normalizePitchFeature,
} from "../../src/ts/score-features/pitches";

const parsePitch = (xml: string): Element => {
  const doc = new DOMParser().parseFromString(`<root>${xml}</root>`, "application/xml");
  const pitch = doc.querySelector("pitch");
  expect(pitch).not.toBeNull();
  if (!pitch) throw new Error("Missing pitch fixture.");
  return pitch;
};

describe("score pitch feature model", () => {
  it("normalizes MusicXML pitch values", () => {
    expect(normalizePitchFeature({ step: " f ", alter: "-1", octave: 4.4 })).toEqual({
      step: "F",
      alter: -1,
      octave: 4,
    });
    expect(normalizePitchFeature({ step: "x", octave: 20 })).toEqual({
      step: "C",
      octave: 9,
    });
  });

  it("builds MusicXML pitch features", () => {
    expect(buildMusicXmlPitchXml({ step: "C", octave: 4 })).toBe(
      "<pitch><step>C</step><octave>4</octave></pitch>"
    );
    expect(buildMusicXmlPitchXml({ step: "F", alter: 1, octave: 5 })).toBe(
      "<pitch><step>F</step><alter>1</alter><octave>5</octave></pitch>"
    );
  });

  it("extracts MusicXML pitch features", () => {
    const pitch = parsePitch("<pitch><step>B</step><alter>-1</alter><octave>3</octave></pitch>");
    expect(extractMusicXmlPitchFeature(pitch)).toEqual({
      step: "B",
      alter: -1,
      octave: 3,
    });
  });
});
