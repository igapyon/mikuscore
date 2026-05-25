/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

export const ORNAMENT_KINDS = [
  "trill-mark",
  "turn",
  "inverted-turn",
  "delayed-turn",
  "mordent",
  "inverted-mordent",
  "shake",
  "schleifer",
] as const;

export type OrnamentKind = typeof ORNAMENT_KINDS[number];
export type TremoloType = "single" | "start" | "stop";

export type OrnamentFeature =
  | {
    kind: OrnamentKind;
    slash?: boolean;
  }
  | {
    kind: "tremolo";
    tremoloType?: TremoloType;
    marks?: number;
  };

const ORNAMENT_KIND_SET = new Set<string>(ORNAMENT_KINDS);

const xmlEscape = (value: string): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const normalizeTremoloType = (raw: string | null | undefined): TremoloType | undefined => {
  const normalized = String(raw ?? "").trim().toLowerCase();
  return normalized === "single" || normalized === "start" || normalized === "stop" ? normalized : undefined;
};

const normalizeTremoloMarks = (raw: unknown): number | undefined => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.max(1, Math.min(8, Math.round(parsed)));
};

export const normalizeOrnamentKind = (raw: string): OrnamentKind | null => {
  const normalized = String(raw ?? "").trim().toLowerCase();
  return ORNAMENT_KIND_SET.has(normalized) ? normalized as OrnamentKind : null;
};

export const buildMusicXmlOrnamentItemsXml = (features: Iterable<OrnamentFeature>): string => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const feature of features) {
    if (feature.kind === "tremolo") {
      const typeAttr = feature.tremoloType ? ` type="${feature.tremoloType}"` : "";
      const marks = normalizeTremoloMarks(feature.marks) ?? 1;
      const key = `tremolo:${feature.tremoloType ?? ""}:${marks}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`<tremolo${typeAttr}>${marks}</tremolo>`);
      continue;
    }
    const slashAttr = (feature.kind === "turn" || feature.kind === "inverted-turn") && feature.slash
      ? ' slash="yes"'
      : "";
    const key = `${feature.kind}:${slashAttr}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`<${xmlEscape(feature.kind)}${slashAttr}/>`);
  }
  return out.join("");
};

export const buildMusicXmlOrnamentsXml = (features: Iterable<OrnamentFeature>): string => {
  const itemsXml = buildMusicXmlOrnamentItemsXml(features);
  return itemsXml ? `<ornaments>${itemsXml}</ornaments>` : "";
};

export const extractMusicXmlOrnamentFeatures = (note: Element): OrnamentFeature[] => {
  const out: OrnamentFeature[] = [];
  const seen = new Set<string>();
  for (const node of Array.from(note.querySelectorAll(":scope > notations > ornaments > *"))) {
    const tag = node.tagName.toLowerCase();
    if (tag === "tremolo") {
      const tremoloType = normalizeTremoloType(node.getAttribute("type"));
      const marks = normalizeTremoloMarks(node.textContent?.trim());
      const key = `tremolo:${tremoloType ?? ""}:${marks ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind: "tremolo", ...(tremoloType ? { tremoloType } : {}), ...(marks ? { marks } : {}) });
      continue;
    }
    const kind = normalizeOrnamentKind(tag);
    if (!kind) continue;
    const slash = (kind === "turn" || kind === "inverted-turn")
      && (node.getAttribute("slash") || "").trim().toLowerCase() === "yes";
    const key = `${kind}:${slash}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind, ...(slash ? { slash } : {}) });
  }
  return out;
};
