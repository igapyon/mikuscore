/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

export type TimeSignatureSymbol = "common" | "cut";

export type TimeSignatureFeature = {
  beats: number;
  beatType: number;
  symbol?: TimeSignatureSymbol;
};

type TimeSignatureInput = {
  beats?: unknown;
  beatType?: unknown;
  symbol?: unknown;
};

const positiveRounded = (value: unknown): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
};

const normalizeSymbol = (value: unknown): TimeSignatureSymbol | undefined => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "common" || normalized === "cut" ? normalized : undefined;
};

export const normalizeTimeSignatureFeature = (
  feature: TimeSignatureInput | null | undefined
): TimeSignatureFeature | null => {
  const beats = positiveRounded(feature?.beats);
  const beatType = positiveRounded(feature?.beatType);
  if (beats === null || beatType === null) return null;
  const symbol = normalizeSymbol(feature?.symbol);
  return { beats, beatType, ...(symbol ? { symbol } : {}) };
};

export const buildMusicXmlTimeSignatureXml = (
  feature: TimeSignatureInput | null | undefined
): string => {
  const normalized = normalizeTimeSignatureFeature(feature);
  if (normalized === null) return "";
  const symbolAttr = normalized.symbol ? ` symbol="${normalized.symbol}"` : "";
  return `<time${symbolAttr}><beats>${normalized.beats}</beats><beat-type>${normalized.beatType}</beat-type></time>`;
};

export const extractMusicXmlTimeSignatureFeature = (time: Element): TimeSignatureFeature | null => {
  return normalizeTimeSignatureFeature({
    beats: time.querySelector(":scope > beats")?.textContent ?? "",
    beatType: time.querySelector(":scope > beat-type")?.textContent ?? "",
    symbol: time.getAttribute("symbol") ?? undefined,
  });
};
