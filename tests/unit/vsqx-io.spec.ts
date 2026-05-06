/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from "vitest";
import { convertMusicXmlToVsqx, convertVsqxToMusicXml, type VsqxIssue } from "../../src/ts/vsqx-io";

type MutableWindow = Window & typeof globalThis;

const clearVsqxBridge = (): void => {
  delete window.UtaFormatix3TsPlusMikuscore;
};

const installVsqxExportBridge = (convertMusicXmlToVsqx: () => string): void => {
  (window as MutableWindow).UtaFormatix3TsPlusMikuscore = {
    convertVsqxToMusicXml: () => "<score-partwise/>",
    convertVsqxToMusicXmlWithReport: () => ({ musicXml: "<score-partwise/>", issues: [] }),
    convertMusicXmlToVsqx,
  };
};

const installVsqxImportBridge = (musicXml: string): void => {
  (window as MutableWindow).UtaFormatix3TsPlusMikuscore = {
    convertVsqxToMusicXml: () => musicXml,
    convertVsqxToMusicXmlWithReport: () => ({ musicXml, issues: [] }),
    convertMusicXmlToVsqx: () => "<vsq3/>",
  };
};

const installVsqxImportReportBridge = (musicXml: string, issues: VsqxIssue[]): void => {
  (window as MutableWindow).UtaFormatix3TsPlusMikuscore = {
    convertVsqxToMusicXml: () => musicXml,
    convertVsqxToMusicXmlWithReport: () => ({ musicXml, issues }),
    convertMusicXmlToVsqx: () => "<vsq3/>",
  };
};

describe("vsqx-io bridge diagnostics", () => {
  afterEach(() => {
    clearVsqxBridge();
  });

  it("reports a stable diagnostic when VSQX import bridge is unavailable", () => {
    clearVsqxBridge();

    const result = convertVsqxToMusicXml("<vsq3/>");

    expect(result.ok).toBe(false);
    expect(result.xml).toBe("");
    expect(result.diagnostics).toEqual([
      {
        code: "VSQX_BRIDGE_UNAVAILABLE",
        message: "VSQX converter bundle is not loaded.",
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("reports a stable diagnostic when VSQX export bridge is unavailable", () => {
    clearVsqxBridge();

    const result = convertMusicXmlToVsqx("<score-partwise/>");

    expect(result).toEqual({
      ok: false,
      vsqx: "",
      diagnostic: {
        code: "VSQX_BRIDGE_UNAVAILABLE",
        message: "VSQX converter bundle is not loaded.",
      },
    });
  });

  it("reports a stable diagnostic when VSQX import returns empty MusicXML", () => {
    installVsqxImportBridge(" ");

    const result = convertVsqxToMusicXml("<vsq3/>");

    expect(result).toEqual({
      ok: false,
      xml: "",
      diagnostics: [
        {
          code: "VSQX_CONVERT_EMPTY_RESULT",
          message: "VSQX converter returned empty MusicXML.",
        },
      ],
      warnings: [],
    });
  });

  it("classifies VSQX import report errors and warnings", () => {
    installVsqxImportReportBridge("<score-partwise/>", [
      { level: "error", code: "E_CUSTOM", message: "custom error" },
      { level: "warning", message: "warned" },
      { level: "info", code: "I_CUSTOM" },
    ]);

    const result = convertVsqxToMusicXml("<vsq3/>");

    expect(result.ok).toBe(false);
    expect(result.xml).toBe("<score-partwise/>");
    expect(result.diagnostics).toEqual([
      {
        code: "E_CUSTOM",
        message: "custom error",
      },
    ]);
    expect(result.warnings).toEqual([
      {
        code: "VSQX_CONVERT_WARNING_1",
        message: "warned",
      },
      {
        code: "I_CUSTOM",
        message: "VSQX to MusicXML conversion emitted a warning.",
      },
    ]);
  });

  it("reports a stable diagnostic when VSQX export returns empty output", () => {
    installVsqxExportBridge(() => " ");

    const result = convertMusicXmlToVsqx("<score-partwise/>");

    expect(result).toEqual({
      ok: false,
      vsqx: "",
      diagnostic: {
        code: "VSQX_EXPORT_EMPTY_RESULT",
        message: "MusicXML to VSQX conversion returned empty output.",
      },
    });
  });

  it("reports a stable diagnostic when VSQX export throws", () => {
    installVsqxExportBridge(() => {
      throw new Error("bad export");
    });

    const result = convertMusicXmlToVsqx("<score-partwise/>");

    expect(result).toEqual({
      ok: false,
      vsqx: "",
      diagnostic: {
        code: "VSQX_EXPORT_FAILED",
        message: "bad export",
      },
    });
  });
});
