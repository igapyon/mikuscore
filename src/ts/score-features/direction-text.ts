/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

export type DirectionPlacement = "above" | "below";
export type DirectionFontStyle = "italic" | "normal";

export type DirectionWordsFeature = {
  text: string;
  placement?: DirectionPlacement;
  fontStyle?: DirectionFontStyle;
  tempoBpm?: number;
  offsetDiv?: number;
  voice?: string;
  staff?: string | number;
};

export type DirectionTempoFeature = {
  bpm: number;
  text?: string;
  placement?: DirectionPlacement;
  offsetDiv?: number;
  voice?: string;
  staff?: string | number;
  includeQuarterMetronome?: boolean;
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

const normalizePlacement = (value: string | null | undefined): DirectionPlacement | undefined => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "above" || normalized === "below" ? normalized : undefined;
};

const normalizeFontStyle = (value: string | null | undefined): DirectionFontStyle | undefined => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "italic" || normalized === "normal" ? normalized : undefined;
};

const directionTailXml = (feature: { offsetDiv?: number; voice?: string; staff?: string | number }): string => {
  const offset = positiveRounded(feature.offsetDiv);
  const offsetXml = offset === null ? "" : `<offset>${offset}</offset>`;
  const voiceXml = feature.voice ? `<voice>${xmlEscape(feature.voice)}</voice>` : "";
  const staffXml = feature.staff == null || String(feature.staff).trim() === ""
    ? ""
    : `<staff>${xmlEscape(String(feature.staff))}</staff>`;
  return `${offsetXml}${voiceXml}${staffXml}`;
};

export const normalizeTempoBpm = (raw: unknown): number | null => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};

export const formatTempoBpm = (bpm: number): string => {
  const normalized = normalizeTempoBpm(bpm);
  if (normalized === null) return "";
  return Number.isInteger(normalized)
    ? String(Math.round(normalized))
    : normalized.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
};

export const buildMusicXmlWordsDirectionXml = (feature: DirectionWordsFeature): string => {
  const text = String(feature.text ?? "").trim();
  if (!text) return "";
  const placementAttr = feature.placement ? ` placement="${feature.placement}"` : "";
  const fontStyleAttr = feature.fontStyle ? ` font-style="${feature.fontStyle}"` : "";
  const tempo = normalizeTempoBpm(feature.tempoBpm);
  const soundXml = tempo === null ? "" : `<sound tempo="${formatTempoBpm(tempo)}"/>`;
  return `<direction${placementAttr}><direction-type><words${fontStyleAttr}>${xmlEscape(text)}</words></direction-type>${directionTailXml(feature)}${soundXml}</direction>`;
};

export const buildMusicXmlTempoDirectionXml = (feature: DirectionTempoFeature): string => {
  const tempo = normalizeTempoBpm(feature.bpm);
  if (tempo === null) return "";
  const placementAttr = feature.placement ? ` placement="${feature.placement}"` : "";
  const text = String(feature.text ?? "").trim();
  const directionTypes: string[] = [];
  if (text) directionTypes.push(`<direction-type><words>${xmlEscape(text)}</words></direction-type>`);
  if (feature.includeQuarterMetronome) {
    directionTypes.push(
      `<direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${formatTempoBpm(tempo)}</per-minute></metronome></direction-type>`
    );
  }
  const directionTypeXml = directionTypes.join("");
  return `<direction${placementAttr}>${directionTypeXml}${directionTailXml(feature)}<sound tempo="${formatTempoBpm(tempo)}"/></direction>`;
};

export const extractMusicXmlDirectionWords = (
  direction: Element
): Array<{ text: string; fontStyle?: DirectionFontStyle }> => {
  const out: Array<{ text: string; fontStyle?: DirectionFontStyle }> = [];
  for (const words of Array.from(direction.querySelectorAll(":scope > direction-type > words"))) {
    const text = (words.textContent ?? "").trim();
    if (!text) continue;
    const fontStyle = normalizeFontStyle(words.getAttribute("font-style"));
    out.push({ text, ...(fontStyle ? { fontStyle } : {}) });
  }
  return out;
};

export const extractMusicXmlSoundTempoBpm = (directionOrMeasure: Element): number | null => {
  const tempoText = directionOrMeasure.matches("sound")
    ? directionOrMeasure.getAttribute("tempo")
    : directionOrMeasure.querySelector(":scope > sound")?.getAttribute("tempo");
  return normalizeTempoBpm(tempoText ?? "");
};

export const extractMusicXmlDirectionPlacement = (direction: Element): DirectionPlacement | undefined =>
  normalizePlacement(direction.getAttribute("placement"));
