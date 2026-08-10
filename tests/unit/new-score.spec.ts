/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createNewScoreMusicXml } from "../../src/ts/new-score";

const parseScore = (xml: string): Document => {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  expect(doc.querySelector("parsererror")).toBeNull();
  return doc;
};

describe("new score MusicXML generation", () => {
  it("creates the existing eight-measure multi-part score shape", () => {
    const doc = parseScore(createNewScoreMusicXml({
      partCount: 2,
      fifths: -3,
      beats: 6,
      beatType: 8,
      clefs: ["treble", "bass"],
    }));

    expect(doc.documentElement.getAttribute("version")).toBe("3.1");
    expect(doc.querySelectorAll("part-list > score-part")).toHaveLength(2);
    expect(doc.querySelectorAll("score-partwise > part")).toHaveLength(2);
    expect(doc.querySelectorAll("score-partwise > part > measure")).toHaveLength(16);
    expect(doc.querySelector("part-list > score-part:nth-of-type(1) > part-name")?.textContent).toBe("Part 1");
    expect(doc.querySelector("part-list > score-part:nth-of-type(2) > part-name")?.textContent).toBe("Part 2");
    expect(doc.querySelector('part[id="P1"] > measure:first-of-type attributes > clef > sign')?.textContent).toBe("G");
    expect(doc.querySelector('part[id="P2"] > measure:first-of-type attributes > clef > sign')?.textContent).toBe("F");
    expect(doc.querySelector('part[id="P1"] > measure:first-of-type attributes > key > fifths')?.textContent).toBe("-3");
    expect(doc.querySelector('part[id="P1"] > measure:first-of-type attributes > time > beats')?.textContent).toBe("6");
    expect(doc.querySelector('part[id="P1"] > measure:first-of-type note > duration')?.textContent).toBe("1440");
  });

  it("creates the existing single-part piano grand-staff template", () => {
    const doc = parseScore(createNewScoreMusicXml({
      usePianoGrandStaffTemplate: true,
      partCount: 8,
      beats: 4,
      beatType: 4,
    }));

    expect(doc.querySelectorAll("part-list > score-part")).toHaveLength(1);
    expect(doc.querySelector("part-list > score-part > part-name")?.textContent).toBe("Piano");
    expect(doc.querySelector("part-list > score-part midi-program")?.textContent).toBe("1");
    expect(doc.querySelector('part[id="P1"] > measure:first-of-type attributes > staves')?.textContent).toBe("2");
    expect(doc.querySelector('part[id="P1"] > measure:first-of-type attributes > clef[number="1"] > sign')?.textContent).toBe("G");
    expect(doc.querySelector('part[id="P1"] > measure:first-of-type attributes > clef[number="2"] > sign')?.textContent).toBe("F");
    expect(doc.querySelectorAll('part[id="P1"] > measure:first-of-type > note')).toHaveLength(2);
    expect(doc.querySelector('part[id="P1"] > measure:first-of-type > backup > duration')?.textContent).toBe("1920");
    expect(
      Array.from(doc.querySelectorAll('part[id="P1"] > measure:first-of-type > note > staff')).map(
        (staff) => staff.textContent
      )
    ).toEqual(["1", "2"]);
  });

  it("normalizes public options without relying on Web form controls", () => {
    const doc = parseScore(createNewScoreMusicXml({
      partCount: 99,
      fifths: 99,
      beats: 0,
      beatType: 3,
      clefs: ["unsupported"],
    }));

    expect(doc.querySelectorAll("part-list > score-part")).toHaveLength(16);
    expect(doc.querySelector('part[id="P1"] attributes > key > fifths')?.textContent).toBe("7");
    expect(doc.querySelector('part[id="P1"] attributes > time > beats')?.textContent).toBe("1");
    expect(doc.querySelector('part[id="P1"] attributes > time > beat-type')?.textContent).toBe("4");
    expect(doc.querySelector('part[id="P1"] attributes > clef > sign')?.textContent).toBe("G");
  });
});
