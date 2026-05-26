/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildMusicXmlTransposeXml,
  extractMusicXmlTranspositionFeature,
  normalizeTranspositionFeature,
} from "../../src/ts/score-features/transposition";

const parseTranspose = (xml: string): Element => {
  const doc = new DOMParser().parseFromString(`<root>${xml}</root>`, "application/xml");
  const transpose = doc.querySelector("transpose");
  expect(transpose).not.toBeNull();
  if (!transpose) throw new Error("Missing transpose fixture.");
  return transpose;
};

describe("score transposition feature model", () => {
  it("normalizes finite diatonic and chromatic values", () => {
    expect(normalizeTranspositionFeature({ diatonic: 1.4, chromatic: "-2" })).toEqual({
      diatonic: 1,
      chromatic: -2,
    });
    expect(normalizeTranspositionFeature({ diatonic: Number.NaN })).toBeNull();
  });

  it("builds MusicXML transpose features", () => {
    expect(buildMusicXmlTransposeXml({ diatonic: 1, chromatic: 2 })).toBe(
      "<transpose><diatonic>1</diatonic><chromatic>2</chromatic></transpose>"
    );
    expect(buildMusicXmlTransposeXml({ chromatic: -1 })).toBe(
      "<transpose><chromatic>-1</chromatic></transpose>"
    );
  });

  it("extracts MusicXML transpose features", () => {
    const transpose = parseTranspose("<transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose>");
    expect(extractMusicXmlTranspositionFeature(transpose)).toEqual({
      diatonic: -1,
      chromatic: -2,
    });
  });
});
