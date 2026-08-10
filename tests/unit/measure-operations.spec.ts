/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  appendMeasureToMusicXml,
  extractMeasureEditorMusicXml,
  replaceMeasureInMusicXml,
} from "../../src/ts/measure-operations";

const singleStaffFixture = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Flute</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><rest/><duration>1440</duration><voice>1</voice></note>
    </measure>
    <measure number="2">
      <note><rest/><duration>1440</duration><voice>1</voice></note>
    </measure>
  </part>
</score-partwise>`;

const parse = (xml: string | null): Document => {
  expect(xml).not.toBeNull();
  return new DOMParser().parseFromString(xml ?? "", "application/xml");
};

describe("MusicXML measure operations", () => {
  it("extracts a self-contained measure with inherited rendering attributes", () => {
    const extracted = extractMeasureEditorMusicXml(singleStaffFixture, "P1", "2");
    const doc = parse(extracted);

    expect(doc.querySelector("part-name")?.textContent).toBe("");
    expect(doc.querySelector('measure[number="2"] attributes > divisions')?.textContent).toBe("480");
    expect(doc.querySelector('measure[number="2"] attributes > time > beats')?.textContent).toBe("3");
    expect(doc.querySelector('measure[number="2"] attributes > clef > sign')?.textContent).toBe("G");
  });

  it("replaces a measure without persisting attributes injected only for the editor", () => {
    const extracted = extractMeasureEditorMusicXml(singleStaffFixture, "P1", "2");
    expect(extracted).not.toBeNull();
    const editedDoc = parse(extracted);
    const duration = editedDoc.querySelector("measure > note > duration");
    expect(duration).not.toBeNull();
    if (duration) duration.textContent = "960";

    const merged = replaceMeasureInMusicXml(
      singleStaffFixture,
      "P1",
      "2",
      new XMLSerializer().serializeToString(editedDoc)
    );
    const mergedDoc = parse(merged);
    const replaced = mergedDoc.querySelector('part[id="P1"] > measure[number="2"]');

    expect(replaced?.querySelector(":scope > attributes")).toBeNull();
    expect(replaced?.querySelector(":scope > note > duration")?.textContent).toBe("960");
    expect(mergedDoc.querySelector('part[id="P1"] > measure[number="1"] attributes')).not.toBeNull();
  });

  it("appends a full-measure rest using inherited time and divisions", () => {
    const appended = appendMeasureToMusicXml(singleStaffFixture);
    const doc = parse(appended);
    const measure = doc.querySelector('part[id="P1"] > measure[number="3"]');

    expect(measure).not.toBeNull();
    expect(measure?.querySelectorAll(":scope > note")).toHaveLength(1);
    expect(measure?.querySelector(":scope > note > rest")?.getAttribute("measure")).toBe("yes");
    expect(measure?.querySelector(":scope > note > duration")?.textContent).toBe("1440");
    expect(measure?.querySelector(":scope > note > staff")).toBeNull();
  });

  it("appends synchronized rests and a backup for a treble-bass grand staff", () => {
    const source = `
      <score-partwise>
        <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
        <part id="P1"><measure number="intro">
          <attributes>
            <divisions>240</divisions>
            <time><beats>4</beats><beat-type>4</beat-type></time>
            <staves>2</staves>
            <clef number="1"><sign>G</sign><line>2</line></clef>
            <clef number="2"><sign>F</sign><line>4</line></clef>
          </attributes>
          <note><rest/><duration>960</duration><voice>1</voice><staff>1</staff></note>
          <backup><duration>960</duration></backup>
          <note><rest/><duration>960</duration><voice>1</voice><staff>2</staff></note>
        </measure></part>
      </score-partwise>`;
    const doc = parse(appendMeasureToMusicXml(source));
    const measure = doc.querySelector('part[id="P1"] > measure[number="2"]');

    expect(measure?.querySelectorAll(":scope > note")).toHaveLength(2);
    expect(Array.from(measure?.querySelectorAll(":scope > note > staff") ?? []).map(
      (staff) => staff.textContent
    )).toEqual(["1", "2"]);
    expect(measure?.querySelector(":scope > backup > duration")?.textContent).toBe("960");
  });

  it("returns null for invalid documents or missing operation targets", () => {
    expect(extractMeasureEditorMusicXml("<score-partwise", "P1", "1")).toBeNull();
    expect(extractMeasureEditorMusicXml(singleStaffFixture, "missing", "2")).toBeNull();
    expect(replaceMeasureInMusicXml(singleStaffFixture, "P1", "missing", singleStaffFixture)).toBeNull();
    expect(appendMeasureToMusicXml("<score-partwise")).toBeNull();
    expect(appendMeasureToMusicXml("<score-partwise><part-list/></score-partwise>")).toBeNull();
  });
});
