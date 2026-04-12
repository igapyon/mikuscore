/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import { lexAbcAccidental, lexAbcLengthToken, lexAbcNote } from "./abc-lexer";

// Low-level parsed note and pitch data.
export type AbcParsedNote = {
  accidentalText: string;
  pitchChar: string;
  octaveShift: string;
  lengthToken: string;
  nextIdx: number;
};

export type AbcParsedPitchSource = Pick<AbcParsedNote, "accidentalText" | "pitchChar" | "octaveShift">;

export type AbcMalformedAccidental = {
  kind: "malformed-accidental";
  accidentalText: string;
  nextIdx: number;
};

export type AbcInvalidChord = {
  kind: "invalid-chord";
  nextIdx: number;
};

export type AbcParsedGraceNote = Omit<AbcParsedNote, "nextIdx"> & {
  graceSlash: boolean;
};

export type AbcParsedChord = {
  notes: Array<Omit<AbcParsedNote, "nextIdx">>;
  lengthToken: string;
  nextIdx: number;
};

export type AbcParsedGraceGroup = {
  notes: AbcParsedGraceNote[];
  nextIdx: number;
};

// Structural tokens and body-level parser results.
export type AbcParsedTuplet = {
  actual: number;
  normal: number;
  count: number;
  nextIdx: number;
  raw: string;
};

export type AbcParsedRepeatEndingMarker = {
  marker: string;
  nextIdx: number;
};

export type AbcParsedInlineField = {
  fieldName: string;
  fieldValue: string;
  nextIdx: number;
};

export type AbcParsedBarlineToken = {
  nextIdx: number;
  endsMeasure: boolean;
  repeatEnd: boolean;
  repeatStart: boolean;
  endingStop: boolean;
};

export type AbcParsedStandaloneBodyField = {
  fieldName: string;
  fieldValue: string;
  token: string;
  nextIdx: number;
};

export type AbcParsedUnsupportedBodyToken = {
  token: string;
  nextIdx: number;
};

export type AbcParsedDelimitedSpan = {
  delimiter: string;
  text: string;
  nextIdx: number;
};

export type AbcParsedQuotedString = {
  rawText: string;
  normalizedText: string;
  nextIdx: number;
  terminated: boolean;
};

export type AbcParsedDecoration = {
  rawDecoration: string;
  decoration: string;
  delimiter: string;
  nextIdx: number;
  terminated: boolean;
};

export type AbcParsedBrokenRhythm = {
  symbol: ">" | "<";
  leftScale: { num: number; den: number };
  rightScale: { num: number; den: number };
  nextIdx: number;
};

export type AbcParsedSingleCharShorthand = {
  kind:
    | "arpeggiate"
    | "fermata"
    | "accent"
    | "mordent"
    | "inverted-mordent"
    | "coda"
    | "segno"
    | "trill"
    | "upbow"
    | "downbow"
    | "staccato";
  nextIdx: number;
};

export type AbcParsedTie = {
  nextIdx: number;
};

export type AbcParsedSlurStop = {
  nextIdx: number;
};

export type AbcParsedParenToken =
  | { kind: "tuplet"; tuplet: AbcParsedTuplet }
  | { kind: "slur-start"; nextIdx: number };

export type AbcParsedBracketToken =
  | { kind: "inline-field"; inlineField: AbcParsedInlineField }
  | { kind: "repeat-ending"; repeatEndingMarker: AbcParsedRepeatEndingMarker }
  | { kind: "chord-start"; nextIdx: number };

export type AbcParsedBodyToken =
  | { kind: "broken-rhythm"; brokenRhythm: AbcParsedBrokenRhythm }
  | { kind: "paren"; parenToken: AbcParsedParenToken }
  | { kind: "single-char-shorthand"; shorthand: AbcParsedSingleCharShorthand }
  | { kind: "tie"; tie: AbcParsedTie }
  | { kind: "quoted-string"; quotedString: AbcParsedQuotedString }
  | { kind: "decoration"; decoration: AbcParsedDecoration }
  | { kind: "bracket"; bracketToken: AbcParsedBracketToken }
  | { kind: "slur-stop"; slurStop: AbcParsedSlurStop };

export type AbcParsedPlayableEvent =
  | {
      kind: "playable";
      pitchSources: AbcParsedPitchSource[];
      rawLengthToken: string;
      nextIdx: number;
      source: "note" | "chord";
    }
  | AbcMalformedAccidental
  | AbcInvalidChord
  | null;

export type AbcParsedBodyEntry =
  | { kind: "barline"; barlineToken: AbcParsedBarlineToken }
  | { kind: "standalone-body-field"; standaloneBodyField: AbcParsedStandaloneBodyField }
  | { kind: "unsupported-body-token"; unsupportedBodyToken: AbcParsedUnsupportedBodyToken }
  | { kind: "unsupported-body-number"; unsupportedBodyNumber: AbcParsedUnsupportedBodyToken }
  | { kind: "body-token"; bodyToken: AbcParsedBodyToken }
  | { kind: "playable-event"; playableEvent: Exclude<AbcParsedPlayableEvent, null> }
  | null;

// Narrow parser return types.
export type AbcNoteParseResult =
  | { kind: "note"; note: AbcParsedNote }
  | AbcMalformedAccidental
  | null;

// Shared parser utilities and static lookup tables.
const toAbcParsedPitchSource = (note: AbcParsedPitchSource): AbcParsedPitchSource => ({
  accidentalText: note.accidentalText,
  pitchChar: note.pitchChar,
  octaveShift: note.octaveShift,
});

const firstMatch = <T>(matchers: Array<() => T | null>): T | null => {
  for (const matcher of matchers) {
    const matched = matcher();
    if (matched) {
      return matched;
    }
  }
  return null;
};

const matchParsed = <TSource, TResult>(
  parse: () => TSource | null,
  map: (parsed: TSource) => TResult
): TResult | null => {
  const parsed = parse();
  return parsed ? map(parsed) : null;
};

// Text access helpers.
const rawText = (text: string): string => String(text || "");
const charAt = (text: string, idx: number): string => rawText(text)[idx] || "";
const sliceFrom = (text: string, startIdx: number): string => rawText(text).slice(startIdx);
const matchFrom = (text: string, startIdx: number, pattern: RegExp): RegExpMatchArray | null =>
  sliceFrom(text, startIdx).match(pattern);

// Wrapper builders for higher-level parser results.
const withBracketToken = <TKind extends AbcParsedBracketToken["kind"]>(
  kind: TKind,
  payload: Omit<Extract<AbcParsedBracketToken, { kind: TKind }>, "kind">
): Extract<AbcParsedBracketToken, { kind: TKind }> =>
  ({
    kind,
    ...payload,
  }) as Extract<AbcParsedBracketToken, { kind: TKind }>;

const withBodyToken = <TKind extends AbcParsedBodyToken["kind"]>(
  kind: TKind,
  payload: Omit<Extract<AbcParsedBodyToken, { kind: TKind }>, "kind">
): Extract<AbcParsedBodyToken, { kind: TKind }> =>
  ({
    kind,
    ...payload,
  }) as Extract<AbcParsedBodyToken, { kind: TKind }>;

const withBodyEntry = <TKind extends Exclude<AbcParsedBodyEntry, null>["kind"]>(
  kind: TKind,
  payload: Omit<Extract<Exclude<AbcParsedBodyEntry, null>, { kind: TKind }>, "kind">
): Extract<Exclude<AbcParsedBodyEntry, null>, { kind: TKind }> =>
  ({
    kind,
    ...payload,
  }) as Extract<Exclude<AbcParsedBodyEntry, null>, { kind: TKind }>;

const withPlayableEvent = (
  source: "note" | "chord",
  pitchSources: AbcParsedPitchSource[],
  rawLengthToken: string,
  nextIdx: number
): Extract<AbcParsedPlayableEvent, { kind: "playable" }> => ({
  kind: "playable",
  pitchSources,
  rawLengthToken,
  nextIdx,
  source,
});

const withInvalidChord = (nextIdx: number): Extract<AbcParsedPlayableEvent, { kind: "invalid-chord" }> => ({
  kind: "invalid-chord",
  nextIdx,
});

// Static lookup tables.
const ABC_BARLINE_CANDIDATES: Array<{
  token: string;
  endsMeasure: boolean;
  repeatEnd: boolean;
  repeatStart: boolean;
  endingStop: boolean;
}> = [
  { token: ":|]", endsMeasure: true, repeatEnd: true, repeatStart: false, endingStop: true },
  { token: ":|:", endsMeasure: true, repeatEnd: true, repeatStart: true, endingStop: false },
  { token: "|:", endsMeasure: true, repeatEnd: false, repeatStart: true, endingStop: false },
  { token: ":|", endsMeasure: true, repeatEnd: true, repeatStart: false, endingStop: false },
  { token: "::", endsMeasure: true, repeatEnd: true, repeatStart: true, endingStop: false },
  { token: "[|", endsMeasure: true, repeatEnd: false, repeatStart: false, endingStop: false },
  { token: "|]", endsMeasure: true, repeatEnd: false, repeatStart: false, endingStop: false },
  { token: "||", endsMeasure: true, repeatEnd: false, repeatStart: false, endingStop: false },
  { token: "|", endsMeasure: true, repeatEnd: false, repeatStart: false, endingStop: false },
  { token: ":", endsMeasure: false, repeatEnd: false, repeatStart: false, endingStop: false },
];

const ABC_SINGLE_CHAR_SHORTHAND_BY_CHAR: Record<string, AbcParsedSingleCharShorthand["kind"]> = {
  "~": "arpeggiate",
  H: "fermata",
  L: "accent",
  M: "mordent",
  O: "coda",
  P: "inverted-mordent",
  S: "segno",
  T: "trill",
  u: "upbow",
  v: "downbow",
  ".": "staccato",
};

// Low-level lexical and structural parsers.
export const parseAbcNoteAt = (text: string, startIdx: number): AbcNoteParseResult => {
  const note = lexAbcNote(text, startIdx);
  if (note) {
    return { kind: "note", note };
  }
  const accidental = lexAbcAccidental(text, startIdx);
  if (accidental) {
    return {
      kind: "malformed-accidental",
      accidentalText: accidental.accidentalText,
      nextIdx: accidental.nextIdx,
    };
  }
  return null;
};

export const parseAbcChordAt = (text: string, startIdx: number): AbcParsedChord | null => {
  if (text[startIdx] !== "[") {
    return null;
  }
  const closeIdx = text.indexOf("]", startIdx + 1);
  if (closeIdx < 0) {
    return null;
  }
  const inner = text.slice(startIdx + 1, closeIdx);
  const notes: Array<Omit<AbcParsedNote, "nextIdx">> = [];
  let idx = 0;
  while (idx < inner.length) {
    const ch = inner[idx];
    if (ch === " " || ch === "\t") {
      idx += 1;
      continue;
    }
    const noteResult = parseAbcNoteAt(inner, idx);
    if (noteResult?.kind === "note") {
      notes.push({
        accidentalText: noteResult.note.accidentalText,
        pitchChar: noteResult.note.pitchChar,
        octaveShift: noteResult.note.octaveShift,
        lengthToken: noteResult.note.lengthToken,
      });
      idx = noteResult.note.nextIdx;
      continue;
    }
    idx = noteResult?.kind === "malformed-accidental" ? noteResult.nextIdx : idx + 1;
  }
  if (notes.length === 0) {
    return null;
  }
  const length = lexAbcLengthToken(text, closeIdx + 1);
  return {
    notes,
    lengthToken: length?.token || "",
    nextIdx: length?.nextIdx || closeIdx + 1,
  };
};

export const parseAbcGraceGroupAt = (
  text: string,
  startIdx: number,
  lineNo: number,
  warnings: string[]
): AbcParsedGraceGroup | null => {
  if (text[startIdx] !== "{") return null;
  const closeIdx = text.indexOf("}", startIdx + 1);
  if (closeIdx < 0) return null;
  const inner = text.slice(startIdx + 1, closeIdx);
  const notes: AbcParsedGraceNote[] = [];
  let idx = 0;
  let graceSlashPending = false;
  while (idx < inner.length) {
    const ch = inner[idx];
    if (ch === " " || ch === "\t") {
      idx += 1;
      continue;
    }
    if (ch === "/") {
      graceSlashPending = true;
      idx += 1;
      continue;
    }
    const noteResult = parseAbcNoteAt(inner, idx);
    if (noteResult?.kind === "note") {
      notes.push({
        accidentalText: noteResult.note.accidentalText,
        pitchChar: noteResult.note.pitchChar,
        octaveShift: noteResult.note.octaveShift,
        lengthToken: noteResult.note.lengthToken,
        graceSlash: graceSlashPending,
      });
      graceSlashPending = false;
      idx = noteResult.note.nextIdx;
      continue;
    }
    if (noteResult?.kind === "malformed-accidental") {
      warnings.push("line " + lineNo + ": Skipped malformed grace accidental token: " + noteResult.accidentalText);
      idx = noteResult.nextIdx;
      continue;
    }
    idx += 1;
  }
  return { notes, nextIdx: closeIdx + 1 };
};

export const parseAbcTupletAt = (text: string, startIdx: number): AbcParsedTuplet | null => {
  if (charAt(text, startIdx) !== "(") {
    return null;
  }
  const match = matchFrom(text, startIdx, /^\((\d)(?::(\d))?(?::(\d))?/);
  if (!match) {
    return null;
  }
  const actual = Number(match[1] || 0);
  const normalRaw = match[2] ? Number(match[2]) : NaN;
  const countRaw = match[3] ? Number(match[3]) : NaN;
  const normal = Number.isFinite(normalRaw) && normalRaw > 0 ? normalRaw : (actual === 3 ? 2 : actual);
  const count = Number.isFinite(countRaw) && countRaw > 0 ? countRaw : actual;
  return {
    actual,
    normal,
    count,
    nextIdx: startIdx + match[0].length,
    raw: match[0],
  };
};

export const parseAbcRepeatEndingMarkerAt = (
  text: string,
  startIdx: number
): AbcParsedRepeatEndingMarker | null => {
  const match = matchFrom(text, startIdx, /^\[(\d+(?:[,-]\d+)*)/);
  if (!match) {
    return null;
  }
  return {
    marker: match[1],
    nextIdx: startIdx + match[0].length,
  };
};

export const parseAbcBareRepeatEndingMarkerAt = (
  text: string,
  startIdx: number
): AbcParsedRepeatEndingMarker | null => {
  const match = matchFrom(text, startIdx, /^(\d+(?:[,-]\d+)*)/);
  if (!match) {
    return null;
  }
  return {
    marker: match[1],
    nextIdx: startIdx + match[0].length,
  };
};

export const parseAbcInlineFieldAt = (text: string, startIdx: number): AbcParsedInlineField | null => {
  const match = matchFrom(text, startIdx, /^\[([A-Za-z]):([^\]]*)\]/);
  if (!match) {
    return null;
  }
  return {
    fieldName: String(match[1] || "").toUpperCase(),
    fieldValue: String(match[2] || "").trim(),
    nextIdx: startIdx + match[0].length,
  };
};

export const parseAbcBarlineTokenAt = (text: string, startIdx: number): AbcParsedBarlineToken | null => {
  const slice = sliceFrom(text, startIdx);
  for (const candidate of ABC_BARLINE_CANDIDATES) {
    if (slice.startsWith(candidate.token)) {
      return {
        nextIdx: startIdx + candidate.token.length,
        endsMeasure: candidate.endsMeasure,
        repeatEnd: candidate.repeatEnd,
        repeatStart: candidate.repeatStart,
        endingStop: candidate.endingStop,
      };
    }
  }
  return null;
};

export const parseAbcStandaloneBodyFieldAt = (
  text: string,
  startIdx: number
): AbcParsedStandaloneBodyField | null => {
  const match = matchFrom(text, startIdx, /^([A-Za-z]):([^\s\]|]+)/);
  if (!match) {
    return null;
  }
  return {
    fieldName: String(match[1] || "").toUpperCase(),
    fieldValue: String(match[2] || "").trim(),
    token: match[0],
    nextIdx: startIdx + match[0].length,
  };
};

export const parseAbcUnsupportedBodyTokenAt = (
  text: string,
  startIdx: number
): AbcParsedUnsupportedBodyToken | null => {
  const match = matchFrom(text, startIdx, /^([IJNQRWY][A-Za-z0-9_-]*|[h-jl-pr-twy][a-z][A-Za-z0-9_-]*)/);
  if (!match) {
    return null;
  }
  return {
    token: match[1],
    nextIdx: startIdx + match[1].length,
  };
};

export const parseAbcUnsupportedBodyNumberAt = (
  text: string,
  startIdx: number
): AbcParsedUnsupportedBodyToken | null => {
  const match = matchFrom(text, startIdx, /^(\d+)/);
  if (!match) {
    return null;
  }
  return {
    token: match[1],
    nextIdx: startIdx + match[1].length,
  };
};

export const parseAbcDelimitedSpanAt = (
  text: string,
  startIdx: number,
  delimiter: string
): AbcParsedDelimitedSpan | null => {
  if (!delimiter || charAt(text, startIdx) !== delimiter) {
    return null;
  }
  const raw = rawText(text);
  let endIdx = startIdx + 1;
  while (endIdx < raw.length && raw[endIdx] !== delimiter) {
    endIdx += 1;
  }
  const nextIdx = Math.min(raw.length, endIdx + 1);
  return {
    delimiter,
    text: raw.slice(startIdx, nextIdx),
    nextIdx,
  };
};

export const parseAbcQuotedStringAt = (text: string, startIdx: number): AbcParsedQuotedString | null => {
  const span = parseAbcDelimitedSpanAt(text, startIdx, '"');
  if (!span) {
    return null;
  }
  const terminated = span.text.endsWith('"') && span.text.length >= 2;
  const rawText = terminated ? span.text.slice(1, -1) : span.text.slice(1);
  return {
    rawText,
    normalizedText: rawText.replace(/^[\^_<>@]/, "").trim(),
    nextIdx: span.nextIdx,
    terminated,
  };
};

export const parseAbcDecorationAt = (text: string, startIdx: number): AbcParsedDecoration | null => {
  const first = charAt(text, startIdx);
  if (first !== "!" && first !== "+") {
    return null;
  }
  const span = parseAbcDelimitedSpanAt(text, startIdx, first);
  if (!span) {
    return null;
  }
  const terminated = span.text.endsWith(first) && span.text.length >= 2;
  const rawDecoration = terminated ? span.text.slice(1, -1).trim() : span.text.slice(1).trim();
  return {
    rawDecoration,
    decoration: rawDecoration.toLowerCase(),
    delimiter: first,
    nextIdx: span.nextIdx,
    terminated,
  };
};

export const parseAbcBrokenRhythmAt = (text: string, startIdx: number): AbcParsedBrokenRhythm | null => {
  const symbol = charAt(text, startIdx);
  if (symbol !== ">" && symbol !== "<") {
    return null;
  }
  return {
    symbol,
    leftScale: symbol === ">" ? { num: 3, den: 2 } : { num: 1, den: 2 },
    rightScale: symbol === ">" ? { num: 1, den: 2 } : { num: 3, den: 2 },
    nextIdx: startIdx + 1,
  };
};

export const parseAbcSingleCharShorthandAt = (
  text: string,
  startIdx: number
): AbcParsedSingleCharShorthand | null => {
  const symbol = charAt(text, startIdx);
  const kind = ABC_SINGLE_CHAR_SHORTHAND_BY_CHAR[symbol];
  if (!kind) {
    return null;
  }
  return {
    kind,
    nextIdx: startIdx + 1,
  };
};

export const parseAbcTieAt = (text: string, startIdx: number): AbcParsedTie | null => {
  if (charAt(text, startIdx) !== "-") {
    return null;
  }
  return { nextIdx: startIdx + 1 };
};

export const parseAbcSlurStopAt = (text: string, startIdx: number): AbcParsedSlurStop | null => {
  if (charAt(text, startIdx) !== ")") {
    return null;
  }
  return { nextIdx: startIdx + 1 };
};

export const parseAbcParenTokenAt = (text: string, startIdx: number): AbcParsedParenToken | null => {
  if (charAt(text, startIdx) !== "(") {
    return null;
  }
  return matchParsed(() => parseAbcTupletAt(text, startIdx), (tuplet) => ({ kind: "tuplet", tuplet })) || {
    kind: "slur-start",
    nextIdx: startIdx + 1,
  };
};

export const parseAbcBracketTokenAt = (text: string, startIdx: number): AbcParsedBracketToken | null => {
  if (charAt(text, startIdx) !== "[") {
    return null;
  }
  return (
    matchParsed(() => parseAbcInlineFieldAt(text, startIdx), (inlineField) =>
      withBracketToken("inline-field", { inlineField })
    ) ||
    matchParsed(() => parseAbcRepeatEndingMarkerAt(text, startIdx), (repeatEndingMarker) =>
      withBracketToken("repeat-ending", { repeatEndingMarker })
    ) ||
    withBracketToken("chord-start", { nextIdx: startIdx + 1 })
  );
};

// High-level body dispatchers.
export const parseAbcBodyTokenAt = (text: string, startIdx: number): AbcParsedBodyToken | null => {
  return firstMatch<AbcParsedBodyToken>([
    () =>
      matchParsed(() => parseAbcBrokenRhythmAt(text, startIdx), (brokenRhythm) =>
        withBodyToken("broken-rhythm", { brokenRhythm })
      ),
    () =>
      matchParsed(() => parseAbcParenTokenAt(text, startIdx), (parenToken) =>
        withBodyToken("paren", { parenToken })
      ),
    () =>
      matchParsed(() => parseAbcSingleCharShorthandAt(text, startIdx), (shorthand) =>
        withBodyToken("single-char-shorthand", { shorthand })
      ),
    () => matchParsed(() => parseAbcTieAt(text, startIdx), (tie) => withBodyToken("tie", { tie })),
    () =>
      matchParsed(() => parseAbcQuotedStringAt(text, startIdx), (quotedString) =>
        withBodyToken("quoted-string", { quotedString })
      ),
    () =>
      matchParsed(() => parseAbcDecorationAt(text, startIdx), (decoration) =>
        withBodyToken("decoration", { decoration })
      ),
    () =>
      matchParsed(() => parseAbcBracketTokenAt(text, startIdx), (bracketToken) =>
        withBodyToken("bracket", { bracketToken })
      ),
    () =>
      matchParsed(() => parseAbcSlurStopAt(text, startIdx), (slurStop) =>
        withBodyToken("slur-stop", { slurStop })
      ),
  ]);
};

export const parseAbcPlayableEventAt = (text: string, startIdx: number): AbcParsedPlayableEvent => {
  if (charAt(text, startIdx) === "[") {
    const chord = parseAbcChordAt(text, startIdx);
    if (!chord) {
      return withInvalidChord(startIdx + 1);
    }
    return withPlayableEvent(
      "chord",
      chord.notes.map(toAbcParsedPitchSource),
      chord.lengthToken || (chord.notes.length > 0 ? chord.notes[0].lengthToken : ""),
      chord.nextIdx
    );
  }

  const noteResult = parseAbcNoteAt(text, startIdx);
  if (!noteResult) {
    return null;
  }
  if (noteResult.kind === "malformed-accidental") {
    return noteResult;
  }
  return withPlayableEvent(
    "note",
    [toAbcParsedPitchSource(noteResult.note)],
    noteResult.note.lengthToken,
    noteResult.note.nextIdx
  );
};

export const parseAbcBodyEntryAt = (text: string, startIdx: number): AbcParsedBodyEntry => {
  return firstMatch<AbcParsedBodyEntry>([
    () =>
      matchParsed(() => parseAbcBarlineTokenAt(text, startIdx), (barlineToken) =>
        withBodyEntry("barline", { barlineToken })
      ),
    () =>
      matchParsed(() => parseAbcStandaloneBodyFieldAt(text, startIdx), (standaloneBodyField) =>
        withBodyEntry("standalone-body-field", { standaloneBodyField })
      ),
    () =>
      matchParsed(() => parseAbcUnsupportedBodyTokenAt(text, startIdx), (unsupportedBodyToken) =>
        withBodyEntry("unsupported-body-token", { unsupportedBodyToken })
      ),
    () =>
      matchParsed(() => parseAbcUnsupportedBodyNumberAt(text, startIdx), (unsupportedBodyNumber) =>
        withBodyEntry("unsupported-body-number", { unsupportedBodyNumber })
      ),
    () =>
      matchParsed(() => parseAbcBodyTokenAt(text, startIdx), (bodyToken) =>
        withBodyEntry("body-token", { bodyToken })
      ),
    () =>
      matchParsed(() => parseAbcPlayableEventAt(text, startIdx), (playableEvent) =>
        withBodyEntry("playable-event", { playableEvent })
      ),
  ]);
};