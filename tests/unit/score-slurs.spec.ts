/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildMusicXmlSlurXml,
  buildMusicXmlSlursXml,
  extractMusicXmlSlurFeatures,
} from "../../src/ts/score-features/slurs";

const parseNote = (slursXml: string): Element => {
  const doc = new DOMParser().parseFromString(
    `<note><notations>${slursXml}</notations></note>`,
    "application/xml"
  );
  const note = doc.querySelector("note");
  expect(note).not.toBeNull();
  if (!note) throw new Error("Missing note fixture.");
  return note;
};

describe("score slurs feature model", () => {
  it("builds MusicXML slur items", () => {
    expect(buildMusicXmlSlurXml({ type: "start", number: 2, placement: "above" })).toBe(
      '<slur type="start" number="2" placement="above"/>'
    );
    expect(buildMusicXmlSlursXml([{ type: "start" }, { type: "stop", number: 1 }])).toBe(
      '<slur type="start"/><slur type="stop" number="1"/>'
    );
  });

  it("extracts supported MusicXML slur features", () => {
    const note = parseNote('<slur type="start" number="2" placement="below"/><slur type="stop" number="2"/><slur type="continue"/>');
    expect(extractMusicXmlSlurFeatures(note)).toEqual([
      { type: "start", number: 2, placement: "below" },
      { type: "stop", number: 2 },
    ]);
  });
});
