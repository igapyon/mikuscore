import { lexAbcAccidental, lexAbcLengthToken, lexAbcNote } from "./abc-lexer";

export type AbcParsedNote = {
  accidentalText: string;
  pitchChar: string;
  octaveShift: string;
  lengthToken: string;
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

export type AbcParsedTuplet = {
  actual: number;
  normal: number;
  count: number;
  nextIdx: number;
  raw: string;
};

export type AbcNoteParseResult =
  | { kind: "note"; note: AbcParsedNote }
  | { kind: "malformed-accidental"; accidentalText: string; nextIdx: number }
  | null;

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
  if (text[startIdx] !== "(") {
    return null;
  }
  const match = text.slice(startIdx).match(/^\((\d)(?::(\d))?(?::(\d))?/);
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
