export type VsqxIssueLevel = "info" | "warning" | "error";

export type VsqxIssue = {
  level?: VsqxIssueLevel;
  code?: string;
  message?: string;
};

export type VsqxToMusicXmlReport = {
  musicXml?: string;
  issues?: VsqxIssue[];
};

export type VsqxToMusicXmlResult = {
  ok: boolean;
  xml: string;
  diagnostics: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
};

type UtaFormatixBridge = {
  convertVsqxToMusicXml: (vsqxText: string, options?: { defaultLyric?: string }) => string;
  convertVsqxToMusicXmlWithReport: (vsqxText: string, options?: { defaultLyric?: string }) => VsqxToMusicXmlReport;
  convertMusicXmlToVsqx: (musicXmlText: string, options?: MusicXmlToVsqxOptions) => string;
};

export type MusicXmlToVsqxOptions = {
  musicXml?: {
    defaultLyric?: string;
  };
  splitPartStaves?: boolean;
};

type UtaFormatixHooks = {
  normalizeImportedMusicXmlText?: (xml: string) => string;
};

declare global {
  interface Window {
    UtaFormatix3TsPlusMikuscore?: UtaFormatixBridge;
    __utaformatix3TsPlusMikuscoreHooks?: UtaFormatixHooks;
  }
}

const bridge = (): UtaFormatixBridge | null => {
  if (typeof window === "undefined") return null;
  return window.UtaFormatix3TsPlusMikuscore ?? null;
};

const issueCode = (issue: VsqxIssue, fallback: string): string => {
  const raw = String(issue.code || "").trim();
  return raw || fallback;
};

const issueMessage = (issue: VsqxIssue, fallback: string): string => {
  const raw = String(issue.message || "").trim();
  return raw || fallback;
};

export const installVsqxMusicXmlNormalizationHook = (
  normalizeImportedMusicXmlText: (xml: string) => string
): void => {
  if (typeof window === "undefined") return;
  window.__utaformatix3TsPlusMikuscoreHooks = {
    ...(window.__utaformatix3TsPlusMikuscoreHooks ?? {}),
    normalizeImportedMusicXmlText,
  };
};

export const isVsqxBridgeAvailable = (): boolean => {
  const runtime = bridge();
  return !!runtime;
};

export const convertVsqxToMusicXml = (
  vsqxText: string,
  options?: { defaultLyric?: string }
): VsqxToMusicXmlResult => {
  const runtime = bridge();
  if (!runtime) {
    return {
      ok: false,
      xml: "",
      diagnostics: [
        {
          code: "VSQX_BRIDGE_UNAVAILABLE",
          message: "VSQX converter bundle is not loaded.",
        },
      ],
      warnings: [],
    };
  }

  const report = runtime.convertVsqxToMusicXmlWithReport(vsqxText, options);
  const issues = Array.isArray(report?.issues) ? report.issues : [];
  const diagnostics = issues
    .filter((issue) => String(issue.level || "").toLowerCase() === "error")
    .map((issue, index) => ({
      code: issueCode(issue, `VSQX_CONVERT_ERROR_${index + 1}`),
      message: issueMessage(issue, "VSQX to MusicXML conversion failed."),
    }));
  const warnings = issues
    .filter((issue) => {
      const level = String(issue.level || "").toLowerCase();
      return level === "warning" || level === "info";
    })
    .map((issue, index) => ({
      code: issueCode(issue, `VSQX_CONVERT_WARNING_${index + 1}`),
      message: issueMessage(issue, "VSQX to MusicXML conversion emitted a warning."),
    }));

  const xml = String(report?.musicXml || "");
  if (!xml.trim()) {
    const fallbackDiagnostics = diagnostics.length
      ? diagnostics
      : [
          {
            code: "VSQX_CONVERT_EMPTY_RESULT",
            message: "VSQX converter returned empty MusicXML.",
          },
        ];
    return {
      ok: false,
      xml: "",
      diagnostics: fallbackDiagnostics,
      warnings,
    };
  }

  return {
    ok: diagnostics.length === 0,
    xml,
    diagnostics,
    warnings,
  };
};

export const convertMusicXmlToVsqx = (
  musicXmlText: string,
  options?: MusicXmlToVsqxOptions
): { ok: boolean; vsqx: string; diagnostic?: { code: string; message: string } } => {
  const runtime = bridge();
  if (!runtime) {
    return {
      ok: false,
      vsqx: "",
      diagnostic: {
        code: "VSQX_BRIDGE_UNAVAILABLE",
        message: "VSQX converter bundle is not loaded.",
      },
    };
  }

  try {
    const vsqx = runtime.convertMusicXmlToVsqx(musicXmlText, options);
    if (!String(vsqx || "").trim()) {
      return {
        ok: false,
        vsqx: "",
        diagnostic: {
          code: "VSQX_EXPORT_EMPTY_RESULT",
          message: "MusicXML to VSQX conversion returned empty output.",
        },
      };
    }
    return { ok: true, vsqx };
  } catch (error) {
    return {
      ok: false,
      vsqx: "",
      diagnostic: {
        code: "VSQX_EXPORT_FAILED",
        message: error instanceof Error ? error.message : "MusicXML to VSQX conversion failed.",
      },
    };
  }
};
