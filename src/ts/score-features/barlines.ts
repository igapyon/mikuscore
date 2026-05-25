/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

export type BarlineLocation = "left" | "right" | "middle";
export type RepeatDirection = "forward" | "backward";
export type EndingType = "start" | "stop" | "discontinue";

export type BarlineFeature = {
  location?: BarlineLocation;
  barStyle?: string;
  repeats?: RepeatDirection[];
  ending?: {
    number: string | number;
    type: EndingType;
  };
};

const xmlEscape = (value: string): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const normalizeLocation = (raw: string | null | undefined): BarlineLocation | undefined => {
  const normalized = String(raw ?? "").trim().toLowerCase();
  return normalized === "left" || normalized === "right" || normalized === "middle" ? normalized : undefined;
};

const normalizeRepeatDirection = (raw: string | null | undefined): RepeatDirection | null => {
  const normalized = String(raw ?? "").trim().toLowerCase();
  return normalized === "forward" || normalized === "backward" ? normalized : null;
};

const normalizeEndingType = (raw: string | null | undefined): EndingType | null => {
  const normalized = String(raw ?? "").trim().toLowerCase();
  return normalized === "start" || normalized === "stop" || normalized === "discontinue" ? normalized : null;
};

export const buildMusicXmlBarlineXml = (feature: BarlineFeature): string => {
  const locationAttr = feature.location ? ` location="${feature.location}"` : "";
  const parts: string[] = [];
  if (feature.barStyle) parts.push(`<bar-style>${xmlEscape(feature.barStyle)}</bar-style>`);
  for (const repeat of feature.repeats ?? []) {
    parts.push(`<repeat direction="${repeat}"/>`);
  }
  if (feature.ending) {
    parts.push(`<ending number="${xmlEscape(String(feature.ending.number))}" type="${feature.ending.type}"/>`);
  }
  return parts.length ? `<barline${locationAttr}>${parts.join("")}</barline>` : "";
};

export const extractMusicXmlBarlineFeature = (barline: Element): BarlineFeature => {
  const repeats: RepeatDirection[] = [];
  for (const repeat of Array.from(barline.querySelectorAll(":scope > repeat[direction]"))) {
    const direction = normalizeRepeatDirection(repeat.getAttribute("direction"));
    if (direction) repeats.push(direction);
  }
  const endingNode = barline.querySelector(":scope > ending[type]");
  const endingType = normalizeEndingType(endingNode?.getAttribute("type"));
  const endingNumber = endingNode?.getAttribute("number")?.trim() || "";
  return {
    ...(normalizeLocation(barline.getAttribute("location")) ? { location: normalizeLocation(barline.getAttribute("location")) } : {}),
    ...((barline.querySelector(":scope > bar-style")?.textContent ?? "").trim()
      ? { barStyle: (barline.querySelector(":scope > bar-style")?.textContent ?? "").trim() }
      : {}),
    ...(repeats.length ? { repeats } : {}),
    ...(endingNode && endingType && endingNumber ? { ending: { number: endingNumber, type: endingType } } : {}),
  };
};
