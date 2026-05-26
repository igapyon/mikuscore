/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

export type ClefFeature = {
  sign: string;
  line: number;
  number?: string | number;
};

type ClefInput = {
  sign?: unknown;
  line?: unknown;
  number?: unknown;
};

const xmlEscape = (value: string): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const positiveRounded = (value: unknown): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
};

export const normalizeClefFeature = (feature: ClefInput | null | undefined): ClefFeature | null => {
  const sign = String(feature?.sign ?? "").trim();
  const line = positiveRounded(feature?.line);
  if (!sign || line === null) return null;
  const number = feature?.number == null || String(feature.number).trim() === ""
    ? undefined
    : String(feature.number).trim();
  return { sign, line, ...(number ? { number } : {}) };
};

export const buildMusicXmlClefXml = (feature: ClefInput | null | undefined): string => {
  const normalized = normalizeClefFeature(feature);
  if (normalized === null) return "";
  const numberAttr = normalized.number ? ` number="${xmlEscape(String(normalized.number))}"` : "";
  return `<clef${numberAttr}><sign>${xmlEscape(normalized.sign)}</sign><line>${normalized.line}</line></clef>`;
};

export const extractMusicXmlClefFeature = (clef: Element): ClefFeature | null => {
  return normalizeClefFeature({
    sign: clef.querySelector(":scope > sign")?.textContent ?? "",
    line: clef.querySelector(":scope > line")?.textContent ?? "",
    number: clef.getAttribute("number") ?? undefined,
  });
};
