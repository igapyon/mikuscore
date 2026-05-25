/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildMusicXmlBarlineXml,
  extractMusicXmlBarlineFeature,
} from "../../src/ts/score-features/barlines";

const parseBarline = (xml: string): Element => {
  const doc = new DOMParser().parseFromString(`<root>${xml}</root>`, "application/xml");
  const barline = doc.querySelector("barline");
  expect(barline).not.toBeNull();
  if (!barline) throw new Error("Missing barline fixture.");
  return barline;
};

describe("score barlines feature model", () => {
  it("builds MusicXML barline features", () => {
    expect(buildMusicXmlBarlineXml({
      location: "right",
      barStyle: "light-heavy",
      repeats: ["backward"],
      ending: { number: 2, type: "stop" },
    })).toBe(
      '<barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward"/><ending number="2" type="stop"/></barline>'
    );
  });

  it("extracts MusicXML barline features", () => {
    const barline = parseBarline(
      '<barline location="middle"><bar-style>light-heavy</bar-style><repeat direction="backward"/><repeat direction="forward"/></barline>'
    );
    expect(extractMusicXmlBarlineFeature(barline)).toEqual({
      location: "middle",
      barStyle: "light-heavy",
      repeats: ["backward", "forward"],
    });
  });
});
