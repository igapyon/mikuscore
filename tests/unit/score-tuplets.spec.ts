/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildMusicXmlTimeModificationXml,
  extractMusicXmlTimeModificationFeature,
  normalizeTimeModificationFeature,
} from "../../src/ts/score-features/tuplets";

const parseNote = (xml: string): Element => {
  const doc = new DOMParser().parseFromString(`<root>${xml}</root>`, "application/xml");
  const note = doc.querySelector("note");
  expect(note).not.toBeNull();
  if (!note) throw new Error("Missing note fixture.");
  return note;
};

describe("score tuplet feature model", () => {
  it("normalizes positive time-modification values", () => {
    expect(normalizeTimeModificationFeature({ actualNotes: 3.4, normalNotes: 2.2 })).toEqual({
      actualNotes: 3,
      normalNotes: 2,
    });
    expect(normalizeTimeModificationFeature({ actualNotes: 0, normalNotes: 2 })).toBeNull();
  });

  it("builds MusicXML time-modification features", () => {
    expect(buildMusicXmlTimeModificationXml({ actualNotes: 3, normalNotes: 2 })).toBe(
      "<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>"
    );
  });

  it("extracts MusicXML time-modification features", () => {
    const note = parseNote(
      "<note><time-modification><actual-notes>5</actual-notes><normal-notes>4</normal-notes></time-modification></note>"
    );
    expect(extractMusicXmlTimeModificationFeature(note)).toEqual({
      actualNotes: 5,
      normalNotes: 4,
    });
  });
});
