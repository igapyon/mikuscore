/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

export type KeyMode = "major" | "minor";

export type KeySignatureFeature = {
  fifths: number;
  mode?: KeyMode | string;
};

type KeySignatureInput = {
  fifths?: unknown;
  mode?: unknown;
};

const roundedFinite = (value: unknown): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
};

export const normalizeKeySignatureFeature = (
  feature: KeySignatureInput | null | undefined
): KeySignatureFeature | null => {
  const fifths = roundedFinite(feature?.fifths);
  if (fifths === null) return null;
  const mode = String(feature?.mode ?? "").trim().toLowerCase();
  return { fifths, ...(mode ? { mode } : {}) };
};

export const buildMusicXmlKeySignatureXml = (
  feature: KeySignatureInput | null | undefined
): string => {
  const normalized = normalizeKeySignatureFeature(feature);
  if (normalized === null) return "";
  const modeXml = normalized.mode ? `<mode>${normalized.mode}</mode>` : "";
  return `<key><fifths>${normalized.fifths}</fifths>${modeXml}</key>`;
};

export const extractMusicXmlKeySignatureFeature = (key: Element): KeySignatureFeature | null => {
  return normalizeKeySignatureFeature({
    fifths: key.querySelector(":scope > fifths")?.textContent ?? "",
    mode: key.querySelector(":scope > mode")?.textContent ?? "",
  });
};
