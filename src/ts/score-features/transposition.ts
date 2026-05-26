/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

export type TranspositionFeature = {
  diatonic?: number;
  chromatic?: number;
};

type TranspositionInput = {
  diatonic?: unknown;
  chromatic?: unknown;
};

const roundedFinite = (value: unknown): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
};

export const normalizeTranspositionFeature = (
  feature: TranspositionInput | null | undefined
): TranspositionFeature | null => {
  const diatonic = roundedFinite(feature?.diatonic);
  const chromatic = roundedFinite(feature?.chromatic);
  if (diatonic === null && chromatic === null) return null;
  return {
    ...(diatonic !== null ? { diatonic } : {}),
    ...(chromatic !== null ? { chromatic } : {}),
  };
};

export const buildMusicXmlTransposeXml = (
  feature: TranspositionInput | null | undefined
): string => {
  const normalized = normalizeTranspositionFeature(feature);
  if (normalized === null) return "";
  const diatonicXml = normalized.diatonic == null ? "" : `<diatonic>${normalized.diatonic}</diatonic>`;
  const chromaticXml = normalized.chromatic == null ? "" : `<chromatic>${normalized.chromatic}</chromatic>`;
  return `<transpose>${diatonicXml}${chromaticXml}</transpose>`;
};

export const extractMusicXmlTranspositionFeature = (transpose: Element): TranspositionFeature | null => {
  return normalizeTranspositionFeature({
    diatonic: transpose.querySelector(":scope > diatonic")?.textContent ?? "",
    chromatic: transpose.querySelector(":scope > chromatic")?.textContent ?? "",
  });
};
