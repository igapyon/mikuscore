/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildMusicXmlArticulationItemsXml,
  buildMusicXmlArticulationsXml,
  extractMusicXmlArticulationKinds,
  normalizeArticulationKind,
} from "../../src/ts/score-features/articulations";

const parseNote = (articulationsXml: string): Element => {
  const doc = new DOMParser().parseFromString(
    `<note><notations>${articulationsXml}</notations></note>`,
    "application/xml"
  );
  const note = doc.querySelector("note");
  expect(note).not.toBeNull();
  if (!note) throw new Error("Missing note fixture.");
  return note;
};

describe("score articulations feature model", () => {
  it("normalizes supported articulation kinds", () => {
    expect(normalizeArticulationKind("Accent")).toBe("accent");
    expect(normalizeArticulationKind("breath-mark")).toBe("breath-mark");
    expect(normalizeArticulationKind("trill-mark")).toBeNull();
  });

  it("builds MusicXML articulations with stable deduplication", () => {
    expect(buildMusicXmlArticulationItemsXml(["staccato", "accent", "staccato"])).toBe(
      "<staccato/><accent/>"
    );
    expect(buildMusicXmlArticulationsXml(["staccato", "accent", "staccato"])).toBe(
      "<articulations><staccato/><accent/></articulations>"
    );
  });

  it("extracts supported MusicXML articulation kinds", () => {
    const note = parseNote("<articulations><staccato/><accent/><caesura/><other-articulation>x</other-articulation></articulations>");
    expect(extractMusicXmlArticulationKinds(note)).toEqual(["staccato", "accent", "caesura"]);
  });
});
