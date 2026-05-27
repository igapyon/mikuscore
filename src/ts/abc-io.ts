/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-nocheck
import {
  buildMusicXmlBeamItemsXml,
  computeBeamAssignments,
} from "./beam-common";
import {
  buildMusicXmlArticulationItemsXml,
  extractMusicXmlArticulationKinds,
} from "./score-features/articulations";
import {
  buildMusicXmlDirectionFeatureXml,
  extractMusicXmlDirectionFeatures,
  normalizeDynamicMark,
} from "./score-features/dynamics";
import {
  buildMusicXmlTempoDirectionXml,
  buildMusicXmlWordsDirectionXml,
  extractMusicXmlDirectionWords,
} from "./score-features/direction-text";
import { buildMusicXmlClefXml, type ClefFeature } from "./score-features/clefs";
import { buildMusicXmlKeySignatureXml } from "./score-features/key-signatures";
import {
  buildMusicXmlOrnamentItemsXml,
  buildMusicXmlOrnamentsXml,
  extractMusicXmlOrnamentFeatures,
} from "./score-features/ornaments";
import { buildMusicXmlPitchXml } from "./score-features/pitches";
import {
  buildMusicXmlAccidentalXml,
  buildMusicXmlFingeringXml,
  buildMusicXmlGraceXml,
  buildMusicXmlLyricXml,
  buildMusicXmlStringNumberXml,
  buildMusicXmlTechnicalXml,
} from "./score-features/note-elements";
import {
  buildMusicXmlSlursXml,
  extractMusicXmlSlurFeatures,
} from "./score-features/slurs";
import {
  buildMusicXmlTieItemsXml,
  buildMusicXmlTiedItemsXml,
  extractMusicXmlTieState,
} from "./score-features/ties";
import { buildMusicXmlTimeModificationXml } from "./score-features/tuplets";
import { buildMusicXmlTimeSignatureXml } from "./score-features/time-signatures";
import { buildMusicXmlTransposeXml } from "./score-features/transposition";
import {
  parseAbcBodyEntryAt,
  parseAbcBracketTokenAt,
  parseAbcBrokenRhythmAt,
  parseAbcDelimitedSpanAt,
  parseAbcBareRepeatEndingMarkerAt,
  parseAbcBarlineTokenAt,
  parseAbcGraceGroupAt,
  parseAbcPlayableEventAt,
  parseAbcSingleCharShorthandAt,
} from "./abc-parser";
import {
  buildAbcGroupedStaffMeasureNotesXml,
  buildAbcParsedPartsFromLayout,
  hasAbcGroupedStaffVoices,
  parseAbcScoreLayout,
} from "./abc-layout";
import type {
  AbcNormalizedVoiceData as LayoutAbcNormalizedVoiceData,
  AbcParsedPart as LayoutAbcParsedPart,
  AbcParsedStaffVoice as LayoutAbcParsedStaffVoice,
} from "./abc-layout";
import { chooseSingleClefByKeys } from "../../core/staffClefPolicy";

export type Fraction = { num: number; den: number };

const DEFAULT_UNIT: Fraction = { num: 1, den: 8 };
const DEFAULT_RATIO: Fraction = { num: 1, den: 1 };

const gcd = (a: number, b: number): number => {
  let x = Math.abs(Number(a) || 0);
  let y = Math.abs(Number(b) || 0);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
};

const reduceFraction = (num: number, den: number, fallback: Fraction = DEFAULT_RATIO): Fraction => {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
    return { num: fallback.num, den: fallback.den };
  }
  const sign = den < 0 ? -1 : 1;
  const n = num * sign;
  const d = den * sign;
  const g = gcd(n, d);
  return { num: n / g, den: d / g };
};

const multiplyFractions = (a: Fraction, b: Fraction, fallback: Fraction = DEFAULT_RATIO): Fraction => {
  return reduceFraction(a.num * b.num, a.den * b.den, fallback);
};

const divideFractions = (a: Fraction, b: Fraction, fallback: Fraction = DEFAULT_RATIO): Fraction => {
  return reduceFraction(a.num * b.den, a.den * b.num, fallback);
};

const parseFractionText = (text: string, fallback: Fraction = DEFAULT_UNIT): Fraction => {
  const m = String(text ?? "").match(/^\s*(\d+)\/(\d+)\s*$/);
  if (!m) {
    return { num: fallback.num, den: fallback.den };
  }
  const num = Number.parseInt(m[1], 10);
  const den = Number.parseInt(m[2], 10);
  if (!num || !den) {
    return { num: fallback.num, den: fallback.den };
  }
  return reduceFraction(num, den, fallback);
};

const isAbcjsWrapperLine = (text: string): boolean =>
  /^\[\s*\/?\s*abcjs(?:-[A-Za-z0-9_-]+)?(?:\s+[^\]]*)?\]$/i.test(String(text ?? "").trim());

const estimateAbcMeasureContentDiv = (notes: any[]): number => {
  const byVoice = new Map<string, number>();
  const lastStartByVoice = new Map<string, number>();
  for (const note of Array.isArray(notes) ? notes : []) {
    if (!note || note.grace) continue;
    const voice = String(note.voice ?? "1");
    const durationDiv = Math.max(0, Math.round(Number(note.duration ?? 0)));
    if (durationDiv <= 0) continue;
    const current = byVoice.get(voice) ?? 0;
    if (note.chord) {
      const startDiv = lastStartByVoice.get(voice) ?? current;
      byVoice.set(voice, Math.max(current, startDiv + durationDiv));
      continue;
    }
    lastStartByVoice.set(voice, current);
    byVoice.set(voice, current + durationDiv);
  }
  let maxDiv = 0;
  for (const value of byVoice.values()) {
    maxDiv = Math.max(maxDiv, value);
  }
  return maxDiv;
};

const parseAbcLengthToken = (token: string, lineNo: number): Fraction => {
  if (!token) {
    return { num: 1, den: 1 };
  }
  if (/^\/+$/.test(token)) {
    return { num: 1, den: 2 ** token.length };
  }
  if (token === "/") {
    return { num: 1, den: 2 };
  }
  if (/^\d+$/.test(token)) {
    return { num: Number(token), den: 1 };
  }
  if (/^\d+\/$/.test(token)) {
    return { num: Number(token.slice(0, -1)), den: 2 };
  }
  if (/^\/\d+$/.test(token)) {
    return { num: 1, den: Number(token.slice(1)) };
  }
  if (/^\d+\/\d+$/.test(token)) {
    const p = token.split("/");
    return reduceFraction(Number(p[0]), Number(p[1]), { num: 1, den: 1 });
  }
  throw new Error(`line ${lineNo}: Could not parse length token: ${token}`);
};

const abcLengthTokenFromFraction = (ratio: Fraction): string => {
  const reduced = reduceFraction(ratio.num, ratio.den, { num: 1, den: 1 });
  if (reduced.num === reduced.den) return "";
  if (reduced.den === 1) return String(reduced.num);
  if (reduced.num === 1 && reduced.den === 2) return "/";
  if (reduced.num === 1) return `/${reduced.den}`;
  return `${reduced.num}/${reduced.den}`;
};

const abcPitchFromStepOctave = (step: string, octave: number): string => {
  const upperStep = String(step ?? "").toUpperCase();
  if (!/^[A-G]$/.test(upperStep)) {
    return "C";
  }
  if (octave >= 5) {
    return upperStep.toLowerCase() + "'".repeat(octave - 5);
  }
  return upperStep + ",".repeat(Math.max(0, 4 - octave));
};

const accidentalFromAlter = (alter: number): string => {
  if (alter === 0) return "";
  if (alter > 0) return "^".repeat(Math.min(2, alter));
  return "_".repeat(Math.min(2, Math.abs(alter)));
};

const keyFromFifthsMode = (fifths: number, mode: string): string => {
  const major = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
  const minor = ["Abm", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m"];
  const idx = Number(fifths) + 7;
  if (idx < 0 || idx >= major.length) {
    return "C";
  }
  const lowerMode = String(mode ?? "").toLowerCase();
  if (lowerMode === "minor") {
    return minor[idx];
  }
  return major[idx];
};

const fractionToAbcTempoUnit = (fraction: Fraction): string => {
  const reduced = reduceFraction(fraction.num, fraction.den, { num: 1, den: 4 });
  return `${reduced.num}/${reduced.den}`;
};

const metronomeUnitFractionFromMusicXml = (metronome: Element | null): Fraction | null => {
  if (!metronome) return null;
  const beatUnit = (metronome.querySelector(":scope > beat-unit")?.textContent ?? "").trim().toLowerCase();
  const dotCount = metronome.querySelectorAll(":scope > beat-unit-dot").length;
  const baseByUnit: Record<string, Fraction> = {
    whole: { num: 1, den: 1 },
    half: { num: 1, den: 2 },
    quarter: { num: 1, den: 4 },
    eighth: { num: 1, den: 8 },
    "16th": { num: 1, den: 16 },
    "32nd": { num: 1, den: 32 },
    "64th": { num: 1, den: 64 },
  };
  const base = baseByUnit[beatUnit];
  if (!base) return null;
  let total = reduceFraction(base.num, base.den, base);
  let add = total;
  for (let i = 0; i < dotCount; i += 1) {
    add = divideFractions(add, { num: 2, den: 1 }, add);
    total = reduceFraction((total.num * add.den) + (add.num * total.den), total.den * add.den, total);
  }
  return total;
};

const readInitialTempoFromMusicXml = (doc: Document): { bpm: number; unit: Fraction | null } | null => {
  const firstPart = doc.querySelector("score-partwise > part");
  const firstMeasure = firstPart?.querySelector(":scope > measure");
  if (!firstMeasure) return null;
  const leadingDirections = Array.from(firstMeasure.children).filter((child) => {
    const tag = child.tagName.toLowerCase();
    if (tag === "direction") return true;
    if (tag === "attributes" || tag === "print" || tag === "sound" || tag === "bookmark") return true;
    return false;
  });
  const candidates: Array<{ bpm: number; unit: Fraction | null }> = [];
  for (const child of leadingDirections) {
    const tag = child.tagName.toLowerCase();
    if (tag === "direction") {
      const metronome = child.querySelector(":scope > direction-type > metronome");
      const soundTempo = Number(child.querySelector(":scope > sound")?.getAttribute("tempo") ?? "");
      const metronomeTempo = Number(metronome?.querySelector(":scope > per-minute")?.textContent?.trim() ?? "");
      if (Number.isFinite(soundTempo) && soundTempo > 0) {
        candidates.push({ bpm: soundTempo, unit: null });
      }
      if (Number.isFinite(metronomeTempo) && metronomeTempo > 0) {
        candidates.push({ bpm: metronomeTempo, unit: metronomeUnitFractionFromMusicXml(metronome) });
      }
      continue;
    }
    if (tag === "sound") {
      const bpm = Number(child.getAttribute("tempo") ?? "");
      if (Number.isFinite(bpm) && bpm > 0) candidates.push({ bpm, unit: null });
    }
  }
  if (!candidates.length) return null;
  return candidates[candidates.length - 1] ?? null;
};

type AbcImportVoiceRegistry = {
  declaredVoiceIds: string[];
  voiceNameById: Record<string, string>;
  voiceClefById: Record<string, string>;
  voiceTransposeById: Record<string, { chromatic?: number; diatonic?: number } | null | undefined>;
};

type AbcImportBodyEntry = {
  text: string;
  lineNo: number;
  voiceId: string;
};

type AbcImportLineState = {
  currentVoiceId: string;
  scoreDirective: string;
  bodyStarted: boolean;
  pendingUnsupportedContinuedFieldName: string;
};

type AbcMetaParams = Record<string, string>;

type AbcMeasureMeta = {
  number: string;
  implicit: boolean;
  repeatStart: boolean;
  repeatEnd: boolean;
  repeatTimes: number | null;
  endingStart: string;
  endingStop: string;
  endingStopType: "" | "stop" | "discontinue";
};

type AbcNormalizedVoiceData = LayoutAbcNormalizedVoiceData<AbcParsedNote, AbcMeasureMeta>;

type AbcImportLineProcessorContext = {
  lineState: AbcImportLineState;
  warnings: string[];
  headers: Record<string, string>;
  lyricEntriesByVoice: Record<string, Array<{ text: string; lineNo: number }>>;
  supportedStandaloneBodyFieldNames: Set<string>;
  voiceRegistry: AbcImportVoiceRegistry;
  userDefinedDecorationBySymbol: Record<string, string>;
  trillWidthHintByKey: Map<string, string>;
  keyHintFifthsByKey: Map<string, number>;
  measureMetaByKey: Map<string, AbcMeasureMeta>;
  transposeHintByVoiceId: Map<string, { chromatic?: number; diatonic?: number }>;
  pushBodyText: (rawBodyText: string, lineNo: number, voiceId: string) => void;
  parseVoiceDirectiveTail: (raw: string) => {
    name: string;
    clef: string;
    transpose: { chromatic?: number; diatonic?: number } | null;
    bodyText: string;
    skippedText: string;
    unsupportedKeys: string[];
  };
  parseUserDefinedDecoration: (raw: string) => { symbol: string; decoration: string } | null;
  expandUserDefinedDecorationSymbols: (text: string, symbolMap: Record<string, string>) => string;
};

type AbcLyricEntry = {
  text: string;
  lineNo: number;
};

type AbcVoiceStores = {
  measuresByVoice: Record<string, AbcParsedNote[][]>;
  notationMeasureMetaByVoice: Record<string, Record<number, AbcMeasureMeta>>;
  activeEndingByVoice: Record<string, string>;
  currentKeyFifthsByVoice: Record<string, number>;
  meterByMeasureByVoice: Record<string, Record<number, { beats: number; beatType: number }>>;
  tempoByMeasureByVoice: Record<string, Record<number, number>>;
};

type AbcBodyFieldContext = {
  warnings: string[];
  voiceStores: AbcVoiceStores;
  entryVoiceId: string;
  currentMeasureNo: number;
  keyHintFifthsByKey: Map<string, number>;
  activeKeyFifths: number;
  activeUnitLength: Fraction;
  activeMeter: { beats: number; beatType: number };
  activeTempoBpm: number | null;
  measureAccidentals: Record<string, number>;
};

type AbcParsedBodyEntryToken = Exclude<ReturnType<typeof parseAbcBodyEntryAt>, null>;

type AbcBarlineEntryContext = {
  text: string;
  idx: number;
  currentMeasureNo: number;
  currentMeasureLength: number;
  measuresLength: number;
  activeEndingMarker: string;
  markRepeatEnd: () => void;
  markRepeatStart: () => void;
  stopActiveEndingAtMeasure: (measureNo: number) => void;
  advanceToNextMeasure: () => void;
  clearMeasureAccidentals: () => void;
  clearLastNote: () => void;
  resetBeamContext: () => void;
  startEndingAtCurrentMeasure: (marker: string, nextIdx: number) => boolean;
};

type AbcNonPlayableBodyEntryContext = {
  text: string;
  idx: number;
  warnBody: (message: string) => void;
  applyBodyField: (fieldName: string, fieldValue: string) => boolean;
  handleBarlineToken: (barlineToken: AbcParsedBodyEntryToken["barlineToken"]) => boolean;
};

type AbcPlayableEventTiming = {
  absoluteLength: Fraction;
  dur: number;
  activeTuplet: { actual: number; normal: number; remaining: number } | null;
  nextIdx: number;
};

type AbcPlayableEventResolution = {
  invalidLengthMessage: string;
  octaveWarningMessage: string;
  firstNoteOptions: { applyTieStop?: boolean };
  commitOptions: { applyChordTieStop?: boolean };
};

type AbcPlayableEventContext = {
  timing: AbcPlayableEventTiming;
  resolution: AbcPlayableEventResolution;
  buildPlayableEventFromPitches: (
    pitchSources: Array<{
      pitchChar: string;
      accidentalText: string;
      octaveShift: number;
      explicitNatural?: boolean;
      accidentalKind?: "editorial" | "courtesy" | "";
    }>,
    timing: AbcPlayableEventTiming,
    options?: {
      octaveWarningMessage?: string;
      firstNoteOptions?: { applyTieStop?: boolean };
    }
  ) => any[];
  commitPlayableEvent: (notes: any[], options?: { applyChordTieStop?: boolean }) => boolean;
  clearLastEventState: (options?: { clearPendingTie?: boolean }) => void;
  warnBody: (message: string) => void;
};

type AbcPlayablePitchSource = {
  pitchChar: string;
  accidentalText: string;
  octaveShift: number;
  explicitNatural?: boolean;
  accidentalKind?: "editorial" | "courtesy" | "";
};

type AbcPlayableEventBuildContext = {
  pitchSources: AbcPlayablePitchSource[];
  timing: AbcPlayableEventTiming;
  octaveWarningMessage: string;
  firstNoteOptions: { applyTieStop?: boolean };
  buildPlayableNoteForBody: (
    pitchSource: AbcPlayablePitchSource,
    absoluteLength: Fraction,
    dur: number,
    octaveWarningMessage: string
  ) => any | null;
  finalizePlayableEventStart: (
    note: any,
    dur: number,
    activeTuplet: { actual: number; normal: number; remaining: number } | null,
    options?: { applyTieStop?: boolean }
  ) => void;
};

type AbcSimpleBodyTokenHandlerContext = {
  char: string;
  handleBrokenRhythmBodyToken: (bodyToken: any) => boolean;
  handleDecorationBodyToken: (bodyToken: any, char: string) => boolean;
  handleParenBodyToken: (bodyToken: any) => boolean;
  handleQuotedStringBodyToken: (bodyToken: any) => boolean;
  handleSingleCharShorthandBodyToken: (bodyToken: any, char: string) => boolean;
  handleSlurStopBodyToken: (bodyToken: any) => boolean;
  handleTieBodyToken: (bodyToken: any) => boolean;
};

type AbcBracketBodyTokenContext = {
  text: string;
  idx: number;
  handleInlineFieldBracketToken: (bracketToken: any) => boolean;
  handleRepeatEndingBracketToken: (bracketToken: any) => boolean;
  handlePlayableEvent: (playableEvent: any, options?: { fallbackToNextChar?: boolean }) => boolean;
};

type AbcGraceGroupContext = {
  char: string;
  text: string;
  idx: number;
  lineNo: number;
  activeUnitLength: Fraction;
  activeKeySignatureAccidentals: Record<string, number>;
  measureAccidentals: Record<string, number>;
  entryVoiceId: string;
  warnings: string[];
  warnBody: (message: string) => void;
  appendGraceNotes: (graceNotes: any[]) => void;
};

type AbcBodyFallbackContext = {
  char: string;
  bodyEntry: any;
  handleClosingNotation: (char: string) => boolean;
  handleUnsupportedPunctuation: (char: string) => boolean;
  throwBodyParseError: () => never;
};

type AbcPendingPlayableNoteContext = {
  note: any;
  options: {
    applySlurStart?: boolean;
    applyTieStop?: boolean;
    trillHint?: string;
  };
  applyPendingOrnamentState: (
    note: any,
    options?: { applySlurStart?: boolean; trillHint?: string }
  ) => void;
  applyPendingArticulationState: (note: any) => void;
  applyPendingDirectionState: (note: any) => void;
  applyPendingTechnicalState: (note: any) => void;
  hasPendingTieToNext: () => boolean;
  clearPendingTieToNext: () => void;
  warnBody: (message: string) => void;
};

type AbcPendingNoteValueContext = {
  note: any;
  isPending: boolean;
  apply: () => void;
  clear: () => void;
};

type AbcPendingNoteOptionalValueContext = {
  note: any;
  value: any;
  isEmpty: (value: any) => boolean;
  apply: (value: any) => void;
  clear: () => void;
};

type AbcPendingNoteArrayContext = {
  note: any;
  values: any[];
  apply: (values: any[]) => void;
  clear: () => void;
};

const ensureAbcDeclaredVoice = (
  registry: AbcImportVoiceRegistry,
  voiceId: string
): void => {
  if (!registry.declaredVoiceIds.includes(voiceId)) {
    registry.declaredVoiceIds.push(voiceId);
  }
};

const appendAbcBodyTextEntries = (
  rawBodyText: string,
  lineNo: number,
  voiceId: string,
  registry: AbcImportVoiceRegistry,
  bodyEntries: AbcImportBodyEntry[],
  splitBodyTextByInlineVoice: (text: string, initialVoiceId?: string) => { segments: Array<{ voiceId: string; text: string }>; finalVoiceId: string },
  splitBodyTextByOverlay: (text: string, baseVoiceId?: string) => Array<{ voiceId: string; text: string; overlayIndex: number }>
): { appended: boolean; finalVoiceId: string } => {
  const normalizedBodyText = String(rawBodyText ?? "").replace(/\\\s*$/, "");
  if (!normalizedBodyText.trim()) {
    return { appended: false, finalVoiceId: String(voiceId ?? "1").trim() || "1" };
  }
  const { segments: inlineVoiceSegments, finalVoiceId } = splitBodyTextByInlineVoice(normalizedBodyText, voiceId);
  for (const segment of inlineVoiceSegments) {
    const overlaySegments = splitBodyTextByOverlay(segment.text, segment.voiceId);
    for (const overlaySegment of overlaySegments) {
      ensureAbcDeclaredVoice(registry, overlaySegment.voiceId);
      if (overlaySegment.overlayIndex > 0) {
        const overlayLabel = `overlay ${overlaySegment.overlayIndex + 1}`;
        registry.voiceNameById[overlaySegment.voiceId] = registry.voiceNameById[segment.voiceId]
          ? `${registry.voiceNameById[segment.voiceId]} ${overlayLabel}`
          : `Voice ${segment.voiceId} ${overlayLabel}`;
        if (registry.voiceClefById[segment.voiceId] && !registry.voiceClefById[overlaySegment.voiceId]) {
          registry.voiceClefById[overlaySegment.voiceId] = registry.voiceClefById[segment.voiceId];
        }
        if (registry.voiceTransposeById[segment.voiceId] && !registry.voiceTransposeById[overlaySegment.voiceId]) {
          registry.voiceTransposeById[overlaySegment.voiceId] = { ...registry.voiceTransposeById[segment.voiceId] };
        }
      }
      bodyEntries.push({ text: overlaySegment.text, lineNo, voiceId: overlaySegment.voiceId });
    }
  }
  return { appended: true, finalVoiceId: String(finalVoiceId ?? voiceId ?? "1").trim() || "1" };
};

const applyAbcVoiceDirective = (
  value: string,
  lineNo: number,
  lineState: AbcImportLineState,
  voiceRegistry: AbcImportVoiceRegistry,
  warnings: string[],
  userDefinedDecorationBySymbol: Record<string, string>,
  parseVoiceDirectiveTail: (raw: string) => {
    name: string;
    clef: string;
    transpose: { chromatic?: number; diatonic?: number } | null;
    bodyText: string;
    skippedText: string;
    unsupportedKeys: string[];
  },
  expandUserDefinedDecorationSymbols: (text: string, symbolMap: Record<string, string>) => string,
  pushBodyText: (rawBodyText: string, lineNo: number, voiceId: string) => void
): void => {
  const m = value.match(/^(\S+)\s*(.*)$/);
  if (!m) return;
  lineState.currentVoiceId = m[1];
  ensureAbcDeclaredVoice(voiceRegistry, lineState.currentVoiceId);
  const rest = m[2]?.trim() ?? "";
  const parsedVoice = parseVoiceDirectiveTail(rest);
  if (parsedVoice.name) {
    voiceRegistry.voiceNameById[lineState.currentVoiceId] = parsedVoice.name;
  }
  if (parsedVoice.clef) {
    voiceRegistry.voiceClefById[lineState.currentVoiceId] = parsedVoice.clef;
  }
  if (parsedVoice.transpose) {
    voiceRegistry.voiceTransposeById[lineState.currentVoiceId] = parsedVoice.transpose;
  }
  if (parsedVoice.skippedText) {
    warnings.push(
      "line " +
        lineNo +
        ": Skipped unsupported V: directive tail token: " +
        parsedVoice.skippedText
    );
  }
  for (const unsupportedKey of parsedVoice.unsupportedKeys ?? []) {
    warnings.push(
      "line " +
        lineNo +
        ": Skipped unsupported V: property: " +
        unsupportedKey
    );
  }
  if (parsedVoice.bodyText) {
    const expandedBodyText = expandUserDefinedDecorationSymbols(parsedVoice.bodyText, userDefinedDecorationBySymbol);
    pushBodyText(expandedBodyText, lineNo, lineState.currentVoiceId);
  }
};

const handleAbcHeaderFieldLine = (
  key: string,
  value: string,
  valueHasContinuation: boolean,
  lineNo: number,
  lineState: AbcImportLineState,
  headers: Record<string, string>,
  lyricEntriesByVoice: Record<string, Array<{ text: string; lineNo: number }>>,
  supportedStandaloneBodyFieldNames: Set<string>,
  voiceRegistry: AbcImportVoiceRegistry,
  warnings: string[],
  userDefinedDecorationBySymbol: Record<string, string>,
  parseVoiceDirectiveTail: (raw: string) => {
    name: string;
    clef: string;
    transpose: { chromatic?: number; diatonic?: number } | null;
    bodyText: string;
    skippedText: string;
    unsupportedKeys: string[];
  },
  parseUserDefinedDecoration: (raw: string) => { symbol: string; decoration: string } | null,
  expandUserDefinedDecorationSymbols: (text: string, symbolMap: Record<string, string>) => string,
  pushBodyText: (rawBodyText: string, lineNo: number, voiceId: string) => void
): boolean => {
  if (key === "w") {
    if (!Object.prototype.hasOwnProperty.call(lyricEntriesByVoice, lineState.currentVoiceId)) {
      lyricEntriesByVoice[lineState.currentVoiceId] = [];
    }
    lyricEntriesByVoice[lineState.currentVoiceId].push({ text: value, lineNo });
    return true;
  }
  if (lineState.bodyStarted && supportedStandaloneBodyFieldNames.has(key)) {
    pushBodyText(`[${key}:${value}]`, lineNo, lineState.currentVoiceId);
    lineState.bodyStarted = true;
    return true;
  }
  if (key === "V") {
    applyAbcVoiceDirective(
      value,
      lineNo,
      lineState,
      voiceRegistry,
      warnings,
      userDefinedDecorationBySymbol,
      parseVoiceDirectiveTail,
      expandUserDefinedDecorationSymbols,
      pushBodyText
    );
    if (!lineState.bodyStarted && valueHasContinuation) {
      warnings.push("line " + lineNo + ": Unsupported continued field after V:; following continuation text will be skipped.");
      lineState.pendingUnsupportedContinuedFieldName = "V:";
    }
    return true;
  }
  if (lineState.bodyStarted) {
    warnings.push("line " + lineNo + ": Skipped unsupported standalone body field: " + key + ":" + value);
    return true;
  }
  if (key === "U") {
    const parsedUserDefinedDecoration = parseUserDefinedDecoration(value);
    if (parsedUserDefinedDecoration) {
      userDefinedDecorationBySymbol[parsedUserDefinedDecoration.symbol] = parsedUserDefinedDecoration.decoration;
    }
    return true;
  }
  headers[key] = value;
  if (!lineState.bodyStarted && valueHasContinuation) {
    warnings.push("line " + lineNo + ": Unsupported continued field after " + key + ":; following continuation text will be skipped.");
    lineState.pendingUnsupportedContinuedFieldName = key + ":";
  }
  return true;
};

const parseAbcMetaParams = (raw: string): AbcMetaParams => {
  const params: AbcMetaParams = {};
  const kvRegex = /([A-Za-z][A-Za-z0-9_-]*)=([^\s]+)/g;
  let kv: RegExpExecArray | null;
  while ((kv = kvRegex.exec(raw)) !== null) {
    params[String(kv[1]).toLowerCase()] = String(kv[2]);
  }
  return params;
};

const applyAbcTrillMeta = (
  params: AbcMetaParams,
  trillWidthHintByKey: Map<string, string>
): boolean => {
  const voiceId = String(params.voice ?? "").trim();
  const measureNo = Number.parseInt(String(params.measure ?? ""), 10);
  const eventNo = Number.parseInt(String(params.event ?? ""), 10);
  const upper = String(params.upper ?? "").trim();
  if (voiceId && Number.isFinite(measureNo) && measureNo > 0 && Number.isFinite(eventNo) && eventNo > 0 && upper) {
    trillWidthHintByKey.set(`${voiceId}#${measureNo}#${eventNo}`, upper);
    return true;
  }
  return false;
};

const applyAbcKeyMeta = (
  params: AbcMetaParams,
  keyHintFifthsByKey: Map<string, number>
): boolean => {
  const voiceId = String(params.voice ?? "").trim();
  const measureNo = Number.parseInt(String(params.measure ?? ""), 10);
  const fifths = Number.parseInt(String(params.fifths ?? ""), 10);
  if (voiceId && Number.isFinite(measureNo) && measureNo > 0 && Number.isFinite(fifths)) {
    const key = `${voiceId}#${measureNo}`;
    if (!keyHintFifthsByKey.has(key)) {
      keyHintFifthsByKey.set(key, Math.max(-7, Math.min(7, Math.round(fifths))));
    }
    return true;
  }
  return false;
};

const applyAbcMeasureMeta = (
  params: AbcMetaParams,
  measureMetaByKey: Map<string, {
    number: string;
    implicit: boolean;
    repeatStart: boolean;
    repeatEnd: boolean;
    repeatTimes: number | null;
    endingStart: string;
    endingStop: string;
    endingStopType: "" | "stop" | "discontinue";
  }>
): boolean => {
  const voiceId = String(params.voice ?? "").trim();
  const measureNo = Number.parseInt(String(params.measure ?? ""), 10);
  if (!(voiceId && Number.isFinite(measureNo) && measureNo > 0)) return false;
  const measureNumberText = String(params.number ?? "").trim();
  const implicitRaw = String(params.implicit ?? "").trim().toLowerCase();
  const repeatRaw = String(params.repeat ?? "").trim().toLowerCase();
  const leftRepeatRaw = String(params["left-repeat"] ?? "").trim().toLowerCase();
  const rightRepeatRaw = String(params["right-repeat"] ?? "").trim().toLowerCase();
  const repeatTimesRaw = Number.parseInt(String(params.times ?? ""), 10);
  const endingStart = String(params["ending-start"] ?? "").trim();
  const endingStop = String(params["ending-stop"] ?? "").trim();
  const endingStopTypeRaw = String(params["ending-type"] ?? "").trim().toLowerCase();
  measureMetaByKey.set(`${voiceId}#${measureNo}`, {
    number: measureNumberText || String(measureNo),
    implicit: implicitRaw === "1" || implicitRaw === "true" || implicitRaw === "yes",
    repeatStart:
      leftRepeatRaw === "1" || leftRepeatRaw === "true" || leftRepeatRaw === "yes" || repeatRaw === "forward",
    repeatEnd:
      rightRepeatRaw === "1" || rightRepeatRaw === "true" || rightRepeatRaw === "yes" || repeatRaw === "backward",
    repeatTimes: Number.isFinite(repeatTimesRaw) && repeatTimesRaw > 1 ? repeatTimesRaw : null,
    endingStart,
    endingStop,
    endingStopType:
      endingStopTypeRaw === "discontinue" || endingStopTypeRaw === "stop"
        ? endingStopTypeRaw
        : (endingStop ? "stop" : ""),
  });
  return true;
};

const applyAbcTransposeMeta = (
  params: AbcMetaParams,
  transposeHintByVoiceId: Map<string, { chromatic?: number; diatonic?: number }>
): boolean => {
  const voiceId = String(params.voice ?? "").trim();
  const chromatic = Number.parseInt(String(params.chromatic ?? ""), 10);
  const diatonic = Number.parseInt(String(params.diatonic ?? ""), 10);
  if (!(voiceId && (Number.isFinite(chromatic) || Number.isFinite(diatonic)))) return false;
  const metaTranspose: { chromatic?: number; diatonic?: number } = {};
  if (Number.isFinite(chromatic)) metaTranspose.chromatic = chromatic;
  if (Number.isFinite(diatonic)) metaTranspose.diatonic = diatonic;
  if (Object.keys(metaTranspose).length > 0) {
    transposeHintByVoiceId.set(voiceId, metaTranspose);
    return true;
  }
  return false;
};

const handleAbcMetaDirectiveLine = (
  rawTrimmed: string,
  trillWidthHintByKey: Map<string, string>,
  keyHintFifthsByKey: Map<string, number>,
  measureMetaByKey: Map<string, {
    number: string;
    implicit: boolean;
    repeatStart: boolean;
    repeatEnd: boolean;
    repeatTimes: number | null;
    endingStart: string;
    endingStop: string;
    endingStopType: "" | "stop" | "discontinue";
  }>,
  transposeHintByVoiceId: Map<string, { chromatic?: number; diatonic?: number }>
): boolean => {
  const metaMatch = rawTrimmed.match(/^%@mks\s+(trill|key|measure|transpose)\s+(.+)$/i);
  if (!metaMatch) return false;
  const kind = String(metaMatch[1] ?? "").toLowerCase();
  const params = parseAbcMetaParams(String(metaMatch[2] ?? ""));
  if (kind === "trill") return applyAbcTrillMeta(params, trillWidthHintByKey);
  if (kind === "key") return applyAbcKeyMeta(params, keyHintFifthsByKey);
  if (kind === "measure") return applyAbcMeasureMeta(params, measureMetaByKey);
  if (kind === "transpose") return applyAbcTransposeMeta(params, transposeHintByVoiceId);
  return false;
};

const isAbcStructuredDirectiveLine = (rawTrimmed: string): boolean => {
  return /^%@mks\s+/i.test(rawTrimmed) || /^%%\s*/i.test(rawTrimmed) || /^[A-Za-z]:\s*(.*)$/.test(rawTrimmed);
};

const handleAbcUnsupportedContinuedFieldLine = (
  raw: string,
  rawTrimmed: string,
  lineNo: number,
  lineState: AbcImportLineState,
  warnings: string[]
): boolean => {
  if (
    !lineState.pendingUnsupportedContinuedFieldName ||
    lineState.bodyStarted ||
    isAbcStructuredDirectiveLine(rawTrimmed)
  ) {
    return false;
  }
  warnings.push(
    "line " +
      lineNo +
      ": Skipped unsupported continued field text for " +
      lineState.pendingUnsupportedContinuedFieldName +
      ": " +
      rawTrimmed
  );
  if (!/\\\s*$/.test(raw)) {
    lineState.pendingUnsupportedContinuedFieldName = "";
  }
  return true;
};

const clearAbcPendingUnsupportedContinuedFieldOnStructuredLine = (
  rawTrimmed: string,
  lineState: AbcImportLineState
): void => {
  if (
    lineState.pendingUnsupportedContinuedFieldName &&
    !lineState.bodyStarted &&
    isAbcStructuredDirectiveLine(rawTrimmed)
  ) {
    lineState.pendingUnsupportedContinuedFieldName = "";
  }
};

const processAbcImportLine = (
  raw: string,
  lineNo: number,
  context: AbcImportLineProcessorContext
): void => {
  const rawTrimmed = raw.trim();
  if (!rawTrimmed) {
    context.lineState.pendingUnsupportedContinuedFieldName = "";
    return;
  }
  if (isAbcjsWrapperLine(rawTrimmed)) {
    context.warnings.push("line " + lineNo + ": Skipped unsupported abcjs wrapper line: " + rawTrimmed);
    context.lineState.pendingUnsupportedContinuedFieldName = "";
    return;
  }
  if (handleAbcUnsupportedContinuedFieldLine(raw, rawTrimmed, lineNo, context.lineState, context.warnings)) {
    return;
  }
  clearAbcPendingUnsupportedContinuedFieldOnStructuredLine(rawTrimmed, context.lineState);
  if (
    handleAbcMetaDirectiveLine(
      rawTrimmed,
      context.trillWidthHintByKey,
      context.keyHintFifthsByKey,
      context.measureMetaByKey,
      context.transposeHintByVoiceId
    )
  ) {
    return;
  }
  const scoreMatch = rawTrimmed.match(/^%%\s*score\s+(.+)$/i);
  if (scoreMatch) {
    context.lineState.scoreDirective = scoreMatch[1].trim();
    return;
  }
  const noComment = raw.split("%")[0];
  const trimmed = noComment.trim();
  if (/^%%\s*/.test(rawTrimmed)) {
    context.warnings.push("line " + lineNo + ": Skipped unsupported ABC directive: " + rawTrimmed);
    return;
  }
  const headerMatch = trimmed.match(/^([A-Za-z]):\s*(.*)$/);
  if (headerMatch && /^[A-Za-z]$/.test(headerMatch[1])) {
    const key = headerMatch[1];
    const valueHasContinuation = /\\\s*$/.test(headerMatch[2]);
    const value = headerMatch[2].replace(/\\\s*$/, "").trim();
    handleAbcHeaderFieldLine(
      key,
      value,
      valueHasContinuation,
      lineNo,
      context.lineState,
      context.headers,
      context.lyricEntriesByVoice,
      context.supportedStandaloneBodyFieldNames,
      context.voiceRegistry,
      context.warnings,
      context.userDefinedDecorationBySymbol,
      context.parseVoiceDirectiveTail,
      context.parseUserDefinedDecoration,
      context.expandUserDefinedDecorationSymbols,
      context.pushBodyText
    );
    return;
  }
  const expandedBodyText = context.expandUserDefinedDecorationSymbols(noComment, context.userDefinedDecorationBySymbol);
  context.pushBodyText(expandedBodyText, lineNo, context.lineState.currentVoiceId);
};

const buildAbcVoiceMeasureMetaByIndex = (
  voiceId: string,
  normalizedMeasures: AbcParsedNote[][],
  keyHintFifthsByKey: Map<string, number>,
  notationMeasureMetaByVoice: Record<string, Record<number, Partial<AbcMeasureMeta>>>,
  measureMetaByKey: Map<string, AbcMeasureMeta>,
  meterByMeasureByVoice: Record<string, Record<number, { beats: number; beatType: number }>>,
  tempoByMeasureByVoice: Record<string, Record<number, number>>
): {
  keyByMeasure: Record<number, number>;
  meterByMeasure: Record<number, { beats: number; beatType: number }>;
  tempoByMeasure: Record<number, number>;
  measureMetaByIndex: Record<number, AbcMeasureMeta>;
} => {
  const keyByMeasure: Record<number, number> = {};
  const meterByMeasure: Record<number, { beats: number; beatType: number }> = {};
  const tempoByMeasure: Record<number, number> = {};
  const measureMetaByIndex: Record<number, AbcMeasureMeta> = {};
  for (let m = 1; m <= normalizedMeasures.length; m += 1) {
    const hinted = keyHintFifthsByKey.get(`${voiceId}#${m}`);
    if (Number.isFinite(hinted)) {
      keyByMeasure[m] = Number(hinted);
    }
    const notationMeta = notationMeasureMetaByVoice[voiceId]?.[m] ?? null;
    const hintedMeta = measureMetaByKey.get(`${voiceId}#${m}`) ?? null;
    const meterHint = meterByMeasureByVoice[voiceId]?.[m] ?? null;
    const tempoHint = tempoByMeasureByVoice[voiceId]?.[m] ?? null;
    if (notationMeta || hintedMeta) {
      measureMetaByIndex[m] = {
        number: hintedMeta?.number || notationMeta?.number || String(m),
        implicit: hintedMeta?.implicit ?? notationMeta?.implicit ?? false,
        repeatStart: !!(notationMeta?.repeatStart || hintedMeta?.repeatStart),
        repeatEnd: !!(notationMeta?.repeatEnd || hintedMeta?.repeatEnd),
        repeatTimes: hintedMeta?.repeatTimes ?? notationMeta?.repeatTimes ?? null,
        endingStart: String(notationMeta?.endingStart ?? hintedMeta?.endingStart ?? ""),
        endingStop: String(notationMeta?.endingStop ?? hintedMeta?.endingStop ?? ""),
        endingStopType: hintedMeta?.endingStopType ?? notationMeta?.endingStopType ?? "",
      };
    }
    if (meterHint) {
      meterByMeasure[m] = {
        beats: meterHint.beats,
        beatType: meterHint.beatType,
      };
    }
    if (Number.isFinite(tempoHint)) {
      tempoByMeasure[m] = Math.max(20, Math.min(300, Math.round(Number(tempoHint))));
    }
  }
  return { keyByMeasure, meterByMeasure, tempoByMeasure, measureMetaByIndex };
};

const buildAbcNormalizedVoiceDataById = (
  orderedVoiceIds: string[],
  voiceRegistry: AbcImportVoiceRegistry,
  measuresByVoice: Record<string, AbcParsedNote[][]>,
  measureCapacity: number,
  overfullCompatibilityMode: boolean,
  settings: { inferTransposeFromPartName?: boolean },
  transposeHintByVoiceId: Map<string, { chromatic?: number; diatonic?: number }>,
  keyHintFifthsByKey: Map<string, number>,
  notationMeasureMetaByVoice: Record<string, Record<number, Partial<AbcMeasureMeta>>>,
  measureMetaByKey: Map<string, AbcMeasureMeta>,
  meterByMeasureByVoice: Record<string, Record<number, { beats: number; beatType: number }>>,
  tempoByMeasureByVoice: Record<string, Record<number, number>>,
  importDiagnostics: Array<{
    level: "warn";
    code: string;
    fmt: "abc";
    message?: string;
    voiceId?: string;
    measure?: number;
    action?: string;
    movedEvents?: number;
  }>
): Map<string, AbcNormalizedVoiceData> => {
  const normalizedVoiceDataById = new Map<string, AbcNormalizedVoiceData>();
  for (const voiceId of orderedVoiceIds) {
    const partName = voiceRegistry.voiceNameById[voiceId] || ("Voice " + voiceId);
    const transpose =
      transposeHintByVoiceId.get(voiceId) ||
      voiceRegistry.voiceTransposeById[voiceId] ||
      (settings.inferTransposeFromPartName ? inferTransposeFromPartName(partName) : null);
    const normalized = overfullCompatibilityMode
      ? normalizeMeasuresToCapacity(measuresByVoice[voiceId] || [[]], measureCapacity)
      : { measures: measuresByVoice[voiceId] || [[]], diagnostics: [] };
    const normalizedMeasures = normalized.measures;
    if (overfullCompatibilityMode) {
      for (const diag of normalized.diagnostics) {
        importDiagnostics.push({
          level: "warn",
          code: "OVERFULL_REFLOWED",
          fmt: "abc",
          voiceId,
          measure: diag.sourceMeasure,
          action: "reflowed",
          movedEvents: diag.movedEvents,
        });
      }
    }
    const measureData = buildAbcVoiceMeasureMetaByIndex(
      voiceId,
      normalizedMeasures,
      keyHintFifthsByKey,
      notationMeasureMetaByVoice,
      measureMetaByKey,
      meterByMeasureByVoice,
      tempoByMeasureByVoice
    );
    normalizedVoiceDataById.set(voiceId, {
      partName,
      clef: voiceRegistry.voiceClefById[voiceId] ?? "",
      transpose,
      voiceId,
      keyByMeasure: measureData.keyByMeasure,
      meterByMeasure: measureData.meterByMeasure,
      tempoByMeasure: measureData.tempoByMeasure,
      measureMetaByIndex: measureData.measureMetaByIndex,
      measures: normalizedMeasures,
    });
  }
  return normalizedVoiceDataById;
};

const buildAbcGroupedStaffClefXml = (staffVoices: AbcParsedStaffVoice[]): string =>
  staffVoices
    .map((staffVoice) => {
      const clefXml = clefXmlFromAbcClef(staffVoice.clef ?? "");
      return clefXml.replace("<clef>", `<clef number="${staffVoice.staff}">`);
    })
    .join("");

const buildAbcMeasureHeaderInitialParts = (
  part: AbcParsedPart,
  currentPartFifths: number,
  currentPartMeter: { beats: number; beatType: number }
): string[] => [
  "<attributes>",
  "<divisions>960</divisions>",
  buildMusicXmlKeySignatureXml({ fifths: currentPartFifths }),
  buildMusicXmlTimeSignatureXml({
    beats: currentPartMeter.beats,
    beatType: currentPartMeter.beatType,
  }),
  hasAbcGroupedStaffVoices(part) ? `<staves>${part.staffVoices.length}</staves>` : "",
  buildMusicXmlTransposeXml(part.transpose),
  hasAbcGroupedStaffVoices(part) ? buildAbcGroupedStaffClefXml(part.staffVoices) : clefXmlFromAbcClef(part.clef),
  "</attributes>",
];

const buildAbcMeasureHeaderUpdateParts = (
  currentPartFifths: number,
  currentPartMeter: { beats: number; beatType: number },
  hintedFifths: number | null,
  hintedMeter: { beats: number; beatType: number } | null
): string[] => [
  "<attributes>",
  hintedFifths !== null ? buildMusicXmlKeySignatureXml({ fifths: currentPartFifths }) : "",
  hintedMeter ? buildMusicXmlTimeSignatureXml({ beats: currentPartMeter.beats, beatType: currentPartMeter.beatType }) : "",
  "</attributes>",
];

const buildAbcPartMeasureRenderContext = (
  part: AbcParsedPart,
  measureIndex: number,
  state: AbcPartRenderState,
  beats: number,
  beatType: number
): AbcPartMeasureRenderContext => {
  const measureNo = measureIndex + 1;
  const notes = part.measures[measureIndex] ?? [];
  const measureMeta = part.measureMetaByIndex?.[measureNo] ?? null;
  const hintedFifths = Number.isFinite(part.keyByMeasure?.[measureNo])
    ? Math.max(-7, Math.min(7, Math.round(Number(part.keyByMeasure?.[measureNo]))))
    : null;
  const hintedMeter = part.meterByMeasure?.[measureNo] ?? null;
  const hintedTempo = Number.isFinite(part.tempoByMeasure?.[measureNo])
    ? Math.max(20, Math.min(300, Math.round(Number(part.tempoByMeasure?.[measureNo]))))
    : null;
  const nextState: AbcPartRenderState = {
    currentPartFifths: hintedFifths !== null ? hintedFifths : state.currentPartFifths,
    currentPartMeter: hintedMeter
      ? {
          beats: Math.max(1, Math.round(Number(hintedMeter.beats) || beats)),
          beatType: Math.max(1, Math.round(Number(hintedMeter.beatType) || beatType)),
        }
      : state.currentPartMeter,
    currentPartTempo: hintedTempo !== null ? hintedTempo : state.currentPartTempo,
  };
  const currentMeasureDurationDiv = Math.max(
    1,
    Math.round((960 * 4 * Math.max(1, Math.round(nextState.currentPartMeter.beats))) / Math.max(1, Math.round(nextState.currentPartMeter.beatType)))
  );
  const currentMeasureContentDiv = estimateAbcMeasureContentDiv(notes);
  const inferredImplicitPickup =
    measureIndex === 0 &&
    !measureMeta?.implicit &&
    currentMeasureContentDiv > 0 &&
    currentMeasureContentDiv < currentMeasureDurationDiv;
  return {
    notes,
    measureMeta,
    hintedFifths,
    hintedMeter,
    hintedTempo,
    nextState,
    currentMeasureDurationDiv,
    inferredImplicitPickup,
  };
};

const buildAbcRenderedPartMeasureXml = (
  context: AbcRenderedPartMeasureContext
): string => {
  const {
    part,
    partIndex,
    measureIndex,
    measureNo,
    notes,
    measureMeta,
    hintedFifths,
    hintedMeter,
    hintedTempo,
    currentPartFifths,
    currentPartMeter,
    currentPartTempo,
    currentMeasureDurationDiv,
    inferredImplicitPickup,
    debugMetadata,
    sourceMetadata,
    diagnostics,
    abcSource,
    buildMeasureNotesXml,
  } = context;
  const headerXml =
    measureIndex === 0
      ? buildAbcMeasureHeaderInitialParts(part, currentPartFifths, currentPartMeter).join("")
      : hintedFifths !== null || hintedMeter !== null
        ? buildAbcMeasureHeaderUpdateParts(currentPartFifths, currentPartMeter, hintedFifths, hintedMeter).join("")
        : "";
  const headerTempoDirectionXml =
    measureIndex === 0 && partIndex === 0 && currentPartTempo !== null
      ? buildMusicXmlTempoDirectionXml({ bpm: currentPartTempo, includeQuarterMetronome: true })
      : "";
  const tempoDirectionXml =
    headerTempoDirectionXml ||
    (measureIndex > 0 && partIndex === 0 && hintedTempo !== null
      ? buildMusicXmlTempoDirectionXml({ bpm: hintedTempo, includeQuarterMetronome: true })
      : "");
  const notesXml =
    hasAbcGroupedStaffVoices(part)
      ? buildAbcGroupedStaffMeasureNotesXml(
          part.staffVoices,
          measureIndex,
          currentMeasureDurationDiv,
          buildMeasureNotesXml
        )
      : buildMeasureNotesXml(notes);
  const repeatStartXml = measureMeta
    ? (() => {
        const chunks = [
          ...(measureMeta.endingStart
            ? [`<ending number="${xmlEscape(String(measureMeta.endingStart))}" type="start"/>`]
            : []),
          ...(measureMeta.repeatStart ? ['<repeat direction="forward" winged="none"/>'] : []),
        ];
        return chunks.length > 0 ? `<barline location="left">${chunks.join("")}</barline>` : "";
      })()
    : "";
  const repeatEndXml = measureMeta
    ? (() => {
        const chunks = [
          ...(measureMeta.endingStop
            ? [
                `<ending number="${xmlEscape(String(measureMeta.endingStop))}" type="${
                  measureMeta.endingStopType || "stop"
                }"/>`,
              ]
            : []),
          ...(measureMeta.repeatEnd
            ? [
                `<repeat direction="backward" winged="none"${
                  Number.isFinite(measureMeta.repeatTimes) && Number(measureMeta.repeatTimes) > 1
                    ? ` times="${Math.round(Number(measureMeta.repeatTimes))}"`
                    : ""
                }/>`,
              ]
            : []),
        ];
        return chunks.length > 0 ? `<barline location="right">${chunks.join("")}</barline>` : "";
      })()
    : "";
  const debugMiscXml = debugMetadata ? buildAbcMeasureDebugMiscXml(notes, measureNo) : "";
  const diagMiscXml = buildAbcDiagMiscXml(
    partIndex === 0 && measureNo === 1
      ? (diagnostics ?? []).filter((diag) => !diag.voiceId || diag.voiceId === (part.voiceId ?? ""))
      : []
  );
  const sourceMiscXml = sourceMetadata && partIndex === 0 && measureNo === 1 ? buildAbcSourceMiscXml(abcSource) : "";
  const xmlMeasureNumber = xmlEscape(String(measureMeta?.number || measureNo));
  const implicitAttr = measureMeta?.implicit || inferredImplicitPickup ? ' implicit="yes"' : "";
  return `<measure number="${xmlMeasureNumber}"${implicitAttr}>${repeatStartXml}${headerXml}${tempoDirectionXml}${debugMiscXml}${diagMiscXml}${sourceMiscXml}${notesXml}${repeatEndXml}</measure>`;
};

const createInitialAbcPartRenderState = (
  defaultFifths: number,
  beats: number,
  beatType: number,
  tempoBpm: number | null
): AbcPartRenderState => ({
  currentPartFifths: Math.max(-7, Math.min(7, Math.round(defaultFifths))),
  currentPartMeter: { beats: Math.round(beats), beatType: Math.round(beatType) },
  currentPartTempo: tempoBpm,
});

const buildAbcPartXml = (
  part: AbcParsedPart,
  partIndex: number,
  measureCount: number,
  defaultFifths: number,
  beats: number,
  beatType: number,
  tempoBpm: number | null,
  debugMetadata: boolean,
  sourceMetadata: boolean,
  diagnostics: AbcParsedResult["diagnostics"] | undefined,
  abcSource: string,
  buildMeasureNotesXml: (notes: AbcParsedNote[], staffOverride?: number | null) => string
): string => {
  const measureParts: string[] = [];
  let state = createInitialAbcPartRenderState(defaultFifths, beats, beatType, tempoBpm);
  for (let i = 0; i < measureCount; i += 1) {
    const measureNo = i + 1;
    const measureContext = buildAbcPartMeasureRenderContext(part, i, state, beats, beatType);
    const {
      notes,
      measureMeta,
      hintedFifths,
      hintedMeter,
      hintedTempo,
      nextState,
      currentMeasureDurationDiv,
      inferredImplicitPickup,
    } = measureContext;
    state = nextState;
    measureParts.push(
      buildAbcRenderedPartMeasureXml({
        part,
        partIndex,
        measureIndex: i,
        measureNo,
        notes,
        measureMeta,
        hintedFifths,
        hintedMeter,
        hintedTempo,
        currentPartFifths: state.currentPartFifths,
        currentPartMeter: state.currentPartMeter,
        currentPartTempo: state.currentPartTempo,
        currentMeasureDurationDiv,
        inferredImplicitPickup,
        debugMetadata,
        sourceMetadata,
        diagnostics,
        abcSource,
        buildMeasureNotesXml,
      })
    );
  }
  return `<part id="${xmlEscape(part.partId)}">${measureParts.join("")}</part>`;
};

const buildAbcNoteHarmonyAndWordsDirectionXml = (note: AbcParsedNote): string =>
  note.chord
    ? ""
    : buildAbcNoteOptionalXmlParts([
        note.chordSymbols?.map((chordSymbol) => buildHarmonyXmlFromChordSymbol(chordSymbol) || buildMusicXmlWordsDirectionXml({ text: String(chordSymbol) })).join("") ?? "",
        note.annotations?.filter((annotation) => annotation.trim().length > 0).map((annotation) => buildMusicXmlWordsDirectionXml({ text: String(annotation) })).join("") ?? "",
      ]).join("");

const buildAbcNoteControlDirectionXml = (note: AbcParsedNote): string =>
  buildAbcNoteControlDirectionXmlParts(note).join("");

const buildAbcNoteControlDirectionXmlParts = (note: AbcParsedNote): string[] => [
  ...buildAbcNoteMarkerDirectionXmlParts(note),
  ...buildAbcNoteJumpDirectionXmlParts(note),
  ...buildAbcNoteExpressionDirectionXmlParts(note),
];

const buildAbcNoteMarkerDirectionXmlParts = (note: AbcParsedNote): string[] => [
  ...buildAbcNoteMarkerSegnoXmlParts(note),
  ...buildAbcNoteMarkerCodaXmlParts(note),
  ...buildAbcNoteMarkerRehearsalXmlParts(note),
];

const buildAbcNoteMarkerSegnoXmlParts = (note: AbcParsedNote): string[] =>
  note.segno ? ["<direction><direction-type><segno/></direction-type></direction>"] : [];

const buildAbcNoteMarkerCodaXmlParts = (note: AbcParsedNote): string[] =>
  note.coda ? ["<direction><direction-type><coda/></direction-type></direction>"] : [];

const buildAbcNoteMarkerRehearsalXmlParts = (note: AbcParsedNote): string[] =>
  note.rehearsalMark
    ? [`<direction><direction-type><rehearsal>${xmlEscape(String(note.rehearsalMark))}</rehearsal></direction-type></direction>`]
    : [];

const buildAbcNoteJumpDirectionXmlParts = (note: AbcParsedNote): string[] => [
  ...buildAbcNoteFineJumpXmlParts(note),
  ...buildAbcNoteDaCapoJumpXmlParts(note),
  ...buildAbcNoteDalSegnoJumpXmlParts(note),
  ...buildAbcNoteToCodaJumpXmlParts(note),
];

const buildAbcNoteFineJumpXmlParts = (note: AbcParsedNote): string[] =>
  note.fine ? ['<direction><sound fine="yes"/></direction>'] : [];

const buildAbcNoteDaCapoJumpXmlParts = (note: AbcParsedNote): string[] =>
  note.daCapo ? ['<direction><sound dacapo="yes"/></direction>'] : [];

const buildAbcNoteDalSegnoJumpXmlParts = (note: AbcParsedNote): string[] =>
  note.dalSegno ? ['<direction><sound dalsegno="segno"/></direction>'] : [];

const buildAbcNoteToCodaJumpXmlParts = (note: AbcParsedNote): string[] =>
  note.toCoda ? ['<direction><sound tocoda="coda"/></direction>'] : [];

const buildAbcNoteExpressionDirectionXmlParts = (note: AbcParsedNote): string[] =>
  buildAbcNoteOptionalXmlParts([
    buildAbcNoteWedgeDirectionXmlPart(note),
    buildAbcNoteDynamicDirectionXmlPart(note),
    buildAbcNoteSfzDirectionXmlPart(note),
  ]);

const buildAbcNoteWedgeDirectionXmlPart = (note: AbcParsedNote): string =>
  note.crescendoStart
    ? buildMusicXmlDirectionFeatureXml({ kind: "wedge", wedgeType: "crescendo" })
    : note.diminuendoStart
      ? buildMusicXmlDirectionFeatureXml({ kind: "wedge", wedgeType: "diminuendo" })
      : note.crescendoStop || note.diminuendoStop
        ? buildMusicXmlDirectionFeatureXml({ kind: "wedge", wedgeType: "stop" })
        : "";

const buildAbcNoteDynamicDirectionXmlPart = (note: AbcParsedNote): string =>
  note.dynamicMark
    ? (() => {
        const dynamicMark = normalizeDynamicMark(String(note.dynamicMark));
        return dynamicMark ? buildMusicXmlDirectionFeatureXml({ kind: "dynamic", mark: dynamicMark }) : "";
      })()
    : "";

const buildAbcNoteSfzDirectionXmlPart = (note: AbcParsedNote): string =>
  note.sfz ? buildMusicXmlDirectionFeatureXml({ kind: "dynamic", mark: "sfz" }) : "";

const buildAbcNoteLeadingDirectionXml = (note: AbcParsedNote): string =>
  note.chord
    ? ""
    : buildAbcNoteOptionalXmlParts([
        note.chordSymbols?.map((chordSymbol) => buildHarmonyXmlFromChordSymbol(chordSymbol) || buildMusicXmlWordsDirectionXml({ text: String(chordSymbol) })).join("") ?? "",
        note.annotations?.filter((annotation) => annotation.trim().length > 0).map((annotation) => buildMusicXmlWordsDirectionXml({ text: String(annotation) })).join("") ?? "",
        ...buildAbcNoteControlDirectionXmlParts(note),
      ]).join("");

const buildAbcNotePitchOrRestXml = (note: AbcParsedNote): string =>
  buildAbcNotePitchOrRestXmlParts(note).join("");

const buildAbcNotePitchOrRestXmlParts = (note: AbcParsedNote): string[] =>
  note.isRest ? [buildAbcNoteRestXmlPart()] : [buildAbcNotePitchXmlPart(note)];

const buildAbcNoteRestXmlPart = (): string => "<rest/>";

const buildAbcNotePitchXmlPart = (note: AbcParsedNote): string =>
  buildMusicXmlPitchXml({
    step: note.step,
    alter: note.alter,
    octave: note.octave,
  });

const buildAbcNoteLyricXml = (note: AbcParsedNote): string =>
  buildMusicXmlLyricXml({
    text: note.lyricText,
    syllabic: note.lyricSyllabic || "single",
    extend: note.lyricExtend,
  });

const buildAbcNoteTimeModificationXml = (note: AbcParsedNote): string =>
  buildMusicXmlTimeModificationXml({
    actualNotes: note.timeModification?.actual,
    normalNotes: note.timeModification?.normal,
  });

const buildAbcNoteAccidentalXml = (note: AbcParsedNote): string =>
  buildMusicXmlAccidentalXml({
    text: note.accidentalText,
    editorial: note.accidentalEditorial,
    cautionary: note.accidentalCautionary,
  });

const buildAbcNoteCoreOpenXmlParts = (note: AbcParsedNote, staffOverride: number | null): string[] => [
  ...buildAbcNoteCoreHeaderXmlParts(note),
  ...buildAbcNoteCorePitchAndDurationXmlParts(note),
  ...buildAbcNoteCoreIdentityXmlParts(note, staffOverride),
];

const buildAbcNoteCoreHeaderXmlParts = (note: AbcParsedNote): string[] => [
  buildAbcNoteCoreNoteStartXmlPart(),
  ...buildAbcNoteCoreChordXmlParts(note),
  ...buildAbcNoteCoreGraceXmlParts(note),
];

const buildAbcNoteCoreNoteStartXmlPart = (): string => "<note>";

const buildAbcNoteCoreChordXmlParts = (note: AbcParsedNote): string[] =>
  note.chord ? ["<chord/>"] : [];

const buildAbcNoteCoreGraceXmlParts = (note: AbcParsedNote): string[] =>
  note.grace ? [buildMusicXmlGraceXml({ slash: note.graceSlash })] : [];

const buildAbcNoteCorePitchAndDurationXmlParts = (note: AbcParsedNote): string[] => [
  buildAbcNotePitchOrRestXml(note),
  ...buildAbcNoteCoreDurationXmlParts(note),
];

const buildAbcNoteCoreDurationXmlParts = (note: AbcParsedNote): string[] =>
  note.grace ? [] : [buildAbcNoteCoreDurationXmlPart(note)];

const buildAbcNoteCoreDurationXmlPart = (note: AbcParsedNote): string =>
  buildAbcNoteCoreDurationXmlFromValuePart(buildAbcNoteCoreDurationValuePart(note));

const buildAbcNoteCoreDurationValuePart = (note: AbcParsedNote): number => Math.max(1, Math.round(Number(note.duration) || 1));

const buildAbcNoteCoreDurationXmlFromValuePart = (durationValue: number): string => `<duration>${durationValue}</duration>`;

const buildAbcNoteCoreIdentityXmlParts = (note: AbcParsedNote, staffOverride: number | null): string[] => [
  ...buildAbcNoteCorePlacementIdentityXmlParts(note, staffOverride),
  ...buildAbcNoteCoreTextIdentityXmlParts(note),
];

const buildAbcNoteCorePlacementIdentityXmlParts = (
  note: AbcParsedNote,
  staffOverride: number | null
): string[] => {
  const staffXmlPart = buildAbcNoteCoreStaffXmlPart(note, staffOverride);
  return [buildAbcNoteCoreVoiceXmlPart(note), ...(staffXmlPart ? [staffXmlPart] : [])];
};

const buildAbcNoteCoreTextIdentityXmlParts = (note: AbcParsedNote): string[] => [
  buildAbcNoteLyricXml(note),
  buildAbcNoteCoreTypeXmlPart(note),
];

const buildAbcNoteCoreVoiceXmlPart = (note: AbcParsedNote): string =>
  `<voice>${xmlEscape(normalizeVoiceForMusicXml(note.voice))}</voice>`;

const buildAbcNoteCoreStaffXmlPart = (note: AbcParsedNote, staffOverride: number | null): string => {
  const staffValue = buildAbcNoteCoreStaffValuePart(note, staffOverride);
  return staffValue ? buildAbcNoteCoreStaffXmlFromValuePart(staffValue) : "";
};

const buildAbcNoteCoreStaffValuePart = (note: AbcParsedNote, staffOverride: number | null): number | null => {
  const staff = Number(note.staff);
  return staffOverride ?? (Number.isFinite(staff) ? Math.max(1, Math.round(staff || 1)) : null);
};

const buildAbcNoteCoreStaffXmlFromValuePart = (staffValue: number): string => `<staff>${staffValue}</staff>`;

const buildAbcNoteCoreTypeXmlPart = (note: AbcParsedNote): string => `<type>${normalizeTypeForMusicXml(note.type)}</type>`;

const buildAbcNoteCoreBeamPart = (
  note: AbcParsedNote,
  noteIndex: number,
  beamXmlByNoteIndex: Map<number, string>
): string =>
  !note.chord && beamXmlByNoteIndex.has(noteIndex) ? String(beamXmlByNoteIndex.get(noteIndex)) : "";

const buildAbcNoteCoreTailXmlParts = (note: AbcParsedNote): string[] => [
  ...buildAbcNoteCoreNotationTailXmlParts(note),
  ...buildAbcNoteCoreTieItemsXmlParts(note),
];

const buildAbcNoteCoreNotationTailXmlParts = (note: AbcParsedNote): string[] => [
  buildAbcNoteTimeModificationXml(note),
  buildAbcNoteAccidentalXml(note),
];

const buildAbcNoteCoreTieItemsXmlParts = (note: AbcParsedNote): string[] => [
  buildMusicXmlTieItemsXml({
    tieStart: !!note.tieStart,
    tieStop: !!note.tieStop,
  }),
];

const buildAbcNoteOrnamentsXml = (note: AbcParsedNote): string =>
  [
    ...buildAbcNoteOrnamentsFeatureXmlParts(note),
    ...buildAbcNoteOrnamentsMotionXmlParts(note),
  ].join("");

const buildAbcNoteOrnamentsFeatureXmlParts = (note: AbcParsedNote): string[] =>
  buildAbcNoteOptionalXmlParts([
    buildAbcNoteOrnamentsWavyLinePart(note),
    buildAbcNoteOrnamentsTurnPart(note),
    buildAbcNoteOrnamentsMordentPart(note),
    buildAbcNoteOrnamentsTremoloPart(note),
    buildAbcNoteOrnamentsSchleiferPart(note),
    buildAbcNoteOrnamentsShakePart(note),
  ]);

const buildAbcNoteOrnamentsMotionXmlParts = (note: AbcParsedNote): string[] =>
  buildAbcNoteOptionalXmlParts([
    buildAbcNoteOrnamentsGlissandoXmlPart(note),
    buildAbcNoteOrnamentsSlideXmlPart(note),
    buildAbcNoteOrnamentsArpeggiatePart(note),
  ]);

const buildAbcNoteOrnamentsGlissandoXmlPart = (note: AbcParsedNote): string =>
  buildAbcNotePairedXmlParts(buildAbcNoteOrnamentsGlissandoStartPart(note), buildAbcNoteOrnamentsGlissandoStopPart(note));

const buildAbcNoteOrnamentsGlissandoStartPart = (note: AbcParsedNote): string =>
  note.glissandoStart ? '<glissando type="start" number="1">wavy</glissando>' : "";

const buildAbcNoteOrnamentsGlissandoStopPart = (note: AbcParsedNote): string =>
  note.glissandoStop ? '<glissando type="stop" number="1">wavy</glissando>' : "";

const buildAbcNoteOrnamentsSlideXmlPart = (note: AbcParsedNote): string =>
  buildAbcNotePairedXmlParts(buildAbcNoteOrnamentsSlideStartPart(note), buildAbcNoteOrnamentsSlideStopPart(note));

const buildAbcNoteOrnamentsSlideStartPart = (note: AbcParsedNote): string =>
  note.slideStart ? '<slide type="start" number="1"/>' : "";

const buildAbcNoteOrnamentsSlideStopPart = (note: AbcParsedNote): string =>
  note.slideStop ? '<slide type="stop" number="1"/>' : "";

const buildAbcNoteOrnamentsArpeggiatePart = (note: AbcParsedNote): string =>
  note.arpeggiate ? "<arpeggiate/>" : "";

const buildAbcNotePairedXmlParts = (startPart: string, stopPart: string): string =>
  [startPart, stopPart].join("");

const buildAbcNoteOptionalXmlParts = (parts: string[]): string[] => parts.filter((part) => part.length > 0);

const buildAbcNoteOrnamentsWavyLinePart = (note: AbcParsedNote): string =>
  buildAbcNoteWrappedXml(
    "ornaments",
    buildAbcNoteOptionalXmlParts([
      buildAbcNoteOrnamentsTrillMarkPart(note),
      buildAbcNoteOrnamentsWavyLineMotionPart(note),
      buildAbcNoteOrnamentsTrillAccidentalMarkPart(note),
    ])
  );

const buildAbcNoteOrnamentsTrillMarkPart = (note: AbcParsedNote): string =>
  note.trill ? buildMusicXmlOrnamentItemsXml([{ kind: "trill-mark" }]) : "";

const buildAbcNoteOrnamentsWavyLineMotionPart = (note: AbcParsedNote): string =>
  note.trillLineStop ? '<wavy-line type="stop"/>' : note.trillLineStart ? '<wavy-line type="start"/>' : "";

const buildAbcNoteOrnamentsTrillAccidentalMarkPart = (note: AbcParsedNote): string =>
  note.trillAccidentalText ? `<accidental-mark>${xmlEscape(String(note.trillAccidentalText))}</accidental-mark>` : "";

const buildAbcNoteOrnamentsTurnPart = (note: AbcParsedNote): string =>
  note.turnType ? buildMusicXmlOrnamentsXml(buildAbcNoteOrnamentsTurnItems(note)) : "";

const buildAbcNoteOrnamentsTurnItems = (note: AbcParsedNote): AbcExportOrnamentFeature[] => [
  buildAbcNoteOrnamentsTurnMainItem(note),
  ...(note.delayedTurn ? [buildAbcNoteOrnamentsDelayedTurnItem()] : []),
];

const buildAbcNoteOrnamentsTurnMainItem = (note: AbcParsedNote): AbcExportOrnamentFeature => ({
  kind: note.turnType === "inverted-turn" ? "inverted-turn" : "turn",
  ...(note.turnSlash ? { slash: true } : {}),
});

const buildAbcNoteOrnamentsDelayedTurnItem = (): AbcExportOrnamentFeature => ({ kind: "delayed-turn" });

const buildAbcNoteOrnamentsMordentPart = (note: AbcParsedNote): string =>
  note.mordentType ? buildMusicXmlOrnamentsXml([buildAbcNoteOrnamentsMordentItem(note)]) : "";

const buildAbcNoteOrnamentsMordentItem = (note: AbcParsedNote): AbcExportOrnamentFeature => ({
  kind: note.mordentType === "inverted-mordent" ? "inverted-mordent" : "mordent",
});

const buildAbcNoteOrnamentsTremoloPart = (note: AbcParsedNote): string =>
  note.tremoloType ? buildMusicXmlOrnamentsXml([buildAbcNoteOrnamentsTremoloItem(note)]) : "";

const buildAbcNoteOrnamentsTremoloItem = (note: AbcParsedNote): AbcExportOrnamentFeature => ({
  kind: "tremolo",
  tremoloType: note.tremoloType,
  marks: note.tremoloMarks,
});

const buildAbcNoteOrnamentsSchleiferPart = (note: AbcParsedNote): string =>
  note.schleifer ? buildMusicXmlOrnamentsXml([buildAbcNoteOrnamentsSchleiferItem()]) : "";

const buildAbcNoteOrnamentsShakePart = (note: AbcParsedNote): string =>
  note.shake ? buildMusicXmlOrnamentsXml([buildAbcNoteOrnamentsShakeItem()]) : "";

const buildAbcNoteOrnamentsSchleiferItem = (): AbcExportOrnamentFeature => ({ kind: "schleifer" });

const buildAbcNoteOrnamentsShakeItem = (): AbcExportOrnamentFeature => ({ kind: "shake" });

const buildAbcNoteArticulationsXml = (note: AbcParsedNote): string =>
  buildAbcNoteWrappedXml(
    "articulations",
    buildAbcNoteOptionalXmlParts([
      buildAbcNoteArticulationFeatureItemsXml(note),
      ...buildAbcNoteArticulationDecorativeXmlParts(note),
    ])
  );

const buildAbcNoteArticulationDecorativeXmlParts = (note: AbcParsedNote): string[] =>
  buildAbcNoteOptionalXmlParts([
    note.stress ? "<stress/>" : "",
    note.unstress ? "<unstress/>" : "",
    note.phraseMark ? `<other-articulation>${xmlEscape(String(note.phraseMark))}</other-articulation>` : "",
  ]);

const buildAbcNoteArticulationFeatureItemsXml = (note: AbcParsedNote): string =>
  buildMusicXmlArticulationItemsXml(buildAbcNoteArticulationFeatureKinds(note));

const buildAbcNoteArticulationFeatureKinds = (note: AbcParsedNote): string[] => [
  ...buildAbcNoteArticulationPrimaryKinds(note),
  ...buildAbcNoteArticulationSecondaryKinds(note),
];

const buildAbcNoteArticulationPrimaryKinds = (note: AbcParsedNote): string[] =>
  buildAbcNoteOptionalXmlParts([
    note.staccato ? "staccato" : "",
    note.staccatissimo ? "staccatissimo" : "",
    note.accent ? "accent" : "",
    note.tenuto ? "tenuto" : "",
  ]);

const buildAbcNoteArticulationSecondaryKinds = (note: AbcParsedNote): string[] =>
  buildAbcNoteOptionalXmlParts([
    note.strongAccent ? "strong-accent" : "",
    note.breathMark ? "breath-mark" : "",
    note.caesura ? "caesura" : "",
  ]);

const buildAbcNoteTechnicalPlainParts = (note: AbcParsedNote): string[] => [
  ...buildAbcNoteTechnicalBowParts(note),
  ...buildAbcNoteTechnicalFootParts(note),
];

const buildAbcNoteTechnicalBowParts = (note: AbcParsedNote): string[] =>
  buildAbcNoteOptionalXmlParts([
    note.upBow ? "<up-bow/>" : "",
    note.downBow ? "<down-bow/>" : "",
    note.doubleTongue ? "<double-tongue/>" : "",
    note.tripleTongue ? "<triple-tongue/>" : "",
  ]);

const buildAbcNoteTechnicalFootParts = (note: AbcParsedNote): string[] =>
  buildAbcNoteOptionalXmlParts([
    note.heel ? "<heel/>" : "",
    note.toe ? "<toe/>" : "",
  ]);

const buildAbcNoteTechnicalCollectionParts = (note: AbcParsedNote): string[] =>
  buildAbcNoteMergedXmlParts(
    note.fingerings ? note.fingerings.map((fingering) => buildMusicXmlFingeringXml(fingering)) : [],
    note.strings ? note.strings.map((stringText) => buildMusicXmlStringNumberXml(stringText)) : [],
    note.plucks ? note.plucks.map((pluckText) => (pluckText ? `<pluck>${xmlEscape(pluckText)}</pluck>` : "")) : []
  );

const buildAbcNoteTechnicalFlagParts = (note: AbcParsedNote): string[] =>
  buildAbcNoteOptionalXmlParts([
    buildAbcNoteTechnicalOpenStringFlagPart(note),
    buildAbcNoteTechnicalSnapPizzicatoFlagPart(note),
    buildAbcNoteTechnicalHarmonicFlagPart(note),
    buildAbcNoteTechnicalStoppedFlagPart(note),
    buildAbcNoteTechnicalThumbPositionFlagPart(note),
  ]);

const buildAbcNoteTechnicalOpenStringFlagPart = (note: AbcParsedNote): string =>
  note.openString ? "<open-string/>" : "";

const buildAbcNoteTechnicalSnapPizzicatoFlagPart = (note: AbcParsedNote): string =>
  note.snapPizzicato ? "<snap-pizzicato/>" : "";

const buildAbcNoteTechnicalHarmonicFlagPart = (note: AbcParsedNote): string =>
  note.harmonic ? "<harmonic/>" : "";

const buildAbcNoteTechnicalStoppedFlagPart = (note: AbcParsedNote): string =>
  note.stopped ? "<stopped/>" : "";

const buildAbcNoteTechnicalThumbPositionFlagPart = (note: AbcParsedNote): string =>
  note.thumbPosition ? "<thumb-position/>" : "";

const hasAbcNoteNotations = (note: AbcParsedNote): boolean =>
  hasAbcNoteTieOrSlurNotations(note) ||
  hasAbcNoteOrnaments(note) ||
  hasAbcNoteArticulations(note) ||
  hasAbcNoteTechnicalNotations(note) ||
  hasAbcNoteFermataNotation(note) ||
  hasAbcNoteTupletNotations(note);

const hasAbcNoteTieOrSlurNotations = (note: AbcParsedNote): boolean =>
  note.tieStart || note.tieStop || note.slurStart || note.slurStop;

const hasAbcNoteOrnaments = (note: AbcParsedNote): boolean =>
  hasAbcNoteOrnamentFeatureNotations(note) || hasAbcNoteOrnamentMotionNotations(note);

const hasAbcNoteOrnamentFeatureNotations = (note: AbcParsedNote): boolean =>
  note.trill || note.trillLineStop || note.turnType || note.delayedTurn || note.mordentType || note.tremoloType ||
  note.schleifer || note.shake;

const hasAbcNoteOrnamentMotionNotations = (note: AbcParsedNote): boolean =>
  note.glissandoStart || note.glissandoStop || note.slideStart || note.slideStop || note.arpeggiate;

const hasAbcNoteArticulations = (note: AbcParsedNote): boolean =>
  hasAbcNoteArticulationFeatureNotations(note) || hasAbcNoteArticulationDecorativeNotations(note);

const hasAbcNoteArticulationFeatureNotations = (note: AbcParsedNote): boolean =>
  note.staccato || note.staccatissimo || note.accent || note.tenuto || note.strongAccent || note.breathMark || note.caesura;

const hasAbcNoteArticulationDecorativeNotations = (note: AbcParsedNote): boolean =>
  note.stress || note.unstress || note.phraseMark;

const hasAbcNoteTechnicalNotations = (note: AbcParsedNote): boolean =>
  hasAbcNoteTechnicalPlainNotations(note) || hasAbcNoteTechnicalCollectionNotations(note) || hasAbcNoteTechnicalFlagNotations(note);

const hasAbcNoteTechnicalPlainNotations = (note: AbcParsedNote): boolean =>
  !!(note.upBow || note.downBow || note.doubleTongue || note.tripleTongue || note.heel || note.toe);

const hasAbcNoteTechnicalCollectionNotations = (note: AbcParsedNote): boolean =>
  !!(note.fingerings?.length || note.strings?.length || note.plucks?.length);

const hasAbcNoteTechnicalFlagNotations = (note: AbcParsedNote): boolean =>
  note.openString || note.snapPizzicato || note.harmonic || note.stopped || note.thumbPosition;

const hasAbcNoteFermataNotation = (note: AbcParsedNote): boolean => !!note.fermataType;

const hasAbcNoteTupletNotations = (note: AbcParsedNote): boolean => !!(note.tupletStart || note.tupletStop);

const buildAbcNoteNotationsXml = (note: AbcParsedNote): string =>
  hasAbcNoteNotations(note)
    ? buildAbcNoteWrappedXml(
        "notations",
        buildAbcNoteOptionalXmlParts([
          buildAbcNoteTieNotationParts(note),
          buildAbcNoteSlurNotationParts(note),
          buildAbcNoteTupletNotationParts(note),
          buildAbcNoteOrnamentsXml(note),
          buildAbcNoteArticulationsXml(note),
          buildMusicXmlTechnicalXml([
            ...buildAbcNoteTechnicalPlainParts(note),
            ...buildAbcNoteTechnicalCollectionParts(note),
            ...buildAbcNoteTechnicalFlagParts(note),
          ]),
          buildAbcNoteFermataNotationPart(note),
        ])
      )
    : "";

const buildAbcNoteTieNotationParts = (note: AbcParsedNote): string =>
  buildMusicXmlTiedItemsXml({
    tiedStart: !!note.tieStart,
    tiedStop: !!note.tieStop,
  });

const buildAbcNoteSlurNotationParts = (note: AbcParsedNote): string =>
  buildMusicXmlSlursXml([
    ...(note.slurStart ? [{ type: "start" as const }] : []),
    ...(note.slurStop ? [{ type: "stop" as const }] : []),
  ]);

const buildAbcNoteTupletNotationParts = (note: AbcParsedNote): string =>
  buildAbcNotePairedXmlParts(
    buildAbcNoteTupletStartNotationPart(note),
    buildAbcNoteTupletStopNotationPart(note)
  );

const buildAbcNoteTupletStartNotationPart = (note: AbcParsedNote): string =>
  note.tupletStart ? '<tuplet type="start"/>' : "";

const buildAbcNoteTupletStopNotationPart = (note: AbcParsedNote): string =>
  note.tupletStop ? '<tuplet type="stop"/>' : "";

const buildAbcNoteFermataNotationPart = (note: AbcParsedNote): string =>
  note.fermataType ? `<fermata>${note.fermataType === "inverted" ? "inverted" : "normal"}</fermata>` : "";

const buildAbcNoteWrappedXml = (tagName: string, parts: string[]): string =>
  parts.length > 0 ? `<${tagName}>${parts.join("")}</${tagName}>` : "";

const buildAbcNoteMergedXmlParts = (...partsGroups: string[][]): string[] =>
  partsGroups.reduce<string[]>((allParts, parts) => allParts.concat(parts), []);

const buildAbcBeamXmlByNoteIndex = (
  notes: AbcParsedNote[],
  beatDiv: number
): Map<number, string> => {
  const out = new Map<number, string>();
  const levelFromType = (typeText: string): number => {
    switch (String(typeText ?? "").trim().toLowerCase()) {
      case "eighth":
        return 1;
      case "16th":
        return 2;
      case "32nd":
        return 3;
      case "64th":
        return 4;
      default:
        return 0;
    }
  };
  const byVoice = new Map<string, Array<{ note: AbcParsedNote; noteIndex: number }>>();
  for (let i = 0; i < notes.length; i += 1) {
    const note = notes[i];
    const voice = normalizeVoiceForMusicXml(note.voice);
    const bucket = byVoice.get(voice) ?? [];
    bucket.push({ note, noteIndex: i });
    byVoice.set(voice, bucket);
  }
  for (const events of byVoice.values()) {
    const primary = events.filter((ev) => !ev.note?.chord);
    if (!primary.length) continue;
    const assignments = computeBeamAssignments(
      primary,
      beatDiv,
      (ev) => {
        const type = normalizeTypeForMusicXml(ev.note?.type);
        return {
          timed: true,
          chord: !ev.note?.isRest,
          grace: !!ev.note?.grace,
          durationDiv: ev.note?.grace ? 0 : Math.max(1, Math.round(Number(ev.note?.duration) || 1)),
          levels: levelFromType(type),
          explicitMode: ev.note?.beamMode,
        };
      },
      { splitAtBeatBoundaryWhenImplicit: true }
    );
    for (const [eventIndex, assignment] of assignments.entries()) {
      const beamXml = buildMusicXmlBeamItemsXml(assignment);
      if (!beamXml) continue;
      const target = primary[eventIndex];
      if (!target) continue;
      out.set(target.noteIndex, beamXml);
    }
  }
  return out;
};

const buildAbcNoteXml = (
  note: AbcParsedNote,
  noteIndex: number,
  staffOverride: number | null,
  beamXmlByNoteIndex: Map<number, string>
): string => {
  const chunks: string[] = [];
  chunks.push(buildAbcNoteLeadingDirectionXml(note));
  chunks.push([
    ...buildAbcNoteCoreOpenXmlParts(note, staffOverride),
    buildAbcNoteCoreBeamPart(note, noteIndex, beamXmlByNoteIndex),
    ...buildAbcNoteCoreTailXmlParts(note),
  ].join(""));
  chunks.push(buildAbcNoteNotationsXml(note));
  chunks.push("</note>");
  return chunks.join("");
};

const buildAbcMeasureNotesXml = (
  notes: AbcParsedNote[],
  measureDurationDiv: number,
  emptyMeasureRestType: string,
  beatDiv: number,
  staffOverride: number | null = null
): string => {
  if (!notes.length) {
    return `<note><rest/><duration>${measureDurationDiv}</duration><voice>1</voice><type>${emptyMeasureRestType}</type>${
      staffOverride !== null ? `<staff>${staffOverride}</staff>` : ""
    }</note>`;
  }
  const beamXmlByNoteIndex = buildAbcBeamXmlByNoteIndex(notes, beatDiv);
  return notes
    .map((note, noteIndex) => buildAbcNoteXml(note, noteIndex, staffOverride, beamXmlByNoteIndex))
    .join("");
};

const createAbcVoiceStores = (): AbcVoiceStores => {
  return {
    measuresByVoice: {},
    notationMeasureMetaByVoice: {},
    activeEndingByVoice: {},
    currentKeyFifthsByVoice: {},
    meterByMeasureByVoice: {},
    tempoByMeasureByVoice: {},
  };
};

const ensureAbcVoiceMeasures = (
  stores: AbcVoiceStores,
  voiceId: string
): AbcParsedNote[][] => {
  if (!Object.prototype.hasOwnProperty.call(stores.measuresByVoice, voiceId)) {
    stores.measuresByVoice[voiceId] = [[]];
  }
  return stores.measuresByVoice[voiceId];
};

const ensureAbcNotationMeasureMeta = (
  stores: AbcVoiceStores,
  voiceId: string,
  measureNo: number
): AbcMeasureMeta => {
  if (!Object.prototype.hasOwnProperty.call(stores.notationMeasureMetaByVoice, voiceId)) {
    stores.notationMeasureMetaByVoice[voiceId] = {};
  }
  if (!Object.prototype.hasOwnProperty.call(stores.notationMeasureMetaByVoice[voiceId], measureNo)) {
    stores.notationMeasureMetaByVoice[voiceId][measureNo] = {
      number: String(measureNo),
      implicit: false,
      repeatStart: false,
      repeatEnd: false,
      repeatTimes: null,
      endingStart: "",
      endingStop: "",
      endingStopType: "",
    };
  }
  return stores.notationMeasureMetaByVoice[voiceId][measureNo];
};

const ensureAbcMeterByMeasure = (
  stores: AbcVoiceStores,
  voiceId: string
): Record<number, { beats: number; beatType: number }> => {
  if (!Object.prototype.hasOwnProperty.call(stores.meterByMeasureByVoice, voiceId)) {
    stores.meterByMeasureByVoice[voiceId] = {};
  }
  return stores.meterByMeasureByVoice[voiceId];
};

const ensureAbcTempoByMeasure = (
  stores: AbcVoiceStores,
  voiceId: string
): Record<number, number> => {
  if (!Object.prototype.hasOwnProperty.call(stores.tempoByMeasureByVoice, voiceId)) {
    stores.tempoByMeasureByVoice[voiceId] = {};
  }
  return stores.tempoByMeasureByVoice[voiceId];
};

const finalizeAbcActiveEndings = (stores: AbcVoiceStores): void => {
  for (const voiceId of Object.keys(stores.measuresByVoice)) {
    const measures = stores.measuresByVoice[voiceId];
    while (measures.length > 1 && measures[measures.length - 1].length === 0) {
      measures.pop();
    }
    const activeEndingMarker = String(stores.activeEndingByVoice[voiceId] ?? "");
    if (activeEndingMarker) {
      const lastMeasureNo = measures.length;
      if (lastMeasureNo >= 1) {
        const measureMeta = ensureAbcNotationMeasureMeta(stores, voiceId, lastMeasureNo);
        if (!measureMeta.endingStop) {
          measureMeta.endingStop = activeEndingMarker;
          measureMeta.endingStopType = "stop";
        }
      }
    }
  }
};

const applyAbcLyricsToMeasures = (
  lyricEntriesByVoice: Record<string, AbcLyricEntry[]>,
  measuresByVoice: Record<string, AbcParsedNote[][]>
): void => {
  for (const voiceId of Object.keys(lyricEntriesByVoice)) {
    const measures = measuresByVoice[voiceId];
    if (!Array.isArray(measures) || measures.length === 0) continue;
    const lyricTargets: AbcParsedNote[] = [];
    for (const measure of measures) {
      for (const note of measure) {
        if (note && !note.isRest && !note.grace && !note.chord) {
          lyricTargets.push(note);
        }
      }
    }
    if (lyricTargets.length === 0) continue;
    let cursor = 0;
    for (const lyricEntry of lyricEntriesByVoice[voiceId]) {
      const tokens = tokenizeAbcLyricLine(lyricEntry.text);
      for (const token of tokens) {
        if (cursor >= lyricTargets.length) break;
        if (token.type === "skip") {
          cursor += 1;
          continue;
        }
        if (token.type === "extend") {
          const target = lyricTargets[Math.max(0, cursor - 1)];
          if (target) {
            target.lyricExtend = true;
          }
          continue;
        }
        const target = lyricTargets[cursor];
        if (target) {
          target.lyricText = token.text;
          target.lyricSyllabic = token.syllabic;
        }
        cursor += 1;
      }
    }
  }
};

const applyAbcBodyField = (
  fieldName: string,
  fieldValue: string,
  context: AbcBodyFieldContext
): {
  handled: boolean;
  activeKeyFifths: number;
  activeKeySignatureAccidentals: Record<string, number>;
  activeUnitLength: Fraction;
  activeMeter: { beats: number; beatType: number };
  activeTempoBpm: number | null;
  measureAccidentals: Record<string, number>;
} => {
  let activeKeyFifths = context.activeKeyFifths;
  let activeKeySignatureAccidentals = keySignatureAlterByStep(activeKeyFifths);
  let activeUnitLength = context.activeUnitLength;
  let activeMeter = context.activeMeter;
  let activeTempoBpm = context.activeTempoBpm;
  let measureAccidentals = context.measureAccidentals;
  if (fieldName === "K") {
    const inlineKeyInfo = parseKey(fieldValue || "C", context.warnings);
    activeKeyFifths = inlineKeyInfo.fifths;
    activeKeySignatureAccidentals = keySignatureAlterByStep(activeKeyFifths);
    context.voiceStores.currentKeyFifthsByVoice[context.entryVoiceId] = activeKeyFifths;
    context.keyHintFifthsByKey.set(`${context.entryVoiceId}#${context.currentMeasureNo}`, activeKeyFifths);
    measureAccidentals = {};
    return { handled: true, activeKeyFifths, activeKeySignatureAccidentals, activeUnitLength, activeMeter, activeTempoBpm, measureAccidentals };
  }
  if (fieldName === "L") {
    activeUnitLength = parseFraction(fieldValue || "1/8", "L", context.warnings);
    return { handled: true, activeKeyFifths, activeKeySignatureAccidentals, activeUnitLength, activeMeter, activeTempoBpm, measureAccidentals };
  }
  if (fieldName === "M") {
    activeMeter = parseMeter(fieldValue || "4/4", context.warnings);
    ensureAbcMeterByMeasure(context.voiceStores, context.entryVoiceId)[context.currentMeasureNo] = {
      beats: activeMeter.beats,
      beatType: activeMeter.beatType,
    };
    return { handled: true, activeKeyFifths, activeKeySignatureAccidentals, activeUnitLength, activeMeter, activeTempoBpm, measureAccidentals };
  }
  if (fieldName === "Q") {
    activeTempoBpm = parseTempoFromQ(fieldValue ?? "", context.warnings);
    if (Number.isFinite(activeTempoBpm)) {
      ensureAbcTempoByMeasure(context.voiceStores, context.entryVoiceId)[context.currentMeasureNo] =
        Math.max(20, Math.min(300, Math.round(Number(activeTempoBpm))));
    }
    return { handled: true, activeKeyFifths, activeKeySignatureAccidentals, activeUnitLength, activeMeter, activeTempoBpm, measureAccidentals };
  }
  return { handled: false, activeKeyFifths, activeKeySignatureAccidentals, activeUnitLength, activeMeter, activeTempoBpm, measureAccidentals };
};

const processAbcBarlineEntry = (
  barlineToken: AbcParsedBodyEntryToken["barlineToken"],
  context: AbcBarlineEntryContext
): boolean => {
  const bareRepeatEndingMarker =
    barlineToken.endsMeasure ? parseAbcBareRepeatEndingMarkerAt(context.text, barlineToken.nextIdx) : null;
  if (barlineToken.repeatEnd) {
    context.markRepeatEnd();
  }
  if (barlineToken.repeatStart) {
    context.markRepeatStart();
  }
  if ((barlineToken.endingStop || bareRepeatEndingMarker) && context.activeEndingMarker) {
    context.stopActiveEndingAtMeasure(context.currentMeasureNo);
  }
  if (barlineToken.endsMeasure && (context.currentMeasureLength > 0 || context.measuresLength === 0)) {
    context.advanceToNextMeasure();
  }
  if (barlineToken.endsMeasure) {
    context.clearMeasureAccidentals();
    context.clearLastNote();
  }
  if (bareRepeatEndingMarker) {
    return context.startEndingAtCurrentMeasure(bareRepeatEndingMarker.marker, bareRepeatEndingMarker.nextIdx);
  }
  context.idx = barlineToken.nextIdx;
  context.resetBeamContext();
  return true;
};

const processAbcNonPlayableBodyEntry = (
  bodyEntry: AbcParsedBodyEntryToken | null,
  context: AbcNonPlayableBodyEntryContext
): boolean => {
  if (!bodyEntry) {
    return false;
  }
  if (bodyEntry.kind === "barline") {
    return context.handleBarlineToken(bodyEntry.barlineToken);
  }
  if (bodyEntry.kind === "standalone-body-field") {
    const { standaloneBodyField } = bodyEntry;
    if (!context.applyBodyField(standaloneBodyField.fieldName, standaloneBodyField.fieldValue)) {
      context.warnBody("Skipped unsupported standalone body field token: " + standaloneBodyField.token);
    }
    context.idx = standaloneBodyField.nextIdx;
    return true;
  }
  if (bodyEntry.kind === "unsupported-body-token") {
    const { unsupportedBodyToken } = bodyEntry;
    context.warnBody("Skipped unsupported body token: " + unsupportedBodyToken.token);
    context.idx = unsupportedBodyToken.nextIdx;
    return true;
  }
  if (bodyEntry.kind === "unsupported-body-number") {
    const { unsupportedBodyNumber } = bodyEntry;
    context.warnBody("Skipped unsupported body number token: " + unsupportedBodyNumber.token);
    context.idx = unsupportedBodyNumber.nextIdx;
    return true;
  }
  return false;
};

const processAbcPlayableEvent = (
  playableEvent: {
    pitchSources: Array<{
      pitchChar: string;
      accidentalText: string;
      octaveShift: number;
      explicitNatural?: boolean;
      accidentalKind?: "editorial" | "courtesy" | "";
    }>;
  },
  context: AbcPlayableEventContext
): boolean => {
  if (context.timing.dur <= 0) {
    context.warnBody(context.resolution.invalidLengthMessage);
    return true;
  }
  const eventNotes = context.buildPlayableEventFromPitches(playableEvent.pitchSources, context.timing, {
    octaveWarningMessage: context.resolution.octaveWarningMessage,
    firstNoteOptions: context.resolution.firstNoteOptions,
  });
  if (eventNotes.length === 0) {
    context.clearLastEventState();
    return true;
  }
  context.commitPlayableEvent(eventNotes, context.resolution.commitOptions);
  return true;
};

const processAbcSimpleBodyToken = (
  bodyToken: any,
  context: AbcSimpleBodyTokenHandlerContext
): boolean => {
  if (!bodyToken) {
    return false;
  }
  const bodyTokenHandlers = {
    "broken-rhythm": () => context.handleBrokenRhythmBodyToken(bodyToken),
    "decoration": () => context.handleDecorationBodyToken(bodyToken, context.char),
    "paren": () => context.handleParenBodyToken(bodyToken),
    "quoted-string": () => context.handleQuotedStringBodyToken(bodyToken),
    "single-char-shorthand": () => context.handleSingleCharShorthandBodyToken(bodyToken, context.char),
    "slur-stop": () => context.handleSlurStopBodyToken(bodyToken),
    "tie": () => context.handleTieBodyToken(bodyToken),
  };
  const handler = bodyTokenHandlers[bodyToken.kind];
  return handler ? handler() : false;
};

const processAbcBracketBodyToken = (
  bodyToken: any,
  context: AbcBracketBodyTokenContext
): boolean => {
  if (!bodyToken || bodyToken.kind !== "bracket") {
    return false;
  }
  const { bracketToken } = bodyToken;
  if (bracketToken.kind === "inline-field") {
    return context.handleInlineFieldBracketToken(bracketToken);
  }
  if (bracketToken.kind === "repeat-ending") {
    return context.handleRepeatEndingBracketToken(bracketToken);
  }
  const playableEvent = parseAbcPlayableEventAt(context.text, context.idx);
  return context.handlePlayableEvent(playableEvent, { fallbackToNextChar: true });
};

const processAbcGraceGroup = (
  context: AbcGraceGroupContext
): { handled: boolean; nextIdx: number } => {
  if (context.char !== "{") {
    return { handled: false, nextIdx: context.idx };
  }
  const graceResult = parseGraceGroupAt(
    context.text,
    context.idx,
    context.lineNo,
    context.activeUnitLength,
    context.activeKeySignatureAccidentals,
    context.measureAccidentals,
    context.entryVoiceId,
    context.warnings
  );
  if (!graceResult) {
    context.warnBody("Failed to parse grace group; skipped.");
    return { handled: true, nextIdx: context.idx + 1 };
  }
  context.appendGraceNotes(graceResult.notes);
  return { handled: true, nextIdx: graceResult.nextIdx };
};

const processAbcBodyFallback = (
  context: AbcBodyFallbackContext
): boolean => {
  const fallbackHandlers = [
    () => context.handleClosingNotation(context.char),
    () => context.handleUnsupportedPunctuation(context.char),
  ];
  for (const handler of fallbackHandlers) {
    if (handler()) {
      return true;
    }
  }
  if (!context.bodyEntry) {
    context.throwBodyParseError();
  }
  return false;
};

const applyAbcPendingStateToPlayableNote = (
  context: AbcPendingPlayableNoteContext
): void => {
  const {
    note,
    options,
    applyPendingOrnamentState,
    applyPendingArticulationState,
    applyPendingDirectionState,
    applyPendingTechnicalState,
    hasPendingTieToNext,
    clearPendingTieToNext,
    warnBody,
  } = context;
  const {
    applySlurStart = true,
    applyTieStop = true,
    trillHint = "",
  } = options;

  applyPendingOrnamentState(note, { applySlurStart, trillHint });
  applyPendingArticulationState(note);
  applyPendingDirectionState(note);
  applyPendingTechnicalState(note);

  if (applyTieStop && hasPendingTieToNext() && !note.isRest) {
    note.tieStop = true;
    clearPendingTieToNext();
  } else if (applyTieStop && note.isRest && hasPendingTieToNext()) {
    warnBody("tie(-) was followed by a rest; tie removed.");
    clearPendingTieToNext();
  }
};

const applyAbcPendingNoteValue = (
  context: AbcPendingNoteValueContext
): void => {
  if (!context.note.isRest && context.isPending) {
    context.apply();
    context.clear();
  }
};

const applyAbcPendingNoteOptionalValue = (
  context: AbcPendingNoteOptionalValueContext
): void => {
  if (!context.note.isRest && !context.isEmpty(context.value)) {
    context.apply(context.value);
    context.clear();
  }
};

const applyAbcPendingNoteArray = (
  context: AbcPendingNoteArrayContext
): void => {
  if (!context.note.isRest && context.values.length > 0) {
    context.apply(context.values);
    context.clear();
  }
};

const fifthsFromAbcKey = (raw: string): number | null => {
  const table: Record<string, number> = {
    C: 0,
    G: 1,
    D: 2,
    A: 3,
    E: 4,
    B: 5,
    "F#": 6,
    "C#": 7,
    F: -1,
    Bb: -2,
    Eb: -3,
    Ab: -4,
    Db: -5,
    Gb: -6,
    Cb: -7,
    Am: 0,
    Em: 1,
    Bm: 2,
    "F#m": 3,
    "C#m": 4,
    "G#m": 5,
    "D#m": 6,
    "A#m": 7,
    Dm: -1,
    Gm: -2,
    Cm: -3,
    Fm: -4,
    Bbm: -5,
    Ebm: -6,
    Abm: -7,
  };
  const normalized = String(raw ?? "").trim().replace(/\s+/g, "");
  if (Object.prototype.hasOwnProperty.call(table, normalized)) {
    return table[normalized];
  }
  return null;
};

export const AbcCommon = {
  gcd,
  reduceFraction,
  multiplyFractions,
  divideFractions,
  parseFractionText,
  parseAbcLengthToken,
  abcLengthTokenFromFraction,
  abcPitchFromStepOctave,
  accidentalFromAlter,
  keyFromFifthsMode,
  fifthsFromAbcKey,
};

declare global {
  interface Window {
    AbcCommon?: typeof AbcCommon;
  }
}

if (typeof window !== "undefined") {
  window.AbcCommon = AbcCommon;
}


const abcCommon = AbcCommon;

const TRILL_DECORATIONS = new Set(["trill", "tr", "triller"]);
const TURN_DECORATIONS = new Set(["turn"]);
const TURN_SLASH_DECORATIONS = new Set(["turnx"]);
const INVERTED_TURN_DECORATIONS = new Set(["invertedturn", "inverted-turn", "lowerturn"]);
const INVERTED_TURN_SLASH_DECORATIONS = new Set(["invertedturnx", "inverted-turnx"]);
const LOWER_MORDENT_DECORATIONS = new Set(["mordent", "lowermordent"]);
const UPPER_MORDENT_DECORATIONS = new Set([
  "pralltriller",
  "pralltrill",
  "prall",
  "uppermordent",
  "invertedmordent",
  "inverted-mordent",
]);
const GLISS_START_DECORATIONS = new Set(["gliss-start", "glissando-start"]);
const GLISS_STOP_DECORATIONS = new Set(["gliss-stop", "glissando-stop"]);
const SLIDE_START_DECORATIONS = new Set(["slide", "slide-start"]);
const ARPEGGIATE_DECORATIONS = new Set(["roll", "arpeggio", "arpeggiate"]);
const STACCATO_DECORATIONS = new Set(["staccato", "stacc", "stac"]);
const STACCATISSIMO_DECORATIONS = new Set(["staccatissimo", "wedge", "spiccato"]);
const ACCENT_DECORATIONS = new Set(["accent", ">", "emphasis"]);
const INVERTED_FERMATA_DECORATIONS = new Set(["invertedfermata", "inverted-fermata", "inverted fermata"]);
const STRONG_ACCENT_DECORATIONS = new Set(["marcato", "strongaccent", "strong-accent", "strong accent"]);
const BREATH_DECORATIONS = new Set(["breath", "breath-mark", "breathmark", "breath mark"]);
const PHRASE_DECORATIONS = new Set(["shortphrase", "mediumphrase", "longphrase"]);
const DACAPO_DECORATIONS = new Set(["dacapo", "da-capo", "da capo", "d.c."]);
const DALSEGNO_DECORATIONS = new Set(["dalsegno", "dal-segno", "dal segno", "d.s."]);
const TOCODA_DECORATIONS = new Set(["tocoda", "to-coda", "to coda"]);
const CRESC_START_DECORATIONS = new Set(["crescendo(", "cresc(", "<("]);
const CRESC_STOP_DECORATIONS = new Set(["crescendo)", "cresc)", "<)"]);
const DIM_START_DECORATIONS = new Set(["diminuendo(", "decrescendo(", "dim(", "decresc(", ">("]);
const DIM_STOP_DECORATIONS = new Set(["diminuendo)", "decrescendo)", "dim)", "decresc)", ">)"]);
const DYNAMIC_DECORATIONS = new Set(["pppp", "ppp", "p", "pp", "mp", "mf", "f", "ff", "fff", "ffff", "fp", "fz", "rfz", "sf", "sfp"]);
const UPBOW_DECORATIONS = new Set(["upbow", "up-bow", "up bow"]);
const DOWNBOW_DECORATIONS = new Set(["downbow", "down-bow", "down bow"]);
const DOUBLE_TONGUE_DECORATIONS = new Set(["doubletongue", "double-tongue", "double tongue"]);
const TRIPLE_TONGUE_DECORATIONS = new Set(["tripletongue", "triple-tongue", "triple tongue"]);
const OPEN_STRING_DECORATIONS = new Set(["open", "open-string", "openstring", "open string"]);
const SNAP_PIZZICATO_DECORATIONS = new Set(["snap", "snap-pizzicato", "snappizzicato", "snap pizzicato"]);
const STOPPED_DECORATIONS = new Set(["stopped", "+", "plus", "stopped horn", "stopped-horn"]);
const THUMB_POSITION_DECORATIONS = new Set(["thumb", "thumbposition", "thumb-position", "thumbpos", "thumb pos", "thumb position"]);

  function tokenizeAbcLyricLine(text) {
    const raw = String(text ?? "").trim();
    if (!raw) return [];
    const chunks = raw
      .replace(/\|/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    const tokens = [];
    let pendingHyphenWord = false;
    for (const chunk of chunks) {
      if (chunk === "*") {
        tokens.push({ type: "skip" });
        continue;
      }
      if (chunk === "_") {
        tokens.push({ type: "extend" });
        continue;
      }
      const normalized = chunk.replace(/~/g, " ");
      if (normalized.endsWith("-") && normalized.length > 1) {
        tokens.push({
          type: "text",
          text: normalized.slice(0, -1),
          syllabic: pendingHyphenWord ? "middle" : "begin"
        });
        pendingHyphenWord = true;
        continue;
      }
      const parts = normalized.split("-").filter((part) => part.length > 0);
      if (parts.length <= 1) {
        tokens.push({
          type: "text",
          text: normalized,
          syllabic: pendingHyphenWord ? "end" : "single"
        });
        pendingHyphenWord = false;
        continue;
      }
      for (let i = 0; i < parts.length; i += 1) {
        const syllabic =
          i === 0
            ? "begin"
            : (i === parts.length - 1 ? "end" : "middle");
        tokens.push({ type: "text", text: parts[i], syllabic });
      }
      pendingHyphenWord = false;
    }
    return tokens;
  }

  function splitBodyTextByInlineVoice(text, initialVoiceId) {
    const segments = [];
    let activeVoiceId = String(initialVoiceId ?? "1").trim() || "1";
    let buffer = "";
    const raw = String(text ?? "");
    let idx = 0;
    while (idx < raw.length) {
      if (raw[idx] === "[") {
        const bracketToken = parseAbcBracketTokenAt(raw, idx);
        if (bracketToken.kind === "inline-field" && bracketToken.inlineField.fieldName === "V") {
          const { inlineField } = bracketToken;
          if (buffer.trim()) {
            segments.push({ voiceId: activeVoiceId, text: buffer });
          }
          buffer = "";
          const voiceMatch = String(inlineField.fieldValue ?? "").match(/^(\S+)/);
          if (voiceMatch) {
            activeVoiceId = voiceMatch[1];
          } else {
            buffer += raw.slice(idx, inlineField.nextIdx);
          }
          idx = inlineField.nextIdx;
          continue;
        }
      }
      buffer += raw[idx];
      idx += 1;
    }
    if (buffer.trim()) {
      segments.push({ voiceId: activeVoiceId, text: buffer });
    }
    return {
      segments,
      finalVoiceId: activeVoiceId,
    };
  }

  function splitBodyTextByOverlay(text, baseVoiceId) {
    const raw = String(text ?? "");
    const normalizedBaseVoiceId = String(baseVoiceId ?? "1").trim() || "1";
    const overlayBuffers = [""];
    let completedMeasureSkeleton = "";
    let activeOverlayIndex = 0;
    let idx = 0;

    const ensureOverlayBuffer = (overlayIndex) => {
      while (overlayBuffers.length <= overlayIndex) {
        overlayBuffers.push(completedMeasureSkeleton);
      }
    };

    while (idx < raw.length) {
      const ch = raw[idx];

      if (ch === '"') {
        const token = parseAbcDelimitedSpanAt(raw, idx, '"');
        if (!token) {
          idx += 1;
          continue;
        }
        ensureOverlayBuffer(activeOverlayIndex);
        overlayBuffers[activeOverlayIndex] += token.text;
        idx = token.nextIdx;
        continue;
      }

      if (ch === "!" || ch === "+") {
        const token = parseAbcDelimitedSpanAt(raw, idx, ch);
        if (!token) {
          idx += 1;
          continue;
        }
        ensureOverlayBuffer(activeOverlayIndex);
        overlayBuffers[activeOverlayIndex] += token.text;
        idx = token.nextIdx;
        continue;
      }

      const barlineToken = parseAbcBarlineTokenAt(raw, idx);
      if (barlineToken) {
        const tokenText = raw.slice(idx, barlineToken.nextIdx);
        if (barlineToken.endsMeasure) {
          for (let overlayIndex = 0; overlayIndex < overlayBuffers.length; overlayIndex += 1) {
            ensureOverlayBuffer(overlayIndex);
            overlayBuffers[overlayIndex] += tokenText;
          }
          completedMeasureSkeleton += tokenText;
          activeOverlayIndex = 0;
        } else {
          ensureOverlayBuffer(activeOverlayIndex);
          overlayBuffers[activeOverlayIndex] += tokenText;
        }
        idx = barlineToken.nextIdx;
        continue;
      }

      if (ch === "&") {
        activeOverlayIndex += 1;
        ensureOverlayBuffer(activeOverlayIndex);
        idx += 1;
        continue;
      }

      ensureOverlayBuffer(activeOverlayIndex);
      overlayBuffers[activeOverlayIndex] += ch;
      idx += 1;
    }

    return overlayBuffers
      .map((segmentText, overlayIndex) => ({
        voiceId: overlayIndex === 0 ? normalizedBaseVoiceId : `${normalizedBaseVoiceId}_ov${overlayIndex + 1}`,
        overlayIndex,
        text: segmentText,
      }))
      .filter((segment) => segment.text.trim().length > 0);
  }

  function parseUserDefinedDecoration(rawValue) {
    const text = String(rawValue ?? "").trim();
    const match = text.match(/^(\S)(?:\s*=\s*|\s+)(.+)$/);
    if (!match) return null;
    const symbol = String(match[1] ?? "");
    const rhs = String(match[2] ?? "").trim();
    if (!symbol || !rhs) return null;
    const wrapped = rhs.match(/^[!+](.+)[!+]$/);
    const decoration = String(wrapped ? wrapped[1] : rhs).trim();
    if (!decoration) return null;
    return { symbol, decoration };
  }

  function expandUserDefinedDecorationSymbols(text, userDefinedDecorationBySymbol) {
    const raw = String(text ?? "");
    const symbolMap = userDefinedDecorationBySymbol ?? {};
    if (!raw || Object.keys(symbolMap).length === 0) {
      return raw;
    }
    let out = "";
    let idx = 0;
    while (idx < raw.length) {
      const ch = raw[idx];
      if (ch === '"' || ch === "!" || ch === "+") {
        const token = parseAbcDelimitedSpanAt(raw, idx, ch);
        if (!token) {
          out += ch;
          idx += 1;
          continue;
        }
        out += token.text;
        idx = token.nextIdx;
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(symbolMap, ch)) {
        out += `!${String(symbolMap[ch])}!`;
        idx += 1;
        continue;
      }
      out += ch;
      idx += 1;
    }
    return out;
  }

  function parseTempoFromQ(rawQ, warnings) {
    const raw = String(rawQ ?? "").trim();
    if (!raw) {
      return null;
    }
    const withoutQuoted = raw.replace(/"[^"]*"/g, " ").trim();
    let m = withoutQuoted.match(/(\d+)\s*\/\s*(\d+)\s*=\s*(\d+(?:\.\d+)?)/);
    if (m) {
      const num = Number(m[1]);
      const den = Number(m[2]);
      const bpm = Number(m[3]);
      if (num > 0 && den > 0 && Number.isFinite(bpm) && bpm > 0) {
        const quarterBpm = bpm * ((4 * num) / den);
        return Math.max(20, Math.min(300, Math.round(quarterBpm)));
      }
    }

    m = withoutQuoted.match(/=\s*(\d+(?:\.\d+)?)/);
    if (m) {
      const bpm = Number(m[1]);
      if (Number.isFinite(bpm) && bpm > 0) {
        return Math.max(20, Math.min(300, Math.round(bpm)));
      }
    }

    m = withoutQuoted.match(/^(\d+(?:\.\d+)?)$/);
    if (m) {
      const bpm = Number(m[1]);
      if (Number.isFinite(bpm) && bpm > 0) {
        return Math.max(20, Math.min(300, Math.round(bpm)));
      }
    }

    warnings.push("Q: unsupported tempo format; ignored: " + rawQ);
    return null;
  }

  function parseForMusicXml(source, settings) {
    const warnings = [];
    const lines = String(source ?? "").split("\n");
    const trillWidthHintByKey = new Map();
    const keyHintFifthsByKey = new Map();
    const measureMetaByKey = new Map();
    const transposeHintByVoiceId = new Map();
    const headers = {};
    const bodyEntries: AbcImportBodyEntry[] = [];
    const lyricEntriesByVoice = {};
    const voiceRegistry: AbcImportVoiceRegistry = {
      declaredVoiceIds: [],
      voiceNameById: {},
      voiceClefById: {},
      voiceTransposeById: {},
    };
    const userDefinedDecorationBySymbol = {};
    const supportedStandaloneBodyFieldNames = new Set(["K", "L", "M", "Q"]);
    const lineState: AbcImportLineState = {
      currentVoiceId: "1",
      scoreDirective: "",
      bodyStarted: false,
      pendingUnsupportedContinuedFieldName: "",
    };

    function pushBodyText(rawBodyText, lineNo, voiceId) {
      const result = appendAbcBodyTextEntries(
        rawBodyText,
        lineNo,
        voiceId,
        voiceRegistry,
        bodyEntries,
        splitBodyTextByInlineVoice,
        splitBodyTextByOverlay
      );
      if (result.appended) {
        lineState.bodyStarted = true;
      }
      lineState.currentVoiceId = result.finalVoiceId;
    }

    for (let i = 0; i < lines.length; i += 1) {
      const lineNo = i + 1;
      processAbcImportLine(lines[i], lineNo, {
        lineState,
        warnings,
        headers,
        lyricEntriesByVoice,
        supportedStandaloneBodyFieldNames,
        voiceRegistry,
        userDefinedDecorationBySymbol,
        trillWidthHintByKey,
        keyHintFifthsByKey,
        measureMetaByKey,
        transposeHintByVoiceId,
        pushBodyText,
        parseVoiceDirectiveTail,
        parseUserDefinedDecoration,
        expandUserDefinedDecorationSymbols,
      });
    }

    if (bodyEntries.length === 0) {
      throw new Error("Body not found. Please provide ABC note content. (line 1)");
    }

    const meter = parseMeter(headers.M || "4/4", warnings);
    const unitLength = parseFraction(headers.L || "1/8", "L", warnings);
    const keyInfo = parseKey(headers.K || "C", warnings);
    const tempoBpm = parseTempoFromQ(headers.Q ?? "", warnings);
    const keySignatureAccidentals = keySignatureAlterByStep(keyInfo.fifths);
    const voiceStores = createAbcVoiceStores();
    let noteCount = 0;

    for (const entry of bodyEntries) {
      const measures = ensureAbcVoiceMeasures(voiceStores, entry.voiceId);
      let currentMeasure = measures[measures.length - 1];
      let measureAccidentals = {};
      let activeUnitLength = unitLength;
      let activeMeter = meter;
      let activeTempoBpm = tempoBpm ?? null;
      let activeKeyFifths = Number.isFinite(voiceStores.currentKeyFifthsByVoice[entry.voiceId])
        ? Number(voiceStores.currentKeyFifthsByVoice[entry.voiceId])
        : keyInfo.fifths;
      let activeKeySignatureAccidentals = keySignatureAlterByStep(activeKeyFifths);
      let lastNote = null;
      let lastEventNotes = [];
      let pendingTieToNext = false;
      let pendingTrill = false;
      let pendingTrillLineStart = false;
      let pendingTrillLineStop = false;
      let pendingTurn: "" | "turn" | "inverted-turn" = "";
      let pendingTurnSlash = false;
      let pendingDelayedTurn = false;
      let pendingMordent: "" | "mordent" | "inverted-mordent" = "";
      let pendingTremolo: { type: "single" | "start" | "stop"; marks: number } | null = null;
      let pendingGlissandoStart = false;
      let pendingGlissandoStop = false;
      let pendingSlideStart = false;
      let pendingSlideStop = false;
      let pendingSchleifer = false;
      let pendingShake = false;
      let pendingArpeggiate = false;
      let pendingStaccato = false;
      let pendingStaccatissimo = false;
      let pendingAccent = false;
      let pendingTenuto = false;
      let pendingStress = false;
      let pendingUnstress = false;
      let pendingFermata: "" | "normal" | "inverted" = "";
      let pendingStrongAccent = false;
      let pendingBreathMark = false;
      let pendingCaesura = false;
      let pendingPhraseMark: "" | "shortphrase" | "mediumphrase" | "longphrase" = "";
      let pendingSegno = false;
      let pendingCoda = false;
      let pendingFine = false;
      let pendingDaCapo = false;
      let pendingDalSegno = false;
      let pendingToCoda = false;
      let pendingCrescendoStart = false;
      let pendingCrescendoStop = false;
      let pendingDiminuendoStart = false;
      let pendingDiminuendoStop = false;
      let pendingDynamicMark: "" | "ppp" | "pp" | "p" | "mp" | "mf" | "f" | "ff" | "fff" | "fp" | "fz" | "rfz" | "sf" | "sfp" = "";
      let pendingSfz = false;
      let pendingRehearsalMark = "";
      let pendingUpBow = false;
      let pendingDownBow = false;
      let pendingOpenString = false;
      let pendingSnapPizzicato = false;
      let pendingHarmonic = false;
      let pendingStopped = false;
      let pendingThumbPosition = false;
      let pendingEditorialAccidental = false;
      let pendingCourtesyAccidental = false;
      let pendingDoubleTongue = false;
      let pendingTripleTongue = false;
      let pendingHeel = false;
      let pendingToe = false;
      let pendingFingerings: string[] = [];
      let pendingStrings: string[] = [];
      let pendingPlucks: string[] = [];
      let pendingChordSymbols: string[] = [];
      let pendingAnnotations: string[] = [];
      let pendingSlurStart = 0;
      let pendingRhythmScale = null;
      let tupletRemaining = 0;
      let tupletScale = null;
      let tupletSpec = null;
      let currentMeasureNo = Math.max(1, measures.length);
      let currentEventNo = 0;
      let beamRunActive = false;
      let sawInterEventWhitespace = false;
      let beamCursorDiv = 0;
      let activeEndingMarker = String(voiceStores.activeEndingByVoice[entry.voiceId] ?? "");
      let idx = 0;
      const text = entry.text ?? "";

      const warnBody = (message) => {
        warnings.push("line " + entry.lineNo + ": " + message);
      };

      // Field and decoration application.
      const applyBodyField = (fieldName, fieldValue) => {
        const result = applyAbcBodyField(fieldName, fieldValue, {
          warnings,
          voiceStores,
          entryVoiceId: entry.voiceId,
          currentMeasureNo,
          keyHintFifthsByKey,
          activeKeyFifths,
          activeUnitLength,
          activeMeter,
          activeTempoBpm,
          measureAccidentals,
        });
        activeKeyFifths = result.activeKeyFifths;
        activeKeySignatureAccidentals = result.activeKeySignatureAccidentals;
        activeUnitLength = result.activeUnitLength;
        activeMeter = result.activeMeter;
        activeTempoBpm = result.activeTempoBpm;
        measureAccidentals = result.measureAccidentals;
        return result.handled;
      };

      const applyPrefixedDecoration = (rawDecoration, decoration) => {
        if (decoration.startsWith("rehearsal:")) {
          const rehearsalText = rawDecoration.slice("rehearsal:".length).trim();
          if (rehearsalText) {
            pendingRehearsalMark = rehearsalText;
          }
          return true;
        }
        if (decoration.startsWith("fingering:")) {
          const fingeringText = rawDecoration.slice("fingering:".length).trim();
          if (fingeringText) {
            pendingFingerings.push(fingeringText);
          }
          return true;
        }
        if (decoration.startsWith("string:")) {
          const stringText = rawDecoration.slice("string:".length).trim();
          if (stringText) {
            pendingStrings.push(stringText);
          }
          return true;
        }
        if (decoration.startsWith("pluck:")) {
          const pluckText = rawDecoration.slice("pluck:".length).trim();
          if (pluckText) {
            pendingPlucks.push(pluckText);
          }
          return true;
        }
        return false;
      };

      const applyTurnDecoration = (decoration) => {
        if (decoration === "delayedturn" || decoration === "delayed-turn") {
          pendingTurn = pendingTurn || "turn";
          pendingDelayedTurn = true;
          return true;
        }
        if (decoration === "delayedinvertedturn" || decoration === "delayed-inverted-turn") {
          pendingTurn = "inverted-turn";
          pendingDelayedTurn = true;
          return true;
        }
        const turnDecorationAppliers = [
          [TURN_DECORATIONS, "turn", false],
          [TURN_SLASH_DECORATIONS, "turn", true],
          [INVERTED_TURN_DECORATIONS, "inverted-turn", false],
          [INVERTED_TURN_SLASH_DECORATIONS, "inverted-turn", true],
        ];
        const matchedTurn = turnDecorationAppliers.find(([decorationSet]) => decorationSet.has(decoration));
        if (!matchedTurn) {
          return false;
        }
        pendingTurn = matchedTurn[1];
        pendingTurnSlash = matchedTurn[2];
        return true;
      };

      const applyTremoloDecoration = (decoration) => {
        const matched = decoration.match(/^tremolo-(single|start|stop)-([1-9]\d*)$/);
        if (!matched) {
          return false;
        }
        pendingTremolo = {
          type: matched[1] as "single" | "start" | "stop",
          marks: Math.max(1, Math.min(8, Number.parseInt(matched[2], 10) || 1))
        };
        return true;
      };

      const applyDecoration = (rawDecoration, decoration) => {
        const exactDecorationAppliers = {
          "caesura": () => {
            pendingCaesura = true;
          },
          "coda": () => {
            pendingCoda = true;
          },
          "courtesy": () => {
            pendingCourtesyAccidental = true;
          },
          "editorial": () => {
            pendingEditorialAccidental = true;
          },
          "fermata": () => {
            pendingFermata = "normal";
          },
          "fine": () => {
            pendingFine = true;
          },
          "harmonic": () => {
            pendingHarmonic = true;
          },
          "heel": () => {
            pendingHeel = true;
          },
          "heel mark": () => {
            pendingHeel = true;
          },
          "schleifer": () => {
            pendingSchleifer = true;
          },
          "segno": () => {
            pendingSegno = true;
          },
          "sfz": () => {
            pendingSfz = true;
          },
          "shake": () => {
            pendingShake = true;
          },
          "slide-stop": () => {
            pendingSlideStop = true;
          },
          "stress": () => {
            pendingStress = true;
          },
          "tenuto": () => {
            pendingTenuto = true;
          },
          "toe": () => {
            pendingToe = true;
          },
          "toe mark": () => {
            pendingToe = true;
          },
          "trill(": () => {
            pendingTrill = true;
            pendingTrillLineStart = true;
          },
          "trill)": () => {
            pendingTrillLineStop = true;
          },
          "unstress": () => {
            pendingUnstress = true;
          },
        };
        const applyExactDecoration = exactDecorationAppliers[decoration];
        if (applyExactDecoration) {
          applyExactDecoration();
          return true;
        }
        const setDecorationAppliers = [
          [TRILL_DECORATIONS, () => {
            pendingTrill = true;
          }],
          [LOWER_MORDENT_DECORATIONS, () => {
            pendingMordent = "mordent";
          }],
          [UPPER_MORDENT_DECORATIONS, () => {
            pendingMordent = "inverted-mordent";
          }],
          [GLISS_START_DECORATIONS, () => {
            pendingGlissandoStart = true;
          }],
          [GLISS_STOP_DECORATIONS, () => {
            pendingGlissandoStop = true;
          }],
          [SLIDE_START_DECORATIONS, () => {
            pendingSlideStart = true;
          }],
          [ARPEGGIATE_DECORATIONS, () => {
            pendingArpeggiate = true;
          }],
          [STACCATO_DECORATIONS, () => {
            pendingStaccato = true;
          }],
          [STACCATISSIMO_DECORATIONS, () => {
            pendingStaccatissimo = true;
          }],
          [ACCENT_DECORATIONS, () => {
            pendingAccent = true;
          }],
          [INVERTED_FERMATA_DECORATIONS, () => {
            pendingFermata = "inverted";
          }],
          [STRONG_ACCENT_DECORATIONS, () => {
            pendingStrongAccent = true;
          }],
          [BREATH_DECORATIONS, () => {
            pendingBreathMark = true;
          }],
          [DACAPO_DECORATIONS, () => {
            pendingDaCapo = true;
          }],
          [DALSEGNO_DECORATIONS, () => {
            pendingDalSegno = true;
          }],
          [TOCODA_DECORATIONS, () => {
            pendingToCoda = true;
          }],
          [CRESC_START_DECORATIONS, () => {
            pendingCrescendoStart = true;
          }],
          [CRESC_STOP_DECORATIONS, () => {
            pendingCrescendoStop = true;
          }],
          [DIM_START_DECORATIONS, () => {
            pendingDiminuendoStart = true;
          }],
          [DIM_STOP_DECORATIONS, () => {
            pendingDiminuendoStop = true;
          }],
          [UPBOW_DECORATIONS, () => {
            pendingUpBow = true;
          }],
          [DOWNBOW_DECORATIONS, () => {
            pendingDownBow = true;
          }],
          [DOUBLE_TONGUE_DECORATIONS, () => {
            pendingDoubleTongue = true;
          }],
          [TRIPLE_TONGUE_DECORATIONS, () => {
            pendingTripleTongue = true;
          }],
          [OPEN_STRING_DECORATIONS, () => {
            pendingOpenString = true;
          }],
          [SNAP_PIZZICATO_DECORATIONS, () => {
            pendingSnapPizzicato = true;
          }],
          [STOPPED_DECORATIONS, () => {
            pendingStopped = true;
          }],
          [THUMB_POSITION_DECORATIONS, () => {
            pendingThumbPosition = true;
          }],
        ];
        const applySetDecoration = setDecorationAppliers.find(([decorationSet]) => decorationSet.has(decoration));
        if (applySetDecoration) {
          applySetDecoration[1]();
          return true;
        }
        if (applyPrefixedDecoration(rawDecoration, decoration)) {
          return true;
        }
        if (applyTurnDecoration(decoration)) {
          return true;
        }
        if (applyTremoloDecoration(decoration)) {
          return true;
        }
        if (PHRASE_DECORATIONS.has(decoration)) {
          pendingPhraseMark = decoration as "shortphrase" | "mediumphrase" | "longphrase";
          return true;
        }
        if (decoration === "dacoda") {
          pendingDaCapo = true;
          pendingToCoda = true;
          return true;
        }
        if (DYNAMIC_DECORATIONS.has(decoration)) {
          pendingDynamicMark = decoration;
          return true;
        }
        if (/^[0-5]$/.test(decoration)) {
          pendingFingerings.push(decoration);
          return true;
        }
        return false;
      };

      const applyPendingOrnamentState = (note, options = {}) => {
        const { applySlurStart = true, trillHint = "" } = options;
        applyAbcPendingNoteValue({
          note,
          isPending: pendingTrill,
          apply: () => {
            note.trill = true;
            note.trillLineStart = pendingTrillLineStart;
          },
          clear: () => {
            pendingTrill = false;
            pendingTrillLineStart = false;
          },
        });
        applyAbcPendingNoteValue({
          note,
          isPending: pendingTrillLineStop,
          apply: () => {
            note.trillLineStop = true;
          },
          clear: () => {
            pendingTrillLineStop = false;
          },
        });
        applyAbcPendingNoteOptionalValue({
          note,
          value: pendingTurn,
          isEmpty: (value) => !value,
          apply: (value) => {
            note.turnType = value;
            note.turnSlash = pendingTurnSlash;
            note.delayedTurn = pendingDelayedTurn;
          },
          clear: () => {
            pendingTurn = "";
            pendingTurnSlash = false;
            pendingDelayedTurn = false;
          },
        });
        if (!note.isRest && (pendingEditorialAccidental || pendingCourtesyAccidental)) {
          if (note.accidentalText) {
            note.accidentalEditorial = pendingEditorialAccidental || undefined;
            note.accidentalCautionary = pendingCourtesyAccidental || undefined;
          }
          pendingEditorialAccidental = false;
          pendingCourtesyAccidental = false;
        }
        applyAbcPendingNoteOptionalValue({ note, value: pendingMordent, isEmpty: (value) => !value, apply: (value) => { note.mordentType = value; }, clear: () => { pendingMordent = ""; } });
        applyAbcPendingNoteOptionalValue({ note, value: pendingPhraseMark, isEmpty: (value) => !value, apply: (value) => { note.phraseMark = value; }, clear: () => { pendingPhraseMark = ""; } });
        applyAbcPendingNoteOptionalValue({
          note,
          value: pendingTremolo,
          isEmpty: (value) => !value,
          apply: (value) => {
            note.tremoloType = value.type;
            note.tremoloMarks = value.marks;
          },
          clear: () => {
            pendingTremolo = null;
          },
        });
        applyAbcPendingNoteValue({ note, isPending: pendingGlissandoStart, apply: () => { note.glissandoStart = true; }, clear: () => { pendingGlissandoStart = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingGlissandoStop, apply: () => { note.glissandoStop = true; }, clear: () => { pendingGlissandoStop = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingSlideStart, apply: () => { note.slideStart = true; }, clear: () => { pendingSlideStart = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingSlideStop, apply: () => { note.slideStop = true; }, clear: () => { pendingSlideStop = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingSchleifer, apply: () => { note.schleifer = true; }, clear: () => { pendingSchleifer = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingShake, apply: () => { note.shake = true; }, clear: () => { pendingShake = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingArpeggiate, apply: () => { note.arpeggiate = true; }, clear: () => { pendingArpeggiate = false; } });
        if (applySlurStart && pendingSlurStart > 0 && !note.isRest) {
          note.slurStart = true;
          pendingSlurStart = 0;
        }
        if (note.trill && trillHint) {
          note.trillAccidentalText = trillHint;
        }
      };

      const applyPendingArticulationState = (note) => {
        applyAbcPendingNoteValue({ note, isPending: pendingStaccato, apply: () => { note.staccato = true; }, clear: () => { pendingStaccato = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingStaccatissimo, apply: () => { note.staccatissimo = true; }, clear: () => { pendingStaccatissimo = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingAccent, apply: () => { note.accent = true; }, clear: () => { pendingAccent = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingTenuto, apply: () => { note.tenuto = true; }, clear: () => { pendingTenuto = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingStress, apply: () => { note.stress = true; }, clear: () => { pendingStress = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingUnstress, apply: () => { note.unstress = true; }, clear: () => { pendingUnstress = false; } });
        applyAbcPendingNoteOptionalValue({ note, value: pendingFermata, isEmpty: (value) => !value, apply: (value) => { note.fermataType = value; }, clear: () => { pendingFermata = ""; } });
        applyAbcPendingNoteValue({ note, isPending: pendingStrongAccent, apply: () => { note.strongAccent = true; }, clear: () => { pendingStrongAccent = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingBreathMark, apply: () => { note.breathMark = true; }, clear: () => { pendingBreathMark = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingCaesura, apply: () => { note.caesura = true; }, clear: () => { pendingCaesura = false; } });
      };

      const applyPendingDirectionState = (note) => {
        applyAbcPendingNoteValue({ note, isPending: pendingSegno, apply: () => { note.segno = true; }, clear: () => { pendingSegno = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingCoda, apply: () => { note.coda = true; }, clear: () => { pendingCoda = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingFine, apply: () => { note.fine = true; }, clear: () => { pendingFine = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingDaCapo, apply: () => { note.daCapo = true; }, clear: () => { pendingDaCapo = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingDalSegno, apply: () => { note.dalSegno = true; }, clear: () => { pendingDalSegno = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingToCoda, apply: () => { note.toCoda = true; }, clear: () => { pendingToCoda = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingCrescendoStart, apply: () => { note.crescendoStart = true; }, clear: () => { pendingCrescendoStart = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingCrescendoStop, apply: () => { note.crescendoStop = true; }, clear: () => { pendingCrescendoStop = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingDiminuendoStart, apply: () => { note.diminuendoStart = true; }, clear: () => { pendingDiminuendoStart = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingDiminuendoStop, apply: () => { note.diminuendoStop = true; }, clear: () => { pendingDiminuendoStop = false; } });
        applyAbcPendingNoteOptionalValue({ note, value: pendingDynamicMark, isEmpty: (value) => !value, apply: (value) => { note.dynamicMark = value; }, clear: () => { pendingDynamicMark = ""; } });
        applyAbcPendingNoteValue({ note, isPending: pendingSfz, apply: () => { note.sfz = true; }, clear: () => { pendingSfz = false; } });
        applyAbcPendingNoteOptionalValue({ note, value: pendingRehearsalMark, isEmpty: (value) => !value, apply: (value) => { note.rehearsalMark = value; }, clear: () => { pendingRehearsalMark = ""; } });
      };

      const applyPendingTechnicalState = (note) => {
        applyAbcPendingNoteValue({ note, isPending: pendingUpBow, apply: () => { note.upBow = true; }, clear: () => { pendingUpBow = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingDownBow, apply: () => { note.downBow = true; }, clear: () => { pendingDownBow = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingDoubleTongue, apply: () => { note.doubleTongue = true; }, clear: () => { pendingDoubleTongue = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingTripleTongue, apply: () => { note.tripleTongue = true; }, clear: () => { pendingTripleTongue = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingHeel, apply: () => { note.heel = true; }, clear: () => { pendingHeel = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingToe, apply: () => { note.toe = true; }, clear: () => { pendingToe = false; } });
        applyAbcPendingNoteArray({ note, values: pendingFingerings, apply: (values) => { note.fingerings = values.slice(); }, clear: () => { pendingFingerings = []; } });
        applyAbcPendingNoteArray({ note, values: pendingStrings, apply: (values) => { note.strings = values.slice(); }, clear: () => { pendingStrings = []; } });
        applyAbcPendingNoteArray({ note, values: pendingPlucks, apply: (values) => { note.plucks = values.slice(); }, clear: () => { pendingPlucks = []; } });
        applyAbcPendingNoteArray({ note, values: pendingChordSymbols, apply: (values) => { note.chordSymbols = values.slice(); }, clear: () => { pendingChordSymbols = []; } });
        applyAbcPendingNoteValue({ note, isPending: pendingOpenString, apply: () => { note.openString = true; }, clear: () => { pendingOpenString = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingSnapPizzicato, apply: () => { note.snapPizzicato = true; }, clear: () => { pendingSnapPizzicato = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingHarmonic, apply: () => { note.harmonic = true; }, clear: () => { pendingHarmonic = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingStopped, apply: () => { note.stopped = true; }, clear: () => { pendingStopped = false; } });
        applyAbcPendingNoteValue({ note, isPending: pendingThumbPosition, apply: () => { note.thumbPosition = true; }, clear: () => { pendingThumbPosition = false; } });
        applyAbcPendingNoteArray({ note, values: pendingAnnotations, apply: (values) => { note.annotations = values.slice(); }, clear: () => { pendingAnnotations = []; } });
      };

      const applyPendingToPlayableNote = (note, options = {}) => {
        applyAbcPendingStateToPlayableNote({
          note,
          options,
          applyPendingOrnamentState,
          applyPendingArticulationState,
          applyPendingDirectionState,
          applyPendingTechnicalState,
          hasPendingTieToNext: () => pendingTieToNext,
          clearPendingTieToNext: () => {
            pendingTieToNext = false;
          },
          warnBody,
        });
      };

      // Event construction and commit helpers.
      const applySingleCharShorthand = (char) => {
        const shorthand = parseAbcSingleCharShorthandAt(char, 0);
        if (!shorthand) {
          return false;
        }
        const shorthandAppliers = {
          "accent": () => {
            pendingAccent = true;
          },
          "arpeggiate": () => {
            pendingArpeggiate = true;
          },
          "coda": () => {
            pendingCoda = true;
          },
          "downbow": () => {
            pendingDownBow = true;
          },
          "fermata": () => {
            pendingFermata = "normal";
          },
          "inverted-mordent": () => {
            pendingMordent = "inverted-mordent";
          },
          "mordent": () => {
            pendingMordent = "mordent";
          },
          "segno": () => {
            pendingSegno = true;
          },
          "staccato": () => {
            pendingStaccato = true;
          },
          "trill": () => {
            pendingTrill = true;
          },
          "upbow": () => {
            pendingUpBow = true;
          },
        };
        const apply = shorthandAppliers[shorthand.kind];
        if (!apply) {
          return false;
        }
        apply();
        return true;
      };

      const consumePlayableTiming = (rawLengthToken, tokenIdx) => {
        const len = parseLengthToken(rawLengthToken, entry.lineNo);
        let absoluteLength = multiplyFractions(activeUnitLength, len);
        if (pendingRhythmScale) {
          absoluteLength = multiplyFractions(absoluteLength, pendingRhythmScale);
          pendingRhythmScale = null;
        }
        const activeTuplet =
          tupletRemaining > 0 && tupletScale && tupletSpec
            ? { actual: tupletSpec.actual, normal: tupletSpec.normal, remaining: tupletSpec.remaining }
            : null;
        if (tupletRemaining > 0 && tupletScale) {
          absoluteLength = multiplyFractions(absoluteLength, tupletScale);
          tupletRemaining -= 1;
          if (tupletSpec) {
            tupletSpec.remaining -= 1;
          }
          if (tupletRemaining <= 0) {
            tupletScale = null;
            tupletSpec = null;
          }
        }

        let nextIdx = tokenIdx;
        const trailingBrokenRhythm = parseAbcBrokenRhythmAt(text, nextIdx);
        if (trailingBrokenRhythm) {
          absoluteLength = multiplyFractions(absoluteLength, trailingBrokenRhythm.leftScale);
          pendingRhythmScale = trailingBrokenRhythm.rightScale;
          nextIdx = trailingBrokenRhythm.nextIdx;
        }

        return {
          absoluteLength,
          dur: durationInDivisions(absoluteLength, 960),
          activeTuplet,
          nextIdx,
        };
      };

      const applyTupletToEventStart = (note, activeTuplet) => {
        if (!activeTuplet) {
          return;
        }
        note.timeModification = { actual: activeTuplet.actual, normal: activeTuplet.normal };
        if (activeTuplet.remaining === activeTuplet.actual) {
          note.tupletStart = true;
        }
        if (activeTuplet.remaining === 1) {
          note.tupletStop = true;
        }
      };

      const finalizePlayableEventStart = (note, dur, activeTuplet, options = {}) => {
        const applyTieStop = options.applyTieStop !== false;
        applyBeamModeForEvent(note, dur);
        currentEventNo += 1;
        const trillHint = trillWidthHintByKey.get(`${entry.voiceId}#${currentMeasureNo}#${currentEventNo}`) ?? "";
        applyPendingToPlayableNote(note, { applySlurStart: true, applyTieStop, trillHint });
        applyTupletToEventStart(note, activeTuplet);
        note.voice = entry.voiceId;
      };

      const buildPlayableNoteForBody = (pitchSource, absoluteLength, dur, octaveWarningMessage) => {
        let note;
        try {
          note = buildNoteData(
            pitchSource.pitchChar,
            pitchSource.accidentalText,
            pitchSource.octaveShift,
            absoluteLength,
            dur,
            entry.lineNo,
            activeKeySignatureAccidentals,
            measureAccidentals
          );
        } catch (error) {
          if (error instanceof Error && /Octave out of range/i.test(error.message ?? "")) {
            warnBody(octaveWarningMessage);
            return null;
          }
          throw error;
        }
        note.voice = entry.voiceId;
        return note;
      };

      const clearLastEventState = (options = {}) => {
        if (options.clearPendingTie !== false) {
          pendingTieToNext = false;
        }
        lastNote = null;
        lastEventNotes = [];
      };

      const commitPlayableEvent = (notes, options = {}) => {
        const applyChordTieStop = options.applyChordTieStop === true;
        if (applyChordTieStop && pendingTieToNext && notes.length > 0) {
          for (const note of notes) {
            if (!note.isRest) {
              note.tieStop = true;
            }
          }
          pendingTieToNext = false;
        }
        for (const note of notes) {
          currentMeasure.push(note);
        }
        if (notes.length === 0) {
          clearLastEventState();
          return false;
        }
        lastNote = notes[0] ?? null;
        lastEventNotes = notes;
        noteCount += notes.length;
        return true;
      };

      const buildPlayableEventFromPitches = (pitchSources, timing, options = {}) => {
        const octaveWarningMessage = options.octaveWarningMessage ?? "Skipped note with unsupported octave range.";
        const firstNoteOptions = options.firstNoteOptions ?? {};
        const notes = [];
        for (let pitchIndex = 0; pitchIndex < pitchSources.length; pitchIndex += 1) {
          const note = buildPlayableNoteForBody(
            pitchSources[pitchIndex],
            timing.absoluteLength,
            timing.dur,
            octaveWarningMessage
          );
          if (!note) {
            notes.length = 0;
            break;
          }
          if (pitchIndex === 0) {
            finalizePlayableEventStart(note, timing.dur, timing.activeTuplet, firstNoteOptions);
          } else {
            note.chord = true;
          }
          notes.push(note);
        }
        return notes;
      };

      const playableEventOptionsForSource = (source) => ({
        invalidLengthMessage: source === "chord" ? "Skipped chord with invalid length." : "Skipped note with invalid length.",
        octaveWarningMessage:
          source === "chord"
            ? "Skipped chord note with unsupported octave range."
            : "Skipped note with unsupported octave range.",
        firstNoteOptions: source === "chord" ? { applyTieStop: false } : {},
        commitOptions: source === "chord" ? { applyChordTieStop: true } : {},
      });

      // Body token handlers.
      const handleBrokenRhythmBodyToken = (bodyToken) => {
        const { brokenRhythm } = bodyToken;
        if (!lastEventNotes || lastEventNotes.length === 0 || lastEventNotes.some((n) => n.isRest)) {
          warnBody("broken rhythm(" + brokenRhythm.symbol + ")  has no preceding note; skipped.");
          idx = brokenRhythm.nextIdx;
          return true;
        }
        scaleNotesDuration(lastEventNotes, brokenRhythm.leftScale);
        pendingRhythmScale = brokenRhythm.rightScale;
        idx = brokenRhythm.nextIdx;
        return true;
      };

      const handleParenBodyToken = (bodyToken) => {
        const { parenToken } = bodyToken;
        if (parenToken.kind === "tuplet") {
          const { tuplet } = parenToken;
          if (tuplet.actual > 0 && tuplet.normal > 0 && tuplet.count > 0) {
            tupletScale = { num: tuplet.normal, den: tuplet.actual };
            tupletRemaining = tuplet.count;
            tupletSpec = { actual: tuplet.actual, normal: tuplet.normal, remaining: tuplet.count };
          } else {
            warnBody("Failed to parse tuplet notation: " + tuplet.raw);
          }
          idx = tuplet.nextIdx;
          return true;
        }
        pendingSlurStart += 1;
        idx = parenToken.nextIdx;
        return true;
      };

      const enqueueQuotedBodyText = (normalizedText) => {
        if (!normalizedText) {
          return;
        }
        if (isLikelyAbcChordSymbol(normalizedText)) {
          pendingChordSymbols.push(normalizedText);
          return;
        }
        pendingAnnotations.push(normalizedText);
      };

      const markTieStartOnLastEvent = () => {
        if (!lastEventNotes || lastEventNotes.length === 0 || !lastEventNotes.some((n) => !n.isRest)) {
          return false;
        }
        for (const eventNote of lastEventNotes) {
          if (!eventNote.isRest) {
            eventNote.tieStart = true;
          }
        }
        pendingTieToNext = true;
        return true;
      };

      const handleTieBodyToken = (bodyToken) => {
        if (!markTieStartOnLastEvent()) {
          warnBody("tie(-)  has no preceding note; skipped.");
        }
        idx = bodyToken.tie.nextIdx;
        return true;
      };

      const handleQuotedStringBodyToken = (bodyToken) => {
        const { quotedString } = bodyToken;
        enqueueQuotedBodyText(quotedString.normalizedText);
        if (!quotedString.terminated) {
          warnBody('Unterminated inline string ("...").');
        }
        idx = quotedString.nextIdx;
        return true;
      };

      const handleSingleCharShorthandBodyToken = (bodyToken, char) => {
        applySingleCharShorthand(char);
        idx = bodyToken.shorthand.nextIdx;
        return true;
      };

      const handleDecorationBodyToken = (bodyToken, char) => {
        const parsedDecoration = bodyToken.decoration;
        if (!parsedDecoration.terminated) {
          warnBody("Unterminated decoration marker: " + char);
          idx = parsedDecoration.nextIdx;
          return true;
        }
        const { rawDecoration, decoration } = parsedDecoration;
        if (!applyDecoration(rawDecoration, decoration) && decoration) {
          warnBody("Skipped decoration: " + char + decoration + char);
        }
        idx = parsedDecoration.nextIdx;
        return true;
      };

      const markSlurStopOnLastNote = () => {
        if (!lastNote || lastNote.isRest) {
          return false;
        }
        lastNote.slurStop = true;
        return true;
      };

      const handleSlurStopBodyToken = (bodyToken) => {
        const { slurStop } = bodyToken;
        if (!markSlurStopOnLastNote()) {
          warnBody("slur stop()) has no preceding note; skipped.");
        }
        idx = slurStop.nextIdx;
        return true;
      };

      const handleSimpleBodyToken = (bodyToken, char) => {
        return processAbcSimpleBodyToken(bodyToken, {
          char,
          handleBrokenRhythmBodyToken,
          handleDecorationBodyToken,
          handleParenBodyToken,
          handleQuotedStringBodyToken,
          handleSingleCharShorthandBodyToken,
          handleSlurStopBodyToken,
          handleTieBodyToken,
        });
      };

      const handleInlineFieldBracketToken = (bracketToken) => {
        const { inlineField } = bracketToken;
        if (!applyBodyField(inlineField.fieldName, inlineField.fieldValue)) {
          warnBody("Skipped unsupported inline field: [" + inlineField.fieldName + ":" + inlineField.fieldValue + "]");
        }
        idx = inlineField.nextIdx;
        return true;
      };

      const handleRepeatEndingBracketToken = (bracketToken) => {
        const { repeatEndingMarker } = bracketToken;
        return startEndingAtCurrentMeasure(repeatEndingMarker.marker, repeatEndingMarker.nextIdx);
      };

      const handleBracketBodyToken = (bodyToken) => {
        return processAbcBracketBodyToken(bodyToken, {
          text,
          idx,
          handleInlineFieldBracketToken,
          handleRepeatEndingBracketToken,
          handlePlayableEvent,
        });
      };

      const handleGraceGroup = (char) => {
        const result = processAbcGraceGroup({
          char,
          text,
          idx,
          lineNo: entry.lineNo,
          activeUnitLength,
          activeKeySignatureAccidentals,
          measureAccidentals,
          entryVoiceId: entry.voiceId,
          warnings,
          warnBody,
          appendGraceNotes,
        });
        idx = result.nextIdx;
        return result.handled;
      };

      // Measure and ending state helpers.
      const appendGraceNotes = (graceNotes) => {
        for (const graceNote of graceNotes) {
          currentMeasure.push(graceNote);
          noteCount += 1;
        }
      };

      const startEndingAtCurrentMeasure = (marker, nextIdx) => {
        if (activeEndingMarker) {
          const stopMeasureNo = currentMeasure.length === 0 ? currentMeasureNo - 1 : currentMeasureNo;
          stopActiveEndingAtMeasure(stopMeasureNo);
        }
          const measureMeta = ensureAbcNotationMeasureMeta(voiceStores, entry.voiceId, currentMeasureNo);
        measureMeta.endingStart = marker;
        activeEndingMarker = marker;
        idx = nextIdx;
        resetBeamContext();
        return true;
      };

      const stopActiveEndingAtMeasure = (measureNo) => {
        if (!activeEndingMarker || measureNo < 1) {
          return false;
        }
        const measureMeta = ensureAbcNotationMeasureMeta(voiceStores, entry.voiceId, measureNo);
        measureMeta.endingStop = activeEndingMarker;
        measureMeta.endingStopType = "stop";
        activeEndingMarker = "";
        return true;
      };

      const advanceToNextMeasure = () => {
        currentMeasure = [];
        measures.push(currentMeasure);
        currentMeasureNo = Math.max(1, measures.length);
        currentEventNo = 0;
        beamCursorDiv = 0;
      };

      const resetBeamContext = () => {
        beamRunActive = false;
        sawInterEventWhitespace = false;
      };

      const handleBarlineToken = (barlineToken) => {
        const barlineContext = {
          text,
          idx,
          currentMeasureNo,
          currentMeasureLength: currentMeasure.length,
          measuresLength: measures.length,
          activeEndingMarker,
          markRepeatEnd: () => {
            ensureAbcNotationMeasureMeta(voiceStores, entry.voiceId, currentMeasureNo).repeatEnd = true;
          },
          markRepeatStart: () => {
            ensureAbcNotationMeasureMeta(voiceStores, entry.voiceId, currentMeasureNo).repeatStart = true;
          },
          stopActiveEndingAtMeasure,
          advanceToNextMeasure,
          clearMeasureAccidentals: () => {
            measureAccidentals = {};
          },
          clearLastNote: () => {
            lastNote = null;
          },
          resetBeamContext,
          startEndingAtCurrentMeasure,
        };
        const handled = processAbcBarlineEntry(barlineToken, barlineContext);
        idx = Math.max(idx, barlineContext.idx);
        return handled;
      };

      const handleNonPlayableBodyEntry = (bodyEntry) => {
        const nonPlayableContext = {
          text,
          idx,
          warnBody,
          applyBodyField,
          handleBarlineToken,
        };
        const handled = processAbcNonPlayableBodyEntry(bodyEntry, nonPlayableContext);
        idx = Math.max(idx, nonPlayableContext.idx);
        return handled;
      };

      // Playable-event and fallback handlers.
      const handleResolvedPlayableEvent = (playableEvent) => {
        const timing = consumePlayableTiming(playableEvent.rawLengthToken, playableEvent.nextIdx);
        idx = timing.nextIdx;
        return processAbcPlayableEvent(playableEvent, {
          timing,
          resolution: playableEventOptionsForSource(playableEvent.source),
          buildPlayableEventFromPitches,
          commitPlayableEvent,
          clearLastEventState,
          warnBody,
        });
      };

      const skipInvalidPlayableEvent = (message, nextIdx) => {
        warnBody(message);
        idx = nextIdx;
        return true;
      };

      const handleInvalidPlayableEvent = (playableEvent, options = {}) => {
        const { fallbackToNextChar = false } = options;
        if (!playableEvent) {
          return false;
        }
        if (playableEvent.kind === "malformed-accidental") {
          return skipInvalidPlayableEvent("Skipped malformed accidental token: " + playableEvent.accidentalText, playableEvent.nextIdx);
        }
        if (playableEvent.kind === "invalid-chord") {
          return skipInvalidPlayableEvent("Failed to parse chord notation; skipped.", playableEvent.nextIdx);
        }
        if (fallbackToNextChar) {
          idx += 1;
          return true;
        }
        return false;
      };

      const handlePlayableEvent = (playableEvent, options = {}) => {
        const { fallbackToNextChar = false } = options;
        if (playableEvent.kind !== "playable") {
          return handleInvalidPlayableEvent(playableEvent, { fallbackToNextChar });
        }
        return handleResolvedPlayableEvent(playableEvent);
      };

      const advanceBodyCursorWithWarning = (message, nextIdx = idx + 1) => {
        warnBody(message);
        idx = nextIdx;
        resetBeamContext();
        return true;
      };

      const handleClosingNotation = (char) => {
        if (char !== "]" && char !== "}") {
          return false;
        }
        if (char === "]" && activeEndingMarker) {
          const stopMeasureNo = currentMeasure.length === 0 ? currentMeasureNo - 1 : currentMeasureNo;
          stopActiveEndingAtMeasure(stopMeasureNo);
          idx += 1;
          resetBeamContext();
          return true;
        }
        return advanceBodyCursorWithWarning("Skipped unsupported notation: " + char);
      };

      const handleUnsupportedPunctuation = (char) => {
        if (char !== ";" && char !== "`" && char !== "?" && char !== "@" && char !== "#" && char !== "$" && char !== "*") {
          return false;
        }
        return advanceBodyCursorWithWarning("Skipped unsupported body punctuation: " + char);
      };

      const handleBodyEntry = (bodyEntry, char) => {
        const bodyToken = bodyEntry?.kind === "body-token" ? bodyEntry.bodyToken : null;
        const entryHandlers = [
          () => handleNonPlayableBodyEntry(bodyEntry),
          () => handleSimpleBodyToken(bodyToken, char),
          () => handleGraceGroup(char),
          () => handleBracketBodyToken(bodyToken),
          () => (bodyEntry?.kind === "playable-event" ? handlePlayableEvent(bodyEntry.playableEvent) : false),
        ];
        for (const handler of entryHandlers) {
          if (handler()) {
            return true;
          }
        }
        return false;
      };

      const throwBodyParseError = () => {
        throw new Error("line " + entry.lineNo + ": Failed to parse note/rest: " + text.slice(idx, idx + 12));
      };

      const handleBodyFallback = (bodyEntry, char) => {
        return processAbcBodyFallback({
          char,
          bodyEntry,
          handleClosingNotation,
          handleUnsupportedPunctuation,
          throwBodyParseError,
        });
      };

      const consumeIgnorableBodyChar = (char) => {
        if (char === " " || char === "\t") {
          sawInterEventWhitespace = true;
          idx += 1;
          return true;
        }
        if (char === "\\") {
          warnBody("Skipped stray body continuation marker: \\");
          idx += 1;
          return true;
        }
        if (char === "," || char === "'") {
          // Lenient compatibility: some real-world sources include standalone octave marks.
          // They are non-standard in strict ABC, but skipping them improves interoperability.
          idx += 1;
          return true;
        }
        return false;
      };

      const isBeamableAbcNote = (note) =>
        !!(
          note &&
          !note.isRest &&
          !note.grace &&
          ["eighth", "16th", "32nd", "64th"].includes(String(note.type ?? "").trim().toLowerCase())
        );
      const applyBeamModeForEvent = (note, durationDiv) => {
        const resolvedDurationDiv = Math.max(0, Math.round(Number(durationDiv) || 0));
        const beatDiv = Math.max(1, Math.round((960 * 4) / Math.max(1, Math.round(Number(activeMeter?.beatType) || 4))));
        const startsAtBeatBoundary = beamCursorDiv > 0 && beamCursorDiv % beatDiv === 0;
        if (startsAtBeatBoundary) {
          beamRunActive = false;
        }
        if (isBeamableAbcNote(note)) {
          note.beamMode = !beamRunActive || sawInterEventWhitespace ? "begin" : "mid";
          beamRunActive = true;
        } else {
          beamRunActive = false;
        }
        sawInterEventWhitespace = false;
        beamCursorDiv += resolvedDurationDiv;
      };

      const ensureAbcBodyCursorAdvanced = (beforeIdx, stage) => {
        if (idx > beforeIdx) {
          return;
        }
        const contextText = text.slice(Math.max(0, beforeIdx - 12), Math.min(text.length, beforeIdx + 24));
        throw new Error(
          "line " +
          entry.lineNo +
          ": ABC body parser made no progress at idx " +
          beforeIdx +
          " during " +
          stage +
          ": " +
          contextText
        );
      };

      while (idx < text.length) {
        const beforeIdx = idx;
        const ch = text[idx];

        if (consumeIgnorableBodyChar(ch)) {
          ensureAbcBodyCursorAdvanced(beforeIdx, "consumeIgnorableBodyChar");
          continue;
        }

        const bodyEntry = parseAbcBodyEntryAt(text, idx);

        if (handleBodyEntry(bodyEntry, ch)) {
          ensureAbcBodyCursorAdvanced(beforeIdx, "handleBodyEntry");
          continue;
        }

        if (handleBodyFallback(bodyEntry, ch)) {
          ensureAbcBodyCursorAdvanced(beforeIdx, "handleBodyFallback");
          continue;
        }
      }
      voiceStores.activeEndingByVoice[entry.voiceId] = activeEndingMarker;
      voiceStores.currentKeyFifthsByVoice[entry.voiceId] = activeKeyFifths;
    }

    finalizeAbcActiveEndings(voiceStores);
    applyAbcLyricsToMeasures(lyricEntriesByVoice, voiceStores.measuresByVoice);

    if (noteCount === 0) {
      throw new Error("No notes or rests were found. (line 1)");
    }

    const scoreLayout = parseAbcScoreLayout(lineState.scoreDirective, voiceRegistry.declaredVoiceIds);
    const orderedVoiceIds = scoreLayout.orderedVoiceIds;
    const measureCapacity = Math.max(
      1,
      Math.round((Number(meter.beats) || 4) * (4 / (Number(meter.beatType) || 4)) * 960)
    );
    const importDiagnostics = [];
    const overfullCompatibilityMode = settings?.overfullCompatibilityMode !== false;
    const normalizedVoiceDataById = buildAbcNormalizedVoiceDataById(
      orderedVoiceIds,
      voiceRegistry,
      voiceStores.measuresByVoice,
      measureCapacity,
      overfullCompatibilityMode,
      settings,
      transposeHintByVoiceId,
      keyHintFifthsByKey,
      voiceStores.notationMeasureMetaByVoice,
      measureMetaByKey,
      voiceStores.meterByMeasureByVoice,
      voiceStores.tempoByMeasureByVoice,
      importDiagnostics
    );
    const parts = buildAbcParsedPartsFromLayout(scoreLayout, normalizedVoiceDataById);
    const measureCount = parts.reduce((acc, part) => Math.max(acc, part.measures.length), 0);

    const warningDiagnostics = warnings.map((message) => ({
      level: "warn" as const,
      code: "ABC_IMPORT_WARNING",
      fmt: "abc" as const,
      message,
    }));
    return {
      meta: {
        title: headers.T || settings.defaultTitle,
        composer: headers.C || settings.defaultComposer,
        meter,
        meterText: headers.M || "4/4",
        unitLength,
        unitLengthText: headers.L || "1/8",
        keyInfo,
        keyText: headers.K || "C",
        tempoBpm
      },
      parts,
      measures: parts[0] ? parts[0].measures : [[]],
      voiceCount: parts.length,
      measureCount,
      noteCount,
      warnings,
      diagnostics: warningDiagnostics.concat(importDiagnostics)
    };
  }

  function parseVoiceDirectiveTail(raw) {
    if (!raw) {
      return { name: "", clef: "", transpose: null, bodyText: "", skippedText: "", unsupportedKeys: [] };
    }
    let bodyText = String(raw ?? "");
    let name = "";
    let clef = "";
    let transpose = null;
    const unsupportedKeys = [];
    const bareClefMatch = bodyText.match(/^\s*(bass|treble|alto|tenor|c3|c4)(?=\s|$)/i);
    if (bareClefMatch) {
      clef = String(bareClefMatch[1] ?? "").trim().toLowerCase();
      bodyText = bodyText.slice(bareClefMatch[0].length);
    }
    const attrRegex = /([A-Za-z][A-Za-z0-9_-]*)\s*=\s*("([^"]*)"|(\S+))/g;
    bodyText = bodyText.replace(attrRegex, (_full, key, _quotedValue, quotedInner, bareValue) => {
      const lowerKey = String(key).toLowerCase();
      if (lowerKey === "name") {
        name = quotedInner ?? bareValue ?? "";
      } else if (lowerKey === "clef") {
        clef = String(quotedInner ?? bareValue ?? "").trim().toLowerCase();
      } else if (lowerKey === "transpose") {
        const parsed = Number.parseInt(String(quotedInner ?? bareValue ?? "").trim(), 10);
        if (Number.isFinite(parsed) && parsed >= -24 && parsed <= 24) {
          transpose = { chromatic: parsed };
        }
      } else {
        unsupportedKeys.push(lowerKey);
      }
      return " ";
    });
    bodyText = bodyText.trim();
    let skippedText = "";
    const firstTokenMatch = bodyText.match(/^(\S+)/);
    const firstToken = firstTokenMatch ? firstTokenMatch[1] ?? "" : "";
    if (firstToken && /^[A-Za-z][A-Za-z0-9_-]*$/.test(firstToken) && /[^A-Ga-gzZxX]/.test(firstToken)) {
      skippedText = firstToken;
      bodyText = bodyText.slice(firstToken.length).trim();
    }
    return {
      name: name.trim(),
      clef: clef.trim(),
      transpose,
      bodyText,
      skippedText,
      unsupportedKeys
    };
  }

  function inferTransposeFromPartName(partName) {
    if (!partName) {
      return null;
    }
    const normalized = String(partName).replace(/[♭]/g, "b").replace(/[♯]/g, "#");
    const m = normalized.match(/\bin\s+([A-Ga-g])([#b]?)/);
    if (!m) {
      return null;
    }

    const tonic = String(m[1]).toUpperCase() + (m[2] ?? "");
    const semitoneByTonic = {
      C: 0,
      "C#": 1,
      Db: 1,
      D: 2,
      "D#": 3,
      Eb: 3,
      E: 4,
      F: 5,
      "F#": 6,
      Gb: 6,
      G: 7,
      "G#": 8,
      Ab: 8,
      A: 9,
      "A#": 10,
      Bb: 10,
      B: 11
    };
    if (!Object.prototype.hasOwnProperty.call(semitoneByTonic, tonic)) {
      return null;
    }
    let chromatic = semitoneByTonic[tonic];
    if (chromatic > 6) {
      chromatic -= 12;
    }
    if (chromatic === 0) {
      return null;
    }
    return { chromatic };
  }

  function parseMeter(raw, warnings) {
    const normalized = String(raw ?? "").trim();
    if (normalized === "C") {
      return { beats: 4, beatType: 4 };
    }
    if (normalized === "C|") {
      return { beats: 2, beatType: 2 };
    }
    const m = normalized.match(/^(\d+)\/(\d+)$/);
    if (!m) {
      warnings.push("Invalid meter M: format; defaulted to 4/4: " + raw);
      return { beats: 4, beatType: 4 };
    }
    return { beats: Number(m[1]), beatType: Number(m[2]) };
  }

  function parseFraction(raw, fieldName, warnings) {
    const parsed = abcCommon.parseFractionText(raw, { num: 1, den: 8 });
    if (parsed.num === 1 && parsed.den === 8 && !/^\s*\d+\/\d+\s*$/.test(String(raw ?? ""))) {
      warnings.push(fieldName + " has invalid format; defaulted to 1/8: " + raw);
      return parsed;
    }
    const m = String(raw ?? "").match(/^\s*(\d+)\/(\d+)\s*$/);
    if (!m || !Number(m[1]) || !Number(m[2])) {
      warnings.push(fieldName + " has invalid value; defaulted to 1/8: " + raw);
      return { num: 1, den: 8 };
    }
    return parsed;
  }

  function parseKey(raw, warnings) {
    const key = raw.trim();
    const fifths = abcCommon.fifthsFromAbcKey(key);
    if (fifths !== null) {
      return { fifths };
    }

    warnings.push("K: unsupported key; defaulted to C: " + key);
    return { fifths: 0 };
  }

  function parseLengthToken(token, lineNo) {
    return abcCommon.parseAbcLengthToken(token, lineNo);
  }

  function parseGraceGroupAt(text, startIdx, lineNo, unitLength, keySignatureAccidentals, measureAccidentals, voiceId, warnings) {
    const parsedGrace = parseAbcGraceGroupAt(text, startIdx, lineNo, warnings);
    if (!parsedGrace) return null;
    const graceAccidentals = { ...measureAccidentals };
    const notes = [];
    for (const parsedNote of parsedGrace.notes) {
      const { accidentalText, pitchChar, octaveShift, lengthToken, graceSlash } = parsedNote;
      const len = parseLengthToken(lengthToken, lineNo);
      const absoluteLength = multiplyFractions(unitLength, len);
      const dur = durationInDivisions(absoluteLength, 960);
      if (dur <= 0) {
        warnings.push("line " + lineNo + ": Skipped grace note with invalid length.");
        continue;
      }
      let note;
      try {
        note = buildNoteData(
          pitchChar,
          accidentalText,
          octaveShift,
          absoluteLength,
          dur,
          lineNo,
          keySignatureAccidentals,
          graceAccidentals
        );
      } catch (error) {
        if (error instanceof Error && /Octave out of range/i.test(error.message ?? "")) {
          warnings.push("line " + lineNo + ": Skipped grace note with unsupported octave range.");
          continue;
        }
        throw error;
      }
      note.voice = voiceId;
      note.grace = true;
      note.graceSlash = graceSlash;
      notes.push(note);
    }
    return { notes, nextIdx: parsedGrace.nextIdx };
  }

  function scaleNotesDuration(notes, scale) {
    if (!Array.isArray(notes) || notes.length === 0 || !scale) {
      return;
    }
    for (const note of notes) {
      note.duration = Math.max(1, Math.round(note.duration * (scale.num / scale.den)));
      note.type = typeFromDuration(note.duration, 960);
    }
  }

  function accidentalToAlter(accidental) {
    if (!accidental) {
      return null;
    }
    if (accidental === "=") {
      return 0;
    }
    if (/^\^+$/.test(accidental)) {
      return accidental.length;
    }
    if (/^_+$/.test(accidental)) {
      return -accidental.length;
    }
    return null;
  }

  function buildNoteData(
    pitchChar,
    accidental,
    octaveShift,
    absoluteLength,
    duration,
    lineNo,
    keySignatureAccidentals,
    measureAccidentals
  ) {
    const isRest = /[zZxX]/.test(pitchChar);
    if (isRest) {
      return {
        isRest: true,
        duration,
        type: typeFromFraction(absoluteLength)
      };
    }

    const step = pitchChar.toUpperCase();
    const isLower = /[a-g]/.test(pitchChar);
    let octave = isLower ? 5 : 4;

    for (const ch of octaveShift) {
      if (ch === "'") {
        octave += 1;
      } else if (ch === ",") {
        octave -= 1;
      }
    }

    if (octave < 0 || octave > 9) {
      throw new Error("line " + lineNo + ": Octave out of range");
    }

    let alter = null;
    let accidentalText = null;
    const explicitAlter = accidentalToAlter(accidental);
    if (explicitAlter !== null) {
      alter = explicitAlter;
      if (explicitAlter === 0) {
        accidentalText = "natural";
      } else if (explicitAlter > 0) {
        accidentalText = explicitAlter >= 2 ? "double-sharp" : "sharp";
      } else {
        accidentalText = explicitAlter <= -2 ? "flat-flat" : "flat";
      }
      measureAccidentals[step] = explicitAlter;
    } else {
      let resolvedAlter = 0;
      if (Object.prototype.hasOwnProperty.call(measureAccidentals, step)) {
        resolvedAlter = measureAccidentals[step];
      } else if (Object.prototype.hasOwnProperty.call(keySignatureAccidentals, step)) {
        resolvedAlter = keySignatureAccidentals[step];
      }
      alter = resolvedAlter === 0 ? null : resolvedAlter;
    }

    return {
      isRest: false,
      step,
      octave,
      alter,
      accidentalText,
      duration,
      type: typeFromFraction(absoluteLength)
    };
  }

  function keySignatureAlterByStep(fifths) {
    const map = {};
    const sharpOrder = ["F", "C", "G", "D", "A", "E", "B"];
    const flatOrder = ["B", "E", "A", "D", "G", "C", "F"];
    const f = Number.isFinite(fifths) ? Math.max(-7, Math.min(7, Math.trunc(fifths))) : 0;
    if (f > 0) {
      for (let i = 0; i < f; i += 1) {
        map[sharpOrder[i]] = 1;
      }
    } else if (f < 0) {
      for (let i = 0; i < Math.abs(f); i += 1) {
        map[flatOrder[i]] = -1;
      }
    }
    return map;
  }

  function typeFromFraction(frac) {
    const value = frac.num / frac.den;
    if (value >= 1) {
      return "whole";
    }
    if (value >= 0.5) {
      return "half";
    }
    if (value >= 0.25) {
      return "quarter";
    }
    if (value >= 0.125) {
      return "eighth";
    }
    if (value >= 0.0625) {
      return "16th";
    }
    return "32nd";
  }

  function durationInDivisions(wholeFraction, divisionsPerQuarter) {
    return Math.round((wholeFraction.num / wholeFraction.den) * 4 * divisionsPerQuarter);
  }

  function typeFromDuration(duration, divisionsPerQuarter) {
    const whole = Number(duration) / (4 * divisionsPerQuarter);
    if (whole >= 1) {
      return "whole";
    }
    if (whole >= 0.5) {
      return "half";
    }
    if (whole >= 0.25) {
      return "quarter";
    }
    if (whole >= 0.125) {
      return "eighth";
    }
    if (whole >= 0.0625) {
      return "16th";
    }
    return "32nd";
  }

  function normalizeMeasuresToCapacity(measures, capacity) {
    if (!Array.isArray(measures) || measures.length === 0) {
      return { measures: [[]], diagnostics: [] };
    }
    if (!Number.isFinite(capacity) || capacity <= 0) {
      return { measures, diagnostics: [] };
    }

    const normalized = [];
    let carry = [];
    let measureIdx = 0;
    const diagnostics = [];

    while (measureIdx < measures.length || carry.length > 0) {
      const source = measureIdx < measures.length ? measures[measureIdx] : [];
      measureIdx += 1;
      const events = carry.concat(Array.isArray(source) ? source : []);
      carry = [];

      const out = [];
      let occupied = 0;

      for (let i = 0; i < events.length; i += 1) {
        const note = events[i];
        if (!note || typeof note !== "object") continue;

        if (note.chord) {
          if (out.length === 0) {
            out.push({ ...note, chord: false });
          } else {
            out.push(note);
          }
          continue;
        }

        // Grace notes are notation-time ornaments and should not consume measure capacity.
        const duration = note.grace
          ? 0
          : Math.max(1, Math.round(Number(note.duration) || 1));
        if (occupied + duration <= capacity || out.length === 0) {
          out.push(note);
          occupied += duration;
          continue;
        }

        carry = events.slice(i);
        diagnostics.push({
          sourceMeasure: normalized.length + 1,
          movedEvents: Math.max(1, carry.length),
        });
        break;
      }

      normalized.push(out);
    }

    while (normalized.length > 1 && normalized[normalized.length - 1].length === 0) {
      normalized.pop();
    }
    return {
      measures: normalized.length > 0 ? normalized : [[]],
      diagnostics,
    };
  }

export const AbcCompatParser = {
  parseForMusicXml
};

declare global {
  interface Window {
    AbcCompatParser?: typeof AbcCompatParser;
  }
}

if (typeof window !== "undefined") {
  window.AbcCompatParser = AbcCompatParser;
}

const abcClefFromMusicXmlClef = (clef: Element | null): string => {
  if (!clef) return "";
  const sign = clef.querySelector(":scope > sign")?.textContent?.trim().toUpperCase() ?? "";
  const line = Number(clef.querySelector(":scope > line")?.textContent?.trim() ?? "");
  if (sign === "F" && line === 4) return "bass";
  if (sign === "G" && line === 2) return "treble";
  if (sign === "C" && line === 3) return "alto";
  if (sign === "C" && line === 4) return "tenor";
  return "";
};

const abcClefFromMusicXmlPart = (part: Element): string =>
  abcClefFromMusicXmlClef(part.querySelector(":scope > measure > attributes > clef"));

const resolveAbcExportLaneClef = (
  part: Element,
  measures: Element[],
  staff: string | null
): string => {
  if (!staff) return abcClefFromMusicXmlPart(part);
  for (const measure of measures) {
    const clef = measure.querySelector(`:scope > attributes > clef[number="${staff}"]`);
    const abcClef = abcClefFromMusicXmlClef(clef);
    if (abcClef) return abcClef;
  }
  return abcClefFromMusicXmlPart(part);
};

const musicXmlKeySignatureAlterByStep = (fifthsValue: number): Record<string, number> => {
  const map: Record<string, number> = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  const sharpOrder = ["F", "C", "G", "D", "A", "E", "B"] as const;
  const flatOrder = ["B", "E", "A", "D", "G", "C", "F"] as const;
  const safeFifths = Math.max(-7, Math.min(7, Math.round(fifthsValue)));
  if (safeFifths > 0) {
    for (let i = 0; i < safeFifths; i += 1) map[sharpOrder[i]] = 1;
  } else if (safeFifths < 0) {
    for (let i = 0; i < Math.abs(safeFifths); i += 1) map[flatOrder[i]] = -1;
  }
  return map;
};

const musicXmlAccidentalTextToAlter = (text: string): number | null => {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "sharp") return 1;
  if (normalized === "flat") return -1;
  if (normalized === "natural") return 0;
  if (normalized === "double-sharp") return 2;
  if (normalized === "flat-flat") return -2;
  return null;
};

const parseOptionalMusicXmlNumber = (text: string | null | undefined): number | null => {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

type AbcExportLaneDefinition = {
  staff: string | null;
  voice: string | null;
  voiceId: string;
};

const compareAbcExportLanes = (
  a: { staff: string | null; voice: string | null },
  b: { staff: string | null; voice: string | null }
): number => {
  const staffA = a.staff === null ? Number.POSITIVE_INFINITY : Number(a.staff);
  const staffB = b.staff === null ? Number.POSITIVE_INFINITY : Number(b.staff);
  if (staffA !== staffB) return staffA - staffB;
  const voiceANum = a.voice !== null ? Number(a.voice) : Number.POSITIVE_INFINITY;
  const voiceBNum = b.voice !== null ? Number(b.voice) : Number.POSITIVE_INFINITY;
  if (Number.isFinite(voiceANum) && Number.isFinite(voiceBNum) && voiceANum !== voiceBNum) {
    return voiceANum - voiceBNum;
  }
  const voiceA = a.voice ?? "";
  const voiceB = b.voice ?? "";
  return voiceA.localeCompare(voiceB);
};

const buildAbcExportLaneDefinitions = (part: Element, partId: string): AbcExportLaneDefinition[] => {
  const laneMap = new Map<string, { staff: string | null; voice: string | null }>();
  for (const note of Array.from(part.querySelectorAll(":scope > measure > note"))) {
    const staffText = note.querySelector(":scope > staff")?.textContent?.trim() ?? "";
    const voiceText = note.querySelector(":scope > voice")?.textContent?.trim() ?? "";
    const staff = staffText ? staffText : null;
    const voice = voiceText ? voiceText : "1";
    const key = `${staff ?? ""}::${voice ?? ""}`;
    if (!laneMap.has(key)) {
      laneMap.set(key, { staff, voice });
    }
  }
  const rawLanes =
    laneMap.size > 0 ? Array.from(laneMap.values()) : [{ staff: null as string | null, voice: null as string | null }];
  return rawLanes
    .sort(compareAbcExportLanes)
    .map((lane, laneIndex) => {
      if (rawLanes.length === 1) {
        return { ...lane, voiceId: partId };
      }
      const staffSuffix = lane.staff ? `_s${lane.staff}` : "";
      const voiceSuffix = lane.voice ? `_v${lane.voice}` : "";
      return { ...lane, voiceId: `${partId}${staffSuffix}${voiceSuffix || `_l${laneIndex + 1}`}` };
    });
};

const buildAbcExportTransposeMetaLine = (
  normalizedVoiceId: string,
  measure: Element
): string | null => {
  const transposeNode = measure.querySelector(":scope > attributes > transpose");
  if (!transposeNode) return null;
  const chromatic = Number(transposeNode.querySelector(":scope > chromatic")?.textContent?.trim() ?? "");
  const diatonic = Number(transposeNode.querySelector(":scope > diatonic")?.textContent?.trim() ?? "");
  return Number.isFinite(chromatic) || Number.isFinite(diatonic)
    ? [
        `%@mks transpose voice=${normalizedVoiceId}`,
        ...(Number.isFinite(chromatic) ? [`chromatic=${Math.round(chromatic)}`] : []),
        ...(Number.isFinite(diatonic) ? [`diatonic=${Math.round(diatonic)}`] : []),
      ].join(" ")
    : null;
};

const buildAbcExportDiagMetaLines = (
  normalizedVoiceId: string,
  measure: Element,
  safeMeasureNumber: number
): string[] => {
  const fields = Array.from(
    measure.querySelectorAll(
      ':scope > attributes > miscellaneous > miscellaneous-field[name^="mks:diag:"]'
    )
  );
  if (!fields.length) return [];
  const byName = new Map<string, string>();
  for (const field of fields) {
    const name = (field.getAttribute("name") ?? "").trim();
    if (!name) continue;
    const value = (field.textContent ?? "").trim();
    byName.set(name, value);
  }
  const orderedNames = Array.from(byName.keys()).sort((a, b) => {
    const isCountA = a === "mks:diag:count";
    const isCountB = b === "mks:diag:count";
    if (isCountA && !isCountB) return -1;
    if (!isCountA && isCountB) return 1;
    return a.localeCompare(b);
  });
  return orderedNames.map(
    (name) =>
      `%@mks diag voice=${normalizedVoiceId} measure=${safeMeasureNumber} name=${name} enc=uri-v1 value=${encodeURIComponent(
        byName.get(name) ?? ""
      )}`
  );
};

const buildAbcExportMeasureMetaLine = (
  normalizedVoiceId: string,
  measure: Element,
  safeMeasureNumber: number,
  hasRightRepeat: boolean,
  rightEndingNumber: string,
  rightEndingType: string
): string | null => {
  const rawMeasureNumber = (measure.getAttribute("number") ?? "").trim() || String(safeMeasureNumber);
  const implicitAttr = (measure.getAttribute("implicit") ?? "").trim().toLowerCase();
  const isImplicit = implicitAttr === "yes" || implicitAttr === "true" || implicitAttr === "1";
  const rightRepeatNode = measure.querySelector(':scope > barline[location="right"] > repeat');
  const repeatTimes = Number.parseInt(String(rightRepeatNode?.getAttribute("times") ?? ""), 10);
  if (
    !isImplicit &&
    rawMeasureNumber === String(safeMeasureNumber) &&
    (!hasRightRepeat || !Number.isFinite(repeatTimes) || repeatTimes <= 2) &&
    (!rightEndingNumber || rightEndingType !== "discontinue")
  ) {
    return null;
  }
  const metaChunks = [
    `%@mks measure voice=${normalizedVoiceId} measure=${safeMeasureNumber}`,
    `number=${rawMeasureNumber}`,
    `implicit=${isImplicit ? 1 : 0}`,
  ];
  if (hasRightRepeat && Number.isFinite(repeatTimes) && repeatTimes > 2) {
    metaChunks.push(`times=${Math.round(repeatTimes)}`);
  }
  if (rightEndingNumber && rightEndingType === "discontinue") {
    metaChunks.push(`ending-stop=${rightEndingNumber}`);
    metaChunks.push(`ending-type=${rightEndingType}`);
  }
  return metaChunks.join(" ");
};

const applyAbcExportDirectionToPending = (
  direction: Element,
  pendingDirectionWords: string[],
  pendingDirectionDecorations: string[],
  activeWedgeType: "" | "crescendo" | "diminuendo"
): "" | "crescendo" | "diminuendo" => {
  appendAbcExportDirectionWords(direction, pendingDirectionWords);
  appendAbcExportDirectionTextDecorations(direction, pendingDirectionDecorations);
  appendAbcExportDirectionSoundDecorations(direction, pendingDirectionDecorations);
  return appendAbcExportDirectionFeatureDecorations(direction, pendingDirectionDecorations, activeWedgeType);
};

const appendAbcExportDirectionWords = (direction: Element, pendingDirectionWords: string[]): void => {
  pendingDirectionWords.push(
    ...extractMusicXmlDirectionWords(direction)
      .map((feature) => abcQuotedTextEscape(feature.text))
      .filter((word) => word.length > 0)
  );
};

const appendAbcExportDirectionTextDecorations = (direction: Element, pendingDirectionDecorations: string[]): void => {
  for (const rehearsalText of Array.from(direction.querySelectorAll(":scope > direction-type > rehearsal"))
    .map((node) => abcQuotedTextEscape(node.textContent ?? ""))
    .filter((text) => text.length > 0)) {
    appendAbcExportDirectionPresenceDecoration(
      pendingDirectionDecorations,
      true,
      `!rehearsal:${rehearsalText}!`
    );
  }
};

const appendAbcExportDirectionSoundDecorations = (direction: Element, pendingDirectionDecorations: string[]): void => {
  appendAbcExportDirectionMarkerDecorations(direction, pendingDirectionDecorations);
  appendAbcExportDirectionJumpDecorations(direction, pendingDirectionDecorations);
};

const appendAbcExportDirectionMarkerDecorations = (direction: Element, pendingDirectionDecorations: string[]): void => {
  appendAbcExportDirectionPresenceDecorations(pendingDirectionDecorations, [
    [direction.querySelector(":scope > direction-type > segno") !== null, "!segno!"],
    [direction.querySelector(":scope > direction-type > coda") !== null, "!coda!"],
    [direction.querySelector(':scope > sound[fine="yes"]') !== null, "!fine!"],
  ]);
};

const appendAbcExportDirectionJumpDecorations = (direction: Element, pendingDirectionDecorations: string[]): void => {
  appendAbcExportDirectionDaCapoDecorations(direction, pendingDirectionDecorations);
  appendAbcExportDirectionDalSegnoDecorations(direction, pendingDirectionDecorations);
  appendAbcExportDirectionToCodaDecorations(direction, pendingDirectionDecorations);
};

const appendAbcExportDirectionDaCapoDecorations = (direction: Element, pendingDirectionDecorations: string[]): void => {
  const hasDaCapo = direction.querySelector(':scope > sound[dacapo="yes"]') !== null;
  const hasToCoda = direction.querySelector(":scope > sound[tocoda]") !== null;
  appendAbcExportDirectionPresenceDecoration(
    pendingDirectionDecorations,
    hasDaCapo && hasToCoda,
    "!dacoda!"
  );
  appendAbcExportDirectionPresenceDecoration(pendingDirectionDecorations, hasDaCapo && !hasToCoda, "!dacapo!");
};

const appendAbcExportDirectionDalSegnoDecorations = (direction: Element, pendingDirectionDecorations: string[]): void => {
  appendAbcExportDirectionPresenceDecoration(
    pendingDirectionDecorations,
    direction.querySelector(":scope > sound[dalsegno]") !== null,
    "!dalsegno!"
  );
};

const appendAbcExportDirectionToCodaDecorations = (direction: Element, pendingDirectionDecorations: string[]): void => {
  appendAbcExportDirectionPresenceDecoration(
    pendingDirectionDecorations,
    direction.querySelector(":scope > sound[tocoda]") !== null && direction.querySelector(':scope > sound[dacapo="yes"]') === null,
    "!tocoda!"
  );
};

const appendAbcExportDirectionFeatureDecorations = (
  direction: Element,
  pendingDirectionDecorations: string[],
  activeWedgeType: "" | "crescendo" | "diminuendo"
): "" | "crescendo" | "diminuendo" => {
  const directionFeatures = extractMusicXmlDirectionFeatures(direction);
  appendAbcExportDirectionDynamicDecorations(directionFeatures, pendingDirectionDecorations);
  return appendAbcExportDirectionWedgeDecorations(directionFeatures, pendingDirectionDecorations, activeWedgeType);
};

const appendAbcExportDirectionWedgeDecorations = (
  directionFeatures: AbcExportDirectionFeatures,
  pendingDirectionDecorations: string[],
  activeWedgeType: "" | "crescendo" | "diminuendo"
): "" | "crescendo" | "diminuendo" =>
  appendAbcExportDirectionWedgeStopDecorations(
    directionFeatures,
    pendingDirectionDecorations,
    appendAbcExportDirectionWedgeStartDecorations(directionFeatures, pendingDirectionDecorations, activeWedgeType)
  );

const appendAbcExportDirectionWedgeStartDecorations = (
  directionFeatures: AbcExportDirectionFeatures,
  pendingDirectionDecorations: string[],
  activeWedgeType: "" | "crescendo" | "diminuendo"
): "" | "crescendo" | "diminuendo" => {
  const crescendoWedgeType = appendAbcExportDirectionWedgeMatch(
    directionFeatures,
    pendingDirectionDecorations,
    activeWedgeType,
    (feature) => feature.kind === "wedge" && feature.wedgeType === "crescendo",
    "!crescendo(!",
    "crescendo"
  );
  return appendAbcExportDirectionWedgeMatch(
    directionFeatures,
    pendingDirectionDecorations,
    crescendoWedgeType,
    (feature) => feature.kind === "wedge" && feature.wedgeType === "diminuendo",
    "!diminuendo(!",
    "diminuendo"
  );
};

const appendAbcExportDirectionWedgeStopDecorations = (
  directionFeatures: AbcExportDirectionFeatures,
  pendingDirectionDecorations: string[],
  activeWedgeType: "" | "crescendo" | "diminuendo"
): "" | "crescendo" | "diminuendo" => {
  let nextWedgeType = activeWedgeType;
  for (const feature of directionFeatures) {
    if (feature.kind === "wedge" && feature.wedgeType === "stop") {
      pendingDirectionDecorations.push(nextWedgeType === "diminuendo" ? "!diminuendo)!" : "!crescendo)!");
      nextWedgeType = "";
    }
  }
  return nextWedgeType;
};

const appendAbcExportDirectionWedgeMatch = (
  directionFeatures: AbcExportDirectionFeatures,
  pendingDirectionDecorations: string[],
  activeWedgeType: "" | "crescendo" | "diminuendo",
  predicate: (feature: AbcExportDirectionFeature) => boolean,
  decoration: string,
  nextWedgeType: "" | "crescendo" | "diminuendo"
): "" | "crescendo" | "diminuendo" => {
  let result = activeWedgeType;
  for (const feature of directionFeatures) {
    if (predicate(feature)) {
      pendingDirectionDecorations.push(decoration);
      result = nextWedgeType;
    }
  }
  return result;
};

const appendAbcExportDirectionDynamicDecorations = (
  directionFeatures: AbcExportDirectionFeatures,
  pendingDirectionDecorations: string[]
): void => {
  appendAbcExportDirectionSfzDecorations(directionFeatures, pendingDirectionDecorations);
  appendAbcExportDirectionStandardDynamicDecorations(directionFeatures, pendingDirectionDecorations);
};

const appendAbcExportDirectionSfzDecorations = (
  directionFeatures: AbcExportDirectionFeatures,
  pendingDirectionDecorations: string[]
): void => {
  appendAbcExportDirectionFeatureMatches(
    directionFeatures,
    pendingDirectionDecorations,
    (feature) => feature.kind === "dynamic" && feature.mark === "sfz",
    () => "!sfz!"
  );
};

const appendAbcExportDirectionStandardDynamicDecorations = (
  directionFeatures: AbcExportDirectionFeatures,
  pendingDirectionDecorations: string[]
): void => {
  appendAbcExportDirectionFeatureMatches(
    directionFeatures,
    pendingDirectionDecorations,
    (feature) => feature.kind === "dynamic" && feature.mark !== "sfz",
    (feature) => `!${feature.mark}!`
  );
};

const appendAbcExportDirectionPresenceDecoration = (
  pendingDirectionDecorations: string[],
  hasDecoration: boolean,
  decoration: string
): void => {
  if (hasDecoration) {
    pendingDirectionDecorations.push(decoration);
  }
};

const appendAbcExportDirectionPresenceDecorations = (
  pendingDirectionDecorations: string[],
  entries: Array<[boolean, string]>
): void => {
  for (const [hasDecoration, decoration] of entries) {
    appendAbcExportDirectionPresenceDecoration(pendingDirectionDecorations, hasDecoration, decoration);
  }
};

const appendAbcExportDirectionFeatureMatches = <T extends AbcExportDirectionFeature>(
  directionFeatures: T[],
  pendingDirectionDecorations: string[],
  predicate: (feature: T) => boolean,
  decorationFromFeature: (feature: T) => string
): void => {
  for (const feature of directionFeatures) {
    if (predicate(feature)) {
      pendingDirectionDecorations.push(decorationFromFeature(feature));
    }
  }
};

const isMusicXmlNoteInAbcExportLane = (
  note: Element,
  lane: Pick<AbcExportLaneDefinition, "staff" | "voice">
): boolean => {
  if (lane.staff) {
    const noteStaff = note.querySelector(":scope > staff")?.textContent?.trim() ?? "";
    if (noteStaff !== lane.staff) return false;
  }
  if (lane.voice) {
    const noteVoiceRaw = note.querySelector(":scope > voice")?.textContent?.trim() ?? "";
    const noteVoice = noteVoiceRaw || "1";
    if (noteVoice !== lane.voice) return false;
  }
  return true;
};

const buildAbcExportPitchToken = (
  note: Element,
  keyAlterMap: Record<string, number>,
  measureAccidentalByStepOctave: Map<string, number>
): string => {
  if (note.querySelector(":scope > rest")) return "z";
  const step = note.querySelector(":scope > pitch > step")?.textContent?.trim() || "C";
  const octave = Number(note.querySelector(":scope > pitch > octave")?.textContent?.trim() || "4");
  const upperStep = /^[A-G]$/.test(step.toUpperCase()) ? step.toUpperCase() : "C";
  const safeOctave = Number.isFinite(octave) ? Math.max(0, Math.min(9, Math.round(octave))) : 4;
  const stepOctaveKey = `${upperStep}${safeOctave}`;

  const alterRaw = note.querySelector(":scope > pitch > alter")?.textContent?.trim() ?? "";
  const explicitAlter =
    alterRaw !== "" && Number.isFinite(Number(alterRaw)) ? Math.round(Number(alterRaw)) : null;
  const accidentalNode = note.querySelector(":scope > accidental");
  const accidentalText = accidentalNode?.textContent?.trim() ?? "";
  const accidentalAlter = musicXmlAccidentalTextToAlter(accidentalText);
  const accidentalEditorial = ((accidentalNode?.getAttribute("editorial") ?? "").trim().toLowerCase() === "yes");
  const accidentalCautionary = ((accidentalNode?.getAttribute("cautionary") ?? "").trim().toLowerCase() === "yes");

  const keyAlter = keyAlterMap[upperStep] ?? 0;
  const currentAlter = measureAccidentalByStepOctave.has(stepOctaveKey)
    ? measureAccidentalByStepOctave.get(stepOctaveKey) ?? 0
    : keyAlter;

  // In MusicXML pitch, omitted <alter> means natural (0), not "follow key accidental".
  // Key signature context is only used to decide whether an explicit accidental token is needed.
  let targetAlter = explicitAlter !== null ? explicitAlter : 0;
  if (accidentalAlter !== null) {
    targetAlter = accidentalAlter;
  }

  // Keep explicit non-natural accidentals (e.g. cautionary sharp/flat),
  // but avoid emitting redundant naturals when pitch is already natural in context.
  const shouldEmitAccidental =
    targetAlter !== currentAlter || (accidentalAlter !== null && accidentalAlter !== 0);
  const accidental = shouldEmitAccidental
    ? (targetAlter === 0 ? "=" : AbcCommon.accidentalFromAlter(targetAlter))
    : "";
  measureAccidentalByStepOctave.set(stepOctaveKey, targetAlter);
  let pitchToken = `${accidental}${AbcCommon.abcPitchFromStepOctave(step, Number.isFinite(octave) ? octave : 4)}`;
  if (accidentalEditorial && accidental) {
    pitchToken = `!editorial!${pitchToken}`;
  }
  if (accidentalCautionary && accidental) {
    pitchToken = `!courtesy!${pitchToken}`;
  }
  return pitchToken;
};

const appendAbcExportGraceToken = (
  pendingGraceTokens: string[],
  pitchToken: string,
  len: string,
  hasTieStart: boolean,
  hasGraceSlash: boolean,
  isChord: boolean
): void => {
  const graceSlashPrefix = hasGraceSlash ? "/" : "";
  if (!isChord || pendingGraceTokens.length === 0) {
    pendingGraceTokens.push(`${graceSlashPrefix}${pitchToken}${len}${hasTieStart ? "-" : ""}`);
    return;
  }
  const last = pendingGraceTokens.pop() ?? "";
  const merged = last.startsWith("[")
    ? last.replace("]", `${graceSlashPrefix}${pitchToken}]`)
    : `[${last}${graceSlashPrefix}${pitchToken}]`;
  pendingGraceTokens.push(merged);
};

type AbcExportTimeModification = {
  actual: number;
  normal: number;
};

type AbcExportActiveTuplet = {
  actual: number;
  normal: number;
  remaining: number;
};

type AbcExportOrnamentPrefixInfo = {
  prefix: string;
  hasTrill: boolean;
  trillAccidentalText: string;
};

type AbcExportDirectionFeature = ReturnType<typeof extractMusicXmlDirectionFeatures>[number];
type AbcExportDirectionFeatures = AbcExportDirectionFeature[];
type AbcExportOrnamentFeature = ReturnType<typeof extractMusicXmlOrnamentFeatures>[number];
type AbcExportOrnamentFeatures = AbcExportOrnamentFeature[];
type AbcExportTremoloOrnamentFeature = Extract<AbcExportOrnamentFeature, { kind: "tremolo" }>;

type AbcExportPendingEvent = {
  pitches: string[];
  len: string;
  tie: boolean;
  slurStop: boolean;
  prefix: string;
};

type AbcExportNoteEventInfo = {
  isChord: boolean;
  isGrace: boolean;
  hasTieStart: boolean;
  ornamentPrefixInfo: AbcExportOrnamentPrefixInfo;
  hasSlurStart: boolean;
  hasSlurStop: boolean;
  hasGraceSlash: boolean;
  hasTupletStart: boolean;
  timeModification: AbcExportTimeModification | null;
  len: string;
};

type AbcExportMeasureBoundaryInfo = {
  hasLeftRepeat: boolean;
  hasRightRepeat: boolean;
  leftEndingNumber: string;
  rightEndingNumber: string;
  rightEndingType: string;
};

type AbcExportMeasureState = {
  currentDivisions: number;
  currentFifths: number;
  currentBeats: number;
  currentBeatType: number;
};

type AbcExportPendingEventUpdateResult = {
  pending: AbcExportPendingEvent | null;
  eventNo: number;
};

type AbcExportNonNoteChildDispatchResult = {
  handled: boolean;
  activeWedgeType: "" | "crescendo" | "diminuendo";
};

type AbcExportPostNoteEventState = {
  activeTuplet: AbcExportActiveTuplet | null;
  pendingLyricExtension: boolean;
};

type AbcExportNoteChildProcessContext = {
  child: Element;
  lane: AbcExportLaneDefinition;
  currentDivisions: number;
  unitLength: Fraction;
  keyAlterMap: Record<string, number>;
  measureAccidentalByStepOctave: Map<string, number>;
  pendingGraceTokens: string[];
  activeTuplet: AbcExportActiveTuplet | null;
  pendingHarmonySymbols: string[];
  pendingDirectionWords: string[];
  pendingDirectionDecorations: string[];
  pending: AbcExportPendingEvent | null;
  tokens: string[];
  eventNo: number;
  metaLines: string[];
  normalizedVoiceId: string;
  measure: Element;
  fallbackMeasureNumber: number;
  lyricTokens: string[];
  pendingLyricExtension: boolean;
};

type AbcExportNoteChildProcessResult = {
  handled: boolean;
  pending: AbcExportPendingEvent | null;
  eventNo: number;
  activeTuplet: AbcExportActiveTuplet | null;
  pendingLyricExtension: boolean;
};

type AbcExportMeasureChildrenContext = {
  measure: Element;
  lane: AbcExportLaneDefinition;
  currentDivisions: number;
  unitLength: Fraction;
  keyAlterMap: Record<string, number>;
  measureAccidentalByStepOctave: Map<string, number>;
  tokens: string[];
  metaLines: string[];
  normalizedVoiceId: string;
  fallbackMeasureNumber: number;
  lyricTokens: string[];
  pendingLyricExtension: boolean;
};

type AbcExportMeasureChildrenResult = {
  pending: AbcExportPendingEvent | null;
  pendingGraceTokens: string[];
  pendingLyricExtension: boolean;
};

type AbcExportMeasureChildProcessingState = {
  lane: AbcExportLaneDefinition;
  currentDivisions: number;
  unitLength: Fraction;
  keyAlterMap: Record<string, number>;
  measureAccidentalByStepOctave: Map<string, number>;
  pendingGraceTokens: string[];
  pendingHarmonySymbols: string[];
  pendingDirectionWords: string[];
  pendingDirectionDecorations: string[];
  tokens: string[];
  metaLines: string[];
  normalizedVoiceId: string;
  measure: Element;
  fallbackMeasureNumber: number;
  lyricTokens: string[];
  pending: AbcExportPendingEvent | null;
  eventNo: number;
  activeTuplet: AbcExportActiveTuplet | null;
  pendingLyricExtension: boolean;
  activeWedgeType: "" | "crescendo" | "diminuendo";
};

type AbcExportMeasureRenderContext = {
  measure: Element;
  lane: AbcExportLaneDefinition;
  measureState: AbcExportMeasureState;
  lastEmittedKeyFifths: number | null;
  unitLength: Fraction;
  metaLines: string[];
  normalizedVoiceId: string;
  fallbackMeasureNumber: number;
  lyricTokens: string[];
  pendingLyricExtension: boolean;
};

type AbcExportMeasureRenderResult = {
  measureText: string;
  measureState: AbcExportMeasureState;
  lastEmittedKeyFifths: number;
  pendingLyricExtension: boolean;
};

type AbcExportLaneBodyRenderResult = {
  measureTexts: string[];
  lyricTokens: string[];
};

type AbcExportLaneBodyRenderingState = {
  measureState: AbcExportMeasureState;
  lastEmittedKeyFifths: number | null;
  measureTexts: string[];
  lyricTokens: string[];
  pendingLyricExtension: boolean;
};

type AbcExportLaneRenderContext = {
  part: Element;
  partName: string;
  measures: Element[];
  laneDefs: AbcExportLaneDefinition[];
  lane: AbcExportLaneDefinition;
  fifths: number;
  meterBeats: string;
  meterBeatType: string;
  unitLength: Fraction;
  headerLines: string[];
  bodyLines: string[];
  metaLines: string[];
};

type AbcExportPartRenderContext = {
  part: Element;
  partIndex: number;
  partNameById: Map<string, string>;
  fifths: number;
  meterBeats: string;
  meterBeatType: string;
  unitLength: Fraction;
  headerLines: string[];
  bodyLines: string[];
  metaLines: string[];
};

type AbcExportPartRenderInfo = {
  partName: string;
  measures: Element[];
  laneDefs: AbcExportLaneDefinition[];
};

type AbcExportDocumentHeaderInfo = {
  title: string;
  composer: string;
  meterBeats: string;
  meterBeatType: string;
  fifths: number;
  key: string;
  abcTempoHeader: string;
};

type AbcExportDocumentCredits = {
  title: string;
  composer: string;
};

type AbcExportDocumentMeterKeyInfo = {
  meterBeats: string;
  meterBeatType: string;
  fifths: number;
  key: string;
};

type AbcExportDocumentMeterInfo = {
  meterBeats: string;
  meterBeatType: string;
};

type AbcExportDocumentKeyInfo = {
  fifths: number;
  key: string;
};

type AbcExportInitialTempo = {
  bpm: number;
  unit: Fraction | null;
};

type AbcExportDocumentContext = {
  headerLines: string[];
  bodyLines: string[];
  metaLines: string[];
  partNameById: Map<string, string>;
  fifths: number;
  meterBeats: string;
  meterBeatType: string;
  unitLength: Fraction;
};

const readAbcExportTimeModification = (note: Element): AbcExportTimeModification | null => {
  const actual = Number(note.querySelector(":scope > time-modification > actual-notes")?.textContent?.trim() ?? "");
  const normal = Number(note.querySelector(":scope > time-modification > normal-notes")?.textContent?.trim() ?? "");
  if (!Number.isFinite(actual) || actual <= 0 || !Number.isFinite(normal) || normal <= 0) return null;
  return { actual: Math.round(actual), normal: Math.round(normal) };
};

const buildAbcExportLengthToken = (
  noteDuration: number,
  currentDivisions: number,
  unitLength: Fraction,
  timeModification: AbcExportTimeModification | null
): string => {
  const rawWholeFraction = AbcCommon.reduceFraction(noteDuration, currentDivisions * 4, { num: 1, den: 4 });
  const abcBaseWholeFraction = timeModification
    ? AbcCommon.multiplyFractions(rawWholeFraction, {
        num: timeModification.actual,
        den: timeModification.normal
      }, { num: 1, den: 4 })
    : rawWholeFraction;
  const lenRatio = AbcCommon.divideFractions(abcBaseWholeFraction, unitLength, { num: 1, den: 1 });
  return AbcCommon.abcLengthTokenFromFraction(lenRatio);
};

const updateAbcExportActiveTupletBeforeEvent = (
  activeTuplet: AbcExportActiveTuplet | null,
  hasTupletStart: boolean,
  timeModification: AbcExportTimeModification | null,
  isChord: boolean
): AbcExportActiveTuplet | null => {
  if (isChord || !timeModification) return activeTuplet;
  if (hasTupletStart || !activeTuplet) {
    return {
      actual: timeModification.actual,
      normal: timeModification.normal,
      remaining: timeModification.actual,
    };
  }
  return activeTuplet;
};

const buildAbcExportTupletPrefix = (activeTuplet: AbcExportActiveTuplet | null, isChord: boolean): string =>
  isChord || !activeTuplet || activeTuplet.remaining !== activeTuplet.actual
    ? ""
    : `(${activeTuplet.actual}:${activeTuplet.normal}:${activeTuplet.actual}`;

const advanceAbcExportActiveTupletAfterEvent = (
  activeTuplet: AbcExportActiveTuplet | null,
  isChord: boolean
): AbcExportActiveTuplet | null => {
  if (isChord || !activeTuplet) return activeTuplet;
  activeTuplet.remaining -= 1;
  return activeTuplet.remaining <= 0 ? null : activeTuplet;
};

const takeAbcExportQueuedEventPrefix = (
  isChord: boolean,
  pendingHarmonySymbols: string[],
  pendingDirectionWords: string[],
  pendingDirectionDecorations: string[],
  pendingGraceTokens: string[]
): string => {
  return [
    buildAbcExportPendingHarmonyPrefix(isChord, pendingHarmonySymbols),
    buildAbcExportPendingWordsPrefix(isChord, pendingDirectionWords),
    buildAbcExportPendingDirectionDecorationPrefix(isChord, pendingDirectionDecorations),
    buildAbcExportPendingGracePrefix(pendingGraceTokens),
  ].join("");
};

const buildAbcExportPendingHarmonyPrefix = (isChord: boolean, pendingHarmonySymbols: string[]): string =>
  takeAbcExportPendingTextPrefix({
    isChord,
    pending: pendingHarmonySymbols,
    buildPrefix: (items) => items.map((item) => `"${abcQuotedTextEscape(item)}"`).join(""),
  });

const buildAbcExportPendingWordsPrefix = (isChord: boolean, pendingDirectionWords: string[]): string =>
  takeAbcExportPendingTextPrefix({
    isChord,
    pending: pendingDirectionWords,
    buildPrefix: (items) => items.map((item) => `"${item}"`).join(""),
  });

const buildAbcExportPendingDirectionDecorationPrefix = (
  isChord: boolean,
  pendingDirectionDecorations: string[]
): string =>
  takeAbcExportPendingTextPrefix({
    isChord,
    pending: pendingDirectionDecorations,
    buildPrefix: (items) => items.join(""),
  });

const buildAbcExportPendingGracePrefix = (pendingGraceTokens: string[]): string =>
  takeAbcExportPendingTextPrefix({
    isChord: false,
    pending: pendingGraceTokens,
    buildPrefix: (items) => `{${items.join("")}}`,
  });

const takeAbcExportPendingTextPrefix = (options: {
  isChord: boolean;
  pending: string[];
  buildPrefix: (items: string[]) => string;
}): string => {
  const prefix = !options.isChord && options.pending.length > 0 ? options.buildPrefix(options.pending) : "";
  clearAbcExportPendingIfConsumed(options.isChord, options.pending);
  return prefix;
};

const clearAbcExportPendingIfConsumed = (isChord: boolean, pending: string[]): void => {
  if (!isChord && pending.length > 0) {
    pending.length = 0;
  }
};

const buildAbcExportTrillMetaLine = (
  normalizedVoiceId: string,
  measure: Element,
  fallbackMeasureNumber: number,
  eventNo: number,
  trillAccidentalText: string
): string => {
  const measureNumber = measure.getAttribute("number") || fallbackMeasureNumber;
  return `%@mks trill voice=${normalizedVoiceId} measure=${measureNumber} event=${eventNo} upper=${trillAccidentalText}`;
};

const buildAbcExportOrnamentPrefixInfo = (note: Element): AbcExportOrnamentPrefixInfo => {
  const ornamentFeatures = extractMusicXmlOrnamentFeatures(note);
  const ornamentKinds = new Set(ornamentFeatures.map((feature) => feature.kind));
  const trillInfo = buildAbcExportOrnamentTrillPrefix(note, ornamentKinds);
  return {
    prefix: buildAbcExportOrnamentPrefixText(
      trillInfo.prefix,
      buildAbcExportOrnamentTurnPrefix(ornamentFeatures, ornamentKinds),
      buildAbcExportOrnamentMordentPrefix(ornamentKinds),
      buildAbcExportOrnamentTremoloPrefix(ornamentFeatures),
      buildAbcExportOrnamentMotionPrefix(note, ornamentKinds)
    ),
    hasTrill: trillInfo.hasTrill,
    trillAccidentalText: buildAbcExportOrnamentTrillAccidentalText(note),
  };
};

const buildAbcExportOrnamentPrefixText = (
  trillPrefix: string,
  turnPrefix: string,
  mordentPrefix: string,
  tremoloPrefix: string,
  motionPrefix: string
): string => [trillPrefix, turnPrefix, mordentPrefix, tremoloPrefix, motionPrefix].join("");

const buildAbcExportOrnamentTrillAccidentalText = (note: Element): string =>
  note.querySelector(":scope > notations > ornaments > accidental-mark")?.textContent?.trim() ?? "";

const buildAbcExportOrnamentTrillPrefix = (
  note: Element,
  ornamentKinds: Set<string>
): { prefix: string; hasTrill: boolean } => {
  const hasTrillMark = buildAbcExportOrnamentTrillMarkPresence(ornamentKinds);
  const hasWavyLineStart = buildAbcExportOrnamentWavyLineStartPresence(note);
  const hasWavyLineStop = buildAbcExportOrnamentWavyLineStopPresence(note);
  return {
    prefix: buildAbcExportOrnamentTrillPrefixFromPresence(hasTrillMark, hasWavyLineStart, hasWavyLineStop),
    hasTrill: hasTrillMark || hasWavyLineStart,
  };
};

const buildAbcExportOrnamentTrillPrefixFromPresence = (
  hasTrillMark: boolean,
  hasWavyLineStart: boolean,
  hasWavyLineStop: boolean
): string =>
  hasWavyLineStop
    ? "!trill)!"
    : hasWavyLineStart && !hasTrillMark
      ? "!trill!"
      : hasWavyLineStart
        ? "!trill(!"
        : hasTrillMark
          ? "!trill!"
          : "";

const buildAbcExportOrnamentTrillMarkPresence = (ornamentKinds: Set<string>): boolean =>
  ornamentKinds.has("trill-mark");

const buildAbcExportOrnamentWavyLineStartPresence = (note: Element): boolean =>
  buildAbcExportOrnamentWavyLinePresence(note, (type) => type === "" || type === "start");

const buildAbcExportOrnamentWavyLineStopPresence = (note: Element): boolean =>
  buildAbcExportOrnamentWavyLinePresence(note, (type) => type === "stop");

const buildAbcExportOrnamentWavyLinePresence = (
  note: Element,
  acceptsType: (type: string) => boolean
): boolean =>
  Array.from(note.querySelectorAll(":scope > notations > ornaments > wavy-line")).some((node) =>
    acceptsType((node.getAttribute("type") ?? "").trim().toLowerCase())
  );

const buildAbcExportOrnamentTurnPrefix = (
  ornamentFeatures: AbcExportOrnamentFeatures,
  ornamentKinds: Set<string>
): string =>
  [
    buildAbcExportOrnamentInvertedTurnPrefix(ornamentFeatures, ornamentKinds),
    buildAbcExportOrnamentNormalTurnPrefix(ornamentFeatures, ornamentKinds),
  ].join("");

const buildAbcExportOrnamentInvertedTurnPrefix = (
  ornamentFeatures: AbcExportOrnamentFeatures,
  ornamentKinds: Set<string>
): string =>
  buildAbcExportOrnamentPresencePrefix(
    ornamentKinds.has("inverted-turn"),
    buildAbcExportOrnamentDelayedTurnPresence(ornamentKinds),
    buildAbcExportOrnamentInvertedTurnSlashPresence(ornamentFeatures),
    "!delayedinvertedturn!",
    "!invertedturnx!",
    "!invertedturn!"
  );

const buildAbcExportOrnamentNormalTurnPrefix = (
  ornamentFeatures: AbcExportOrnamentFeatures,
  ornamentKinds: Set<string>
): string =>
  buildAbcExportOrnamentPresencePrefix(
    ornamentKinds.has("turn"),
    buildAbcExportOrnamentDelayedTurnPresence(ornamentKinds),
    buildAbcExportOrnamentNormalTurnSlashPresence(ornamentFeatures),
    "!delayedturn!",
    "!turnx!",
    "!turn!"
  );

const buildAbcExportOrnamentInvertedTurnSlashPresence = (ornamentFeatures: AbcExportOrnamentFeatures): boolean =>
  ornamentFeatures.some((feature) => feature.kind === "inverted-turn" && feature.slash);

const buildAbcExportOrnamentNormalTurnSlashPresence = (ornamentFeatures: AbcExportOrnamentFeatures): boolean =>
  ornamentFeatures.some((feature) => feature.kind === "turn" && feature.slash);

const buildAbcExportOrnamentDelayedTurnPresence = (ornamentKinds: Set<string>): boolean =>
  ornamentKinds.has("delayed-turn");

const buildAbcExportOrnamentPresencePrefix = (
  hasKind: boolean,
  hasDelayed: boolean,
  hasSlash: boolean,
  delayedPrefix: string,
  slashPrefix: string,
  normalPrefix: string
): string => (hasKind ? (hasDelayed ? delayedPrefix : hasSlash ? slashPrefix : normalPrefix) : "");

const buildAbcExportOrnamentSimplePresencePrefix = (hasKind: boolean, prefix: string): string =>
  hasKind ? prefix : "";

const buildAbcExportOrnamentMordentPrefix = (ornamentKinds: Set<string>): string =>
  [buildAbcExportOrnamentInvertedMordentPrefix(ornamentKinds), buildAbcExportOrnamentNormalMordentPrefix(ornamentKinds)].join("");

const buildAbcExportOrnamentInvertedMordentPrefix = (ornamentKinds: Set<string>): string =>
  buildAbcExportOrnamentSimplePresencePrefix(ornamentKinds.has("inverted-mordent"), "!pralltriller!");

const buildAbcExportOrnamentNormalMordentPrefix = (ornamentKinds: Set<string>): string =>
  buildAbcExportOrnamentSimplePresencePrefix(ornamentKinds.has("mordent"), "!mordent!");

const buildAbcExportOrnamentTremoloPrefix = (ornamentFeatures: AbcExportOrnamentFeatures): string =>
  (["single", "start", "stop"] as const)
    .map((tremoloType) =>
      buildAbcExportOrnamentTremoloPrefixFromFeature(
        buildAbcExportOrnamentTremoloFeatureByType(ornamentFeatures, tremoloType),
        tremoloType
      )
    )
    .join("");

const buildAbcExportOrnamentTremoloFeatureByType = (
  ornamentFeatures: AbcExportOrnamentFeatures,
  tremoloType: "single" | "start" | "stop"
): AbcExportTremoloOrnamentFeature | undefined =>
  ornamentFeatures.find((feature) => feature.kind === "tremolo" && feature.tremoloType === tremoloType);

const buildAbcExportOrnamentTremoloPrefixFromFeature = (
  tremoloFeature: AbcExportTremoloOrnamentFeature | undefined,
  tremoloType: "single" | "start" | "stop"
): string =>
  tremoloFeature ? `!tremolo-${tremoloType}-${tremoloFeature.marks ? tremoloFeature.marks : 1}!` : "";

const buildAbcExportOrnamentMotionPrefix = (note: Element, ornamentKinds: Set<string>): string =>
  buildAbcExportOrnamentMotionPrefixParts(note, ornamentKinds).join("");

const buildAbcExportOrnamentGlissandoSlidePrefix = (note: Element): string =>
  buildAbcExportOrnamentGlissandoSlidePrefixParts(note).join("");

const buildAbcExportOrnamentGlissandoPrefix = (note: Element): string =>
  buildAbcExportOrnamentStartStopPrefixParts(
    note.querySelector(':scope > notations > glissando[type="start"]'),
    note.querySelector(':scope > notations > glissando[type="stop"]'),
    "!gliss-start!",
    "!gliss-stop!"
  ).join("");

const buildAbcExportOrnamentSlidePrefix = (note: Element): string =>
  buildAbcExportOrnamentStartStopPrefixParts(
    note.querySelector(':scope > notations > slide[type="start"]'),
    note.querySelector(':scope > notations > slide[type="stop"]'),
    "!slide!",
    "!slide-stop!"
  ).join("");

const buildAbcExportOrnamentGlissandoSlidePrefixParts = (note: Element): string[] => [
  buildAbcExportOrnamentGlissandoPrefix(note),
  buildAbcExportOrnamentSlidePrefix(note),
];

const buildAbcExportOrnamentStartStopPrefixParts = (
  hasStart: boolean | Element | null,
  hasStop: boolean | Element | null,
  startPrefix: string,
  stopPrefix: string
): string[] => [
  ...(hasStart ? [startPrefix] : []),
  ...(hasStop ? [stopPrefix] : []),
];

const buildAbcExportOrnamentMotionEffectPrefix = (note: Element, ornamentKinds: Set<string>): string =>
  buildAbcExportOrnamentMotionEffectPrefixParts(note, ornamentKinds).join("");

const buildAbcExportOrnamentSchleiferShakePrefix = (ornamentKinds: Set<string>): string =>
  [buildAbcExportOrnamentSchleiferPrefix(ornamentKinds), buildAbcExportOrnamentShakePrefix(ornamentKinds)].join("");

const buildAbcExportOrnamentSchleiferPrefix = (ornamentKinds: Set<string>): string =>
  ornamentKinds.has("schleifer") ? "!schleifer!" : "";

const buildAbcExportOrnamentShakePrefix = (ornamentKinds: Set<string>): string =>
  ornamentKinds.has("shake") ? "!shake!" : "";

const buildAbcExportOrnamentArpeggiatePrefix = (note: Element): string =>
  note.querySelector(":scope > notations > arpeggiate") ? "!arpeggio!" : "";

const buildAbcExportOrnamentMotionPrefixParts = (note: Element, ornamentKinds: Set<string>): string[] => [
  buildAbcExportOrnamentGlissandoSlidePrefix(note),
  buildAbcExportOrnamentMotionEffectPrefix(note, ornamentKinds),
];

const buildAbcExportOrnamentMotionEffectPrefixParts = (note: Element, ornamentKinds: Set<string>): string[] => [
  buildAbcExportOrnamentSchleiferShakePrefix(ornamentKinds),
  buildAbcExportOrnamentArpeggiatePrefix(note),
];

const buildAbcExportTechnicalPrefix = (note: Element): string =>
  buildAbcExportTechnicalPrefixXmlParts(note).join("");

const buildAbcExportTechnicalPrefixXmlParts = (note: Element): string[] => [
  ...buildAbcExportTechnicalStrokeXmlParts(note),
  ...buildAbcExportTechnicalCollectionXmlParts(note),
  ...buildAbcExportTechnicalStateXmlParts(note),
];

const buildAbcExportTechnicalStrokeXmlParts = (note: Element): string[] => [
  ...buildAbcExportTechnicalBowingXmlParts(note),
  ...buildAbcExportTechnicalTongueAndFootXmlParts(note),
];

const buildAbcExportTechnicalBowingXmlParts = (note: Element): string[] => [
  note.querySelector(":scope > notations > technical > up-bow") ? "!upbow!" : "",
  note.querySelector(":scope > notations > technical > down-bow") ? "!downbow!" : "",
];

const buildAbcExportTechnicalTongueAndFootXmlParts = (note: Element): string[] =>
  [
    note.querySelector(":scope > notations > technical > double-tongue") ? "!doubletongue!" : "",
    note.querySelector(":scope > notations > technical > triple-tongue") ? "!tripletongue!" : "",
    note.querySelector(":scope > notations > technical > heel") ? "!heel!" : "",
    note.querySelector(":scope > notations > technical > toe") ? "!toe!" : "",
  ];

const buildAbcExportTechnicalCollectionXmlParts = (note: Element): string[] =>
  [
    Array.from(note.querySelectorAll(":scope > notations > technical > fingering"))
      .map((node) => (node.textContent ?? "").trim())
      .filter((text) => text.length > 0)
      .map((value) => (/^[0-5]$/.test(value) ? `!${value}!` : `!fingering:${value}!`))
      .join(""),
    Array.from(note.querySelectorAll(":scope > notations > technical > string"))
      .map((node) => (node.textContent ?? "").trim())
      .filter((text) => text.length > 0)
      .map((value) => `!string:${value}!`)
      .join(""),
    Array.from(note.querySelectorAll(":scope > notations > technical > pluck"))
      .map((node) => (node.textContent ?? "").trim())
      .filter((text) => text.length > 0)
      .map((value) => `!pluck:${value}!`)
      .join(""),
  ];

const buildAbcExportTechnicalStateXmlParts = (note: Element): string[] =>
  [
    note.querySelector(":scope > notations > technical > open-string") ? "!open!" : "",
    note.querySelector(":scope > notations > technical > snap-pizzicato") ? "!snap!" : "",
    note.querySelector(":scope > notations > technical > harmonic") ? "!harmonic!" : "",
    note.querySelector(":scope > notations > technical > stopped") ? "!stopped!" : "",
    note.querySelector(":scope > notations > technical > thumb-position") ? "!thumb!" : "",
  ];

const buildAbcExportFermataPrefix = (note: Element): string => {
  const fermata = note.querySelector(":scope > notations > fermata");
  const type = fermata?.getAttribute("type")?.trim().toLowerCase() ?? "";
  const shape = fermata?.textContent?.trim().toLowerCase() ?? "";
  return fermata ? (type === "inverted" || shape === "inverted" ? "!invertedfermata!" : "!fermata!") : "";
};

const buildAbcExportArticulationPrefix = (note: Element): string =>
  buildAbcExportArticulationPrefixXmlParts(note).join("");

const buildAbcExportArticulationPrefixXmlParts = (note: Element): string[] => {
  const articulationKinds = new Set(extractMusicXmlArticulationKinds(note));
  return [
    ...buildAbcExportArticulationCorePrefixXmlParts(articulationKinds),
    ...buildAbcExportArticulationDecorativePrefixXmlParts(note, articulationKinds),
    ...[
      (
        Array.from(note.querySelectorAll(":scope > notations > articulations > other-articulation"))
          .map((node) => (node.textContent ?? "").trim().toLowerCase())
          .find((text) => text === "shortphrase" || text === "mediumphrase" || text === "longphrase") ?? ""
      )
        ? `!${
            Array.from(note.querySelectorAll(":scope > notations > articulations > other-articulation"))
              .map((node) => (node.textContent ?? "").trim().toLowerCase())
              .find((text) => text === "shortphrase" || text === "mediumphrase" || text === "longphrase") ?? ""
          }!`
        : "",
    ].filter((part) => part.length > 0),
  ];
};

const buildAbcExportArticulationCorePrefixXmlParts = (articulationKinds: Set<string>): string[] => [
  buildAbcExportArticulationStaccatoXmlPart(articulationKinds),
  buildAbcExportArticulationAccentXmlPart(articulationKinds),
  buildAbcExportArticulationTenutoXmlPart(articulationKinds),
];

const buildAbcExportArticulationStaccatoXmlPart = (articulationKinds: Set<string>): string =>
  articulationKinds.has("staccatissimo") ? "!wedge!" : (articulationKinds.has("staccato") ? "!staccato!" : "");

const buildAbcExportArticulationAccentXmlPart = (articulationKinds: Set<string>): string =>
  articulationKinds.has("accent") ? "!accent!" : "";

const buildAbcExportArticulationTenutoXmlPart = (articulationKinds: Set<string>): string =>
  articulationKinds.has("tenuto") ? "!tenuto!" : "";

const buildAbcExportArticulationDecorativePrefixXmlParts = (note: Element, articulationKinds: Set<string>): string[] => [
  ...buildAbcExportArticulationDirectDecorativeXmlParts(note),
  ...buildAbcExportArticulationKindDecorativeXmlParts(articulationKinds),
];

const buildAbcExportArticulationDirectDecorativeXmlParts = (note: Element): string[] => [
  buildAbcExportArticulationStressXmlPart(note),
  buildAbcExportArticulationUnstressXmlPart(note),
];

const buildAbcExportArticulationKindDecorativeXmlParts = (articulationKinds: Set<string>): string[] => [
  buildAbcExportArticulationStrongAccentXmlPart(articulationKinds),
  buildAbcExportArticulationBreathXmlPart(articulationKinds),
  buildAbcExportArticulationCaesuraXmlPart(articulationKinds),
];

const buildAbcExportArticulationStressXmlPart = (note: Element): string =>
  buildAbcExportArticulationPresenceXmlPart(note, "stress", "!stress!");

const buildAbcExportArticulationUnstressXmlPart = (note: Element): string =>
  buildAbcExportArticulationPresenceXmlPart(note, "unstress", "!unstress!");

const buildAbcExportArticulationStrongAccentXmlPart = (articulationKinds: Set<string>): string =>
  buildAbcExportArticulationSimplePresenceXmlPart(articulationKinds.has("strong-accent"), "!marcato!");

const buildAbcExportArticulationBreathXmlPart = (articulationKinds: Set<string>): string =>
  buildAbcExportArticulationSimplePresenceXmlPart(articulationKinds.has("breath-mark"), "!breath!");

const buildAbcExportArticulationCaesuraXmlPart = (articulationKinds: Set<string>): string =>
  buildAbcExportArticulationSimplePresenceXmlPart(articulationKinds.has("caesura"), "!caesura!");

const buildAbcExportArticulationSimplePresenceXmlPart = (hasKind: boolean, prefix: string): string =>
  hasKind ? prefix : "";

const buildAbcExportArticulationPresenceXmlPart = (
  note: Element,
  elementName: string,
  prefix: string
): string =>
  buildAbcExportArticulationSimplePresenceXmlPart(note.querySelector(`:scope > notations > articulations > ${elementName}`) !== null, prefix);

const appendAbcExportLyricToken = (
  note: Element,
  lyricTokens: string[],
  pendingLyricExtension: boolean
): boolean => {
  if (note.querySelector(":scope > rest")) return pendingLyricExtension;
  const lyric = note.querySelector(":scope > lyric");
  const lyricText = lyric?.querySelector(":scope > text")?.textContent?.trim() ?? "";
  const lyricSyllabic = lyric?.querySelector(":scope > syllabic")?.textContent?.trim() ?? "single";
  const lyricExtend = lyric?.querySelector(":scope > extend") !== null;
  if (lyricText) {
    lyricTokens.push(abcLyricTokenFromMusicXml(lyricText, lyricSyllabic));
    return lyricExtend;
  }
  if (pendingLyricExtension) {
    lyricTokens.push("_");
    return true;
  }
  lyricTokens.push("*");
  return false;
};

const buildAbcExportPendingEventToken = (pending: AbcExportPendingEvent): string => {
  const tieSuffix = pending.tie ? "-" : "";
  const slurStopSuffix = pending.slurStop ? ")" : "";
  if (pending.pitches.length === 1) {
    return `${pending.prefix}${pending.pitches[0]}${pending.len}${tieSuffix}${slurStopSuffix}`;
  }
  return `${pending.prefix}[${pending.pitches.join("")}]${pending.len}${tieSuffix}${slurStopSuffix}`;
};

const flushAbcExportPendingEvent = (
  pending: AbcExportPendingEvent | null,
  tokens: string[]
): null => {
  if (pending) {
    tokens.push(buildAbcExportPendingEventToken(pending));
  }
  return null;
};

const createAbcExportPendingEvent = (
  pitchToken: string,
  len: string,
  hasTieStart: boolean,
  hasSlurStop: boolean,
  eventPrefix: string
): AbcExportPendingEvent => ({
  pitches: [pitchToken],
  len,
  tie: hasTieStart,
  slurStop: hasSlurStop,
  prefix: eventPrefix,
});

const appendAbcExportChordPitchToPendingEvent = (
  pending: AbcExportPendingEvent,
  pitchToken: string,
  hasTieStart: boolean,
  hasSlurStop: boolean
): void => {
  pending.pitches.push(pitchToken);
  pending.tie = pending.tie || hasTieStart;
  pending.slurStop = pending.slurStop || hasSlurStop;
};

const startAbcExportPendingEventForNote = (
  flushPending: boolean,
  pending: AbcExportPendingEvent | null,
  tokens: string[],
  metaLines: string[],
  normalizedVoiceId: string,
  measure: Element,
  fallbackMeasureNumber: number,
  ornamentPrefixInfo: AbcExportOrnamentPrefixInfo,
  pitchToken: string,
  len: string,
  hasTieStart: boolean,
  hasSlurStop: boolean,
  eventPrefix: string,
  eventNo: number
): AbcExportPendingEventUpdateResult => {
  const nextEventNo = eventNo + 1;
  const trillMetaLine =
    ornamentPrefixInfo.hasTrill && ornamentPrefixInfo.trillAccidentalText
      ? buildAbcExportTrillMetaLine(
          normalizedVoiceId,
          measure,
          fallbackMeasureNumber,
          nextEventNo,
          ornamentPrefixInfo.trillAccidentalText
        )
      : "";
  if (trillMetaLine) metaLines.push(trillMetaLine);
  if (flushPending) flushAbcExportPendingEvent(pending, tokens);
  return {
    pending: createAbcExportPendingEvent(pitchToken, len, hasTieStart, hasSlurStop, eventPrefix),
    eventNo: nextEventNo,
  };
};

const readAbcExportNoteEventInfo = (
  note: Element,
  currentDivisions: number,
  unitLength: Fraction
): AbcExportNoteEventInfo | null => {
  const isChord = note.querySelector(":scope > chord") !== null;
  const isGrace = note.querySelector(":scope > grace") !== null;
  const duration = Number(note.querySelector(":scope > duration")?.textContent?.trim() ?? "0");
  if (!isGrace && (!Number.isFinite(duration) || duration <= 0)) return null;
  const noteDuration = isGrace
    ? (Number.isFinite(duration) && duration > 0 ? duration : Math.round(currentDivisions / 2))
    : duration;
  const tieState = extractMusicXmlTieState(note);
  const slurFeatures = extractMusicXmlSlurFeatures(note);
  const timeModification = readAbcExportTimeModification(note);
  return {
    isChord,
    isGrace,
    hasTieStart: tieState.tieStart,
    ornamentPrefixInfo: buildAbcExportOrnamentPrefixInfo(note),
    hasSlurStart: slurFeatures.some((slur) => slur.type === "start"),
    hasSlurStop: slurFeatures.some((slur) => slur.type === "stop"),
    hasGraceSlash: (note.querySelector(":scope > grace")?.getAttribute("slash") ?? "").trim().toLowerCase() === "yes",
    hasTupletStart: note.querySelector(':scope > notations > tuplet[type="start"]') !== null,
    timeModification,
    len: buildAbcExportLengthToken(noteDuration, currentDivisions, unitLength, timeModification),
  };
};

const buildAbcExportEventPrefix = (
  note: Element,
  noteEventInfo: AbcExportNoteEventInfo,
  activeTuplet: AbcExportActiveTuplet | null,
  pendingHarmonySymbols: string[],
  pendingDirectionWords: string[],
  pendingDirectionDecorations: string[],
  pendingGraceTokens: string[]
): string => {
  const tupletPrefix = buildAbcExportTupletPrefix(activeTuplet, noteEventInfo.isChord);
  const articulationPrefix = buildAbcExportArticulationPrefix(note);
  const technicalPrefix = buildAbcExportTechnicalPrefix(note);
  const fermataPrefix = buildAbcExportFermataPrefix(note);
  const slurStartPrefix = noteEventInfo.hasSlurStart ? "(" : "";
  const parts = buildAbcExportEventPrefixParts(
    noteEventInfo.isChord,
    pendingHarmonySymbols,
    pendingDirectionWords,
    pendingDirectionDecorations,
    pendingGraceTokens,
    tupletPrefix,
    slurStartPrefix,
    noteEventInfo.ornamentPrefixInfo.prefix,
    articulationPrefix,
    technicalPrefix,
    fermataPrefix
  );
  return parts.join("");
};

const buildAbcExportEventPrefixParts = (
  isChord: boolean,
  pendingHarmonySymbols: string[],
  pendingDirectionWords: string[],
  pendingDirectionDecorations: string[],
  pendingGraceTokens: string[],
  tupletPrefix: string,
  slurStartPrefix: string,
  ornamentPrefix: string,
  articulationPrefix: string,
  technicalPrefix: string,
  fermataPrefix: string
): string[] => [
  takeAbcExportQueuedEventPrefix(
    isChord,
    pendingHarmonySymbols,
    pendingDirectionWords,
    pendingDirectionDecorations,
    pendingGraceTokens
  ),
  tupletPrefix,
  slurStartPrefix,
  ornamentPrefix,
  articulationPrefix,
  technicalPrefix,
  fermataPrefix,
];

const flushAbcExportPendingGraceTokens = (
  pendingGraceTokens: string[],
  tokens: string[]
): void => {
  if (pendingGraceTokens.length === 0) return;
  tokens.push(`{${pendingGraceTokens.join("")}}`);
  pendingGraceTokens.length = 0;
};

const appendAbcExportEmptyMeasureRestTokenIfNeeded = (
  tokens: string[],
  currentDivisions: number,
  currentBeats: number,
  currentBeatType: number,
  unitLength: Fraction
): void => {
  if (tokens.length > 0) return;
  const measureDuration = Math.max(
    1,
    Math.round(currentDivisions * Number(currentBeats) * (4 / Number(currentBeatType || 4)))
  );
  const wholeFraction = AbcCommon.reduceFraction(measureDuration, currentDivisions * 4, { num: 1, den: 4 });
  const lenRatio = AbcCommon.divideFractions(wholeFraction, unitLength, { num: 1, den: 1 });
  tokens.push(`z${AbcCommon.abcLengthTokenFromFraction(lenRatio)}`);
};

const buildAbcExportMeasureBoundaryPrefix = (boundaryInfo: AbcExportMeasureBoundaryInfo): string =>
  `${boundaryInfo.hasLeftRepeat ? "|:" : ""}${boundaryInfo.leftEndingNumber ? `[${boundaryInfo.leftEndingNumber}` : ""}`;

const buildAbcExportMeasureKeyPrefix = (needsInlineKeyChange: boolean, currentFifths: number): string =>
  needsInlineKeyChange
    ? `[K:${AbcCommon.keyFromFifthsMode(Math.max(-7, Math.min(7, Math.round(currentFifths))), "major")}]`
    : "";

const buildAbcExportMeasureBoundarySuffix = (boundaryInfo: AbcExportMeasureBoundaryInfo): string =>
  boundaryInfo.hasRightRepeat
    ? (boundaryInfo.rightEndingNumber ? ":|]" : ":|")
    : (boundaryInfo.rightEndingNumber ? "]|" : "|");

const readAbcExportMeasureBoundaryInfo = (measure: Element): AbcExportMeasureBoundaryInfo => {
  const leftRepeatNode = measure.querySelector(':scope > barline[location="left"] > repeat');
  const rightRepeatNode = measure.querySelector(':scope > barline[location="right"] > repeat');
  const leftEndingNode = measure.querySelector(':scope > barline[location="left"] > ending');
  const rightEndingNode = measure.querySelector(':scope > barline[location="right"] > ending');
  const leftRepeatDir = (leftRepeatNode?.getAttribute("direction") ?? "").trim().toLowerCase();
  const rightRepeatDir = (rightRepeatNode?.getAttribute("direction") ?? "").trim().toLowerCase();
  return {
    hasLeftRepeat: leftRepeatDir === "forward",
    hasRightRepeat: rightRepeatDir === "backward",
    leftEndingNumber: (leftEndingNode?.getAttribute("number") ?? "").trim(),
    rightEndingNumber: (rightEndingNode?.getAttribute("number") ?? "").trim(),
    rightEndingType: (rightEndingNode?.getAttribute("type") ?? "").trim().toLowerCase(),
  };
};

const applyAbcExportMeasureAttributesToState = (
  measure: Element,
  state: AbcExportMeasureState
): AbcExportMeasureState => {
  const parsedDiv = parseOptionalMusicXmlNumber(measure.querySelector("attributes > divisions")?.textContent);
  const parsedFifths = parseOptionalMusicXmlNumber(measure.querySelector("attributes > key > fifths")?.textContent);
  const parsedBeats = parseOptionalMusicXmlNumber(measure.querySelector("attributes > time > beats")?.textContent);
  const parsedBeatType = parseOptionalMusicXmlNumber(measure.querySelector("attributes > time > beat-type")?.textContent);
  return {
    currentDivisions: parsedDiv !== null && parsedDiv > 0 ? parsedDiv : state.currentDivisions,
    currentFifths: parsedFifths !== null ? Math.round(parsedFifths) : state.currentFifths,
    currentBeats: parsedBeats !== null && parsedBeats > 0 ? parsedBeats : state.currentBeats,
    currentBeatType: parsedBeatType !== null && parsedBeatType > 0 ? parsedBeatType : state.currentBeatType,
  };
};

const appendAbcExportMeasureMetaLines = (
  metaLines: string[],
  normalizedVoiceId: string,
  measure: Element,
  safeMeasureNumber: number,
  boundaryInfo: AbcExportMeasureBoundaryInfo
): void => {
  const measureMetaLine = buildAbcExportMeasureMetaLine(
    normalizedVoiceId,
    measure,
    safeMeasureNumber,
    boundaryInfo.hasRightRepeat,
    boundaryInfo.rightEndingNumber,
    boundaryInfo.rightEndingType
  );
  if (measureMetaLine) metaLines.push(measureMetaLine);
  metaLines.push(...buildAbcExportDiagMetaLines(normalizedVoiceId, measure, safeMeasureNumber));
};

const applyAbcExportNonNoteChildToPending = (
  child: Element,
  pendingHarmonySymbols: string[],
  pendingDirectionWords: string[],
  pendingDirectionDecorations: string[],
  activeWedgeType: "" | "crescendo" | "diminuendo"
): AbcExportNonNoteChildDispatchResult => {
  if (child.tagName === "harmony") {
    const chordSymbol = abcChordSymbolFromHarmony(child);
    if (chordSymbol) {
      pendingHarmonySymbols.push(chordSymbol);
    }
    return { handled: true, activeWedgeType };
  }
  if (child.tagName === "direction") {
    return {
      handled: true,
      activeWedgeType: applyAbcExportDirectionToPending(
        child,
        pendingDirectionWords,
        pendingDirectionDecorations,
        activeWedgeType
      ),
    };
  }
  return { handled: false, activeWedgeType };
};

const applyAbcExportGraceNoteToPending = (
  noteEventInfo: AbcExportNoteEventInfo,
  pendingGraceTokens: string[],
  pitchToken: string
): boolean => {
  if (!noteEventInfo.isGrace) return false;
  appendAbcExportGraceToken(
    pendingGraceTokens,
    pitchToken,
    noteEventInfo.len,
    noteEventInfo.hasTieStart,
    noteEventInfo.hasGraceSlash,
    noteEventInfo.isChord
  );
  return true;
};

const updateAbcExportActiveTupletBeforeNoteEvent = (
  activeTuplet: AbcExportActiveTuplet | null,
  noteEventInfo: AbcExportNoteEventInfo
): AbcExportActiveTuplet | null =>
  updateAbcExportActiveTupletBeforeEvent(
    activeTuplet,
    noteEventInfo.hasTupletStart,
    noteEventInfo.timeModification,
    noteEventInfo.isChord
  );

const updateAbcExportPendingEventForNote = (
  pending: AbcExportPendingEvent | null,
  tokens: string[],
  eventNo: number,
  metaLines: string[],
  normalizedVoiceId: string,
  measure: Element,
  fallbackMeasureNumber: number,
  noteEventInfo: AbcExportNoteEventInfo,
  pitchToken: string,
  eventPrefix: string
): AbcExportPendingEventUpdateResult => {
  const {
    isChord,
    hasTieStart,
    ornamentPrefixInfo,
    hasSlurStop,
    len,
  } = noteEventInfo;
  if (!isChord) {
    return startAbcExportPendingEventForNote(
      true,
      pending,
      tokens,
      metaLines,
      normalizedVoiceId,
      measure,
      fallbackMeasureNumber,
      ornamentPrefixInfo,
      pitchToken,
      len,
      hasTieStart,
      hasSlurStop,
      eventPrefix,
      eventNo
    );
  }
  if (!pending) {
    return startAbcExportPendingEventForNote(
      false,
      pending,
      tokens,
      metaLines,
      normalizedVoiceId,
      measure,
      fallbackMeasureNumber,
      ornamentPrefixInfo,
      pitchToken,
      len,
      hasTieStart,
      hasSlurStop,
      eventPrefix,
      eventNo
    );
  }
  appendAbcExportChordPitchToPendingEvent(pending, pitchToken, hasTieStart, hasSlurStop);
  return { pending, eventNo };
};

const updateAbcExportStateAfterNoteEvent = (
  note: Element,
  noteEventInfo: AbcExportNoteEventInfo,
  activeTuplet: AbcExportActiveTuplet | null,
  lyricTokens: string[],
  pendingLyricExtension: boolean
): AbcExportPostNoteEventState => {
  return {
    activeTuplet: advanceAbcExportActiveTupletAfterEvent(activeTuplet, noteEventInfo.isChord),
    pendingLyricExtension: noteEventInfo.isChord ? pendingLyricExtension : appendAbcExportLyricToken(note, lyricTokens, pendingLyricExtension),
  };
};

const applyAbcExportNoteEvent = (
  child: Element,
  noteEventInfo: AbcExportNoteEventInfo,
  activeTuplet: AbcExportActiveTuplet | null,
  pending: AbcExportPendingEvent | null,
  eventNo: number,
  pendingGraceTokens: string[],
  pendingHarmonySymbols: string[],
  pendingDirectionWords: string[],
  pendingDirectionDecorations: string[],
  tokens: string[],
  metaLines: string[],
  normalizedVoiceId: string,
  measure: Element,
  fallbackMeasureNumber: number,
  keyAlterMap: Map<string, number>,
  measureAccidentalByStepOctave: Map<string, number>,
  lyricTokens: string[],
  pendingLyricExtension: boolean
): AbcExportNoteChildProcessResult => {
  const pitchToken = buildAbcExportPitchToken(child, keyAlterMap, measureAccidentalByStepOctave);
  if (applyAbcExportGraceNoteToPending(noteEventInfo, pendingGraceTokens, pitchToken)) {
    return { handled: true, pending, eventNo, activeTuplet, pendingLyricExtension };
  }

  const nextActiveTuplet = updateAbcExportActiveTupletBeforeNoteEvent(activeTuplet, noteEventInfo);
  const eventPrefix = buildAbcExportEventPrefix(
    child,
    noteEventInfo,
    nextActiveTuplet,
    pendingHarmonySymbols,
    pendingDirectionWords,
    pendingDirectionDecorations,
    pendingGraceTokens
  );
  const pendingEventUpdate = updateAbcExportPendingEventForNote(
    pending,
    tokens,
    eventNo,
    metaLines,
    normalizedVoiceId,
    measure,
    fallbackMeasureNumber,
    noteEventInfo,
    pitchToken,
    eventPrefix
  );
  const postNoteEventState = updateAbcExportStateAfterNoteEvent(
    child,
    noteEventInfo,
    nextActiveTuplet,
    lyricTokens,
    pendingLyricExtension
  );
  return {
    handled: true,
    pending: pendingEventUpdate.pending,
    eventNo: pendingEventUpdate.eventNo,
    activeTuplet: postNoteEventState.activeTuplet,
    pendingLyricExtension: postNoteEventState.pendingLyricExtension,
  };
};

const processAbcExportNoteChild = (
  context: AbcExportNoteChildProcessContext
): AbcExportNoteChildProcessResult => {
  const {
    child,
    lane,
    currentDivisions,
    unitLength,
    keyAlterMap,
    measureAccidentalByStepOctave,
    pendingGraceTokens,
    pendingHarmonySymbols,
    pendingDirectionWords,
    pendingDirectionDecorations,
    tokens,
    metaLines,
    normalizedVoiceId,
    measure,
    fallbackMeasureNumber,
    lyricTokens,
  } = context;
  let {
    activeTuplet,
    pending,
    eventNo,
    pendingLyricExtension,
  } = context;
  if (child.tagName !== "note") {
    return { handled: false, pending, eventNo, activeTuplet, pendingLyricExtension };
  }
  if (!isMusicXmlNoteInAbcExportLane(child, lane)) {
    return { handled: true, pending, eventNo, activeTuplet, pendingLyricExtension };
  }
  const noteEventInfo = readAbcExportNoteEventInfo(child, currentDivisions, unitLength);
  if (!noteEventInfo) {
    return { handled: true, pending, eventNo, activeTuplet, pendingLyricExtension };
  }

  return applyAbcExportNoteEvent(
    child,
    noteEventInfo,
    activeTuplet,
    pending,
    eventNo,
    pendingGraceTokens,
    pendingHarmonySymbols,
    pendingDirectionWords,
    pendingDirectionDecorations,
    tokens,
    metaLines,
    normalizedVoiceId,
    measure,
    fallbackMeasureNumber,
    keyAlterMap,
    measureAccidentalByStepOctave,
    lyricTokens,
    pendingLyricExtension
  );
};

const processAbcExportMeasureChild = (
  child: Element,
  state: {
    lane: AbcExportLaneDefinition;
    currentDivisions: number;
    unitLength: Fraction;
    keyAlterMap: Record<string, number>;
    measureAccidentalByStepOctave: Map<string, number>;
    pendingGraceTokens: string[];
    pendingHarmonySymbols: string[];
    pendingDirectionWords: string[];
    pendingDirectionDecorations: string[];
    tokens: string[];
    metaLines: string[];
    normalizedVoiceId: string;
    measure: Element;
    fallbackMeasureNumber: number;
    lyricTokens: string[];
    pending: AbcExportPendingEvent | null;
    eventNo: number;
    activeTuplet: AbcExportActiveTuplet | null;
    pendingLyricExtension: boolean;
    activeWedgeType: "" | "crescendo" | "diminuendo";
  }
): void => {
  if (processAbcExportMeasureNonNoteChild(child, state)) {
    return;
  }
  processAbcExportMeasureNoteChild(child, state);
};

const processAbcExportMeasureNonNoteChild = (
  child: Element,
  state: {
    pendingHarmonySymbols: string[];
    pendingDirectionWords: string[];
    pendingDirectionDecorations: string[];
    activeWedgeType: "" | "crescendo" | "diminuendo";
  }
): boolean => {
  const nonNoteDispatch = applyAbcExportNonNoteChildToPending(
    child,
    state.pendingHarmonySymbols,
    state.pendingDirectionWords,
    state.pendingDirectionDecorations,
    state.activeWedgeType
  );
  state.activeWedgeType = nonNoteDispatch.activeWedgeType;
  return nonNoteDispatch.handled;
};

const processAbcExportMeasureNoteChild = (
  child: Element,
  state: {
    lane: AbcExportLaneDefinition;
    currentDivisions: number;
    unitLength: Fraction;
    keyAlterMap: Record<string, number>;
    measureAccidentalByStepOctave: Map<string, number>;
    pendingGraceTokens: string[];
    pendingHarmonySymbols: string[];
    pendingDirectionWords: string[];
    pendingDirectionDecorations: string[];
    tokens: string[];
    metaLines: string[];
    normalizedVoiceId: string;
    measure: Element;
    fallbackMeasureNumber: number;
    lyricTokens: string[];
    pending: AbcExportPendingEvent | null;
    eventNo: number;
    activeTuplet: AbcExportActiveTuplet | null;
    pendingLyricExtension: boolean;
  }
): void => {
  const noteChildProcess = processAbcExportNoteChild({
    child,
    lane: state.lane,
    currentDivisions: state.currentDivisions,
    unitLength: state.unitLength,
    keyAlterMap: state.keyAlterMap,
    measureAccidentalByStepOctave: state.measureAccidentalByStepOctave,
    pendingGraceTokens: state.pendingGraceTokens,
    activeTuplet: state.activeTuplet,
    pendingHarmonySymbols: state.pendingHarmonySymbols,
    pendingDirectionWords: state.pendingDirectionWords,
    pendingDirectionDecorations: state.pendingDirectionDecorations,
    pending: state.pending,
    tokens: state.tokens,
    eventNo: state.eventNo,
    metaLines: state.metaLines,
    normalizedVoiceId: state.normalizedVoiceId,
    measure: state.measure,
    fallbackMeasureNumber: state.fallbackMeasureNumber,
    lyricTokens: state.lyricTokens,
    pendingLyricExtension: state.pendingLyricExtension,
  });
  if (!noteChildProcess.handled) {
    return;
  }
  state.pending = noteChildProcess.pending;
  state.eventNo = noteChildProcess.eventNo;
  state.activeTuplet = noteChildProcess.activeTuplet;
  state.pendingLyricExtension = noteChildProcess.pendingLyricExtension;
};

const createAbcExportMeasureChildProcessingState = (
  context: AbcExportMeasureChildrenContext,
  pendingGraceTokens: string[],
  pendingHarmonySymbols: string[],
  pendingDirectionWords: string[],
  pendingDirectionDecorations: string[]
): AbcExportMeasureChildProcessingState => ({
  lane: context.lane,
  currentDivisions: context.currentDivisions,
  unitLength: context.unitLength,
  keyAlterMap: context.keyAlterMap,
  measureAccidentalByStepOctave: context.measureAccidentalByStepOctave,
  pendingGraceTokens,
  pendingHarmonySymbols,
  pendingDirectionWords,
  pendingDirectionDecorations,
  tokens: context.tokens,
  metaLines: context.metaLines,
  normalizedVoiceId: context.normalizedVoiceId,
  measure: context.measure,
  fallbackMeasureNumber: context.fallbackMeasureNumber,
  lyricTokens: context.lyricTokens,
  pending: null,
  eventNo: 0,
  activeTuplet: null,
  pendingLyricExtension: context.pendingLyricExtension,
  activeWedgeType: "",
});

const processAbcExportMeasureChildren = (
  context: AbcExportMeasureChildrenContext
): AbcExportMeasureChildrenResult => {
  const {
    measure,
    lane,
    currentDivisions,
    unitLength,
    keyAlterMap,
    measureAccidentalByStepOctave,
    tokens,
    metaLines,
    normalizedVoiceId,
    fallbackMeasureNumber,
    lyricTokens,
  } = context;
  let { pendingLyricExtension } = context;
  let pending: AbcExportPendingEvent | null = null;
  const pendingGraceTokens: string[] = [];
  const pendingHarmonySymbols: string[] = [];
  const pendingDirectionWords: string[] = [];
  const pendingDirectionDecorations: string[] = [];
  const state = createAbcExportMeasureChildProcessingState(
    context,
    pendingGraceTokens,
    pendingHarmonySymbols,
    pendingDirectionWords,
    pendingDirectionDecorations
  );

  for (const child of Array.from(measure.children)) {
    processAbcExportMeasureChild(child, state);
  }

  return {
    pending: state.pending,
    pendingGraceTokens,
    pendingLyricExtension: state.pendingLyricExtension,
  };
};

const renderAbcExportMeasureText = (
  context: AbcExportMeasureRenderContext
): AbcExportMeasureRenderResult => {
  const {
    measure,
    lane,
    lastEmittedKeyFifths,
    unitLength,
    metaLines,
    normalizedVoiceId,
    fallbackMeasureNumber,
    lyricTokens,
  } = context;
  let { pendingLyricExtension } = context;
  const measureState = applyAbcExportMeasureAttributesToState(measure, context.measureState);
  const boundaryInfo = readAbcExportMeasureBoundaryInfo(measure);
  appendAbcExportMeasureMetaLines(metaLines, normalizedVoiceId, measure, fallbackMeasureNumber, boundaryInfo);
  const { currentDivisions, currentFifths, currentBeats, currentBeatType } = measureState;
  const needsInlineKeyChange = lastEmittedKeyFifths === null || lastEmittedKeyFifths !== currentFifths;
  const keyAlterMap = musicXmlKeySignatureAlterByStep(currentFifths);
  const measureAccidentalByStepOctave = new Map<string, number>();
  const tokens: string[] = [];
  const measureChildren = processAbcExportMeasureChildren({
    measure,
    lane,
    currentDivisions,
    unitLength,
    keyAlterMap,
    measureAccidentalByStepOctave,
    tokens,
    metaLines,
    normalizedVoiceId,
    fallbackMeasureNumber,
    lyricTokens,
    pendingLyricExtension,
  });
  pendingLyricExtension = measureChildren.pendingLyricExtension;
  flushAbcExportPendingGraceTokens(measureChildren.pendingGraceTokens, tokens);
  flushAbcExportPendingEvent(measureChildren.pending, tokens);
  appendAbcExportEmptyMeasureRestTokenIfNeeded(
    tokens,
    currentDivisions,
    currentBeats,
    currentBeatType,
    unitLength
  );
  const boundaryPrefix = buildAbcExportMeasureBoundaryPrefix(boundaryInfo);
  const keyPrefix = buildAbcExportMeasureKeyPrefix(needsInlineKeyChange, currentFifths);
  const boundarySuffix = buildAbcExportMeasureBoundarySuffix(boundaryInfo);
  return {
    measureText: [
      ...(boundaryPrefix ? [boundaryPrefix] : []),
      ...(keyPrefix ? [keyPrefix] : []),
      tokens.join(" "),
      ...(boundarySuffix ? [boundarySuffix] : []),
    ]
      .join(" ")
      .trim(),
    measureState,
    lastEmittedKeyFifths: currentFifths,
    pendingLyricExtension,
  };
};

const readAbcExportPartInitialFifths = (part: Element, fallbackFifths: number): number => {
  const partInitialFifthsRaw = parseOptionalMusicXmlNumber(
    part.querySelector(":scope > measure > attributes > key > fifths")?.textContent
  );
  return partInitialFifthsRaw !== null
    ? Math.round(partInitialFifthsRaw)
    : (Number.isFinite(fallbackFifths) ? Math.round(fallbackFifths) : 0);
};

const createAbcExportInitialMeasureStateFromPart = (
  part: Element,
  fifths: number,
  meterBeats: string,
  meterBeatType: string
): AbcExportMeasureState => ({
  currentDivisions: 480,
  currentFifths: readAbcExportPartInitialFifths(part, fifths),
  currentBeats: Number(meterBeats) || 4,
  currentBeatType: Number(meterBeatType) || 4,
});

const createAbcExportLaneBodyStateFromPart = (
  part: Element,
  fifths: number,
  meterBeats: string,
  meterBeatType: string
): AbcExportLaneBodyRenderingState => ({
  measureState: createAbcExportInitialMeasureStateFromPart(part, fifths, meterBeats, meterBeatType),
  lastEmittedKeyFifths: Number.isFinite(fifths) ? Math.round(fifths) : 0,
  measureTexts: [],
  lyricTokens: [],
  pendingLyricExtension: false,
});

const appendAbcExportLaneBodyMeasure = (
  state: AbcExportLaneBodyRenderingState,
  measure: Element,
  lane: AbcExportLaneDefinition,
  unitLength: Fraction,
  metaLines: string[],
  normalizedVoiceId: string
): void => {
  const renderedMeasure = renderAbcExportMeasureText({
    measure,
    lane,
    measureState: state.measureState,
    lastEmittedKeyFifths: state.lastEmittedKeyFifths,
    unitLength,
    metaLines,
    normalizedVoiceId,
    fallbackMeasureNumber: state.measureTexts.length + 1,
    lyricTokens: state.lyricTokens,
    pendingLyricExtension: state.pendingLyricExtension,
  });
  state.measureState = renderedMeasure.measureState;
  state.lastEmittedKeyFifths = renderedMeasure.lastEmittedKeyFifths;
  state.pendingLyricExtension = renderedMeasure.pendingLyricExtension;
  state.measureTexts.push(renderedMeasure.measureText);
};

const appendAbcExportPartFromRenderContext = (context: AbcExportPartRenderContext): void => {
  const partId = context.part.getAttribute("id") || `P${context.partIndex + 1}`;
  const partName = context.partNameById.get(partId) || partId;
  const measures = Array.from(context.part.querySelectorAll(":scope > measure"));
  const laneDefs = buildAbcExportLaneDefinitions(context.part, partId);

  for (const lane of laneDefs) {
    const laneContext: AbcExportLaneRenderContext = {
      part: context.part,
      partName,
      measures,
      laneDefs,
      lane,
      fifths: context.fifths,
      meterBeats: context.meterBeats,
      meterBeatType: context.meterBeatType,
      unitLength: context.unitLength,
      headerLines: context.headerLines,
      bodyLines: context.bodyLines,
      metaLines: context.metaLines,
    };
    const normalizedVoiceId = laneContext.lane.voiceId.replace(/[^A-Za-z0-9_.-]/g, "_");
    const laneName =
      laneContext.laneDefs.length <= 1
        ? laneContext.partName
        : laneContext.lane.staff && laneContext.lane.voice
          ? `${laneContext.partName} (Staff ${laneContext.lane.staff} Voice ${laneContext.lane.voice})`
          : laneContext.lane.staff
            ? `${laneContext.partName} (Staff ${laneContext.lane.staff})`
            : laneContext.lane.voice
              ? `${laneContext.partName} (Voice ${laneContext.lane.voice})`
              : `${laneContext.partName} (Lane)`;
    const abcClef = resolveAbcExportLaneClef(laneContext.part, laneContext.measures, laneContext.lane.staff);
    const clefSuffix = abcClef ? ` clef=${abcClef}` : "";
    laneContext.headerLines.push(`V:${normalizedVoiceId} name="${laneName}"${clefSuffix}`);
    const transposeMetaLine = buildAbcExportTransposeMetaLine(normalizedVoiceId, laneContext.measures[0]);
    if (transposeMetaLine) laneContext.metaLines.push(transposeMetaLine);
    const state = createAbcExportLaneBodyStateFromPart(
      laneContext.part,
      laneContext.fifths,
      laneContext.meterBeats,
      laneContext.meterBeatType
    );
    for (const measure of laneContext.measures) {
      appendAbcExportLaneBodyMeasure(
        state,
        measure,
        laneContext.lane,
        laneContext.unitLength,
        laneContext.metaLines,
        normalizedVoiceId
      );
    }
    laneContext.bodyLines.push(`V:${normalizedVoiceId}`, state.measureTexts.join(" "));
    if (state.lyricTokens.some((token) => token !== "*")) {
      laneContext.bodyLines.push(`w: ${state.lyricTokens.join(" ")}`);
    }
  }
};

const hasAbcExportUnitTempoHeader = (
  initialTempo: AbcExportInitialTempo
): initialTempo is AbcExportInitialTempo & { unit: Fraction } =>
  !!initialTempo.unit && Number.isFinite(initialTempo.bpm) && initialTempo.bpm > 0;

const buildAbcExportFallbackTempoHeader = (tempoBpm: number): string =>
  Number.isFinite(tempoBpm) ? `Q:1/4=${Math.round(tempoBpm)}` : "";

const buildAbcExportTempoHeader = (doc: Document): string =>
  (() => {
    const initialTempo = readInitialTempoFromMusicXml(doc);
    return initialTempo
      ? (hasAbcExportUnitTempoHeader(initialTempo)
          ? `Q:${fractionToAbcTempoUnit(initialTempo.unit)}=${Math.round(initialTempo.bpm)}`
          : buildAbcExportFallbackTempoHeader(initialTempo.bpm))
      : buildAbcExportFallbackTempoHeader(NaN);
  })();

const readAbcExportTitle = (doc: Document): string =>
  doc.querySelector("work > work-title")?.textContent?.trim() ??
  doc.querySelector("movement-title")?.textContent?.trim() ??
  "mikuscore";

const readAbcExportComposer = (doc: Document): string =>
  doc.querySelector('identification > creator[type="composer"]')?.textContent?.trim() ?? "";

const readAbcExportDocumentCredits = (doc: Document): AbcExportDocumentCredits => ({
  title: readAbcExportTitle(doc),
  composer: readAbcExportComposer(doc),
});

const createAbcExportDocumentHeaderInfo = (doc: Document): AbcExportDocumentHeaderInfo => {
  const credits = readAbcExportDocumentCredits(doc);
  const firstMeasure = doc.querySelector("score-partwise > part > measure");
  const meterBeats = firstMeasure?.querySelector("attributes > time > beats")?.textContent?.trim() ?? "4";
  const meterBeatType = firstMeasure?.querySelector("attributes > time > beat-type")?.textContent?.trim() ?? "4";
  const fifths = Number(firstMeasure?.querySelector("attributes > key > fifths")?.textContent?.trim() ?? "0");
  const mode = firstMeasure?.querySelector("attributes > key > mode")?.textContent?.trim() ?? "major";
  const abcTempoHeader = buildAbcExportTempoHeader(doc);
  return {
    title: credits.title,
    composer: credits.composer,
    meterBeats,
    meterBeatType,
    fifths,
    key: AbcCommon.keyFromFifthsMode(Number.isFinite(fifths) ? fifths : 0, mode),
    abcTempoHeader,
  };
};

const buildAbcExportRawHeaderLines = (headerInfo: AbcExportDocumentHeaderInfo): string[] => [
  "X:1",
  `T:${headerInfo.title}`,
  headerInfo.composer ? `C:${headerInfo.composer}` : "",
  `M:${headerInfo.meterBeats}/${headerInfo.meterBeatType}`,
  `L:${fractionToAbcTempoUnit(DEFAULT_UNIT)}`,
  headerInfo.abcTempoHeader,
  `K:${headerInfo.key}`,
];

const appendAbcExportParts = (
  parts: Element[],
  exportContext: AbcExportDocumentContext
): void => {
  for (const [partIndex, part] of parts.entries()) {
    appendAbcExportPartFromRenderContext({
      part,
      partIndex,
      partNameById: exportContext.partNameById,
      fifths: exportContext.fifths,
      meterBeats: exportContext.meterBeats,
      meterBeatType: exportContext.meterBeatType,
      unitLength: exportContext.unitLength,
      headerLines: exportContext.headerLines,
      bodyLines: exportContext.bodyLines,
      metaLines: exportContext.metaLines,
    });
  }
};

export const exportMusicXmlDomToAbc = (doc: Document): string => {
  const headerInfo = createAbcExportDocumentHeaderInfo(doc);
  const exportContext: AbcExportDocumentContext = {
    headerLines: buildAbcExportRawHeaderLines(headerInfo).filter((line) => line.length > 0),
    bodyLines: [],
    metaLines: [],
    partNameById: new Map(
      Array.from(doc.querySelectorAll("part-list > score-part"))
        .map((scorePart) => {
          const id = scorePart.getAttribute("id") ?? "";
          return id ? [id, scorePart.querySelector("part-name")?.textContent?.trim() || id] : null;
        })
        .filter((entry): entry is [string, string] => entry !== null)
    ),
    fifths: headerInfo.fifths,
    meterBeats: headerInfo.meterBeats,
    meterBeatType: headerInfo.meterBeatType,
    unitLength: DEFAULT_UNIT,
  };
  appendAbcExportParts(Array.from(doc.querySelectorAll("score-partwise > part")), exportContext);
  return `${exportContext.headerLines.join("\n")}\n\n${exportContext.bodyLines.join("\n")}${exportContext.metaLines.length > 0 ? `\n${exportContext.metaLines.join("\n")}\n` : "\n"}`;
};

const xmlEscape = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const abcQuotedTextEscape = (text: string): string =>
  String(text ?? "")
    .replace(/"/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const normalizeChordToken = (raw: string): string =>
  String(raw ?? "")
    .trim()
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .replace(/\s+/g, "");

const ABC_CHORD_SYMBOL_PATTERN = /^([A-G](?:#|b)?)([^/\s"]*)?(?:\/([A-G](?:#|b)?))?$/;

const isLikelyAbcChordSymbol = (raw: string): boolean =>
  ABC_CHORD_SYMBOL_PATTERN.test(normalizeChordToken(raw));

const normalizeHarmonyChordSuffix = (suffixRaw: string): string =>
  String(suffixRaw ?? "").trim().toLowerCase();

const abcHarmonyKindBySuffix: Readonly<Record<string, string>> = {
  "": "major",
  m: "minor",
  min: "minor",
  "6": "major-sixth",
  m6: "minor-sixth",
  min6: "minor-sixth",
  "7": "dominant",
  "7sus4": "suspended-fourth",
  "9": "dominant-ninth",
  "11": "dominant-11th",
  "13": "dominant-13th",
  maj7: "major-seventh",
  maj9: "major-ninth",
  m9: "minor-ninth",
  min9: "minor-ninth",
  m7: "minor-seventh",
  min7: "minor-seventh",
  dim: "diminished",
  dim7: "diminished-seventh",
  aug: "augmented",
  "+": "augmented",
  sus4: "suspended-fourth",
  sus2: "suspended-second",
  "m7b5": "half-diminished",
  min7b5: "half-diminished",
  "ø": "half-diminished",
};

const xmlHarmonyKindFromChordSuffix = (suffixRaw: string): string | null => {
  const suffix = normalizeHarmonyChordSuffix(suffixRaw);
  return abcHarmonyKindBySuffix[suffix] ?? null;
};

type AbcHarmonyPitch = { step: string; alter: number };

const xmlHarmonyRootFromChordToken = (token: string): AbcHarmonyPitch | null => {
  const m = String(token ?? "").match(/^([A-G])(#|b)?$/);
  return m
    ? {
        step: m[1],
        alter: m[2] === "#" ? 1 : (m[2] === "b" ? -1 : 0),
      }
    : null;
};

type AbcChordSymbolParts = {
  normalized: string;
  root: AbcHarmonyPitch;
  suffix: string;
  bass: AbcHarmonyPitch | null;
};

const parseAbcChordSymbolParts = (raw: string): AbcChordSymbolParts | null => {
  const normalized = normalizeChordToken(raw);
  const match = normalized.match(ABC_CHORD_SYMBOL_PATTERN);
  if (!match) return null;
  const root = xmlHarmonyRootFromChordToken(match[1] ?? "");
  if (!root) return null;
  const bass = match[3] ? xmlHarmonyRootFromChordToken(match[3]) : null;
  return {
    normalized,
    root,
    suffix: String(match[2] ?? ""),
    bass,
  };
};

const buildHarmonyPitchXml = (
  tagName: "root" | "bass",
  pitch: AbcHarmonyPitch
): string => [
  `<${tagName}>`,
  `<${tagName}-step>${xmlEscape(pitch.step)}</${tagName}-step>`,
  pitch.alter !== 0 ? `<${tagName}-alter>${pitch.alter}</${tagName}-alter>` : "",
  `</${tagName}>`,
].join("");

const buildHarmonyXmlFromChordSymbol = (raw: string): string => {
  const parts = parseAbcChordSymbolParts(raw);
  if (!parts) return "";
  const kind = xmlHarmonyKindFromChordSuffix(parts.suffix);
  return kind
    ? [
        "<harmony>",
        buildHarmonyPitchXml("root", parts.root),
        parts.bass ? buildHarmonyPitchXml("bass", parts.bass) : "",
        `<kind text="${xmlEscape(parts.normalized)}">${kind}</kind>`,
        "</harmony>",
      ].join("")
    : "";
};

const abcHarmonySuffixByKindValue: Readonly<Record<string, string>> = {
  major: "",
  minor: "m",
  "major-sixth": "6",
  "minor-sixth": "m6",
  dominant: "7",
  "dominant-11th": "11",
  "dominant-13th": "13",
  "dominant-ninth": "9",
  "major-seventh": "maj7",
  "major-ninth": "maj9",
  "minor-ninth": "m9",
  "minor-seventh": "m7",
  diminished: "dim",
  "diminished-seventh": "dim7",
  augmented: "aug",
  "suspended-fourth": "sus4",
  "suspended-second": "sus2",
  "half-diminished": "m7b5",
};

const abcChordSymbolFromHarmony = (harmony: Element | null): string => {
  if (!harmony) return "";
  const rootNode = harmony.querySelector(":scope > root");
  const rootStep = rootNode ? (rootNode.querySelector(":scope > root-step")?.textContent ?? "").trim() : "";
  const rootAlter = rootNode ? Number(rootNode.querySelector(":scope > root-alter")?.textContent ?? "0") : 0;
  const rootNormalizedStep = String(rootStep ?? "").trim().toUpperCase();
  const rootToken =
    /^[A-G]$/.test(rootNormalizedStep)
      ? `${rootNormalizedStep}${rootAlter === 1 ? "#" : (rootAlter === -1 ? "b" : "")}`
      : "";
  if (!rootToken) return "";
  const kindNode = harmony.querySelector(":scope > kind");
  const kindTextAttr = kindNode?.getAttribute("text")?.trim() ?? "";
  if (kindTextAttr) return abcQuotedTextEscape(kindTextAttr);
  const bassNode = harmony.querySelector(":scope > bass");
  const bassStep = bassNode ? (bassNode.querySelector(":scope > bass-step")?.textContent ?? "").trim() : "";
  const bassAlter = bassNode ? Number(bassNode.querySelector(":scope > bass-alter")?.textContent ?? "0") : 0;
  const bassNormalizedStep = String(bassStep ?? "").trim().toUpperCase();
  const bassPitchToken =
    /^[A-G]$/.test(bassNormalizedStep)
      ? `${bassNormalizedStep}${bassAlter === 1 ? "#" : (bassAlter === -1 ? "b" : "")}`
      : "";
  const kindValue = String(kindNode?.textContent ?? "").trim().toLowerCase();
  const suffix = abcHarmonySuffixByKindValue[kindValue] ?? "";
  return `${rootToken}${suffix}${bassPitchToken ? `/${bassPitchToken}` : ""}`;
};

const normalizeAbcLyricText = (text: string): string =>
  String(text ?? "").trim().replace(/\s+/g, "~");

const normalizeAbcLyricSyllabicMode = (
  syllabic?: "single" | "begin" | "middle" | "end" | string
): string =>
  String(syllabic ?? "single").trim().toLowerCase();

const shouldAppendAbcLyricHyphen = (syllabicMode: string): boolean =>
  syllabicMode === "begin" || syllabicMode === "middle";

const abcLyricTokenFromMusicXml = (
  text: string,
  syllabic?: "single" | "begin" | "middle" | "end" | string
): string => {
  const normalized = normalizeAbcLyricText(text);
  const mode = normalizeAbcLyricSyllabicMode(syllabic);
  if (!normalized) return "*";
  return shouldAppendAbcLyricHyphen(mode) ? `${normalized}-` : normalized;
};

const normalizeMusicXmlTypeName = (t?: string): string =>
  String(t ?? "").trim();

const isSupportedMusicXmlTypeName = (typeName: string): boolean =>
  typeName === "16th" ||
  typeName === "32nd" ||
  typeName === "64th" ||
  typeName === "128th" ||
  typeName === "whole" ||
  typeName === "half" ||
  typeName === "quarter" ||
  typeName === "eighth";

const normalizeTypeForMusicXml = (t?: string): string => {
  const raw = normalizeMusicXmlTypeName(t);
  return raw && isSupportedMusicXmlTypeName(raw) ? raw : "quarter";
};

const normalizeMusicXmlVoiceText = (voice?: string): string =>
  String(voice ?? "").trim();

const isPositiveIntegerVoiceText = (voiceText: string): boolean =>
  /^[1-9]\d*$/.test(voiceText);

const extractFirstVoiceNumberText = (voiceText: string): string =>
  voiceText.match(/\d+/)?.[0] ?? "";

const normalizeMusicXmlVoiceNumberText = (voiceNumberText: string): string => {
  const n = Number(voiceNumberText);
  return Number.isFinite(n) && n > 0 ? String(Math.round(n)) : "1";
};

const normalizeVoiceForMusicXml = (voice?: string): string => {
  const raw = normalizeMusicXmlVoiceText(voice);
  if (!raw) return "1";
  if (isPositiveIntegerVoiceText(raw)) return raw;
  const numberText = extractFirstVoiceNumberText(raw);
  return numberText ? normalizeMusicXmlVoiceNumberText(numberText) : "1";
};

const midiByStepForAbcImport: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const normalizeAbcImportStep = (step?: string): string =>
  String(step ?? "").trim().toUpperCase();

const normalizeAbcImportClefName = (clef?: string): string =>
  String(clef ?? "").trim().toLowerCase();

const collectAbcImportClefMidiKeys = (part: AbcParsedPart): number[] => {
  const keys: number[] = [];
  for (const measure of part?.measures ?? []) {
    for (const note of measure ?? []) {
      if (!note || note.isRest) {
        continue;
      }
      const step = normalizeAbcImportStep(note.step);
      if (!Object.prototype.hasOwnProperty.call(midiByStepForAbcImport, step)) {
        continue;
      }
      const octave = Number.isFinite(Number(note.octave)) ? Math.round(Number(note.octave)) : 4;
      const alter = Number.isFinite(Number(note.alter)) ? Math.round(Number(note.alter)) : 0;
      keys.push((octave + 1) * 12 + midiByStepForAbcImport[step] + alter);
    }
  }
  return keys;
};

const abcImportClefNameFromMidiKeys = (keys: number[]): string =>
  chooseSingleClefByKeys(keys) === "F" ? "bass" : "treble";

const resolveAbcImportClef = (part: AbcParsedPart): string => {
  const explicit = normalizeAbcImportClefName(part?.clef);
  const keys = collectAbcImportClefMidiKeys(part);
  if (explicit) return explicit;
  if (!keys.length) return explicit;
  return abcImportClefNameFromMidiKeys(keys);
};

const clefFeatureByAbcClefName: Readonly<Record<string, ClefFeature>> = {
  bass: { sign: "F", line: 4 },
  f: { sign: "F", line: 4 },
  alto: { sign: "C", line: 3 },
  c3: { sign: "C", line: 3 },
  tenor: { sign: "C", line: 4 },
  c4: { sign: "C", line: 4 },
  treble: { sign: "G", line: 2 },
  g: { sign: "G", line: 2 },
};

const clefFeatureFromAbcClefName = (clef: string): ClefFeature =>
  clefFeatureByAbcClefName[clef] ?? { sign: "G", line: 2 };

export const clefXmlFromAbcClef = (rawClef?: string): string =>
  buildMusicXmlClefXml(clefFeatureFromAbcClefName(normalizeAbcImportClefName(rawClef)));

type AbcParsedMeta = {
  title: string;
  composer: string;
  meter: { beats: number; beatType: number };
  keyInfo: { fifths: number };
  tempoBpm?: number | null;
};

type AbcParsedNote = {
  isRest: boolean;
  duration: number;
  staff?: number;
  type?: string;
  beamMode?: "begin" | "mid";
  step?: string;
  octave?: number;
  alter?: number | null;
  accidentalText?: string | null;
  accidentalEditorial?: boolean;
  accidentalCautionary?: boolean;
  tieStart?: boolean;
  tieStop?: boolean;
  slurStart?: boolean;
  slurStop?: boolean;
  chord?: boolean;
  grace?: boolean;
  graceSlash?: boolean;
  trill?: boolean;
  trillLineStart?: boolean;
  trillLineStop?: boolean;
  trillAccidentalText?: string;
  turnType?: "turn" | "inverted-turn";
  turnSlash?: boolean;
  delayedTurn?: boolean;
  mordentType?: "mordent" | "inverted-mordent";
  phraseMark?: "shortphrase" | "mediumphrase" | "longphrase";
  tremoloType?: "single" | "start" | "stop";
  tremoloMarks?: number;
  glissandoStart?: boolean;
  glissandoStop?: boolean;
  slideStart?: boolean;
  slideStop?: boolean;
  schleifer?: boolean;
  shake?: boolean;
  arpeggiate?: boolean;
  staccato?: boolean;
  staccatissimo?: boolean;
  accent?: boolean;
  tenuto?: boolean;
  stress?: boolean;
  unstress?: boolean;
  fermataType?: "normal" | "inverted";
  strongAccent?: boolean;
  breathMark?: boolean;
  caesura?: boolean;
  segno?: boolean;
  coda?: boolean;
  fine?: boolean;
  daCapo?: boolean;
  dalSegno?: boolean;
  toCoda?: boolean;
  crescendoStart?: boolean;
  crescendoStop?: boolean;
  diminuendoStart?: boolean;
  diminuendoStop?: boolean;
  rehearsalMark?: string;
  dynamicMark?: "ppp" | "pp" | "p" | "mp" | "mf" | "f" | "ff" | "fff" | "fp" | "fz" | "rfz" | "sf" | "sfp";
  sfz?: boolean;
  upBow?: boolean;
  downBow?: boolean;
  doubleTongue?: boolean;
  tripleTongue?: boolean;
  heel?: boolean;
  toe?: boolean;
  fingerings?: string[];
  strings?: string[];
  plucks?: string[];
  chordSymbols?: string[];
  openString?: boolean;
  snapPizzicato?: boolean;
  harmonic?: boolean;
  stopped?: boolean;
  thumbPosition?: boolean;
  annotations?: string[];
  lyricText?: string;
  lyricSyllabic?: "single" | "begin" | "middle" | "end";
  lyricExtend?: boolean;
  timeModification?: { actual: number; normal: number };
  tupletStart?: boolean;
  tupletStop?: boolean;
  voice?: string;
};

type AbcParsedPart = LayoutAbcParsedPart<AbcParsedNote, AbcMeasureMeta>;

type AbcParsedResult = {
  meta: AbcParsedMeta;
  parts: AbcParsedPart[];
  warnings?: string[];
  diagnostics?: Array<{
    level: "warn";
    code: string;
    fmt: "abc";
    message?: string;
    voiceId?: string;
    measure?: number;
    action?: string;
    movedEvents?: number;
  }>;
};

type AbcParsedStaffVoice = LayoutAbcParsedStaffVoice<AbcParsedNote>;

type AbcPartRenderState = {
  currentPartFifths: number;
  currentPartMeter: { beats: number; beatType: number };
  currentPartTempo: number | null;
};

type AbcPartMeasureRenderContext = {
  notes: AbcParsedNote[];
  measureMeta: NonNullable<AbcParsedPart["measureMetaByIndex"]>[number] | null;
  hintedFifths: number | null;
  hintedMeter: { beats: number; beatType: number } | null;
  hintedTempo: number | null;
  nextState: AbcPartRenderState;
  currentMeasureDurationDiv: number;
  inferredImplicitPickup: boolean;
};

type AbcRenderedPartMeasureContext = {
  part: AbcParsedPart;
  partIndex: number;
  measureIndex: number;
  measureNo: number;
  notes: AbcParsedNote[];
  measureMeta: NonNullable<AbcParsedPart["measureMetaByIndex"]>[number] | null;
  hintedFifths: number | null;
  hintedMeter: { beats: number; beatType: number } | null;
  hintedTempo: number | null;
  currentPartFifths: number;
  currentPartMeter: { beats: number; beatType: number };
  currentPartTempo: number | null;
  currentMeasureDurationDiv: number;
  inferredImplicitPickup: boolean;
  debugMetadata: boolean;
  sourceMetadata: boolean;
  diagnostics: AbcParsedResult["diagnostics"] | undefined;
  abcSource: string;
  buildMeasureNotesXml: (notes: AbcParsedNote[], staffOverride?: number | null) => string;
};

export type AbcImportOptions = {
  debugMetadata?: boolean;
  debugPrettyPrint?: boolean;
  sourceMetadata?: boolean;
  overfullCompatibilityMode?: boolean;
};

const toHex = (value: number, width = 2): string => {
  const safe = Math.max(0, Math.round(Number(value ?? 0)));
  return `0x${safe.toString(16).toUpperCase().padStart(width, "0")}`;
};

const normalizeAbcDebugStep = (note: AbcParsedNote): string =>
  note.isRest ? "R" : (/^[A-G]$/.test(String(note.step ?? "").toUpperCase()) ? String(note.step).toUpperCase() : "C");

const normalizeAbcDebugOctave = (octave?: number): number =>
  Number.isFinite(Number(octave)) ? Math.max(0, Math.min(9, Math.round(Number(octave)))) : 4;

const normalizeAbcDebugAlter = (alter?: number): number =>
  Number.isFinite(Number(alter)) ? Math.round(Number(alter)) : 0;

const buildAbcMeasureDebugMiscXml = (notes: AbcParsedNote[], measureNo: number): string =>
  notes.length
    ? `<attributes><miscellaneous><miscellaneous-field name="mks:dbg:abc:meta:count">${toHex(notes.length, 4)}</miscellaneous-field>${notes
        .map(
          (note, index) =>
            `<miscellaneous-field name="mks:dbg:abc:meta:${String(index + 1).padStart(4, "0")}">${[
              [
                `idx=${toHex(index, 4)}`,
                `m=${toHex(measureNo, 4)}`,
                `v=${xmlEscape(normalizeVoiceForMusicXml(note.voice))}`,
              ].join(";"),
              [
                `r=${note.isRest ? "1" : "0"}`,
                `g=${note.grace ? "1" : "0"}`,
                `ch=${note.chord ? "1" : "0"}`,
                `st=${normalizeAbcDebugStep(note)}`,
                `al=${String(normalizeAbcDebugAlter(note.alter))}`,
                `oc=${toHex(normalizeAbcDebugOctave(note.octave), 2)}`,
                `dd=${toHex(note.grace ? 0 : buildAbcNoteCoreDurationValuePart(note), 4)}`,
                `tp=${xmlEscape(normalizeTypeForMusicXml(note.type))}`,
              ].join(";"),
            ].join(";")}</miscellaneous-field>`,
        )
        .join("")}</miscellaneous></attributes>`
    : "";

const encodeAbcSourceForMiscXml = (abcSource: string): string =>
  String(abcSource ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");

const buildAbcSourceMiscXml = (abcSource: string): string => {
  const source = String(abcSource ?? "");
  if (!source.length) return "";
  const encoded = encodeAbcSourceForMiscXml(source);
  const CHUNK_SIZE = 240;
  const MAX_CHUNKS = 512;
  const chunks: string[] = [];
  for (let i = 0; i < encoded.length && chunks.length < MAX_CHUNKS; i += CHUNK_SIZE) {
    chunks.push(encoded.slice(i, i + CHUNK_SIZE));
  }
  const truncated = chunks.join("").length < encoded.length;
  return `<attributes><miscellaneous>${[
    `<miscellaneous-field name="mks:src:abc:raw-encoding">escape-v1</miscellaneous-field>`,
    `<miscellaneous-field name="mks:src:abc:raw-length">${xmlEscape(String(source.length))}</miscellaneous-field>`,
    `<miscellaneous-field name="mks:src:abc:raw-encoded-length">${xmlEscape(String(encoded.length))}</miscellaneous-field>`,
    `<miscellaneous-field name="mks:src:abc:raw-chunks">${xmlEscape(String(chunks.length))}</miscellaneous-field>`,
    `<miscellaneous-field name="mks:src:abc:raw-truncated">${truncated ? "1" : "0"}</miscellaneous-field>`,
    ...chunks.map(
      (chunk, index) =>
        `<miscellaneous-field name="mks:src:abc:raw-${String(index + 1).padStart(4, "0")}">${xmlEscape(chunk)}</miscellaneous-field>`,
    ),
  ].join("")}</miscellaneous></attributes>`;
};

const buildAbcDiagMiscXml = (
  diagnostics: Array<{
    level: "warn";
    code: string;
    fmt: "abc";
    message?: string;
    voiceId?: string;
    measure?: number;
    action?: string;
    movedEvents?: number;
  }>  
): string =>
  diagnostics.length
    ? `<attributes><miscellaneous><miscellaneous-field name="mks:diag:count">${Math.min(256, diagnostics.length)}</miscellaneous-field>${Array.from(
        { length: Math.min(256, diagnostics.length) },
        (_, i) =>
          `<miscellaneous-field name="mks:diag:${String(i + 1).padStart(4, "0")}">${[
            `level=${diagnostics[i].level}`,
            `code=${diagnostics[i].code}`,
            `fmt=${diagnostics[i].fmt}`,
            ...(diagnostics[i].measure !== undefined && Number.isFinite(diagnostics[i].measure)
              ? [`measure=${Math.max(1, Math.round(Number(diagnostics[i].measure)))}`]
              : []),
            ...(diagnostics[i].movedEvents !== undefined && Number.isFinite(diagnostics[i].movedEvents)
              ? [`movedEvents=${Math.max(0, Math.round(Number(diagnostics[i].movedEvents)))}`]
              : []),
            ...(diagnostics[i].voiceId ? [`voice=${xmlEscape(diagnostics[i].voiceId)}`] : []),
            ...(diagnostics[i].action ? [`action=${xmlEscape(diagnostics[i].action)}`] : []),
            ...(diagnostics[i].message ? [`message=${xmlEscape(diagnostics[i].message)}`] : []),
          ].join(";")}</miscellaneous-field>`
      ).join("")}</miscellaneous></attributes>`
    : "";

const prettyPrintXml = (xml: string): string => {
  const compact = xml.replace(/>\s+</g, "><").trim();
  const split = compact.replace(/(>)(<)(\/*)/g, "$1\n$2$3").split("\n");
  let indent = 0;
  const lines: string[] = [];
  for (const rawToken of split) {
    const token = rawToken.trim();
    if (!token) continue;
    if (/^<\//.test(token)) indent = Math.max(0, indent - 1);
    lines.push(`${"  ".repeat(indent)}${token}`);
    const isOpening = /^<[^!?/][^>]*>$/.test(token);
    const isSelfClosing = /\/>$/.test(token);
    if (isOpening && !isSelfClosing) indent += 1;
  }
  return lines.join("\n");
};

const resolveAbcParsedPartsForExport = (parts: AbcParsedPart[] | undefined): AbcParsedPart[] =>
  (parts && parts.length > 0 ? parts : [{ partId: "P1", partName: "Voice 1", measures: [[]] }]).map((part) => ({
    ...part,
    clef: resolveAbcImportClef(part),
  }));

type AbcMusicXmlExportContext = {
  resolvedParts: AbcParsedPart[];
  measureCount: number;
  title: string;
  composer: string;
  beats: number;
  beatType: number;
  defaultFifths: number;
  divisions: number;
  beatDiv: number;
  measureDurationDiv: number;
  emptyMeasureRestType: string;
  tempoBpm: number | null;
};

const buildAbcMusicXmlExportContext = (parsed: AbcParsedResult): AbcMusicXmlExportContext => {
  const resolvedParts = resolveAbcParsedPartsForExport(parsed.parts);
  const measureCount = resolvedParts.reduce((max, part) => Math.max(max, part.measures.length), 1);
  const title = parsed.meta?.title || "mikuscore";
  const composer = parsed.meta?.composer || "Unknown";
  const beats = parsed.meta?.meter?.beats || 4;
  const beatType = parsed.meta?.meter?.beatType || 4;
  const defaultFifths = Number.isFinite(parsed.meta?.keyInfo?.fifths) ? parsed.meta.keyInfo.fifths : 0;
  const divisions = 960;
  const beatDiv = Math.max(1, Math.round((divisions * 4) / Math.max(1, Math.round(beatType))));
  const measureDurationDiv = Math.max(1, Math.round((divisions * 4 * Math.max(1, Math.round(beats))) / Math.max(1, Math.round(beatType))));
  const emptyMeasureRestType = normalizeTypeForMusicXml(typeFromDuration(measureDurationDiv, divisions));
  const tempoBpm =
    Number.isFinite(parsed.meta?.tempoBpm as number) && Number(parsed.meta?.tempoBpm) > 0
      ? Math.max(20, Math.min(300, Math.round(Number(parsed.meta?.tempoBpm))))
      : null;
  return {
    resolvedParts,
    measureCount,
    title,
    composer,
    beats,
    beatType,
    defaultFifths,
    divisions,
    beatDiv,
    measureDurationDiv,
    emptyMeasureRestType,
    tempoBpm,
  };
};

const buildAbcScorePartwiseXmlDocument = (
  title: string,
  composer: string,
  partListXml: string,
  partBodyXml: string
): string => [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<score-partwise version="4.0">',
  `<work><work-title>${xmlEscape(title)}</work-title></work>`,
  `<identification><creator type="composer">${xmlEscape(composer)}</creator></identification>`,
  `<part-list>${partListXml}</part-list>`,
  partBodyXml,
  "</score-partwise>",
].join("");

export const convertAbcToMusicXml = (abcSource: string, options: AbcImportOptions = {}): string => {
  const parsed = AbcCompatParser.parseForMusicXml(abcSource, {
    defaultTitle: "mikuscore",
    defaultComposer: "Unknown",
    inferTransposeFromPartName: true,
    overfullCompatibilityMode: options.overfullCompatibilityMode !== false,
  }) as AbcParsedResult;
  const debugMetadata = options.debugMetadata ?? true;
  const sourceMetadata = options.sourceMetadata ?? true;
  const debugPrettyPrint = options.debugPrettyPrint ?? debugMetadata;
  const exportContext = buildAbcMusicXmlExportContext(parsed);
  const buildMeasureNotesXml = (notes: AbcParsedNote[], staffOverride: number | null = null): string =>
    buildAbcMeasureNotesXml(
      notes,
      exportContext.measureDurationDiv,
      exportContext.emptyMeasureRestType,
      exportContext.beatDiv,
      staffOverride
    );
  const partBodyXml = exportContext.resolvedParts
    .map((part, partIndex) =>
      buildAbcPartXml(
        part,
        partIndex,
        exportContext.measureCount,
        exportContext.defaultFifths,
        exportContext.beats,
        exportContext.beatType,
        exportContext.tempoBpm,
        debugMetadata,
        sourceMetadata,
        parsed.diagnostics,
        abcSource,
        buildMeasureNotesXml
      )
    )
    .join("");
  const xml = buildAbcScorePartwiseXmlDocument(
    exportContext.title,
    exportContext.composer,
    exportContext.resolvedParts
      .map((part, index) =>
        [
          `<score-part id="${xmlEscape(part.partId)}">`,
          `<part-name>${xmlEscape(part.partName || part.partId)}</part-name>`,
          `<midi-instrument id="${xmlEscape(part.partId)}-I1">`,
          `<midi-channel>${((index % 16) + 1 === 10) ? 11 : ((index % 16) + 1)}</midi-channel>`,
          `<midi-program>6</midi-program>`,
          "</midi-instrument>",
          "</score-part>",
        ].join("")
      )
      .join(""),
    partBodyXml
  );
  return debugPrettyPrint ? prettyPrintXml(xml) : xml;
};
