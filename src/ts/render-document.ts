/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  buildRenderDocWithNodeIds,
  parseMusicXmlDocument,
  type RenderDocBundle,
} from "./musicxml-io";

export type PreparedRenderDocument = Omit<RenderDocBundle, "renderDoc"> & {
  renderDoc: Document | null;
};

export type PrepareRenderDocumentOptions = {
  nodeIds?: readonly string[];
  idPrefix?: string;
};

const normalizeTextForRenderKey = (value: string | null | undefined): string => {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
};

const localNameOf = (element: Element): string => {
  return (element.localName || element.tagName || "").toLowerCase();
};

const directChildrenByName = (parent: Element, name: string): Element[] => {
  const normalizedName = name.toLowerCase();
  return Array.from(parent.children).filter((child) => localNameOf(child) === normalizedName);
};

const firstDescendantByName = (parent: Element, name: string): Element | null => {
  const namespaceMatch = parent.getElementsByTagNameNS("*", name).item(0);
  if (namespaceMatch) return namespaceMatch;
  return parent.getElementsByTagName(name).item(0);
};

const extractTempoDirectionRenderKey = (direction: Element): string | null => {
  const directSound = directChildrenByName(direction, "sound")[0] ?? null;
  const directionType = directChildrenByName(direction, "direction-type")[0] ?? null;
  const metronome = directionType ? firstDescendantByName(directionType, "metronome") : null;
  const wordsElement = directionType ? firstDescendantByName(directionType, "words") : null;
  const perMinuteElement = metronome ? firstDescendantByName(metronome, "per-minute") : null;
  const beatUnitElement = metronome ? firstDescendantByName(metronome, "beat-unit") : null;
  const directOffset = directChildrenByName(direction, "offset")[0] ?? null;

  const soundTempo = normalizeTextForRenderKey(directSound?.getAttribute("tempo"));
  const perMinute = normalizeTextForRenderKey(perMinuteElement?.textContent);
  const beatUnit = normalizeTextForRenderKey(beatUnitElement?.textContent);
  const words = normalizeTextForRenderKey(wordsElement?.textContent);
  if (!soundTempo && !perMinute && !words) return null;

  const offset = normalizeTextForRenderKey(directOffset?.textContent || "0");
  return `off=${offset}|sound=${soundTempo}|pm=${perMinute}|unit=${beatUnit}|words=${words}`;
};

export const dedupeGlobalTempoDirectionsInRenderDocument = (doc: Document): void => {
  const root = doc.documentElement;
  if (!root || localNameOf(root) !== "score-partwise") return;

  const parts = directChildrenByName(root, "part");
  if (parts.length <= 1) return;

  const seen = new Set<string>();
  for (const part of parts) {
    for (const measure of directChildrenByName(part, "measure")) {
      const measureNumber = (measure.getAttribute("number") ?? "").trim();
      for (const direction of directChildrenByName(measure, "direction")) {
        const tempoKey = extractTempoDirectionRenderKey(direction);
        if (!tempoKey) continue;

        const dedupeKey = `m=${measureNumber}|${tempoKey}`;
        if (seen.has(dedupeKey)) {
          direction.remove();
        } else {
          seen.add(dedupeKey);
        }
      }
    }
  }
};

export const prepareMusicXmlRenderDocument = (
  xml: string,
  options: PrepareRenderDocumentOptions = {}
): PreparedRenderDocument => {
  const sourceDoc = parseMusicXmlDocument(xml);
  if (!sourceDoc) {
    return {
      renderDoc: null,
      svgIdToNodeId: new Map<string, string>(),
      noteCount: 0,
    };
  }

  const renderBundle = buildRenderDocWithNodeIds(
    sourceDoc,
    Array.from(options.nodeIds ?? []),
    options.idPrefix ?? "mks-main"
  );
  dedupeGlobalTempoDirectionsInRenderDocument(renderBundle.renderDoc);
  return renderBundle;
};
