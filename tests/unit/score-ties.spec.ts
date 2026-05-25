/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildMusicXmlTieItemsXml,
  buildMusicXmlTiedItemsXml,
  extractMusicXmlTieState,
} from "../../src/ts/score-features/ties";

const parseNote = (xml: string): Element => {
  const doc = new DOMParser().parseFromString(`<note>${xml}</note>`, "application/xml");
  const note = doc.querySelector("note");
  expect(note).not.toBeNull();
  if (!note) throw new Error("Missing note fixture.");
  return note;
};

describe("score ties feature model", () => {
  it("builds MusicXML tie and tied items", () => {
    expect(buildMusicXmlTieItemsXml({ tieStart: true, tieStop: true })).toBe(
      '<tie type="stop"/><tie type="start"/>'
    );
    expect(buildMusicXmlTiedItemsXml({ tiedStart: true, tiedStop: false })).toBe('<tied type="start"/>');
  });

  it("extracts sound tie and notation tied state separately", () => {
    const note = parseNote('<tie type="start"/><notations><tied type="stop"/></notations>');
    expect(extractMusicXmlTieState(note)).toEqual({
      tieStart: true,
      tieStop: false,
      tiedStart: false,
      tiedStop: true,
    });
  });
});
