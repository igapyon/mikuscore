/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { parseMusicXmlDocument } from "../../src/ts/musicxml-io";
import {
  prepareMusicXmlDomForVerovio,
  renderMusicXmlDomWithVerovioToolkit,
  renderMusicXmlWithVerovioToolkit,
  type VerovioToolkitApi,
} from "../../src/ts/verovio-render";

const scoreWithMixedSlurs = `
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <note><rest/><duration>1</duration><notations><slur type="stop" number="1"/></notations></note>
    <note><rest/><duration>1</duration><notations><slur type="start" number="1"/></notations></note>
    <note><rest/><duration>1</duration><notations><slur type="start" number="2"/></notations></note>
    <note><rest/><duration>1</duration><notations><slur type="stop" number="2"/></notations></note>
  </measure></part>
</score-partwise>`;

const parseScore = (): Document => {
  const doc = parseMusicXmlDocument(scoreWithMixedSlurs);
  if (!doc) throw new Error("test MusicXML did not parse");
  return doc;
};

describe("value-based Verovio rendering", () => {
  it("sanitizes unmatched slurs on a clone while preserving the source document", () => {
    const source = parseScore();
    const prepared = prepareMusicXmlDomForVerovio(source);

    expect(source.querySelectorAll("slur")).toHaveLength(4);
    expect(prepared.querySelectorAll('slur[number="1"]')).toHaveLength(0);
    expect(prepared.querySelectorAll('slur[number="2"]')).toHaveLength(2);
    expect(prepared.querySelectorAll("notations")).toHaveLength(2);
  });

  it("renders through an explicitly supplied toolkit and serializer", () => {
    const source = parseScore();
    const toolkit: VerovioToolkitApi = {
      setOptions: vi.fn(),
      loadData: vi.fn(() => true),
      getPageCount: vi.fn(() => 2),
      renderToSVG: vi.fn(() => "<svg/>"),
    };

    const result = renderMusicXmlDomWithVerovioToolkit(
      source,
      { scale: 40 },
      toolkit,
      (doc) => new XMLSerializer().serializeToString(doc)
    );

    expect(result).toEqual({ svg: "<svg/>", pageCount: 2 });
    expect(toolkit.setOptions).toHaveBeenCalledWith({ scale: 40 });
    expect(toolkit.loadData).toHaveBeenCalledWith(expect.not.stringContaining('slur type="stop" number="1"'));
    expect(toolkit.renderToSVG).toHaveBeenCalledWith(1, {});
    expect(source.querySelectorAll("slur")).toHaveLength(4);
  });

  it("reports stable failures from the toolkit contract", () => {
    const toolkit: VerovioToolkitApi = {
      setOptions: vi.fn(),
      loadData: vi.fn(() => false),
      getPageCount: vi.fn(() => 1),
      renderToSVG: vi.fn(() => "<svg/>"),
    };

    expect(() => renderMusicXmlWithVerovioToolkit("<score-partwise/>", {}, toolkit))
      .toThrow("verovio loadData failed.");
  });
});
