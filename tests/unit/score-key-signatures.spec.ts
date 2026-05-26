/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildMusicXmlKeySignatureXml,
  extractMusicXmlKeySignatureFeature,
  normalizeKeySignatureFeature,
} from "../../src/ts/score-features/key-signatures";

const parseKey = (xml: string): Element => {
  const doc = new DOMParser().parseFromString(`<root>${xml}</root>`, "application/xml");
  const key = doc.querySelector("key");
  expect(key).not.toBeNull();
  if (!key) throw new Error("Missing key signature fixture.");
  return key;
};

describe("score key signature feature model", () => {
  it("normalizes fifths and optional mode", () => {
    expect(normalizeKeySignatureFeature({ fifths: -2.4, mode: " Minor " })).toEqual({
      fifths: -2,
      mode: "minor",
    });
    expect(normalizeKeySignatureFeature({ fifths: Number.NaN })).toBeNull();
  });

  it("builds MusicXML key signature features", () => {
    expect(buildMusicXmlKeySignatureXml({ fifths: 3, mode: "major" })).toBe(
      "<key><fifths>3</fifths><mode>major</mode></key>"
    );
    expect(buildMusicXmlKeySignatureXml({ fifths: -1 })).toBe("<key><fifths>-1</fifths></key>");
  });

  it("extracts MusicXML key signature features", () => {
    const key = parseKey("<key><fifths>1</fifths><mode>minor</mode></key>");
    expect(extractMusicXmlKeySignatureFeature(key)).toEqual({
      fifths: 1,
      mode: "minor",
    });
  });
});
