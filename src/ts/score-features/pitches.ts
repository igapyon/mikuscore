/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

export type PitchFeature = {
  step: string;
  alter?: number;
  octave: number;
};

type PitchInput = {
  step?: unknown;
  alter?: unknown;
  octave?: unknown;
};

const normalizeStep = (value: unknown): string => {
  const step = String(value ?? "").trim().toUpperCase();
  return /^[A-G]$/.test(step) ? step : "C";
};

const roundedFinite = (value: unknown): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
};

export const normalizePitchFeature = (feature: PitchInput | null | undefined): PitchFeature => {
  const octave = roundedFinite(feature?.octave);
  const alter = roundedFinite(feature?.alter);
  return {
    step: normalizeStep(feature?.step),
    ...(alter !== null && alter !== 0 ? { alter } : {}),
    octave: octave === null ? 4 : Math.max(0, Math.min(9, octave)),
  };
};

export const buildMusicXmlPitchXml = (feature: PitchInput | null | undefined): string => {
  const normalized = normalizePitchFeature(feature);
  const alterXml = normalized.alter == null ? "" : `<alter>${normalized.alter}</alter>`;
  return `<pitch><step>${normalized.step}</step>${alterXml}<octave>${normalized.octave}</octave></pitch>`;
};

export const extractMusicXmlPitchFeature = (pitch: Element): PitchFeature => {
  return normalizePitchFeature({
    step: pitch.querySelector(":scope > step")?.textContent ?? "",
    alter: pitch.querySelector(":scope > alter")?.textContent ?? 0,
    octave: pitch.querySelector(":scope > octave")?.textContent ?? "",
  });
};
