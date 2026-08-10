/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import { getMeasureCapacity } from "../../core/timeIndex";
import {
  extractMeasureEditorDocument,
  parseMusicXmlDocument,
  replaceMeasureInMainDocument,
  serializeMusicXmlDocument,
} from "./musicxml-io";

export const extractMeasureEditorMusicXml = (
  sourceXml: string,
  partId: string,
  measureNumber: string
): string | null => {
  const sourceDoc = parseMusicXmlDocument(sourceXml);
  if (!sourceDoc) return null;

  const extractedDoc = extractMeasureEditorDocument(sourceDoc, partId, measureNumber);
  return extractedDoc ? serializeMusicXmlDocument(extractedDoc) : null;
};

export const replaceMeasureInMusicXml = (
  sourceXml: string,
  partId: string,
  measureNumber: string,
  measureXml: string
): string | null => {
  const mainDoc = parseMusicXmlDocument(sourceXml);
  const measureDoc = parseMusicXmlDocument(measureXml);
  if (!mainDoc || !measureDoc) return null;

  const mergedDoc = replaceMeasureInMainDocument(mainDoc, partId, measureNumber, measureDoc);
  return mergedDoc ? serializeMusicXmlDocument(mergedDoc) : null;
};

const toPositiveInteger = (value: number | null | undefined): number | null => {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value as number);
  return rounded > 0 ? rounded : null;
};

const resolveEffectiveStavesAtEnd = (part: Element): number => {
  const measures = Array.from(part.querySelectorAll(":scope > measure"));
  let staves = 1;
  for (const measure of measures) {
    const text = measure.querySelector(":scope > attributes > staves")?.textContent?.trim() ?? "";
    const parsed = Number(text);
    if (Number.isInteger(parsed) && parsed > 0) staves = parsed;
  }
  return staves;
};

const resolveHasTrebleBassGrandStaffAtEnd = (part: Element): boolean => {
  const measures = Array.from(part.querySelectorAll(":scope > measure"));
  let clef1 = "";
  let clef2 = "";
  for (const measure of measures) {
    const nextClef1 = measure.querySelector(':scope > attributes > clef[number="1"] > sign')
      ?.textContent?.trim() ?? "";
    const nextClef2 = measure.querySelector(':scope > attributes > clef[number="2"] > sign')
      ?.textContent?.trim() ?? "";
    if (nextClef1) clef1 = nextClef1;
    if (nextClef2) clef2 = nextClef2;
  }
  return clef1 === "G" && clef2 === "F";
};

const createMeasureRestNoteXml = (duration: number, voice: string, staff: string | null): string => {
  return [
    "<note>",
    '<rest measure="yes"/>',
    `<duration>${duration}</duration>`,
    `<voice>${voice}</voice>`,
    staff ? `<staff>${staff}</staff>` : "",
    "</note>",
  ].join("");
};

const deriveNextMeasureNumber = (part: Element): string => {
  const measures = Array.from(part.querySelectorAll(":scope > measure"));
  const lastMeasure = measures[measures.length - 1] ?? null;
  if (!lastMeasure) return "1";

  const raw = lastMeasure.getAttribute("number")?.trim() ?? "";
  const numeric = Number(raw);
  if (Number.isInteger(numeric) && numeric >= 0) return String(numeric + 1);
  return String(measures.length + 1);
};

export const appendMeasureToMusicXml = (sourceXml: string): string | null => {
  const doc = parseMusicXmlDocument(sourceXml);
  if (!doc) return null;

  const parts = Array.from(doc.querySelectorAll("score-partwise > part"));
  if (parts.length === 0) return null;

  for (const part of parts) {
    const measures = Array.from(part.querySelectorAll(":scope > measure"));
    const lastMeasure = measures[measures.length - 1] ?? null;
    if (!lastMeasure) continue;

    const capacity = toPositiveInteger(getMeasureCapacity(lastMeasure)) ?? 3840;
    const nextNumber = deriveNextMeasureNumber(part);
    const staves = resolveEffectiveStavesAtEnd(part);
    const isGrandStaff = staves >= 2 && resolveHasTrebleBassGrandStaffAtEnd(part);

    const measure = doc.createElement("measure");
    measure.setAttribute("number", nextNumber);
    if (isGrandStaff) {
      const lane1 = parseMusicXmlDocument(createMeasureRestNoteXml(capacity, "1", "1"))
        ?.querySelector("note");
      const backup = doc.createElement("backup");
      const backupDuration = doc.createElement("duration");
      backupDuration.textContent = String(capacity);
      backup.appendChild(backupDuration);
      const lane2 = parseMusicXmlDocument(createMeasureRestNoteXml(capacity, "1", "2"))
        ?.querySelector("note");
      if (lane1) measure.appendChild(doc.importNode(lane1, true));
      measure.appendChild(backup);
      if (lane2) measure.appendChild(doc.importNode(lane2, true));
    } else {
      const rest = parseMusicXmlDocument(createMeasureRestNoteXml(capacity, "1", null))
        ?.querySelector("note");
      if (rest) measure.appendChild(doc.importNode(rest, true));
    }
    part.appendChild(measure);
  }

  return serializeMusicXmlDocument(doc);
};
