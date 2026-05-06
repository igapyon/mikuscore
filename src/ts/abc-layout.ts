/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

export type AbcScoreLayout = {
  orderedVoiceIds: string[];
  groups: string[][];
};

type AbcScoreLayoutAccumulator = {
  ordered: string[];
  groups: string[][];
  seen: Set<string>;
};

const ABC_SCORE_VOICE_ID_PATTERN = /^[A-Za-z0-9_.-]+$/;

export type AbcNormalizedVoiceData<Note = unknown, MeasureMeta = unknown> = {
  partName: string;
  clef: string;
  transpose?: { chromatic?: number; diatonic?: number } | null;
  voiceId: string;
  keyByMeasure: Record<number, number>;
  meterByMeasure: Record<number, { beats: number; beatType: number }>;
  tempoByMeasure: Record<number, number>;
  measureMetaByIndex: Record<number, MeasureMeta>;
  measures: Note[][];
};

export type AbcParsedStaffVoice<Note = unknown> = {
  staff: number;
  voiceId: string;
  clef?: string;
  transpose?: { chromatic?: number; diatonic?: number } | null;
  measures: Note[][];
};

export type AbcParsedPart<Note = unknown, MeasureMeta = unknown> = {
  partId: string;
  partName: string;
  clef?: string;
  transpose?: { chromatic?: number; diatonic?: number } | null;
  voiceId?: string;
  keyByMeasure?: Record<number, number>;
  meterByMeasure?: Record<number, { beats: number; beatType: number }>;
  tempoByMeasure?: Record<number, number>;
  measureMetaByIndex?: Record<number, MeasureMeta>;
  measures: Note[][];
  staffVoices?: AbcParsedStaffVoice<Note>[];
};

const parseAbcScoreLayoutChunks = (raw: string): string[][] => {
  const chunks: string[][] = [];
  const groupRegex = /\(([^)]*)\)|([^\s()]+)/g;
  let m: RegExpExecArray | null;
  while ((m = groupRegex.exec(raw)) !== null) {
    const chunk = m[1] || m[2] || "";
    chunks.push(chunk.split(/\s+/));
  }
  return chunks;
};

const normalizeAbcScoreLayoutVoiceIds = (ids: string[]): string[] => {
  return ids
    .map((v) => String(v || "").trim())
    .filter((v) => ABC_SCORE_VOICE_ID_PATTERN.test(v));
};

const appendAbcScoreLayoutGroup = (
  accumulator: AbcScoreLayoutAccumulator,
  ids: string[]
): void => {
  const normalized = normalizeAbcScoreLayoutVoiceIds(ids);
  if (normalized.length === 0) return;
  const group: string[] = [];
  for (const id of normalized) {
    if (accumulator.seen.has(id)) continue;
    accumulator.seen.add(id);
    accumulator.ordered.push(id);
    group.push(id);
  }
  if (group.length > 0) {
    accumulator.groups.push(group);
  }
};

const appendAbcScoreLayoutFallbackVoices = (
  accumulator: AbcScoreLayoutAccumulator,
  declaredVoiceIds: string[]
): void => {
  for (const id of declaredVoiceIds) {
    if (!accumulator.seen.has(id)) {
      accumulator.seen.add(id);
      accumulator.ordered.push(id);
      accumulator.groups.push([id]);
    }
  }
};

export const parseAbcScoreLayout = (raw: string, declaredVoiceIds: string[]): AbcScoreLayout => {
  const baseOrder = Array.from(declaredVoiceIds || []);
  const accumulator: AbcScoreLayoutAccumulator = {
    ordered: [],
    groups: [],
    seen: new Set<string>(),
  };
  if (raw) {
    for (const ids of parseAbcScoreLayoutChunks(raw)) {
      appendAbcScoreLayoutGroup(accumulator, ids);
    }
  }

  appendAbcScoreLayoutFallbackVoices(accumulator, baseOrder);

  if (accumulator.ordered.length === 0) {
    return { orderedVoiceIds: ["1"], groups: [["1"]] };
  }
  return { orderedVoiceIds: accumulator.ordered, groups: accumulator.groups };
};

const createFallbackAbcNormalizedVoiceData = <Note, MeasureMeta>(
  voiceId: string
): AbcNormalizedVoiceData<Note, MeasureMeta> => ({
  partName: "Voice " + voiceId,
  clef: "",
  transpose: null,
  voiceId,
  keyByMeasure: {},
  meterByMeasure: {},
  tempoByMeasure: {},
  measureMetaByIndex: {},
  measures: [[] as Note[]],
});

const resolveAbcPrimaryVoiceData = <Note, MeasureMeta>(
  normalizedVoiceDataById: Map<string, AbcNormalizedVoiceData<Note, MeasureMeta>>,
  primaryVoiceId: string
): AbcNormalizedVoiceData<Note, MeasureMeta> => {
  return normalizedVoiceDataById.get(primaryVoiceId) || createFallbackAbcNormalizedVoiceData<Note, MeasureMeta>(primaryVoiceId);
};

const resolveAbcGroupedPartName = <Note, MeasureMeta>(
  groupVoiceIds: string[],
  normalizedVoiceDataById: Map<string, AbcNormalizedVoiceData<Note, MeasureMeta>>,
  fallbackPartName: string
): string => {
  if (groupVoiceIds.length <= 1) {
    return fallbackPartName;
  }
  const names = groupVoiceIds
    .map((voiceId) => normalizedVoiceDataById.get(voiceId)?.partName || ("Voice " + voiceId))
    .filter((name, idx, arr) => name && arr.indexOf(name) === idx);
  return names.length <= 1 ? (names[0] || fallbackPartName) : names.join(" / ");
};

const buildAbcParsedStaffVoice = <Note, MeasureMeta>(
  voiceId: string,
  staffIndex: number,
  voiceData: AbcNormalizedVoiceData<Note, MeasureMeta>
): AbcParsedStaffVoice<Note> => ({
  staff: staffIndex + 1,
  voiceId,
  clef: voiceData.clef,
  transpose: voiceData.transpose,
  measures: (voiceData.measures || [[]]).map((measure) =>
    (Array.isArray(measure) ? measure : []).map((note) => ({ ...note, staff: staffIndex + 1 }))
  ) as Note[][],
});

const buildAbcParsedPartBase = <Note, MeasureMeta>(
  primary: AbcNormalizedVoiceData<Note, MeasureMeta>,
  index: number,
  partName: string
): AbcParsedPart<Note, MeasureMeta> => ({
  partId: "P" + String(index + 1),
  partName,
  clef: primary.clef,
  transpose: primary.transpose,
  voiceId: primary.voiceId,
  keyByMeasure: primary.keyByMeasure,
  meterByMeasure: primary.meterByMeasure,
  tempoByMeasure: primary.tempoByMeasure,
  measureMetaByIndex: primary.measureMetaByIndex,
  measures: primary.measures,
});

export const buildAbcParsedPartsFromLayout = <Note, MeasureMeta>(
  scoreLayout: AbcScoreLayout,
  normalizedVoiceDataById: Map<string, AbcNormalizedVoiceData<Note, MeasureMeta>>
): AbcParsedPart<Note, MeasureMeta>[] => {
  return scoreLayout.groups.map((groupVoiceIds, index) => {
    const primaryVoiceId = groupVoiceIds[0] || "1";
    const primary = resolveAbcPrimaryVoiceData(normalizedVoiceDataById, primaryVoiceId);
    const partName = resolveAbcGroupedPartName(groupVoiceIds, normalizedVoiceDataById, primary.partName);
    const part = buildAbcParsedPartBase(primary, index, partName);
    if (groupVoiceIds.length <= 1) {
      return part;
    }
    return {
      ...part,
      staffVoices: groupVoiceIds.map((voiceId, staffIndex) => {
        const voiceData = normalizedVoiceDataById.get(voiceId) || primary;
        return buildAbcParsedStaffVoice(voiceId, staffIndex, voiceData);
      }),
    };
  });
};

export const hasAbcGroupedStaffVoices = <Note, MeasureMeta>(
  part: AbcParsedPart<Note, MeasureMeta>
): boolean => {
  return Array.isArray(part.staffVoices) && part.staffVoices.length > 1;
};

export const buildAbcGroupedStaffMeasureNotesXml = <Note>(
  staffVoices: AbcParsedStaffVoice<Note>[],
  measureIndex: number,
  currentMeasureDurationDiv: number,
  buildMeasureNotesXml: (notes: Note[], staffNumber?: number) => string
): string => {
  return staffVoices
    .map((staffVoice, staffIndex) => {
      const staffNotes = staffVoice.measures?.[measureIndex] ?? [];
      const xml = buildMeasureNotesXml(staffNotes, staffVoice.staff);
      if (staffIndex <= 0) {
        return xml;
      }
      return `<backup><duration>${currentMeasureDurationDiv}</duration></backup>${xml}`;
    })
    .join("");
};
