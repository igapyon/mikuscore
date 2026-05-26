/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";
import {
  buildMusicXmlBackupXml,
  buildMusicXmlForwardXml,
} from "../../src/ts/score-features/measure-flow";

describe("score measure flow helpers", () => {
  it("builds MusicXML backup controls", () => {
    expect(buildMusicXmlBackupXml({ duration: 960.2 })).toBe(
      "<backup><duration>960</duration></backup>"
    );
    expect(buildMusicXmlBackupXml({ duration: 0 })).toBe("");
  });

  it("builds MusicXML forward controls", () => {
    expect(buildMusicXmlForwardXml({ duration: 120, voice: 2, staff: 1 })).toBe(
      "<forward><duration>120</duration><voice>2</voice><staff>1</staff></forward>"
    );
  });
});
