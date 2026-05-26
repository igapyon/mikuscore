/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildMusicXmlDotsXml,
  countMusicXmlDots,
  normalizeDotCount,
} from "../../src/ts/score-features/durations";

const parseNote = (xml: string): Element => {
  const doc = new DOMParser().parseFromString(`<root>${xml}</root>`, "application/xml");
  const note = doc.querySelector("note");
  expect(note).not.toBeNull();
  if (!note) throw new Error("Missing note fixture.");
  return note;
};

describe("score duration feature helpers", () => {
  it("normalizes dot counts", () => {
    expect(normalizeDotCount(2.2)).toBe(2);
    expect(normalizeDotCount(0)).toBe(0);
    expect(normalizeDotCount(Number.NaN)).toBe(0);
  });

  it("builds MusicXML dot items", () => {
    expect(buildMusicXmlDotsXml(3)).toBe("<dot/><dot/><dot/>");
  });

  it("counts MusicXML dot items", () => {
    const note = parseNote("<note><dot/><dot/></note>");
    expect(countMusicXmlDots(note)).toBe(2);
  });
});
