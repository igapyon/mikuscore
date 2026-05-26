/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

type FlowInput = {
  duration?: unknown;
  voice?: unknown;
  staff?: unknown;
};

const positiveRounded = (value: unknown): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
};

const xmlEscape = (value: string): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export const buildMusicXmlBackupXml = (input: FlowInput): string => {
  const duration = positiveRounded(input.duration);
  if (duration === null) return "";
  return `<backup><duration>${duration}</duration></backup>`;
};

export const buildMusicXmlForwardXml = (input: FlowInput): string => {
  const duration = positiveRounded(input.duration);
  if (duration === null) return "";
  const voiceXml = input.voice == null || String(input.voice).trim() === ""
    ? ""
    : `<voice>${xmlEscape(String(input.voice))}</voice>`;
  const staffXml = input.staff == null || String(input.staff).trim() === ""
    ? ""
    : `<staff>${xmlEscape(String(input.staff))}</staff>`;
  return `<forward><duration>${duration}</duration>${voiceXml}${staffXml}</forward>`;
};
