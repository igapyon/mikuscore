/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

export type TimeModificationFeature = {
  actualNotes: number;
  normalNotes: number;
};

type TimeModificationInput = {
  actualNotes?: unknown;
  normalNotes?: unknown;
};

const positiveRounded = (value: unknown): number | null => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
};

export const normalizeTimeModificationFeature = (
  feature: TimeModificationInput | null | undefined
): TimeModificationFeature | null => {
  const actualNotes = positiveRounded(feature?.actualNotes);
  const normalNotes = positiveRounded(feature?.normalNotes);
  if (actualNotes === null || normalNotes === null) return null;
  return { actualNotes, normalNotes };
};

export const buildMusicXmlTimeModificationXml = (
  feature: TimeModificationInput | null | undefined
): string => {
  const normalized = normalizeTimeModificationFeature(feature);
  if (normalized === null) return "";
  return `<time-modification><actual-notes>${normalized.actualNotes}</actual-notes><normal-notes>${normalized.normalNotes}</normal-notes></time-modification>`;
};

export const extractMusicXmlTimeModificationFeature = (note: Element): TimeModificationFeature | null => {
  const timeModification = note.querySelector(":scope > time-modification");
  if (!timeModification) return null;
  return normalizeTimeModificationFeature({
    actualNotes: timeModification.querySelector(":scope > actual-notes")?.textContent ?? "",
    normalNotes: timeModification.querySelector(":scope > normal-notes")?.textContent ?? "",
  });
};
