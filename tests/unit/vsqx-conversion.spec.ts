/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from "vitest";
import {
  convertMusicXmlToVsqxWithBridge,
  convertVsqxToMusicXmlWithBridge,
  type VsqxConversionBridge,
} from "../../src/ts/vsqx-conversion";

const createBridge = (): VsqxConversionBridge => ({
  convertVsqxToMusicXml: vi.fn(() => "<score-partwise/>"),
  convertVsqxToMusicXmlWithReport: vi.fn(() => ({
    musicXml: "<score-partwise/>",
    issues: [],
  })),
  convertMusicXmlToVsqx: vi.fn(() => "<vsq3/>"),
});

describe("value-based VSQX conversion", () => {
  it("converts through an explicitly supplied bridge and preserves report diagnostics", () => {
    const bridge = createBridge();
    bridge.convertVsqxToMusicXmlWithReport = vi.fn(() => ({
      musicXml: "<score-partwise/>",
      issues: [
        { level: "warning", code: "W_TEST", message: "warning" },
        { level: "error", code: "E_TEST", message: "error" },
      ],
    }));

    const result = convertVsqxToMusicXmlWithBridge(
      bridge,
      "<vsq3/>",
      { defaultLyric: "la" }
    );

    expect(bridge.convertVsqxToMusicXmlWithReport).toHaveBeenCalledWith(
      "<vsq3/>",
      { defaultLyric: "la" }
    );
    expect(result).toEqual({
      ok: false,
      xml: "<score-partwise/>",
      diagnostics: [{ code: "E_TEST", message: "error" }],
      warnings: [{ code: "W_TEST", message: "warning" }],
    });
  });

  it("exports through an explicitly supplied bridge", () => {
    const bridge = createBridge();

    const result = convertMusicXmlToVsqxWithBridge(
      bridge,
      "<score-partwise/>",
      { splitPartStaves: true }
    );

    expect(result).toEqual({ ok: true, vsqx: "<vsq3/>" });
    expect(bridge.convertMusicXmlToVsqx).toHaveBeenCalledWith(
      "<score-partwise/>",
      { splitPartStaves: true }
    );
  });

  it("returns stable results when no bridge capability is supplied", () => {
    expect(convertVsqxToMusicXmlWithBridge(null, "<vsq3/>")).toMatchObject({
      ok: false,
      diagnostics: [{ code: "VSQX_BRIDGE_UNAVAILABLE" }],
    });
    expect(convertMusicXmlToVsqxWithBridge(null, "<score-partwise/>")).toMatchObject({
      ok: false,
      diagnostic: { code: "VSQX_BRIDGE_UNAVAILABLE" },
    });
  });
});
