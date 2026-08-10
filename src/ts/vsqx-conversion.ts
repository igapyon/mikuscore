/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

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

export type VsqxDiagnostic = { code: string; message: string };

export type VsqxToMusicXmlResult = {
  ok: boolean;
  xml: string;
  diagnostics: VsqxDiagnostic[];
  warnings: VsqxDiagnostic[];
};

export type MusicXmlToVsqxResult = {
  ok: boolean;
  vsqx: string;
  diagnostic?: VsqxDiagnostic;
};

export type VsqxToMusicXmlOptions = {
  defaultLyric?: string;
};

export type MusicXmlToVsqxOptions = {
  musicXml?: {
    defaultLyric?: string;
  };
  splitPartStaves?: boolean;
};

export type VsqxConversionBridge = {
  convertVsqxToMusicXml: (
    vsqxText: string,
    options?: VsqxToMusicXmlOptions
  ) => string;
  convertVsqxToMusicXmlWithReport: (
    vsqxText: string,
    options?: VsqxToMusicXmlOptions
  ) => VsqxToMusicXmlReport;
  convertMusicXmlToVsqx: (
    musicXmlText: string,
    options?: MusicXmlToVsqxOptions
  ) => string;
};

type VsqxConversionIssueSummary = {
  diagnostics: VsqxDiagnostic[];
  warnings: VsqxDiagnostic[];
};

const VSQX_BRIDGE_UNAVAILABLE = "VSQX_BRIDGE_UNAVAILABLE";
const VSQX_CONVERT_EMPTY_RESULT = "VSQX_CONVERT_EMPTY_RESULT";
const VSQX_EXPORT_EMPTY_RESULT = "VSQX_EXPORT_EMPTY_RESULT";
const VSQX_EXPORT_FAILED = "VSQX_EXPORT_FAILED";
const MSG_BRIDGE_UNAVAILABLE = "VSQX converter bundle is not loaded.";
const MSG_CONVERT_FAILED = "VSQX to MusicXML conversion failed.";
const MSG_CONVERT_WARNING = "VSQX to MusicXML conversion emitted a warning.";
const MSG_CONVERT_EMPTY_RESULT = "VSQX converter returned empty MusicXML.";
const MSG_EXPORT_EMPTY_RESULT = "MusicXML to VSQX conversion returned empty output.";
const MSG_EXPORT_FAILED = "MusicXML to VSQX conversion failed.";

const textOrEmpty = (value: unknown): string => String(value || "");
const trimmedTextOrEmpty = (value: unknown): string => textOrEmpty(value).trim();
const isBlankText = (value: unknown): boolean => !trimmedTextOrEmpty(value);
const diagnostic = (code: string, message: string): VsqxDiagnostic => ({ code, message });

const bridgeUnavailableDiagnostic = (): VsqxDiagnostic => {
  return diagnostic(VSQX_BRIDGE_UNAVAILABLE, MSG_BRIDGE_UNAVAILABLE);
};

const vsqxConvertEmptyResultDiagnostic = (): VsqxDiagnostic => {
  return diagnostic(VSQX_CONVERT_EMPTY_RESULT, MSG_CONVERT_EMPTY_RESULT);
};

const vsqxExportEmptyResultDiagnostic = (): VsqxDiagnostic => {
  return diagnostic(VSQX_EXPORT_EMPTY_RESULT, MSG_EXPORT_EMPTY_RESULT);
};

const vsqxExportFailedDiagnostic = (error: unknown): VsqxDiagnostic => {
  const message = error instanceof Error ? error.message : MSG_EXPORT_FAILED;
  return diagnostic(VSQX_EXPORT_FAILED, message);
};

const failedVsqxToMusicXmlResult = (
  diagnostics: VsqxDiagnostic[],
  warnings: VsqxDiagnostic[] = []
): VsqxToMusicXmlResult => ({ ok: false, xml: "", diagnostics, warnings });

const failedMusicXmlToVsqxResult = (
  failureDiagnostic: VsqxDiagnostic
): MusicXmlToVsqxResult => ({
  ok: false,
  vsqx: "",
  diagnostic: failureDiagnostic,
});

const issueLevel = (issue: VsqxIssue): string => trimmedTextOrEmpty(issue.level).toLowerCase();
const isVsqxConversionErrorIssue = (issue: VsqxIssue): boolean => issueLevel(issue) === "error";
const isVsqxConversionWarningIssue = (issue: VsqxIssue): boolean => {
  const level = issueLevel(issue);
  return level === "warning" || level === "info";
};

const issueCode = (issue: VsqxIssue, fallback: string): string => {
  return trimmedTextOrEmpty(issue.code) || fallback;
};

const issueMessage = (issue: VsqxIssue, fallback: string): string => {
  return trimmedTextOrEmpty(issue.message) || fallback;
};

const issueDiagnostic = (
  issue: VsqxIssue,
  fallbackCode: string,
  fallbackMessage: string
): VsqxDiagnostic => {
  return diagnostic(issueCode(issue, fallbackCode), issueMessage(issue, fallbackMessage));
};

const reportIssues = (report: VsqxToMusicXmlReport | null | undefined): VsqxIssue[] => {
  return Array.isArray(report?.issues) ? report.issues : [];
};

const collectVsqxConversionIssues = (issues: VsqxIssue[]): VsqxConversionIssueSummary => {
  const diagnostics = issues
    .filter(isVsqxConversionErrorIssue)
    .map((issue, index) =>
      issueDiagnostic(issue, `VSQX_CONVERT_ERROR_${index + 1}`, MSG_CONVERT_FAILED)
    );
  const warnings = issues
    .filter(isVsqxConversionWarningIssue)
    .map((issue, index) =>
      issueDiagnostic(issue, `VSQX_CONVERT_WARNING_${index + 1}`, MSG_CONVERT_WARNING)
    );
  return { diagnostics, warnings };
};

export const convertVsqxToMusicXmlWithBridge = (
  runtime: VsqxConversionBridge | null,
  vsqxText: string,
  options?: VsqxToMusicXmlOptions
): VsqxToMusicXmlResult => {
  if (!runtime) {
    return failedVsqxToMusicXmlResult([bridgeUnavailableDiagnostic()]);
  }

  const report = runtime.convertVsqxToMusicXmlWithReport(vsqxText, options);
  const { diagnostics, warnings } = collectVsqxConversionIssues(reportIssues(report));
  const xml = textOrEmpty(report?.musicXml);
  if (isBlankText(xml)) {
    return failedVsqxToMusicXmlResult(
      diagnostics.length ? diagnostics : [vsqxConvertEmptyResultDiagnostic()],
      warnings
    );
  }
  return {
    ok: diagnostics.length === 0,
    xml,
    diagnostics,
    warnings,
  };
};

export const convertMusicXmlToVsqxWithBridge = (
  runtime: VsqxConversionBridge | null,
  musicXmlText: string,
  options?: MusicXmlToVsqxOptions
): MusicXmlToVsqxResult => {
  if (!runtime) {
    return failedMusicXmlToVsqxResult(bridgeUnavailableDiagnostic());
  }

  try {
    const vsqx = runtime.convertMusicXmlToVsqx(musicXmlText, options);
    if (isBlankText(vsqx)) {
      return failedMusicXmlToVsqxResult(vsqxExportEmptyResultDiagnostic());
    }
    return { ok: true, vsqx };
  } catch (error) {
    return failedMusicXmlToVsqxResult(vsqxExportFailedDiagnostic(error));
  }
};
