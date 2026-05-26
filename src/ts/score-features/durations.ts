/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

export const normalizeDotCount = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n);
};

export const buildMusicXmlDotsXml = (count: unknown): string => {
  return "<dot/>".repeat(normalizeDotCount(count));
};

export const countMusicXmlDots = (note: Element): number => {
  return note.querySelectorAll(":scope > dot").length;
};
