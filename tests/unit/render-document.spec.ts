/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  dedupeGlobalTempoDirectionsInRenderDocument,
  prepareMusicXmlRenderDocument,
} from "../../src/ts/render-document";

const multiPartFixture = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Part 1</part-name></score-part>
    <score-part id="P2"><part-name>Part 2</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <direction id="first-tempo">
        <direction-type>
          <words>Allegro</words>
          <metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome>
        </direction-type>
        <sound tempo="120"/>
      </direction>
      <note><rest/><duration>480</duration></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <direction id="duplicate-tempo">
        <direction-type>
          <words>  ALLEGRO  </words>
          <metronome><beat-unit>QUARTER</beat-unit><per-minute>120</per-minute></metronome>
        </direction-type>
        <offset>0</offset>
        <sound tempo="120"/>
      </direction>
      <direction id="different-offset">
        <direction-type><words>Allegro</words></direction-type>
        <offset>480</offset>
      </direction>
      <direction id="non-tempo"><direction-type><dynamics><f/></dynamics></direction-type></direction>
      <note><rest/><duration>480</duration></note>
    </measure>
  </part>
</score-partwise>`;

describe("MusicXML render-document preparation", () => {
  it("deduplicates matching global tempo directions and preserves distinct directions", () => {
    const prepared = prepareMusicXmlRenderDocument(multiPartFixture);
    const doc = prepared.renderDoc;

    expect(doc).not.toBeNull();
    expect(doc?.querySelector("#first-tempo")).not.toBeNull();
    expect(doc?.querySelector("#duplicate-tempo")).toBeNull();
    expect(doc?.querySelector("#different-offset")).not.toBeNull();
    expect(doc?.querySelector("#non-tempo")).not.toBeNull();
    expect(prepared.noteCount).toBe(0);
    expect(prepared.svgIdToNodeId.size).toBe(0);
  });

  it("adds stable render ids while preparing the deduplicated document", () => {
    const prepared = prepareMusicXmlRenderDocument(multiPartFixture, {
      nodeIds: ["note-a", "note-b"],
      idPrefix: "mks-test",
    });
    const notes = Array.from(prepared.renderDoc?.querySelectorAll("note") ?? []);

    expect(prepared.noteCount).toBe(2);
    expect(prepared.svgIdToNodeId).toEqual(new Map([
      ["mks-test-note-a", "note-a"],
      ["mks-test-note-b", "note-b"],
    ]));
    expect(notes.map((note) => note.getAttribute("id"))).toEqual([
      "mks-test-note-a",
      "mks-test-note-b",
    ]);
    expect(prepared.renderDoc?.querySelector("#duplicate-tempo")).toBeNull();
  });

  it("keeps duplicate directions in a single-part score, matching the existing render policy", () => {
    const doc = new DOMParser().parseFromString(`
      <score-partwise>
        <part id="P1"><measure number="1">
          <direction><direction-type><words>Moderato</words></direction-type></direction>
          <direction><direction-type><words>Moderato</words></direction-type></direction>
        </measure></part>
      </score-partwise>
    `, "application/xml");

    dedupeGlobalTempoDirectionsInRenderDocument(doc);

    expect(doc.querySelectorAll("direction")).toHaveLength(2);
  });

  it("reports invalid XML without a partially prepared document", () => {
    const prepared = prepareMusicXmlRenderDocument("<score-partwise");

    expect(prepared.renderDoc).toBeNull();
    expect(prepared.noteCount).toBe(0);
    expect(prepared.svgIdToNodeId.size).toBe(0);
  });
});
