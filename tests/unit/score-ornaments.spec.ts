/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildMusicXmlOrnamentItemsXml,
  buildMusicXmlOrnamentsXml,
  extractMusicXmlOrnamentFeatures,
  normalizeOrnamentKind,
} from "../../src/ts/score-features/ornaments";

const parseNote = (ornamentsXml: string): Element => {
  const doc = new DOMParser().parseFromString(
    `<note><notations>${ornamentsXml}</notations></note>`,
    "application/xml"
  );
  const note = doc.querySelector("note");
  expect(note).not.toBeNull();
  if (!note) throw new Error("Missing note fixture.");
  return note;
};

describe("score ornaments feature model", () => {
  it("normalizes supported ornament kinds", () => {
    expect(normalizeOrnamentKind("Trill-Mark")).toBe("trill-mark");
    expect(normalizeOrnamentKind("inverted-mordent")).toBe("inverted-mordent");
    expect(normalizeOrnamentKind("wavy-line")).toBeNull();
  });

  it("builds MusicXML ornament items with stable deduplication", () => {
    expect(buildMusicXmlOrnamentItemsXml([
      { kind: "trill-mark" },
      { kind: "turn", slash: true },
      { kind: "trill-mark" },
      { kind: "tremolo", tremoloType: "single", marks: 3 },
    ])).toBe('<trill-mark/><turn slash="yes"/><tremolo type="single">3</tremolo>');
    expect(buildMusicXmlOrnamentsXml([{ kind: "mordent" }])).toBe("<ornaments><mordent/></ornaments>");
  });

  it("extracts supported MusicXML ornament features", () => {
    const note = parseNote(
      '<ornaments><trill-mark/><turn slash="yes"/><tremolo type="start">2</tremolo><wavy-line type="start"/></ornaments>'
    );
    expect(extractMusicXmlOrnamentFeatures(note)).toEqual([
      { kind: "trill-mark" },
      { kind: "turn", slash: true },
      { kind: "tremolo", tremoloType: "start", marks: 2 },
    ]);
  });
});
