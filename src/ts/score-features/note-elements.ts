/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

export type AccidentalFeature = {
  text: string;
  editorial?: boolean;
  cautionary?: boolean;
};

export type GraceFeature = {
  slash?: boolean;
};

export type LyricFeature = {
  text: string;
  syllabic?: string;
  extend?: boolean;
};

type AccidentalInput = {
  text?: unknown;
  editorial?: unknown;
  cautionary?: unknown;
};

type GraceInput = {
  slash?: unknown;
};

type LyricInput = {
  text?: unknown;
  syllabic?: unknown;
  extend?: unknown;
};

const xmlEscape = (value: string): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export const normalizeAccidentalFeature = (
  feature: AccidentalInput | null | undefined
): AccidentalFeature | null => {
  const text = String(feature?.text ?? "").trim();
  if (!text) return null;
  return {
    text,
    ...(feature?.editorial === true ? { editorial: true } : {}),
    ...(feature?.cautionary === true ? { cautionary: true } : {}),
  };
};

export const buildMusicXmlAccidentalXml = (
  feature: AccidentalInput | null | undefined
): string => {
  const normalized = normalizeAccidentalFeature(feature);
  if (normalized === null) return "";
  const attrs = [
    normalized.editorial ? 'editorial="yes"' : "",
    normalized.cautionary ? 'cautionary="yes"' : "",
  ].filter(Boolean).join(" ");
  return attrs
    ? `<accidental ${attrs}>${xmlEscape(normalized.text)}</accidental>`
    : `<accidental>${xmlEscape(normalized.text)}</accidental>`;
};

export const buildMusicXmlGraceXml = (feature: GraceInput | null | undefined = {}): string => {
  return feature?.slash === true ? '<grace slash="yes"/>' : "<grace/>";
};

export const buildMusicXmlStemXml = (value: unknown): string => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "up" || normalized === "down" ? `<stem>${normalized}</stem>` : "";
};

export const normalizeLyricFeature = (
  feature: LyricInput | null | undefined
): LyricFeature | null => {
  const text = String(feature?.text ?? "").trim();
  if (!text) return null;
  const syllabic = String(feature?.syllabic ?? "").trim();
  return {
    text,
    ...(syllabic ? { syllabic } : {}),
    ...(feature?.extend === true ? { extend: true } : {}),
  };
};

export const buildMusicXmlLyricXml = (
  feature: LyricInput | null | undefined
): string => {
  const normalized = normalizeLyricFeature(feature);
  if (normalized === null) return "";
  const syllabicXml = normalized.syllabic ? `<syllabic>${xmlEscape(normalized.syllabic)}</syllabic>` : "";
  const extendXml = normalized.extend ? "<extend/>" : "";
  return `<lyric>${syllabicXml}<text>${xmlEscape(normalized.text)}</text>${extendXml}</lyric>`;
};

export const buildMusicXmlFingeringXml = (value: unknown): string => {
  const text = String(value ?? "").trim();
  return text ? `<fingering>${xmlEscape(text)}</fingering>` : "";
};

export const buildMusicXmlStringNumberXml = (
  value: unknown,
  options: { roundNumeric?: boolean } = {}
): string => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const n = Number(value);
  const normalized = options.roundNumeric === true && Number.isFinite(n) && n > 0 ? String(Math.round(n)) : text;
  return `<string>${xmlEscape(normalized)}</string>`;
};

export const buildMusicXmlTechnicalXml = (items: string[]): string => {
  const filtered = items.filter((item) => item.length > 0);
  return filtered.length ? `<technical>${filtered.join("")}</technical>` : "";
};
