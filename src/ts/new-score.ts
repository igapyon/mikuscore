/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildMusicXmlClefXml, type ClefFeature } from "./score-features/clefs";

export type NewScoreClef = "treble" | "alto" | "bass";

export type CreateNewScoreOptions = {
  usePianoGrandStaffTemplate?: boolean;
  partCount?: number;
  fifths?: number;
  beats?: number;
  beatType?: number;
  clefs?: readonly (NewScoreClef | string)[];
};

const DEFAULT_DIVISIONS = 480;
const DEFAULT_MEASURE_COUNT = 8;
const MAX_PARTS = 16;
const ALLOWED_BEAT_TYPES = new Set([2, 4, 8, 16]);

const clefFeatures: Readonly<Record<NewScoreClef, ClefFeature>> = {
  treble: { sign: "G", line: 2 },
  alto: { sign: "C", line: 3 },
  bass: { sign: "F", line: 4 },
};

const boundedInteger = (value: unknown, fallback: number, min: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
};

const normalizeBeatType = (value: unknown): number => {
  const parsed = Number(value);
  return ALLOWED_BEAT_TYPES.has(parsed) ? parsed : 4;
};

const normalizeClef = (value: unknown): NewScoreClef => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "alto" || normalized === "bass") return normalized;
  return "treble";
};

const buildClefXml = (clef: unknown): string => {
  return buildMusicXmlClefXml(clefFeatures[normalizeClef(clef)]);
};

const buildMeasureRestNoteXml = (duration: number, staff?: number): string => {
  return [
    "<note>",
    '<rest measure="yes"/>',
    `<duration>${duration}</duration>`,
    "<voice>1</voice>",
    staff === undefined ? "" : `<staff>${staff}</staff>`,
    "</note>",
  ].join("");
};

export const createNewScoreMusicXml = (options: CreateNewScoreOptions = {}): string => {
  const usePianoGrandStaffTemplate = options.usePianoGrandStaffTemplate === true;
  const partCount = usePianoGrandStaffTemplate
    ? 1
    : boundedInteger(options.partCount, 1, 1, MAX_PARTS);
  const fifths = boundedInteger(options.fifths, 0, -7, 7);
  const beats = boundedInteger(options.beats, 4, 1, 16);
  const beatType = normalizeBeatType(options.beatType);
  const measureDuration = Math.max(
    1,
    Math.round(DEFAULT_DIVISIONS * beats * (4 / beatType))
  );

  const partListXml = Array.from({ length: partCount }, (_, index) => {
    const partId = `P${index + 1}`;
    const channelCandidate = (index % 16) + 1;
    const midiChannel = channelCandidate === 10 ? 11 : channelCandidate;
    const midiProgram = usePianoGrandStaffTemplate ? 1 : 6;
    const partName = usePianoGrandStaffTemplate ? "Piano" : `Part ${index + 1}`;
    return [
      `<score-part id="${partId}">`,
      `<part-name>${partName}</part-name>`,
      `<midi-instrument id="${partId}-I1">`,
      `<midi-channel>${midiChannel}</midi-channel>`,
      `<midi-program>${midiProgram}</midi-program>`,
      "</midi-instrument>",
      "</score-part>",
    ].join("");
  }).join("");

  const partsXml = Array.from({ length: partCount }, (_, partIndex) => {
    const partId = `P${partIndex + 1}`;
    const clefXml = buildClefXml(options.clefs?.[partIndex]);
    const measuresXml = Array.from({ length: DEFAULT_MEASURE_COUNT }, (_, measureIndex) => {
      const attributesXml = measureIndex === 0
        ? [
            "<attributes>",
            `<divisions>${DEFAULT_DIVISIONS}</divisions>`,
            `<key><fifths>${fifths}</fifths><mode>major</mode></key>`,
            `<time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>`,
            usePianoGrandStaffTemplate
              ? '<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>'
              : clefXml,
            "</attributes>",
          ].join("")
        : "";
      const measureBodyXml = usePianoGrandStaffTemplate
        ? [
            buildMeasureRestNoteXml(measureDuration, 1),
            `<backup><duration>${measureDuration}</duration></backup>`,
            buildMeasureRestNoteXml(measureDuration, 2),
          ].join("")
        : buildMeasureRestNoteXml(measureDuration);
      return [
        `<measure number="${measureIndex + 1}">`,
        attributesXml,
        measureBodyXml,
        "</measure>",
      ].join("");
    }).join("");
    return [`<part id="${partId}">`, measuresXml, "</part>"].join("");
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work>
    <work-title>Untitled</work-title>
  </work>
  <identification>
    <creator type="composer">Unknown</creator>
  </identification>
  <part-list>${partListXml}</part-list>
  ${partsXml}
</score-partwise>`;
};
