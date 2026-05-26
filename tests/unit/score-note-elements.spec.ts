/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";
import {
  buildMusicXmlAccidentalXml,
  buildMusicXmlFingeringXml,
  buildMusicXmlGraceXml,
  buildMusicXmlLyricXml,
  buildMusicXmlStemXml,
  buildMusicXmlStringNumberXml,
  buildMusicXmlTechnicalXml,
  normalizeAccidentalFeature,
  normalizeLyricFeature,
} from "../../src/ts/score-features/note-elements";

describe("score note element helpers", () => {
  it("normalizes accidental text and flags", () => {
    expect(normalizeAccidentalFeature({ text: " sharp ", editorial: true })).toEqual({
      text: "sharp",
      editorial: true,
    });
    expect(normalizeAccidentalFeature({ text: "" })).toBeNull();
  });

  it("builds MusicXML accidentals", () => {
    expect(buildMusicXmlAccidentalXml({ text: "flat", cautionary: true })).toBe(
      '<accidental cautionary="yes">flat</accidental>'
    );
    expect(buildMusicXmlAccidentalXml({ text: "sharp & flat" })).toBe(
      "<accidental>sharp &amp; flat</accidental>"
    );
  });

  it("builds MusicXML grace items", () => {
    expect(buildMusicXmlGraceXml()).toBe("<grace/>");
    expect(buildMusicXmlGraceXml({ slash: true })).toBe('<grace slash="yes"/>');
  });

  it("builds MusicXML stem items", () => {
    expect(buildMusicXmlStemXml("up")).toBe("<stem>up</stem>");
    expect(buildMusicXmlStemXml("sideways")).toBe("");
  });

  it("normalizes and builds MusicXML lyric items", () => {
    expect(normalizeLyricFeature({ text: " la ", syllabic: "single", extend: true })).toEqual({
      text: "la",
      syllabic: "single",
      extend: true,
    });
    expect(buildMusicXmlLyricXml({ text: "a & b", syllabic: "begin" })).toBe(
      "<lyric><syllabic>begin</syllabic><text>a &amp; b</text></lyric>"
    );
  });

  it("builds MusicXML technical items", () => {
    expect(buildMusicXmlFingeringXml(" 2 ")).toBe("<fingering>2</fingering>");
    expect(buildMusicXmlStringNumberXml(3.4)).toBe("<string>3.4</string>");
    expect(buildMusicXmlStringNumberXml(3.4, { roundNumeric: true })).toBe("<string>3</string>");
    expect(buildMusicXmlTechnicalXml(["<fingering>2</fingering>", ""])).toBe(
      "<technical><fingering>2</fingering></technical>"
    );
  });
});
