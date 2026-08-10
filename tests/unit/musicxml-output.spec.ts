/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  stripMetadataFromMusicXml,
  summarizeImportedDiagWarnings,
} from "../../src/ts/musicxml-output";

const metadataFixture = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <miscellaneous>
          <miscellaneous-field name="mks:meta:test">meta</miscellaneous-field>
          <miscellaneous-field name="mks:src:test">source</miscellaneous-field>
          <miscellaneous-field name="mks:dbg:test">debug</miscellaneous-field>
          <miscellaneous-field name="mks:diag:0001">code=OTHER_WARNING</miscellaneous-field>
          <miscellaneous-field name="other:test">other</miscellaneous-field>
        </miscellaneous>
      </attributes>
    </measure>
    <measure number="2">
      <attributes>
        <miscellaneous>
          <miscellaneous-field name="mks:dbg:only">debug only</miscellaneous-field>
        </miscellaneous>
      </attributes>
    </measure>
  </part>
</score-partwise>`;

describe("MusicXML output metadata policy", () => {
  it("returns the original text unchanged when all metadata families are kept", () => {
    expect(stripMetadataFromMusicXml(metadataFixture, {
      keepMeta: true,
      keepSrc: true,
      keepDbg: true,
    })).toBe(metadataFixture);
  });

  it("removes selected mks families and prunes empty containers", () => {
    const output = stripMetadataFromMusicXml(metadataFixture, {
      keepMeta: false,
      keepSrc: true,
      keepDbg: false,
    });
    const doc = new DOMParser().parseFromString(output, "application/xml");

    expect(doc.querySelector('miscellaneous-field[name="mks:meta:test"]')).toBeNull();
    expect(doc.querySelector('miscellaneous-field[name="mks:src:test"]')?.textContent).toBe("source");
    expect(doc.querySelector('miscellaneous-field[name="mks:dbg:test"]')).toBeNull();
    expect(doc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toBe("code=OTHER_WARNING");
    expect(doc.querySelector('miscellaneous-field[name="other:test"]')?.textContent).toBe("other");
    expect(doc.querySelector('measure[number="2"] > attributes')).toBeNull();
  });

  it("keeps invalid input unchanged", () => {
    const invalid = "<not-musicxml";
    expect(stripMetadataFromMusicXml(invalid, {
      keepMeta: false,
      keepSrc: false,
      keepDbg: false,
    })).toBe(invalid);
  });
});

describe("imported diagnostic summary", () => {
  it("summarizes the existing ABC warning categories and skips the count field", () => {
    const xml = `
      <score-partwise>
        <miscellaneous-field name="mks:diag:count">4</miscellaneous-field>
        <miscellaneous-field name="mks:diag:0001">code=OVERFULL_REFLOWED;message=one</miscellaneous-field>
        <miscellaneous-field name="mks:diag:0002">message=two;code=overfull_reflowed</miscellaneous-field>
        <miscellaneous-field name="mks:diag:0003">code=ABC_IMPORT_WARNING</miscellaneous-field>
        <miscellaneous-field name="mks:diag:0004">code=OTHER_WARNING</miscellaneous-field>
      </score-partwise>`;

    expect(summarizeImportedDiagWarnings(xml)).toBe(
      "ABC overfull auto-reflow: 2 / ABC parser warnings: 1"
    );
  });

  it("returns an empty summary for invalid MusicXML", () => {
    expect(summarizeImportedDiagWarnings("<score-partwise")).toBe("");
  });
});
