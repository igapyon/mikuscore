/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

export type SlurType = "start" | "stop";
export type SlurPlacement = "above" | "below";

export type SlurFeature = {
  type: SlurType;
  number?: number;
  placement?: SlurPlacement;
};

const normalizeSlurType = (raw: string | null | undefined): SlurType | null => {
  const normalized = String(raw ?? "").trim().toLowerCase();
  return normalized === "start" || normalized === "stop" ? normalized : null;
};

const normalizeSlurPlacement = (raw: string | null | undefined): SlurPlacement | undefined => {
  const normalized = String(raw ?? "").trim().toLowerCase();
  return normalized === "above" || normalized === "below" ? normalized : undefined;
};

const positiveRounded = (raw: unknown): number | undefined => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed);
};

export const buildMusicXmlSlurXml = (feature: SlurFeature): string => {
  const numberAttr = feature.number && feature.number > 0 ? ` number="${Math.round(feature.number)}"` : "";
  const placementAttr = feature.type === "start" && feature.placement ? ` placement="${feature.placement}"` : "";
  return `<slur type="${feature.type}"${numberAttr}${placementAttr}/>`;
};

export const buildMusicXmlSlursXml = (features: Iterable<SlurFeature>): string =>
  Array.from(features).map(buildMusicXmlSlurXml).join("");

export const extractMusicXmlSlurFeatures = (note: Element): SlurFeature[] => {
  const out: SlurFeature[] = [];
  for (const slur of Array.from(note.querySelectorAll(":scope > notations > slur[type]"))) {
    const type = normalizeSlurType(slur.getAttribute("type"));
    if (!type) continue;
    const number = positiveRounded(slur.getAttribute("number"));
    const placement = normalizeSlurPlacement(slur.getAttribute("placement"));
    out.push({
      type,
      ...(number ? { number } : {}),
      ...(type === "start" && placement ? { placement } : {}),
    });
  }
  return out;
};
