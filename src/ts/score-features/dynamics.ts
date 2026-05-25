/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

export const DYNAMIC_MARKS = [
  "pppp",
  "ppp",
  "pp",
  "p",
  "mp",
  "mf",
  "f",
  "ff",
  "fff",
  "ffff",
  "fp",
  "fz",
  "sffz",
  "rf",
  "sf",
  "sfp",
  "sfz",
  "rfz",
] as const;

export type DynamicMark = typeof DYNAMIC_MARKS[number];
export type WedgeType = "crescendo" | "diminuendo" | "stop";
export type DirectionPlacement = "above" | "below";

export type DynamicFeature =
  | {
    kind: "dynamic";
    mark: DynamicMark;
    offsetDiv?: number;
    voice?: string;
    staff?: string | number;
    placement?: DirectionPlacement;
  }
  | {
    kind: "wedge";
    wedgeType: WedgeType;
    number?: string;
    offsetDiv?: number;
    voice?: string;
    staff?: string | number;
    placement?: DirectionPlacement;
  };

const DYNAMIC_MARK_SET = new Set<string>(DYNAMIC_MARKS);

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

export const normalizeDynamicMark = (raw: string): DynamicMark | null => {
  const normalized = String(raw ?? "").trim().toLowerCase();
  return DYNAMIC_MARK_SET.has(normalized) ? normalized as DynamicMark : null;
};

export const velocityToDynamicMark = (velocity: number): DynamicMark => {
  const v = Math.max(1, Math.min(127, Math.round(Number.isFinite(velocity) ? velocity : 64)));
  if (v <= 15) return "ppp";
  if (v <= 31) return "pp";
  if (v <= 47) return "p";
  if (v <= 63) return "mp";
  if (v <= 79) return "mf";
  if (v <= 95) return "f";
  if (v <= 111) return "ff";
  return "fff";
};

export const buildMusicXmlDirectionFeatureXml = (feature: DynamicFeature): string => {
  const placementAttr = feature.placement ? ` placement="${feature.placement}"` : "";
  const offset = positiveRounded(feature.offsetDiv);
  const offsetXml = offset === null ? "" : `<offset>${offset}</offset>`;
  const voiceXml = feature.voice ? `<voice>${xmlEscape(feature.voice)}</voice>` : "";
  const staffXml = feature.staff == null || String(feature.staff).trim() === ""
    ? ""
    : `<staff>${xmlEscape(String(feature.staff))}</staff>`;

  const directionType = feature.kind === "dynamic"
    ? `<dynamics><${feature.mark}/></dynamics>`
    : `<wedge type="${feature.wedgeType}"${feature.number ? ` number="${xmlEscape(feature.number)}"` : ""}/>`;

  return `<direction${placementAttr}><direction-type>${directionType}</direction-type>${offsetXml}${voiceXml}${staffXml}</direction>`;
};

export const extractMusicXmlDirectionFeatures = (direction: Element): DynamicFeature[] => {
  const offset = positiveRounded(direction.querySelector(":scope > offset")?.textContent ?? "");
  const voice = direction.querySelector(":scope > voice")?.textContent?.trim() || undefined;
  const staff = direction.querySelector(":scope > staff")?.textContent?.trim() || undefined;
  const placement = normalizePlacement(direction.getAttribute("placement"));
  const common = {
    ...(offset === null ? {} : { offsetDiv: offset }),
    ...(voice ? { voice } : {}),
    ...(staff ? { staff } : {}),
    ...(placement ? { placement } : {}),
  };
  const features: DynamicFeature[] = [];

  for (const node of Array.from(direction.querySelectorAll(":scope > direction-type > dynamics > *"))) {
    const mark = normalizeDynamicMark(node.tagName);
    if (mark) features.push({ kind: "dynamic", mark, ...common });
  }

  for (const wedge of Array.from(direction.querySelectorAll(":scope > direction-type > wedge"))) {
    const rawType = (wedge.getAttribute("type") ?? "").trim().toLowerCase();
    if (rawType !== "crescendo" && rawType !== "diminuendo" && rawType !== "stop") continue;
    const number = wedge.getAttribute("number")?.trim() || undefined;
    features.push({
      kind: "wedge",
      wedgeType: rawType,
      ...(number ? { number } : {}),
      ...common,
    });
  }

  return features;
};
