/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildMusicXmlDirectionFeatureXml,
  extractMusicXmlDirectionFeatures,
  normalizeDynamicMark,
  velocityToDynamicMark,
} from "../../src/ts/score-features/dynamics";

const parseDirection = (xml: string): Element => {
  const doc = new DOMParser().parseFromString(`<root>${xml}</root>`, "application/xml");
  const direction = doc.querySelector("direction");
  expect(direction).not.toBeNull();
  if (!direction) throw new Error("Missing direction fixture.");
  return direction;
};

describe("score dynamics feature model", () => {
  it("normalizes supported dynamic marks", () => {
    expect(normalizeDynamicMark("MF")).toBe("mf");
    expect(normalizeDynamicMark(" sfz ")).toBe("sfz");
    expect(normalizeDynamicMark("unknown")).toBeNull();
  });

  it("maps MIDI velocity bands to dynamic marks", () => {
    expect(velocityToDynamicMark(1)).toBe("ppp");
    expect(velocityToDynamicMark(64)).toBe("mf");
    expect(velocityToDynamicMark(127)).toBe("fff");
  });

  it("builds and extracts MusicXML dynamic directions", () => {
    const xml = buildMusicXmlDirectionFeatureXml({
      kind: "dynamic",
      mark: "mf",
      offsetDiv: 12,
      voice: "1",
      staff: 2,
      placement: "below",
    });
    expect(xml).toBe(
      '<direction placement="below"><direction-type><dynamics><mf/></dynamics></direction-type><offset>12</offset><voice>1</voice><staff>2</staff></direction>'
    );
    expect(extractMusicXmlDirectionFeatures(parseDirection(xml))).toEqual([
      {
        kind: "dynamic",
        mark: "mf",
        offsetDiv: 12,
        voice: "1",
        staff: "2",
        placement: "below",
      },
    ]);
  });

  it("builds and extracts MusicXML wedge directions", () => {
    const xml = buildMusicXmlDirectionFeatureXml({
      kind: "wedge",
      wedgeType: "crescendo",
      number: "2",
      offsetDiv: 4,
      staff: 1,
    });
    expect(xml).toBe(
      '<direction><direction-type><wedge type="crescendo" number="2"/></direction-type><offset>4</offset><staff>1</staff></direction>'
    );
    expect(extractMusicXmlDirectionFeatures(parseDirection(xml))).toEqual([
      {
        kind: "wedge",
        wedgeType: "crescendo",
        number: "2",
        offsetDiv: 4,
        staff: "1",
      },
    ]);
  });
});
