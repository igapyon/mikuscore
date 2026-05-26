/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";
import { buildMusicXmlBeamItemsXml } from "../../src/ts/beam-common";

describe("beam-common", () => {
  it("builds MusicXML beam items from beam assignments", () => {
    expect(buildMusicXmlBeamItemsXml({ state: "begin", levels: 2 })).toBe(
      '<beam number="1">begin</beam><beam number="2">begin</beam>'
    );
    expect(buildMusicXmlBeamItemsXml({ state: "end", levels: 0 })).toBe("");
  });
});
