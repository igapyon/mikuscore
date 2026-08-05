/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";
import { preparePreviewSvgIdMap } from "../../src/ts/preview-flow";

describe("preview-flow SVG id map preparation", () => {
  it("uses the direct render map when rendered note ids already include miku-score ids", () => {
    const directMap = new Map([["mks-note-1", "node-1"]]);
    const fallbackMap = new Map([["vrv-note-1", "node-1"]]);
    let fallbackCalled = false;

    const result = preparePreviewSvgIdMap(
      { svgIdToNodeId: directMap },
      ["node-1"],
      ["mks-note-1"],
      () => {
        fallbackCalled = true;
        return fallbackMap;
      }
    );

    expect(result.mapMode).toBe("direct");
    expect(result.map).toBe(directMap);
    expect(fallbackCalled).toBe(false);
  });

  it("builds a sequential fallback map when verovio rendered ids do not include miku-score ids", () => {
    const directMap = new Map([["mks-note-1", "node-1"]]);
    const fallbackMap = new Map([["vrv-note-1", "node-1"]]);
    let fallbackArgs: { noteNodeIds: string[]; renderedNoteIds: string[] } | null = null;

    const result = preparePreviewSvgIdMap(
      { svgIdToNodeId: directMap },
      ["node-1"],
      ["vrv-note-1"],
      (noteNodeIds, renderedNoteIds) => {
        fallbackArgs = { noteNodeIds, renderedNoteIds };
        return fallbackMap;
      }
    );

    expect(result.mapMode).toBe("fallback-seq");
    expect(result.map).toBe(fallbackMap);
    expect(fallbackArgs).toEqual({
      noteNodeIds: ["node-1"],
      renderedNoteIds: ["vrv-note-1"],
    });
  });

  it("keeps the direct map when there are no rendered note ids to align", () => {
    const directMap = new Map([["mks-note-1", "node-1"]]);

    const result = preparePreviewSvgIdMap(
      { svgIdToNodeId: directMap },
      ["node-1"],
      [],
      () => new Map([["fallback", "node-1"]])
    );

    expect(result.mapMode).toBe("direct");
    expect(result.map).toBe(directMap);
  });
});
