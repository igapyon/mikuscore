/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

export const ARTICULATION_KINDS = [
  "staccato",
  "staccatissimo",
  "accent",
  "tenuto",
  "strong-accent",
  "breath-mark",
  "caesura",
] as const;

export type ArticulationKind = typeof ARTICULATION_KINDS[number];

const ARTICULATION_KIND_SET = new Set<string>(ARTICULATION_KINDS);

export const normalizeArticulationKind = (raw: string): ArticulationKind | null => {
  const normalized = String(raw ?? "").trim().toLowerCase();
  return ARTICULATION_KIND_SET.has(normalized) ? normalized as ArticulationKind : null;
};

export const buildMusicXmlArticulationItemsXml = (kinds: Iterable<ArticulationKind>): string => {
  const unique = Array.from(new Set(kinds));
  return unique.map((kind) => `<${kind}/>`).join("");
};

export const buildMusicXmlArticulationsXml = (kinds: Iterable<ArticulationKind>): string => {
  const itemsXml = buildMusicXmlArticulationItemsXml(kinds);
  return itemsXml ? `<articulations>${itemsXml}</articulations>` : "";
};

export const extractMusicXmlArticulationKinds = (note: Element): ArticulationKind[] => {
  const out: ArticulationKind[] = [];
  for (const node of Array.from(note.querySelectorAll(":scope > notations > articulations > *"))) {
    const kind = normalizeArticulationKind(node.tagName);
    if (kind) out.push(kind);
  }
  return Array.from(new Set(out));
};
