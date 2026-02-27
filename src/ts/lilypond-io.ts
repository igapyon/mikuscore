import {
  applyImplicitBeamsToMusicXmlText,
  parseMusicXmlDocument,
  prettyPrintMusicXmlText,
  serializeMusicXmlDocument,
} from "./musicxml-io";
import {
  chooseSingleClefByKeys,
  pickStaffForClusterWithHysteresis,
  shouldUseGrandStaffByRange,
  type StaffNo,
} from "../../core/staffClefPolicy";

export type LilyPondImportOptions = {
  debugMetadata?: boolean;
  debugPrettyPrint?: boolean;
  sourceMetadata?: boolean;
};

type LilyParsedPitch = {
  step: string;
  alter: number;
  octave: number;
};

type LilyDirectEvent =
  | { kind: "direction"; durationDiv: number; xml: string }
  | { kind: "rest"; durationDiv: number; type: string; dots: number }
  | { kind: "backup"; durationDiv: number }
  | {
    kind: "note";
    durationDiv: number;
    type: string;
    dots: number;
    pitch: LilyParsedPitch;
    articulationSubtypes?: string[];
    technicalSubtypes?: string[];
    graceSlash?: boolean;
    tupletActual?: number;
    tupletNormal?: number;
    tupletStart?: boolean;
    tupletStop?: boolean;
    tupletNumber?: number;
    accidentalText?: string;
    slurHints?: Array<{ type: "start" | "stop"; number?: number; placement?: "above" | "below" }>;
    glissHints?: Array<{ type: "start" | "stop"; number?: number }>;
    trillMark?: boolean;
    wavyLineHints?: Array<{ type: "start" | "stop"; number?: number }>;
    tieStart?: boolean;
    tieStop?: boolean;
    lyricText?: string;
  }
  | {
    kind: "chord";
    durationDiv: number;
    type: string;
    dots: number;
    pitches: LilyParsedPitch[];
    articulationSubtypes?: string[];
    technicalSubtypes?: string[];
    graceSlash?: boolean;
    tupletActual?: number;
    tupletNormal?: number;
    tupletStart?: boolean;
    tupletStop?: boolean;
    tupletNumber?: number;
    accidentalText?: string;
    slurHints?: Array<{ type: "start" | "stop"; number?: number; placement?: "above" | "below" }>;
    glissHints?: Array<{ type: "start" | "stop"; number?: number }>;
    trillMark?: boolean;
    wavyLineHints?: Array<{ type: "start" | "stop"; number?: number }>;
    tieStart?: boolean;
    tieStop?: boolean;
    lyricText?: string;
  };

const expandLilyRepeatVoltaMarkers = (body: string): string => {
  let expanded = String(body || "");
  const maxPasses = 8;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const m = expanded.match(/\\repeat\s+volta\s+(\d+)\s*\{/i);
    if (!m || m.index === undefined) break;
    const times = Number.parseInt(m[1], 10);
    const bracePos = expanded.indexOf("{", m.index + m[0].length - 1);
    if (bracePos < 0) break;
    const block = findBalancedBlock(expanded, bracePos);
    if (!block) break;
    const repeatTimes = Number.isFinite(times) && times > 1 ? Math.round(times) : 2;
    const markerStart = " @@MKS_RPT_FWD@@ ";
    const markerStop = ` @@MKS_RPT_BWD_${repeatTimes}@@ `;
    expanded =
      expanded.slice(0, m.index)
      + markerStart
      + block.content
      + markerStop
      + expanded.slice(block.endPos);
  }
  return expanded;
};

const expandLilyAlternativeMarkers = (body: string): string => {
  let expanded = String(body || "");
  const maxPasses = 8;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const m = expanded.match(/\\alternative\s*\{/i);
    if (!m || m.index === undefined) break;
    const outerBracePos = expanded.indexOf("{", m.index + m[0].length - 1);
    if (outerBracePos < 0) break;
    const outer = findBalancedBlock(expanded, outerBracePos);
    if (!outer) break;
    const children: string[] = [];
    let cursor = 0;
    while (cursor < outer.content.length) {
      const next = outer.content.indexOf("{", cursor);
      if (next < 0) break;
      const child = findBalancedBlock(outer.content, next);
      if (!child) break;
      children.push(child.content);
      cursor = child.endPos;
    }
    const replacement = children
      .map((content, i) => {
        const endingNo = i + 1;
        return ` @@MKS_ENDING_START_${endingNo}@@ ${content} @@MKS_ENDING_STOP_${endingNo}@@ `;
      })
      .join(" ");
    expanded = expanded.slice(0, m.index) + replacement + expanded.slice(outer.endPos);
  }
  return expanded;
};

const expandLilyTupletMarkers = (body: string): string => {
  let expanded = String(body || "");
  const maxPasses = 16;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const m = expanded.match(/\\tuplet\s+(\d+)\s*\/\s*(\d+)\s*\{/i);
    if (!m || m.index === undefined) break;
    const actual = Number.parseInt(m[1], 10);
    const normal = Number.parseInt(m[2], 10);
    const bracePos = expanded.indexOf("{", m.index + m[0].length - 1);
    if (bracePos < 0) break;
    const block = findBalancedBlock(expanded, bracePos);
    if (!block) break;
    const safeActual = Number.isFinite(actual) && actual > 0 ? Math.round(actual) : 3;
    const safeNormal = Number.isFinite(normal) && normal > 0 ? Math.round(normal) : 2;
    const replacement =
      ` @@MKS_TUPLET_START_${safeActual}_${safeNormal}@@ `
      + block.content
      + " @@MKS_TUPLET_STOP@@ ";
    expanded = expanded.slice(0, m.index) + replacement + expanded.slice(block.endPos);
  }
  return expanded;
};

type LilyTransposeHint = { chromatic?: number; diatonic?: number };
type LilyMeasureHint = {
  number?: string;
  implicit?: boolean;
  repeat?: "forward" | "backward";
  times?: number;
  beats?: number;
  beatType?: number;
  explicitTime?: boolean;
  doubleBar?: "left" | "right" | "both";
};

type LilyOctaveShiftHint = {
  type: "up" | "down" | "stop";
  size?: number;
  number?: number;
};

const xmlEscape = (value: string): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

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

const reduceFraction = (num: number, den: number): { num: number; den: number } => {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return { num: 1, den: 1 };
  const sign = den < 0 ? -1 : 1;
  const n = Math.round(num * sign);
  const d = Math.round(den * sign);
  const g = gcd(n, d);
  return { num: n / g, den: d / g };
};

const lilyDurationToAbcLen = (duration: number, dotCount: number): string => {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 4;
  let ratio = reduceFraction(8, safeDuration);
  const safeDots = Math.max(0, Math.min(3, Math.round(dotCount)));
  if (safeDots > 0) {
    const dotMul = reduceFraction((2 ** (safeDots + 1)) - 1, 2 ** safeDots);
    ratio = reduceFraction(ratio.num * dotMul.num, ratio.den * dotMul.den);
  }
  if (ratio.num === ratio.den) return "";
  if (ratio.den === 1) return String(ratio.num);
  if (ratio.num === 1 && ratio.den === 2) return "/";
  if (ratio.num === 1) return `/${ratio.den}`;
  return `${ratio.num}/${ratio.den}`;
};

const abcLenToLilyDuration = (token: string): { duration: number; dots: number } => {
  const raw = String(token || "").trim();
  if (!raw) return { duration: 8, dots: 0 };
  let ratio = { num: 1, den: 1 };
  if (/^\d+$/.test(raw)) {
    ratio = reduceFraction(Number.parseInt(raw, 10), 1);
  } else if (raw === "/") {
    ratio = { num: 1, den: 2 };
  } else if (/^\/\d+$/.test(raw)) {
    ratio = reduceFraction(1, Number.parseInt(raw.slice(1), 10));
  } else {
    const m = raw.match(/^(\d+)\/(\d+)$/);
    if (m) ratio = reduceFraction(Number.parseInt(m[1], 10), Number.parseInt(m[2], 10));
  }

  const exact = reduceFraction(8 * ratio.den, ratio.num);
  const dotted1 = reduceFraction(16 * ratio.den, 3 * ratio.num);
  const dotted2 = reduceFraction(32 * ratio.den, 7 * ratio.num);
  const candidates = [
    { duration: exact.num / exact.den, dots: 0, frac: exact },
    { duration: dotted1.num / dotted1.den, dots: 1, frac: dotted1 },
    { duration: dotted2.num / dotted2.den, dots: 2, frac: dotted2 },
  ].filter((item) => item.frac.den !== 0 && Number.isFinite(item.duration));

  for (const candidate of candidates) {
    if (candidate.frac.den === 1 && [1, 2, 4, 8, 16, 32, 64, 128].includes(candidate.frac.num)) {
      return {
        duration: candidate.frac.num,
        dots: candidate.dots,
      };
    }
  }
  return { duration: 8, dots: 0 };
};

const abcPitchFromStepOctave = (step: string, octave: number): string => {
  const upperStep = String(step || "").toUpperCase();
  if (!/^[A-G]$/.test(upperStep)) return "C";
  if (octave >= 5) return upperStep.toLowerCase() + "'".repeat(octave - 5);
  return upperStep + ",".repeat(Math.max(0, 4 - octave));
};

const lilyPitchFromStepAlterOctave = (step: string, alter: number, octave: number): string => {
  const base = String(step || "").trim().toLowerCase();
  if (!/^[a-g]$/.test(base)) return "c'";
  let acc = "";
  const safeAlter = Number.isFinite(alter) ? Math.round(alter) : 0;
  if (safeAlter > 0) acc = "is".repeat(Math.min(2, safeAlter));
  if (safeAlter < 0) acc = "es".repeat(Math.min(2, Math.abs(safeAlter)));
  const octaveShift = Math.round(octave) - 3;
  const octaveMarks = octaveShift >= 0 ? "'".repeat(octaveShift) : ",".repeat(Math.abs(octaveShift));
  return `${base}${acc}${octaveMarks}`;
};

const pitchToMidiKey = (step: string, alter: number, octave: number): number | null => {
  const upper = String(step || "").trim().toUpperCase();
  if (!/^[A-G]$/.test(upper)) return null;
  const semitone = lilyPitchClassToSemitone(upper, alter);
  if (!Number.isFinite(semitone) || !Number.isFinite(octave)) return null;
  // MusicXML octave 4 corresponds to MIDI C4=60, so add +1 octave offset.
  return (Math.round(octave) + 1) * 12 + semitone;
};

const chooseLilyClefFromMeasures = (measures: LilyDirectEvent[][]): string => {
  const keys: number[] = [];
  for (const events of measures) {
    for (const event of events) {
      if (event.kind === "note") {
        const midi = pitchToMidiKey(event.pitch.step, event.pitch.alter, event.pitch.octave);
        if (midi !== null) keys.push(midi);
        continue;
      }
      if (event.kind === "chord") {
        for (const pitch of event.pitches) {
          const midi = pitchToMidiKey(pitch.step, pitch.alter, pitch.octave);
          if (midi !== null) keys.push(midi);
        }
      }
    }
  }
  return chooseSingleClefByKeys(keys) === "F" ? "bass" : "treble";
};

const collectKeysFromMeasures = (measures: LilyDirectEvent[][]): number[] => {
  const keys: number[] = [];
  for (const events of measures) {
    for (const event of events) {
      if (event.kind === "note") {
        const midi = pitchToMidiKey(event.pitch.step, event.pitch.alter, event.pitch.octave);
        if (midi !== null) keys.push(midi);
        continue;
      }
      if (event.kind === "chord") {
        for (const pitch of event.pitches) {
          const midi = pitchToMidiKey(pitch.step, pitch.alter, pitch.octave);
          if (midi !== null) keys.push(midi);
        }
      }
    }
  }
  return keys;
};

const autoSplitMeasuresToGrandStaff = (
  measures: LilyDirectEvent[][]
): { upper: LilyDirectEvent[][]; lower: LilyDirectEvent[][]; splitApplied: boolean } => {
  const keys = collectKeysFromMeasures(measures);
  if (!shouldUseGrandStaffByRange(keys)) {
    return { upper: measures, lower: [], splitApplied: false };
  }
  const upper: LilyDirectEvent[][] = [];
  const lower: LilyDirectEvent[][] = [];
  let previousStaff: StaffNo | null = null;
  let upperHasPitch = false;
  let lowerHasPitch = false;
  for (const events of measures) {
    const upEvents: LilyDirectEvent[] = [];
    const lowEvents: LilyDirectEvent[] = [];
    for (const event of events) {
      if (event.kind === "note") {
        const midi = pitchToMidiKey(event.pitch.step, event.pitch.alter, event.pitch.octave);
        if (midi === null) {
          upEvents.push(event);
          continue;
        }
        const staff = pickStaffForClusterWithHysteresis(midi, midi, previousStaff);
        previousStaff = staff;
        if (staff === 1) {
          upEvents.push(event);
          upperHasPitch = true;
        } else {
          lowEvents.push(event);
          lowerHasPitch = true;
        }
        continue;
      }
      if (event.kind === "chord") {
        const chordKeys = event.pitches
          .map((pitch) => pitchToMidiKey(pitch.step, pitch.alter, pitch.octave))
          .filter((value): value is number => value !== null);
        if (!chordKeys.length) {
          upEvents.push(event);
          continue;
        }
        const minKey = Math.min(...chordKeys);
        const maxKey = Math.max(...chordKeys);
        const staff = pickStaffForClusterWithHysteresis(minKey, maxKey, previousStaff);
        previousStaff = staff;
        if (staff === 1) {
          upEvents.push(event);
          upperHasPitch = true;
        } else {
          lowEvents.push(event);
          lowerHasPitch = true;
        }
        continue;
      }
      // Keep directions/backup/rests on upper staff in split mode.
      upEvents.push(event);
    }
    upper.push(upEvents);
    lower.push(lowEvents);
  }
  // Guard: if either side has no real notes, cancel split.
  if (!upperHasPitch || !lowerHasPitch) {
    return { upper: measures, lower: [], splitApplied: false };
  }
  return { upper, lower, splitApplied: true };
};

const lilyKeyToAbc = (tonicRaw: string, modeRaw: string): string => {
  const tonic = String(tonicRaw || "").trim().toLowerCase();
  const mode = String(modeRaw || "").trim().toLowerCase();
  const table: Record<string, string> = {
    c: "C",
    cis: "C#",
    des: "Db",
    d: "D",
    dis: "D#",
    ees: "Eb",
    es: "Eb",
    e: "E",
    f: "F",
    fis: "F#",
    ges: "Gb",
    g: "G",
    gis: "G#",
    aes: "Ab",
    as: "Ab",
    a: "A",
    ais: "A#",
    bes: "Bb",
    b: "B",
  };
  const note = table[tonic] || "C";
  return mode === "minor" ? `${note}m` : note;
};

const parseHeaderField = (source: string, field: "title" | "composer"): string => {
  const headerMatch = source.match(/\\header\s*\{([\s\S]*?)\}/);
  if (!headerMatch) return "";
  const rx = new RegExp(`${field}\\s*=\\s*\"([^\"]*)\"`);
  const m = headerMatch[1].match(rx);
  return m ? m[1].trim() : "";
};

const parseTimeSignature = (source: string): { beats: number; beatType: number } => {
  const m = source.match(/\\time\s+(\d+)\s*\/\s*(\d+)/);
  const beats = m ? Number.parseInt(m[1], 10) : 4;
  const beatType = m ? Number.parseInt(m[2], 10) : 4;
  return {
    beats: Number.isFinite(beats) && beats > 0 ? beats : 4,
    beatType: Number.isFinite(beatType) && beatType > 0 ? beatType : 4,
  };
};

const parseKeySignature = (source: string): string => {
  const m = source.match(/\\key\s+([a-g](?:is|es)?)\s+\\(major|minor)/i);
  if (!m) return "C";
  return lilyKeyToAbc(m[1], m[2]);
};

const stripLilyComments = (text: string): string => {
  return text
    .split("\n")
    .map((line) => line.replace(/%.*$/, ""))
    .join("\n");
};

const keyModeAndFifthsFromAbcKey = (abcKey: string): { mode: "major" | "minor"; fifths: number } => {
  const map: Record<string, number> = {
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
  const normalized = String(abcKey || "C").trim();
  const fifths = Object.prototype.hasOwnProperty.call(map, normalized) ? map[normalized] : 0;
  return {
    mode: /m$/.test(normalized) ? "minor" : "major",
    fifths,
  };
};

const lilyDurationToDivisions = (duration: number, dots: number, divisions: number): number => {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 4;
  const base = Math.max(1, Math.round((divisions * 4) / safeDuration));
  const safeDots = Math.max(0, Math.min(3, Math.round(dots)));
  if (safeDots === 0) return base;
  // dotted multiplier: 1 + 1/2 + 1/4 + ...
  const num = (2 ** (safeDots + 1)) - 1;
  const den = 2 ** safeDots;
  return Math.max(1, Math.round((base * num) / den));
};

const parseLilyDurationExpr = (expr: string): { base: number; mulNum: number; mulDen: number } => {
  const raw = String(expr || "").trim();
  if (!raw) return { base: 4, mulNum: 1, mulDen: 1 };
  const m = raw.match(/^(\d+)(?:\*(\d+)(?:\/(\d+))?)?$/);
  if (!m) return { base: 4, mulNum: 1, mulDen: 1 };
  const base = Number.parseInt(m[1], 10);
  const mulNum = m[2] ? Number.parseInt(m[2], 10) : 1;
  const mulDen = m[3] ? Number.parseInt(m[3], 10) : 1;
  return {
    base: Number.isFinite(base) && base > 0 ? base : 4,
    mulNum: Number.isFinite(mulNum) && mulNum > 0 ? mulNum : 1,
    mulDen: Number.isFinite(mulDen) && mulDen > 0 ? mulDen : 1,
  };
};

const lilyDurationExprToDivisions = (
  durationExpr: string,
  dots: number,
  divisions: number
): number => {
  const parsed = parseLilyDurationExpr(durationExpr);
  const safeDivisions = Math.max(1, Math.round(divisions));
  const baseDiv = Math.max(1, Math.round((safeDivisions * 4) / parsed.base));
  const safeDots = Math.max(0, Math.min(3, Math.round(dots)));
  const dotNum = (2 ** (safeDots + 1)) - 1;
  const dotDen = 2 ** safeDots;
  const raw =
    (baseDiv * parsed.mulNum * dotNum) /
    Math.max(1, parsed.mulDen * dotDen);
  return Math.max(1, Math.round(raw));
};

const noteDurationToLilyToken = (
  typeText: string,
  dots: number,
  durationDiv: number,
  divisions: number
): string => {
  const safeDots = Math.max(0, Math.min(3, Math.round(dots)));
  const typeDurText = noteTypeToLilyDuration(typeText);
  const typeDur = Number.parseInt(typeDurText, 10);
  const safeDivisions = Math.max(1, Math.round(divisions));
  const safeDurationDiv =
    Number.isFinite(durationDiv) && durationDiv > 0
      ? Math.round(durationDiv)
      : noteTypeToDivisionsFallback(typeText, safeDivisions);
  if (Number.isFinite(typeDur) && typeDur > 0) {
    const expected = lilyDurationToDivisions(typeDur, safeDots, safeDivisions);
    if (expected === safeDurationDiv) {
      return `${typeDurText}${".".repeat(safeDots)}`;
    }
  }
  const quarterRatio = reduceFraction(safeDurationDiv, safeDivisions);
  if (quarterRatio.num === quarterRatio.den) return "4";
  if (quarterRatio.den === 1) return `4*${quarterRatio.num}`;
  return `4*${quarterRatio.num}/${quarterRatio.den}`;
};

const lilyDurationToMusicXmlType = (duration: number): string => {
  const d = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 4;
  switch (d) {
    case 1:
      return "whole";
    case 2:
      return "half";
    case 4:
      return "quarter";
    case 8:
      return "eighth";
    case 16:
      return "16th";
    case 32:
      return "32nd";
    case 64:
      return "64th";
    default:
      return "quarter";
  }
};

const findBalancedBlock = (source: string, startBracePos: number): { content: string; endPos: number } | null => {
  if (startBracePos < 0 || startBracePos >= source.length || source[startBracePos] !== "{") return null;
  let depth = 0;
  for (let i = startBracePos; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch !== "}") continue;
    depth -= 1;
    if (depth === 0) {
      return {
        content: source.slice(startBracePos + 1, i),
        endPos: i + 1,
      };
    }
  }
  return null;
};

const normalizeAbcClefName = (raw: string): string => {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "bass") return "bass";
  if (value === "alto") return "alto";
  if (value === "tenor") return "tenor";
  if (value === "percussion") return "perc";
  return "treble";
};

const normalizeVoiceId = (raw: string, fallback: string): string => {
  const normalized = String(raw || "").trim().replace(/[^A-Za-z0-9_.-]/g, "_");
  return normalized || fallback;
};

const lilyTranspositionTokenToHint = (token: string): LilyTransposeHint | null => {
  const parsed = parseLilyPitchToken(token);
  if (!parsed) return null;
  const stepToDiatonic: Record<string, number> = {
    C: 0,
    D: 1,
    E: 2,
    F: 3,
    G: 4,
    A: 5,
    B: 6,
  };
  const up = (parsed.octaveMarks.match(/'/g) || []).length;
  const down = (parsed.octaveMarks.match(/,/g) || []).length;
  const octaveShift = up - down;
  let chromatic = lilyPitchClassToSemitone(parsed.step, parsed.alter) + octaveShift * 12;
  while (chromatic > 6) chromatic -= 12;
  while (chromatic < -6) chromatic += 12;
  let diatonic = (stepToDiatonic[parsed.step] ?? 0) + octaveShift * 7;
  while (diatonic > 3) diatonic -= 7;
  while (diatonic < -3) diatonic += 7;
  return { chromatic, diatonic };
};

const parseMksTransposeHints = (source: string): Map<string, LilyTransposeHint> => {
  const out = new Map<string, LilyTransposeHint>();
  const lines = String(source || "").split("\n");
  for (const lineRaw of lines) {
    const trimmed = lineRaw.trim().replace(/^%\s*/, "");
    const m = trimmed.match(/^%@mks\s+transpose\s+(.+)$/i);
    if (!m) continue;
    const params: Record<string, string> = {};
    const kvRegex = /([A-Za-z][A-Za-z0-9_-]*)=([^\s]+)/g;
    let kv: RegExpExecArray | null;
    while ((kv = kvRegex.exec(m[1])) !== null) {
      params[String(kv[1]).toLowerCase()] = String(kv[2]);
    }
    const voiceId = normalizeVoiceId(String(params.voice || "").trim(), "");
    const chromatic = Number.parseInt(String(params.chromatic || ""), 10);
    const diatonic = Number.parseInt(String(params.diatonic || ""), 10);
    if (!voiceId || (!Number.isFinite(chromatic) && !Number.isFinite(diatonic))) continue;
    const hint: LilyTransposeHint = {};
    if (Number.isFinite(chromatic)) hint.chromatic = Math.round(chromatic);
    if (Number.isFinite(diatonic)) hint.diatonic = Math.round(diatonic);
    out.set(voiceId, hint);
  }
  return out;
};

const parseMksMeasureHints = (source: string): Map<string, Map<number, LilyMeasureHint>> => {
  const out = new Map<string, Map<number, LilyMeasureHint>>();
  const lines = String(source || "").split("\n");
  for (const lineRaw of lines) {
    const trimmed = lineRaw.trim().replace(/^%\s*/, "");
    const m = trimmed.match(/^%@mks\s+measure\s+(.+)$/i);
    if (!m) continue;
    const params: Record<string, string> = {};
    const kvRegex = /([A-Za-z][A-Za-z0-9_-]*)=([^\s]+)/g;
    let kv: RegExpExecArray | null;
    while ((kv = kvRegex.exec(m[1])) !== null) {
      params[String(kv[1]).toLowerCase()] = String(kv[2]);
    }
    const voiceId = normalizeVoiceId(String(params.voice || "").trim(), "");
    const measureNo = Number.parseInt(String(params.measure || ""), 10);
    if (!voiceId || !Number.isFinite(measureNo) || measureNo <= 0) continue;
    const hint: LilyMeasureHint = {};
    const numberText = String(params.number || "").trim();
    if (numberText) hint.number = numberText;
    const implicitRaw = String(params.implicit || "").trim().toLowerCase();
    if (implicitRaw) {
      hint.implicit = implicitRaw === "1" || implicitRaw === "true" || implicitRaw === "yes";
    }
    const repeatRaw = String(params.repeat || "").trim().toLowerCase();
    if (repeatRaw === "forward" || repeatRaw === "backward") {
      hint.repeat = repeatRaw;
    }
    const times = Number.parseInt(String(params.times || ""), 10);
    if (Number.isFinite(times) && times > 1) hint.times = times;
    const beats = Number.parseInt(String(params.beats || ""), 10);
    if (Number.isFinite(beats) && beats > 0) hint.beats = Math.max(1, Math.round(beats));
    const beatType = Number.parseInt(String(params.beattype || ""), 10);
    if (Number.isFinite(beatType) && beatType > 0) hint.beatType = Math.max(1, Math.round(beatType));
    const explicitTimeRaw = String(params.explicittime || "").trim().toLowerCase();
    if (explicitTimeRaw) {
      hint.explicitTime = explicitTimeRaw === "1" || explicitTimeRaw === "true" || explicitTimeRaw === "yes";
    }
    const doubleBarRaw = String(params.doublebar || "").trim().toLowerCase();
    if (doubleBarRaw === "left" || doubleBarRaw === "right" || doubleBarRaw === "both") {
      hint.doubleBar = doubleBarRaw;
    }
    const byMeasure = out.get(voiceId) ?? new Map<number, LilyMeasureHint>();
    byMeasure.set(measureNo, hint);
    out.set(voiceId, byMeasure);
  }
  return out;
};

const parseMksArticulationHints = (source: string): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  const lines = String(source || "").split("\n");
  for (const lineRaw of lines) {
    const trimmed = lineRaw.trim().replace(/^%\s*/, "");
    const m = trimmed.match(/^%@mks\s+articul\s+(.+)$/i);
    if (!m) continue;
    const params: Record<string, string> = {};
    const kvRegex = /([A-Za-z][A-Za-z0-9_-]*)=([^\s]+)/g;
    let kv: RegExpExecArray | null;
    while ((kv = kvRegex.exec(m[1])) !== null) {
      params[String(kv[1]).toLowerCase()] = String(kv[2]);
    }
    const voiceId = normalizeVoiceId(String(params.voice || "").trim(), "");
    const measureNo = Number.parseInt(String(params.measure || ""), 10);
    const eventNo = Number.parseInt(String(params.event || ""), 10);
    const kindRaw = String(params.kind || "").trim().toLowerCase();
    if (!voiceId || !Number.isFinite(measureNo) || measureNo <= 0 || !Number.isFinite(eventNo) || eventNo <= 0 || !kindRaw) {
      continue;
    }
    const normalized = kindRaw
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .reduce<string[]>((acc, k) => {
        if (k === "staccato") acc.push("staccato");
        if (k === "accent") acc.push("accent");
        return acc;
      }, []);
    if (!normalized.length) continue;
    out.set(`${voiceId}#${measureNo}#${eventNo}`, Array.from(new Set(normalized)));
  }
  return out;
};

const parseMksGraceHints = (source: string): Map<string, { slash: boolean }> => {
  const out = new Map<string, { slash: boolean }>();
  const lines = String(source || "").split("\n");
  for (const lineRaw of lines) {
    const trimmed = lineRaw.trim().replace(/^%\s*/, "");
    const m = trimmed.match(/^%@mks\s+grace\s+(.+)$/i);
    if (!m) continue;
    const params: Record<string, string> = {};
    const kvRegex = /([A-Za-z][A-Za-z0-9_-]*)=([^\s]+)/g;
    let kv: RegExpExecArray | null;
    while ((kv = kvRegex.exec(m[1])) !== null) {
      params[String(kv[1]).toLowerCase()] = String(kv[2]);
    }
    const voiceId = normalizeVoiceId(String(params.voice || "").trim(), "");
    const measureNo = Number.parseInt(String(params.measure || ""), 10);
    const eventNo = Number.parseInt(String(params.event || ""), 10);
    if (!voiceId || !Number.isFinite(measureNo) || measureNo <= 0 || !Number.isFinite(eventNo) || eventNo <= 0) continue;
    const slashRaw = String(params.slash || "").trim().toLowerCase();
    out.set(`${voiceId}#${measureNo}#${eventNo}`, { slash: slashRaw === "1" || slashRaw === "true" || slashRaw === "yes" });
  }
  return out;
};

const parseMksTupletHints = (source: string): Map<string, {
  actual?: number;
  normal?: number;
  start?: boolean;
  stop?: boolean;
  number?: number;
}> => {
  const out = new Map<string, { actual?: number; normal?: number; start?: boolean; stop?: boolean; number?: number }>();
  const lines = String(source || "").split("\n");
  for (const lineRaw of lines) {
    const trimmed = lineRaw.trim().replace(/^%\s*/, "");
    const m = trimmed.match(/^%@mks\s+tuplet\s+(.+)$/i);
    if (!m) continue;
    const params: Record<string, string> = {};
    const kvRegex = /([A-Za-z][A-Za-z0-9_-]*)=([^\s]+)/g;
    let kv: RegExpExecArray | null;
    while ((kv = kvRegex.exec(m[1])) !== null) {
      params[String(kv[1]).toLowerCase()] = String(kv[2]);
    }
    const voiceId = normalizeVoiceId(String(params.voice || "").trim(), "");
    const measureNo = Number.parseInt(String(params.measure || ""), 10);
    const eventNo = Number.parseInt(String(params.event || ""), 10);
    if (!voiceId || !Number.isFinite(measureNo) || measureNo <= 0 || !Number.isFinite(eventNo) || eventNo <= 0) continue;
    const actual = Number.parseInt(String(params.actual || ""), 10);
    const normal = Number.parseInt(String(params.normal || ""), 10);
    const number = Number.parseInt(String(params.number || ""), 10);
    const startRaw = String(params.start || "").trim().toLowerCase();
    const stopRaw = String(params.stop || "").trim().toLowerCase();
    const hint: { actual?: number; normal?: number; start?: boolean; stop?: boolean; number?: number } = {};
    if (Number.isFinite(actual) && actual > 0) hint.actual = Math.round(actual);
    if (Number.isFinite(normal) && normal > 0) hint.normal = Math.round(normal);
    if (Number.isFinite(number) && number > 0) hint.number = Math.round(number);
    if (startRaw) hint.start = startRaw === "1" || startRaw === "true" || startRaw === "yes";
    if (stopRaw) hint.stop = stopRaw === "1" || stopRaw === "true" || stopRaw === "yes";
    if (hint.actual || hint.normal || hint.number || hint.start || hint.stop) {
      out.set(`${voiceId}#${measureNo}#${eventNo}`, hint);
    }
  }
  return out;
};

const parseMksAccidentalHints = (source: string): Map<string, string> => {
  const out = new Map<string, string>();
  const lines = String(source || "").split("\n");
  for (const lineRaw of lines) {
    const trimmed = lineRaw.trim().replace(/^%\s*/, "");
    const m = trimmed.match(/^%@mks\s+accidental\s+(.+)$/i);
    if (!m) continue;
    const params: Record<string, string> = {};
    const kvRegex = /([A-Za-z][A-Za-z0-9_-]*)=([^\s]+)/g;
    let kv: RegExpExecArray | null;
    while ((kv = kvRegex.exec(m[1])) !== null) {
      params[String(kv[1]).toLowerCase()] = String(kv[2]);
    }
    const voiceId = normalizeVoiceId(String(params.voice || "").trim(), "");
    const measureNo = Number.parseInt(String(params.measure || ""), 10);
    const eventNo = Number.parseInt(String(params.event || ""), 10);
    const value = String(params.value || "").trim().toLowerCase();
    if (!voiceId || !Number.isFinite(measureNo) || measureNo <= 0 || !Number.isFinite(eventNo) || eventNo <= 0 || !value) {
      continue;
    }
    if (!["natural", "sharp", "flat", "double-sharp", "flat-flat"].includes(value)) continue;
    out.set(`${voiceId}#${measureNo}#${eventNo}`, value);
  }
  return out;
};

const parseMksLaneHints = (source: string): Map<string, Map<number, string[]>> => {
  const out = new Map<string, Map<number, string[]>>();
  const lines = String(source || "").split("\n");
  for (const lineRaw of lines) {
    const trimmed = lineRaw.trim().replace(/^%\s*/, "");
    const m = trimmed.match(/^%@mks\s+lanes\s+(.+)$/i);
    if (!m) continue;
    const params: Record<string, string> = {};
    const kvRegex = /([A-Za-z][A-Za-z0-9_-]*)=([^\s]+)/g;
    let kv: RegExpExecArray | null;
    while ((kv = kvRegex.exec(m[1])) !== null) {
      params[String(kv[1]).toLowerCase()] = String(kv[2]);
    }
    const voiceId = normalizeVoiceId(String(params.voice || "").trim(), "");
    const measureNo = Number.parseInt(String(params.measure || ""), 10);
    const encoded = String(params.data || "").trim();
    if (!voiceId || !Number.isFinite(measureNo) || measureNo <= 0 || !encoded) continue;
    const lanes = encoded
      .split(",")
      .map((entry) => {
        try {
          return decodeURIComponent(entry);
        } catch {
          return "";
        }
      })
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (!lanes.length) continue;
    const byMeasure = out.get(voiceId) ?? new Map<number, string[]>();
    byMeasure.set(measureNo, lanes);
    out.set(voiceId, byMeasure);
  }
  return out;
};

const parseMksSlurHints = (
  source: string
): Map<string, Array<{ type: "start" | "stop"; number?: number; placement?: "above" | "below" }>> => {
  const out = new Map<string, Array<{ type: "start" | "stop"; number?: number; placement?: "above" | "below" }>>();
  const lines = String(source || "").split("\n");
  for (const lineRaw of lines) {
    const trimmed = lineRaw.trim().replace(/^%\s*/, "");
    const m = trimmed.match(/^%@mks\s+slur\s+(.+)$/i);
    if (!m) continue;
    const params: Record<string, string> = {};
    const kvRegex = /([A-Za-z][A-Za-z0-9_-]*)=([^\s]+)/g;
    let kv: RegExpExecArray | null;
    while ((kv = kvRegex.exec(m[1])) !== null) {
      params[String(kv[1]).toLowerCase()] = String(kv[2]);
    }
    const voiceId = normalizeVoiceId(String(params.voice || "").trim(), "");
    const measureNo = Number.parseInt(String(params.measure || ""), 10);
    const eventNo = Number.parseInt(String(params.event || ""), 10);
    const typeRaw = String(params.type || "").trim().toLowerCase();
    if (!voiceId || !Number.isFinite(measureNo) || measureNo <= 0 || !Number.isFinite(eventNo) || eventNo <= 0) continue;
    if (typeRaw !== "start" && typeRaw !== "stop") continue;
    const numberRaw = Number.parseInt(String(params.number || ""), 10);
    const placementRaw = String(params.placement || "").trim().toLowerCase();
    const key = `${voiceId}#${measureNo}#${eventNo}`;
    const arr = out.get(key) ?? [];
    arr.push({
      type: typeRaw,
      number: Number.isFinite(numberRaw) && numberRaw > 0 ? Math.round(numberRaw) : undefined,
      placement: placementRaw === "above" || placementRaw === "below" ? placementRaw : undefined,
    });
    out.set(key, arr);
  }
  return out;
};

const parseMksTrillHints = (
  source: string
): Map<string, { trillMark?: boolean; wavy?: Array<{ type: "start" | "stop"; number?: number }> }> => {
  const out = new Map<string, { trillMark?: boolean; wavy?: Array<{ type: "start" | "stop"; number?: number }> }>();
  const lines = String(source || "").split("\n");
  for (const lineRaw of lines) {
    const trimmed = lineRaw.trim().replace(/^%\s*/, "");
    const m = trimmed.match(/^%@mks\s+trill\s+(.+)$/i);
    if (!m) continue;
    const params: Record<string, string> = {};
    const kvRegex = /([A-Za-z][A-Za-z0-9_-]*)=([^\s]+)/g;
    let kv: RegExpExecArray | null;
    while ((kv = kvRegex.exec(m[1])) !== null) {
      params[String(kv[1]).toLowerCase()] = String(kv[2]);
    }
    const voiceId = normalizeVoiceId(String(params.voice || "").trim(), "");
    const measureNo = Number.parseInt(String(params.measure || ""), 10);
    const eventNo = Number.parseInt(String(params.event || ""), 10);
    if (!voiceId || !Number.isFinite(measureNo) || measureNo <= 0 || !Number.isFinite(eventNo) || eventNo <= 0) continue;
    const key = `${voiceId}#${measureNo}#${eventNo}`;
    const slot = out.get(key) ?? {};
    const markRaw = String(params.mark || "").trim().toLowerCase();
    if (markRaw === "1" || markRaw === "true" || markRaw === "yes") {
      slot.trillMark = true;
    }
    const wavyType = String(params.wavy || "").trim().toLowerCase();
    if (wavyType === "start" || wavyType === "stop") {
      const number = Number.parseInt(String(params.number || ""), 10);
      const arr = slot.wavy ?? [];
      arr.push({
        type: wavyType,
        number: Number.isFinite(number) && number > 0 ? Math.round(number) : undefined,
      });
      slot.wavy = arr;
    }
    if (slot.trillMark || (slot.wavy?.length ?? 0) > 0) out.set(key, slot);
  }
  return out;
};

const parseMksOctaveShiftHints = (source: string): Map<string, Map<number, LilyOctaveShiftHint[]>> => {
  const out = new Map<string, Map<number, LilyOctaveShiftHint[]>>();
  const lines = String(source || "").split("\n");
  for (const lineRaw of lines) {
    const trimmed = lineRaw.trim().replace(/^%\s*/, "");
    const m = trimmed.match(/^%@mks\s+octshift\s+(.+)$/i);
    if (!m) continue;
    const params: Record<string, string> = {};
    const kvRegex = /([A-Za-z][A-Za-z0-9_-]*)=([^\s]+)/g;
    let kv: RegExpExecArray | null;
    while ((kv = kvRegex.exec(m[1])) !== null) {
      params[String(kv[1]).toLowerCase()] = String(kv[2]);
    }
    const voiceId = normalizeVoiceId(String(params.voice || "").trim(), "");
    const measureNo = Number.parseInt(String(params.measure || ""), 10);
    const typeRaw = String(params.type || "").trim().toLowerCase();
    if (!voiceId || !Number.isFinite(measureNo) || measureNo <= 0) continue;
    if (typeRaw !== "up" && typeRaw !== "down" && typeRaw !== "stop") continue;
    const size = Number.parseInt(String(params.size || ""), 10);
    const number = Number.parseInt(String(params.number || ""), 10);
    const hint: LilyOctaveShiftHint = {
      type: typeRaw,
      size: Number.isFinite(size) && size > 0 ? Math.round(size) : undefined,
      number: Number.isFinite(number) && number > 0 ? Math.round(number) : undefined,
    };
    const byMeasure = out.get(voiceId) ?? new Map<number, LilyOctaveShiftHint[]>();
    const arr = byMeasure.get(measureNo) ?? [];
    arr.push(hint);
    byMeasure.set(measureNo, arr);
    out.set(voiceId, byMeasure);
  }
  return out;
};

const inferMusicXmlTypeFromDurationDiv = (durationDiv: number, divisions: number): string => {
  const safeDivisions = Math.max(1, Math.round(divisions));
  const safeDuration = Math.max(1, Math.round(durationDiv));
  const table: Array<{ type: string; dur: number }> = [
    { type: "whole", dur: safeDivisions * 4 },
    { type: "half", dur: safeDivisions * 2 },
    { type: "quarter", dur: safeDivisions },
    { type: "eighth", dur: Math.round(safeDivisions / 2) },
    { type: "16th", dur: Math.round(safeDivisions / 4) },
    { type: "32nd", dur: Math.round(safeDivisions / 8) },
    { type: "64th", dur: Math.round(safeDivisions / 16) },
  ];
  let best = table[0];
  let bestDiff = Math.abs(safeDuration - best.dur);
  for (const row of table) {
    const diff = Math.abs(safeDuration - row.dur);
    if (diff < bestDiff) {
      best = row;
      bestDiff = diff;
    }
  }
  return best.type;
};

const applyArticulationHintsToMeasures = (
  measures: LilyDirectEvent[][],
  voiceId: string,
  articulationHintByKey: Map<string, string[]>,
  graceHintByKey: Map<string, { slash: boolean }>,
  tupletHintByKey: Map<string, { actual?: number; normal?: number; start?: boolean; stop?: boolean; number?: number }>,
  accidentalHintByKey: Map<string, string>,
  slurHintByKey: Map<string, Array<{ type: "start" | "stop"; number?: number; placement?: "above" | "below" }>>,
  trillHintByKey: Map<string, { trillMark?: boolean; wavy?: Array<{ type: "start" | "stop"; number?: number }> }>
): LilyDirectEvent[][] => {
  const divisions = 480;
  for (let mi = 0; mi < measures.length; mi += 1) {
    let noteEventNo = 0;
    for (const event of measures[mi] ?? []) {
      if (event.kind === "rest" || event.kind === "backup") continue;
      noteEventNo += 1;
      const key = `${voiceId}#${mi + 1}#${noteEventNo}`;
      const hints = articulationHintByKey.get(key);
      if (event.kind === "note" || event.kind === "chord") {
        if (hints?.length) {
          event.articulationSubtypes = Array.from(new Set([...(event.articulationSubtypes ?? []), ...hints]));
        }
        const graceHint = graceHintByKey.get(key);
        if (graceHint) {
          event.graceSlash = graceHint.slash;
          event.durationDiv = 0;
        }
        const tupletHint = tupletHintByKey.get(key);
        if (tupletHint) {
          if (Number.isFinite(tupletHint.actual) && (tupletHint.actual as number) > 0) event.tupletActual = Math.round(tupletHint.actual as number);
          if (Number.isFinite(tupletHint.normal) && (tupletHint.normal as number) > 0) event.tupletNormal = Math.round(tupletHint.normal as number);
          if (Number.isFinite(tupletHint.number) && (tupletHint.number as number) > 0) event.tupletNumber = Math.round(tupletHint.number as number);
          if (tupletHint.start === true) event.tupletStart = true;
          if (tupletHint.stop === true) event.tupletStop = true;
          if (
            Number.isFinite(tupletHint.actual)
            && (tupletHint.actual as number) > 0
            && Number.isFinite(tupletHint.normal)
            && (tupletHint.normal as number) > 0
            && event.durationDiv > 0
          ) {
            const normalizedDiv = Math.round(
              (event.durationDiv * Math.round(tupletHint.actual as number)) / Math.max(1, Math.round(tupletHint.normal as number))
            );
            event.type = inferMusicXmlTypeFromDurationDiv(normalizedDiv, divisions);
          }
        }
        const accidentalText = accidentalHintByKey.get(key);
        if (accidentalText) event.accidentalText = accidentalText;
        const slurHints = slurHintByKey.get(key);
        if (slurHints?.length) event.slurHints = slurHints.slice();
        const trillHints = trillHintByKey.get(key);
        if (trillHints) {
          if (trillHints.trillMark) event.trillMark = true;
          if (trillHints.wavy?.length) event.wavyLineHints = trillHints.wavy.slice();
        }
      }
    }
  }
  return measures;
};

const extractAllStaffBlocks = (source: string): Array<{
  voiceId: string;
  partName: string;
  body: string;
  clef: string;
  transpose: LilyTransposeHint | null;
}> => {
  const out: Array<{ voiceId: string; partName: string; body: string; clef: string; transpose: LilyTransposeHint | null }> = [];
  const regex = /\\new\s+Staff/g;
  for (;;) {
    const m = regex.exec(source);
    if (!m) break;
    let cursor = m.index + m[0].length;
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    let voiceId = "";
    if (source[cursor] === "=") {
      cursor += 1;
      while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
      if (source[cursor] === "\"") {
        const endQuote = source.indexOf("\"", cursor + 1);
        if (endQuote > cursor) {
          voiceId = source.slice(cursor + 1, endQuote).trim();
          cursor = endQuote + 1;
        }
      }
      while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    }
    if (source.startsWith("\\with", cursor)) {
      cursor += "\\with".length;
      while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
      if (source[cursor] === "{") {
        const withBlock = findBalancedBlock(source, cursor);
        if (withBlock) {
          const withInstrumentNameMatch = withBlock.content.match(/(?:^|[\s;])instrumentName\s*=\s*"([^"]*)"/i);
          const withPartName = (withInstrumentNameMatch?.[1] ?? "").trim();
          const withTranspositionMatch = withBlock.content.match(
            /\\transposition\s+([a-g](?:isis|eses|is|es)?[,']*)/i
          );
          const withTranspose = withTranspositionMatch
            ? lilyTranspositionTokenToHint(withTranspositionMatch[1])
            : null;
          cursor = withBlock.endPos;
          while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
          const blockStart = source.indexOf("{", cursor);
          if (blockStart < 0) continue;
          const block = findBalancedBlock(source, blockStart);
          if (!block) continue;
          const clefMatch = block.content.match(/\\clef\s+([A-Za-z]+)/);
          const clef = normalizeAbcClefName(clefMatch?.[1] || "treble");
          const bodyInstrumentNameMatch = block.content.match(/\\set\s+Staff\.instrumentName\s*=\s*"([^"]*)"/i);
          const bodyPartName = (bodyInstrumentNameMatch?.[1] ?? "").trim();
          const bodyTranspositionMatch = block.content.match(
            /\\transposition\s+([a-g](?:isis|eses|is|es)?[,']*)/i
          );
          const bodyTranspose = bodyTranspositionMatch
            ? lilyTranspositionTokenToHint(bodyTranspositionMatch[1])
            : null;
          out.push({
            voiceId: normalizeVoiceId(voiceId, `P${out.length + 1}`),
            partName: withPartName || bodyPartName || normalizeVoiceId(voiceId, `P${out.length + 1}`),
            body: block.content,
            clef,
            transpose: withTranspose || bodyTranspose,
          });
          regex.lastIndex = block.endPos;
          continue;
        }
      }
    }
    const blockStart = source.indexOf("{", cursor);
    if (blockStart < 0) continue;
    const block = findBalancedBlock(source, blockStart);
    if (!block) continue;
    const clefMatch = block.content.match(/\\clef\s+([A-Za-z]+)/);
    const clef = normalizeAbcClefName(clefMatch?.[1] || "treble");
    const bodyInstrumentNameMatch = block.content.match(/\\set\s+Staff\.instrumentName\s*=\s*"([^"]*)"/i);
    const bodyPartName = (bodyInstrumentNameMatch?.[1] ?? "").trim();
    const bodyTranspositionMatch = block.content.match(/\\transposition\s+([a-g](?:isis|eses|is|es)?[,']*)/i);
    const bodyTranspose = bodyTranspositionMatch
      ? lilyTranspositionTokenToHint(bodyTranspositionMatch[1])
      : null;
    const normalizedVoiceId = normalizeVoiceId(voiceId, `P${out.length + 1}`);
    out.push({
      voiceId: normalizedVoiceId,
      partName: bodyPartName || normalizedVoiceId,
      body: block.content,
      clef,
      transpose: bodyTranspose,
    });
    regex.lastIndex = block.endPos;
  }
  return out;
};

const extractStandaloneMusicBlocks = (source: string): string[] => {
  const out: string[] = [];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] !== "{") continue;
    const block = findBalancedBlock(source, i);
    if (!block) continue;
    const lookbehind = source.slice(Math.max(0, i - 24), i);
    if (/\\(header|paper|layout|midi|with|bookpart|book|score)\s*$/i.test(lookbehind)) {
      i = block.endPos - 1;
      continue;
    }
    const relativePrefix = source.slice(Math.max(0, i - 64), i);
    const relativeMatch = relativePrefix.match(/\\relative(?:\s+[a-g](?:isis|eses|is|es)?[,']*)?\s*$/i);
    if (relativeMatch && relativeMatch.index !== undefined) {
      const relativeStart = Math.max(0, i - 64) + relativeMatch.index;
      out.push(source.slice(relativeStart, block.endPos));
      i = block.endPos - 1;
      continue;
    }
    out.push(block.content);
    i = block.endPos - 1;
  }
  return out;
};

const parseLilyVariableBlocks = (source: string): Map<string, string> => {
  const out = new Map<string, string>();
  const assignRegex = /(^|\n)\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*/g;
  let m: RegExpExecArray | null;
  while ((m = assignRegex.exec(source)) !== null) {
    const name = String(m[2] || "").trim();
    if (!name) continue;
    let cursor = assignRegex.lastIndex;
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    if (cursor >= source.length) continue;

    if (source.startsWith("\\relative", cursor)) {
      const bracePos = source.indexOf("{", cursor + "\\relative".length);
      if (bracePos < 0) continue;
      const block = findBalancedBlock(source, bracePos);
      if (!block) continue;
      out.set(name, source.slice(cursor, block.endPos));
      assignRegex.lastIndex = block.endPos;
      continue;
    }

    if (source[cursor] === "{") {
      const block = findBalancedBlock(source, cursor);
      if (!block) continue;
      out.set(name, source.slice(cursor, block.endPos));
      assignRegex.lastIndex = block.endPos;
    }
  }
  return out;
};

const expandLilyVariablesInBody = (body: string, variableMap: Map<string, string>): string => {
  if (!variableMap.size) return body;
  let expanded = String(body || "");
  const maxPasses = 8;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let replacedAny = false;
    expanded = expanded.replace(/\\([A-Za-z][A-Za-z0-9_]*)\b/g, (full, nameRaw: string) => {
      const name = String(nameRaw || "").trim();
      const replacement = variableMap.get(name);
      if (!replacement) return full;
      replacedAny = true;
      return ` ${replacement} `;
    });
    if (!replacedAny) break;
  }
  return expanded;
};

const extractLilyBlocksByCommand = (source: string, command: string): string[] => {
  const out: string[] = [];
  const rx = new RegExp(`\\\\${command}\\b`, "g");
  for (;;) {
    const m = rx.exec(source);
    if (!m) break;
    let cursor = m.index + m[0].length;
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    const bracePos = source.indexOf("{", cursor);
    if (bracePos < 0) continue;
    const block = findBalancedBlock(source, bracePos);
    if (!block) continue;
    out.push(block.content);
    rx.lastIndex = block.endPos;
  }
  return out;
};

const parseLyricSyllablesFromText = (text: string): string[] => {
  const clean = stripLilyComments(String(text || ""))
    .replace(/\\[A-Za-z]+/g, " ")
    .replace(/[{}]/g, " ");
  const rawTokens = clean.split(/\s+/).map((t) => t.trim()).filter(Boolean);
  const out: string[] = [];
  for (const token of rawTokens) {
    if (token === "--" || token === "__" || token === "_" || token === "~") continue;
    out.push(token.replace(/^"|"$/g, ""));
  }
  return out;
};

type LilyLyricAssignment = {
  targetVoiceId: string | null;
  syllables: string[];
};

const parseLilyLyricAssignments = (source: string): LilyLyricAssignment[] => {
  const out: LilyLyricAssignment[] = [];
  const addLyricsBlocks = extractLilyBlocksByCommand(source, "addlyrics");
  if (addLyricsBlocks.length > 0) {
    out.push({
      targetVoiceId: null,
      syllables: parseLyricSyllablesFromText(addLyricsBlocks[0]),
    });
  }

  const lyricstoRegex = /\\lyricsto\s+"([^"]+)"\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = lyricstoRegex.exec(source)) !== null) {
    const rawTarget = String(m[1] || "").trim();
    const targetVoiceId = normalizeVoiceId(rawTarget, "");
    const bracePos = source.indexOf("{", m.index + m[0].length - 1);
    if (bracePos < 0) continue;
    const block = findBalancedBlock(source, bracePos);
    if (!block) continue;
    out.push({
      targetVoiceId: targetVoiceId || null,
      syllables: parseLyricSyllablesFromText(block.content),
    });
    lyricstoRegex.lastIndex = block.endPos;
  }

  if (out.length === 0) {
    const lyricModeBlocks = extractLilyBlocksByCommand(source, "lyricmode");
    if (lyricModeBlocks.length > 0) {
      out.push({
        targetVoiceId: null,
        syllables: parseLyricSyllablesFromText(lyricModeBlocks[0]),
      });
    }
  }
  return out;
};

const applyLyricsToMeasures = (measures: LilyDirectEvent[][], syllables: string[]): LilyDirectEvent[][] => {
  if (!syllables.length) return measures;
  let cursor = 0;
  for (let mi = 0; mi < measures.length; mi += 1) {
    for (const event of measures[mi] ?? []) {
      if (event.kind !== "note" && event.kind !== "chord") continue;
      if (event.durationDiv <= 0) continue;
      if (cursor >= syllables.length) return measures;
      event.lyricText = syllables[cursor];
      cursor += 1;
    }
  }
  return measures;
};

const lilyPitchClassToSemitone = (step: string, alter: number): number => {
  const baseByStep: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  const safeStep = String(step || "").toUpperCase();
  const base = baseByStep[safeStep] ?? 0;
  const alt = Number.isFinite(alter) ? Math.round(alter) : 0;
  return base + alt;
};

const parseLilyPitchToken = (token: string): {
  step: string;
  alter: number;
  octaveMarks: string;
} | null => {
  const m = String(token || "").match(/^([a-g])(isis|eses|is|es)?([,']*)$/i);
  if (!m) return null;
  const step = m[1].toUpperCase();
  const accidentalText = (m[2] || "").toLowerCase();
  let alter = 0;
  if (accidentalText === "is") alter = 1;
  if (accidentalText === "isis") alter = 2;
  if (accidentalText === "es") alter = -1;
  if (accidentalText === "eses") alter = -2;
  return { step, alter, octaveMarks: m[3] || "" };
};

const parseLilyAbsolutePitch = (token: string): LilyParsedPitch | null => {
  const parsed = parseLilyPitchToken(token);
  if (!parsed) return null;
  const up = (parsed.octaveMarks.match(/'/g) || []).length;
  const down = (parsed.octaveMarks.match(/,/g) || []).length;
  return {
    step: parsed.step,
    alter: parsed.alter,
    octave: 3 + up - down,
  };
};

const parseRelativeRoot = (token: string): { step: string; alter: number; octave: number } | null => {
  const parsed = parseLilyPitchToken(token);
  if (!parsed) return null;
  let octave = 3;
  if (parsed.octaveMarks) {
    const up = (parsed.octaveMarks.match(/'/g) || []).length;
    const down = (parsed.octaveMarks.match(/,/g) || []).length;
    octave = 3 + up - down;
  }
  return {
    step: parsed.step,
    alter: parsed.alter,
    octave,
  };
};

type LilyRelativeAnchor = {
  step: string;
  octave: number;
  midi: number;
};

const lilyStepToIndex = (step: string): number => {
  const safe = String(step || "").toUpperCase();
  if (safe === "C") return 0;
  if (safe === "D") return 1;
  if (safe === "E") return 2;
  if (safe === "F") return 3;
  if (safe === "G") return 4;
  if (safe === "A") return 5;
  if (safe === "B") return 6;
  return 0;
};

const resolveRelativePitch = (
  step: string,
  alter: number,
  previousAnchor: LilyRelativeAnchor | null
): LilyRelativeAnchor => {
  if (!previousAnchor) {
    // LilyPond's omitted \relative root behaves like starting from c' anchor.
    // Our octave scale uses C3 as base "c", so fallback should be octave 3.
    const fallbackOctave = 3;
    return {
      step,
      octave: fallbackOctave,
      midi: fallbackOctave * 12 + lilyPitchClassToSemitone(step, alter),
    };
  }
  const prevIndex = previousAnchor.octave * 7 + lilyStepToIndex(previousAnchor.step);
  const targetStepIndex = lilyStepToIndex(step);
  let bestOctave = 4;
  let bestIndex = bestOctave * 7 + targetStepIndex;
  let bestMidi = 4 * 12 + lilyPitchClassToSemitone(step, alter);
  let bestDist = Number.POSITIVE_INFINITY;
  for (let octave = 0; octave <= 9; octave += 1) {
    const index = octave * 7 + targetStepIndex;
    const dist = Math.abs(index - prevIndex);
    const midi = octave * 12 + lilyPitchClassToSemitone(step, alter);
    if (dist < bestDist) {
      bestDist = dist;
      bestOctave = octave;
      bestIndex = index;
      bestMidi = midi;
      continue;
    }
    if (dist === bestDist && index > bestIndex) {
      bestOctave = octave;
      bestIndex = index;
      bestMidi = midi;
    }
  }
  return { step, octave: bestOctave, midi: bestMidi };
};

const applyLilyOctaveMarks = (
  resolved: LilyRelativeAnchor,
  octaveMarks: string,
  step: string,
  alter: number
): LilyRelativeAnchor => {
  if (!octaveMarks) return resolved;
  const up = (octaveMarks.match(/'/g) || []).length;
  const down = (octaveMarks.match(/,/g) || []).length;
  const octave = resolved.octave + up - down;
  return {
    step,
    octave,
    midi: octave * 12 + lilyPitchClassToSemitone(step, alter),
  };
};

const unwrapRelativeBlock = (
  sourceBody: string
): { body: string; relativeMode: boolean; relativeRoot: { step: string; alter: number; octave: number } | null } => {
  const relativeMatch = sourceBody.match(/\\relative(?:\s+([a-g](?:isis|eses|is|es)?[,']*))?\s*\{/i);
  if (!relativeMatch || relativeMatch.index === undefined) {
    return { body: sourceBody, relativeMode: false, relativeRoot: null };
  }
  const bracePos = sourceBody.indexOf("{", relativeMatch.index + relativeMatch[0].length - 1);
  if (bracePos < 0) return { body: sourceBody, relativeMode: false, relativeRoot: null };
  const block = findBalancedBlock(sourceBody, bracePos);
  if (!block) return { body: sourceBody, relativeMode: false, relativeRoot: null };
  const rootToken = String(relativeMatch[1] || "").trim();
  const relativeRoot = rootToken ? parseRelativeRoot(rootToken) : null;
  return {
    body: block.content,
    relativeMode: true,
    relativeRoot,
  };
};

const hasOmittedRelativeRoot = (sourceBody: string): boolean => {
  const m = String(sourceBody || "").match(/\\relative(?:\s+([a-g](?:isis|eses|is|es)?[,']*))?\s*\{/i);
  if (!m) return false;
  return !String(m[1] || "").trim();
};

const parseLilyDirectBody = (
  body: string,
  warnings: string[],
  contextLabel: string,
  beats: number,
  beatType: number,
  options: {
    voiceId?: string;
    graceHintByKey?: Map<string, { slash: boolean }>;
  } = {}
): LilyDirectEvent[][] => {
  const SMALL_OVERFLOW_TOLERANCE_DIV = 8;
  const relative = unwrapRelativeBlock(body);
  let previousAnchor: LilyRelativeAnchor | null = relative.relativeRoot
    ? {
      step: relative.relativeRoot.step,
      octave: relative.relativeRoot.octave,
      midi: relative.relativeRoot.octave * 12 + lilyPitchClassToSemitone(relative.relativeRoot.step, relative.relativeRoot.alter),
    }
    : null;
  const preprocessed = expandLilyTupletMarkers(expandLilyAlternativeMarkers(expandLilyRepeatVoltaMarkers(relative.body)));
  const clean = stripLilyComments(preprocessed)
    .replace(/\\key\s+[a-g](?:isis|eses|is|es)?[,']*\s+\\[A-Za-z]+/gi, " ")
    .replace(/\\time\s+\d+\s*\/\s*\d+/g, " ")
    .replace(/\\clef\s+"[^"]+"/g, " ")
    .replace(/\\clef\s+[A-Za-z]+/g, " ")
    .replace(/\\bar\s+\"[^\"]*\"/g, "|")
    .replace(/\"[^\"]*\"/g, " ")
    .replace(/\\bar/g, " ")
    .replace(/[{}]/g, " ");
  const tokens =
    clean.match(
      /@@MKS_(?:RPT_(?:FWD|BWD_\d+)|ENDING_(?:START|STOP)_\d+|TUPLET_START_\d+_\d+|TUPLET_STOP)@@|\\(?:ppp|pp|p|mp|mf|ff|fff|f|sfz|<|>|!|\(|\)|trill|startTrillSpan|stopTrillSpan|glissando|sustainOn|sustainOff|sostenutoOn|sostenutoOff|unaCorda|treCorde|upbow|downbow|snappizzicato|flageolet|harmonic)|(?<![A-Za-z\\])<[^>]+>(?:\d+(?:\*\d+(?:\/\d+)?)?)?\.{0,3}~?(?![A-Za-z])|(?<![A-Za-z\\])[a-grs](?:isis|eses|is|es)?[,']*(?:\d+(?:\*\d+(?:\/\d+)?)?)?\.{0,3}~?(?![A-Za-z])|(?<![A-Za-z\\])(?:\d+(?:\*\d+(?:\/\d+)?)?)\.{0,3}~?(?![A-Za-z])|[()]|\|/g
    ) || [];
  const measures: LilyDirectEvent[][] = [[]];
  let currentDurationExpr = "4";
  let currentDots = 0;
  const divisions = 480;
  const safeBeats = Number.isFinite(beats) && beats > 0 ? Math.round(beats) : 4;
  const safeBeatType = Number.isFinite(beatType) && beatType > 0 ? Math.round(beatType) : 4;
  const measureCapacity = Math.max(1, Math.round((divisions * 4 * safeBeats) / safeBeatType));
  const voiceId = options.voiceId ? normalizeVoiceId(options.voiceId, "") : "";
  const graceHintByKey = options.graceHintByKey ?? new Map<string, { slash: boolean }>();
  let noteEventNoInMeasure = 0;
  let pendingTieStop = false;
  let pendingSlurStart = 0;
  let pendingArticulations: string[] = [];
  let pendingTechnicals: string[] = [];
  let pendingTrillMark = false;
  let pendingWavyHints: Array<{ type: "start" | "stop"; number?: number }> = [];
  let pendingGlissStop = false;
  let activeTuplet: { actual: number; normal: number; needsStart: boolean } | null = null;
  let previousPitched:
    | { kind: "note"; pitch: LilyParsedPitch }
    | { kind: "chord"; pitches: LilyParsedPitch[] }
    | null = null;

  const appendSlurStopToLastPitchedEvent = (): void => {
    for (let mi = measures.length - 1; mi >= 0; mi -= 1) {
      const events = measures[mi] || [];
      for (let ei = events.length - 1; ei >= 0; ei -= 1) {
        const event = events[ei];
        if (event.kind !== "note" && event.kind !== "chord") continue;
        const hints = event.slurHints ?? [];
        hints.push({ type: "stop" });
        event.slurHints = hints;
        return;
      }
    }
  };
  const appendToLastPitchedEvent = (
    updater: (event: Extract<LilyDirectEvent, { kind: "note" | "chord" }>) => void
  ): boolean => {
    for (let mi = measures.length - 1; mi >= 0; mi -= 1) {
      const events = measures[mi] || [];
      for (let ei = events.length - 1; ei >= 0; ei -= 1) {
        const event = events[ei];
        if (event.kind !== "note" && event.kind !== "chord") continue;
        updater(event);
        return true;
      }
    }
    return false;
  };
  const appendTupletStopToLastPitchedEvent = (): void => {
    for (let mi = measures.length - 1; mi >= 0; mi -= 1) {
      const events = measures[mi] || [];
      for (let ei = events.length - 1; ei >= 0; ei -= 1) {
        const event = events[ei];
        if (event.kind !== "note" && event.kind !== "chord") continue;
        event.tupletStop = true;
        return;
      }
    }
  };
  const applyPendingOrnaments = (event: Extract<LilyDirectEvent, { kind: "note" | "chord" }>): void => {
    if (pendingArticulations.length > 0) {
      event.articulationSubtypes = [...(event.articulationSubtypes ?? []), ...pendingArticulations];
      pendingArticulations = [];
    }
    if (pendingTechnicals.length > 0) {
      event.technicalSubtypes = [...(event.technicalSubtypes ?? []), ...pendingTechnicals];
      pendingTechnicals = [];
    }
    if (pendingTrillMark) {
      event.trillMark = true;
      pendingTrillMark = false;
    }
    if (pendingWavyHints.length > 0) {
      event.wavyLineHints = [...(event.wavyLineHints ?? []), ...pendingWavyHints];
      pendingWavyHints = [];
    }
  };

  const pushEvent = (event: LilyDirectEvent): void => {
    const current = measures[measures.length - 1];
    const used = current.reduce((sum, item) => sum + item.durationDiv, 0);
    if (used + event.durationDiv > measureCapacity) {
      const overflow = used + event.durationDiv - measureCapacity;
      if (overflow <= SMALL_OVERFLOW_TOLERANCE_DIV) {
        warnings.push(`${contextLabel}: accepted slight overfill due to duration rounding.`);
        current.push(event);
        return;
      }
      if (event.durationDiv > measureCapacity) {
        warnings.push(`${contextLabel}: overfull measure; dropped oversized event.`);
        return;
      }
      warnings.push(`${contextLabel}: overfull measure; carried event to next measure.`);
      measures.push([event]);
      return;
    }
    current.push(event);
  };

  for (const token of tokens) {
    if (token === "|") {
      measures.push([]);
      noteEventNoInMeasure = 0;
      continue;
    }
    if (token === "@@MKS_RPT_FWD@@") {
      pushEvent({
        kind: "direction",
        durationDiv: 0,
        xml: `<barline location="left"><repeat direction="forward"/></barline>`,
      });
      continue;
    }
    if (token.startsWith("@@MKS_RPT_BWD_")) {
      const timesText = token.replace(/^@@MKS_RPT_BWD_(\d+)@@$/, "$1");
      const times = Number.parseInt(timesText, 10);
      const endingXml = Number.isFinite(times) && times > 1
        ? `<ending number="${Math.round(times)}" type="stop"/>`
        : "";
      pushEvent({
        kind: "direction",
        durationDiv: 0,
        xml: `<barline location="right"><repeat direction="backward"/>${endingXml}</barline>`,
      });
      continue;
    }
    if (token.startsWith("@@MKS_ENDING_START_")) {
      const nText = token.replace(/^@@MKS_ENDING_START_(\d+)@@$/, "$1");
      const n = Number.parseInt(nText, 10);
      const numberAttr = Number.isFinite(n) && n > 0 ? Math.round(n) : 1;
      pushEvent({
        kind: "direction",
        durationDiv: 0,
        xml: `<barline location="left"><ending number="${numberAttr}" type="start"/></barline>`,
      });
      continue;
    }
    if (token.startsWith("@@MKS_ENDING_STOP_")) {
      const nText = token.replace(/^@@MKS_ENDING_STOP_(\d+)@@$/, "$1");
      const n = Number.parseInt(nText, 10);
      const numberAttr = Number.isFinite(n) && n > 0 ? Math.round(n) : 1;
      pushEvent({
        kind: "direction",
        durationDiv: 0,
        xml: `<barline location="right"><ending number="${numberAttr}" type="stop"/></barline>`,
      });
      continue;
    }
    if (token.startsWith("@@MKS_TUPLET_START_")) {
      const m = token.match(/^@@MKS_TUPLET_START_(\d+)_(\d+)@@$/);
      const actual = Number.parseInt(m?.[1] || "", 10);
      const normal = Number.parseInt(m?.[2] || "", 10);
      activeTuplet = {
        actual: Number.isFinite(actual) && actual > 0 ? Math.round(actual) : 3,
        normal: Number.isFinite(normal) && normal > 0 ? Math.round(normal) : 2,
        needsStart: true,
      };
      continue;
    }
    if (token === "@@MKS_TUPLET_STOP@@") {
      if (activeTuplet) appendTupletStopToLastPitchedEvent();
      activeTuplet = null;
      continue;
    }
    if (token === "(") {
      pendingSlurStart += 1;
      continue;
    }
    if (token === ")") {
      appendSlurStopToLastPitchedEvent();
      continue;
    }
    if (token.startsWith("\\")) {
      const dyn = token.slice(1).toLowerCase();
      const dynamicKinds = new Set(["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff", "sfz"]);
      if (dynamicKinds.has(dyn)) {
        pushEvent({
          kind: "direction",
          durationDiv: 0,
          xml: `<direction><direction-type><dynamics><${dyn}/></dynamics></direction-type></direction>`,
        });
        continue;
      }
      if (dyn === "<" || dyn === ">" || dyn === "!") {
        const wedgeType = dyn === "<" ? "crescendo" : dyn === ">" ? "diminuendo" : "stop";
        pushEvent({
          kind: "direction",
          durationDiv: 0,
          xml: `<direction><direction-type><wedge type="${wedgeType}"/></direction-type></direction>`,
        });
        continue;
      }
      if (dyn === "(") {
        pendingSlurStart += 1;
        continue;
      }
      if (dyn === ")") {
        appendSlurStopToLastPitchedEvent();
        continue;
      }
      if (dyn === "trill") {
        if (!appendToLastPitchedEvent((event) => {
          event.trillMark = true;
        })) {
          pendingTrillMark = true;
        }
        continue;
      }
      if (dyn === "starttrillspan") {
        if (!appendToLastPitchedEvent((event) => {
          const hints = event.wavyLineHints ?? [];
          hints.push({ type: "start" });
          event.wavyLineHints = hints;
        })) {
          pendingWavyHints.push({ type: "start" });
        }
        continue;
      }
      if (dyn === "stoptrillspan") {
        if (!appendToLastPitchedEvent((event) => {
          const hints = event.wavyLineHints ?? [];
          hints.push({ type: "stop" });
          event.wavyLineHints = hints;
        })) {
          pendingWavyHints.push({ type: "stop" });
        }
        continue;
      }
      if (dyn === "glissando") {
        if (!appendToLastPitchedEvent((event) => {
          const hints = event.glissHints ?? [];
          hints.push({ type: "start" });
          event.glissHints = hints;
        })) {
          // If no previous pitched note exists, start marker is not placeable.
        }
        pendingGlissStop = true;
        continue;
      }
      if (dyn === "upbow" || dyn === "downbow") {
        const articulation = dyn === "upbow" ? "up-bow" : "down-bow";
        if (!appendToLastPitchedEvent((event) => {
          event.articulationSubtypes = [...(event.articulationSubtypes ?? []), articulation];
        })) {
          pendingArticulations.push(articulation);
        }
        continue;
      }
      if (dyn === "snappizzicato") {
        if (!appendToLastPitchedEvent((event) => {
          event.articulationSubtypes = [...(event.articulationSubtypes ?? []), "snap-pizzicato"];
        })) {
          pendingArticulations.push("snap-pizzicato");
        }
        continue;
      }
      if (dyn === "flageolet" || dyn === "harmonic") {
        if (!appendToLastPitchedEvent((event) => {
          event.technicalSubtypes = [...(event.technicalSubtypes ?? []), "harmonic"];
        })) {
          pendingTechnicals.push("harmonic");
        }
        continue;
      }
      if (dyn === "sustainon" || dyn === "sustainoff") {
        const type = dyn === "sustainon" ? "start" : "stop";
        pushEvent({
          kind: "direction",
          durationDiv: 0,
          xml: `<direction><direction-type><pedal type="${type}" number="1" line="yes"/></direction-type></direction>`,
        });
        continue;
      }
      if (dyn === "sostenutoon" || dyn === "sostenutooff") {
        if (dyn === "sostenutoon") {
          pushEvent({
            kind: "direction",
            durationDiv: 0,
            xml: `<direction><direction-type><words>Sost. Ped.</words></direction-type></direction>`,
          });
        }
        const type = dyn === "sostenutoon" ? "start" : "stop";
        pushEvent({
          kind: "direction",
          durationDiv: 0,
          xml: `<direction><direction-type><pedal type="${type}" number="2" line="yes"/></direction-type></direction>`,
        });
        continue;
      }
      if (dyn === "unacorda" || dyn === "trecorde") {
        const words = dyn === "unacorda" ? "una corda" : "tre corde";
        pushEvent({
          kind: "direction",
          durationDiv: 0,
          xml: `<direction><direction-type><words>${words}</words></direction-type></direction>`,
        });
        const type = dyn === "unacorda" ? "start" : "stop";
        pushEvent({
          kind: "direction",
          durationDiv: 0,
          xml: `<direction><direction-type><pedal type="${type}" number="3" line="yes"/></direction-type></direction>`,
        });
        continue;
      }
      continue;
    }
    const durationOnlyMatch = token.match(/^((?:\d+(?:\*\d+(?:\/\d+)?)?))(\.*)(~?)$/);
    if (durationOnlyMatch && previousPitched) {
      currentDurationExpr = durationOnlyMatch[1];
      currentDots = durationOnlyMatch[2]?.length || 0;
      const parsedDuration = parseLilyDurationExpr(currentDurationExpr).base;
      const durationDiv = lilyDurationExprToDivisions(currentDurationExpr, currentDots, divisions);
      const type = lilyDurationToMusicXmlType(parsedDuration);
      if (previousPitched.kind === "note") {
        const event: LilyDirectEvent = {
          kind: "note",
          durationDiv,
          type,
          dots: currentDots,
          pitch: previousPitched.pitch,
          tieStop: pendingTieStop || undefined,
          tieStart: durationOnlyMatch[3] === "~" ? true : undefined,
        };
        if (activeTuplet) {
          event.tupletActual = activeTuplet.actual;
          event.tupletNormal = activeTuplet.normal;
          if (activeTuplet.needsStart) {
            event.tupletStart = true;
            activeTuplet.needsStart = false;
          }
        }
        applyPendingOrnaments(event);
        if (pendingGlissStop) {
          event.glissHints = [...(event.glissHints ?? []), { type: "stop" }];
          pendingGlissStop = false;
        }
        if (pendingSlurStart > 0) {
          event.slurHints = Array.from({ length: pendingSlurStart }, () => ({ type: "start" as const }));
          pendingSlurStart = 0;
        }
        pendingTieStop = durationOnlyMatch[3] === "~";
        noteEventNoInMeasure += 1;
        pushEvent(event);
        previousPitched = { kind: "note", pitch: event.pitch };
      } else {
        const copiedPitches: LilyParsedPitch[] = previousPitched.pitches.map((pitch: LilyParsedPitch) => ({ ...pitch }));
        const event: LilyDirectEvent = {
          kind: "chord",
          durationDiv,
          type,
          dots: currentDots,
          pitches: copiedPitches,
          tieStop: pendingTieStop || undefined,
          tieStart: durationOnlyMatch[3] === "~" ? true : undefined,
        };
        if (activeTuplet) {
          event.tupletActual = activeTuplet.actual;
          event.tupletNormal = activeTuplet.normal;
          if (activeTuplet.needsStart) {
            event.tupletStart = true;
            activeTuplet.needsStart = false;
          }
        }
        applyPendingOrnaments(event);
        if (pendingGlissStop) {
          event.glissHints = [...(event.glissHints ?? []), { type: "stop" }];
          pendingGlissStop = false;
        }
        if (pendingSlurStart > 0) {
          event.slurHints = Array.from({ length: pendingSlurStart }, () => ({ type: "start" as const }));
          pendingSlurStart = 0;
        }
        pendingTieStop = durationOnlyMatch[3] === "~";
        noteEventNoInMeasure += 1;
        pushEvent(event);
        previousPitched = { kind: "chord", pitches: copiedPitches };
      }
      continue;
    }
    const chordExprMatch = token.match(/^<([^>]+)>((?:\d+(?:\*\d+(?:\/\d+)?)?)?)(\.*)(~?)$/);
    if (chordExprMatch) {
      const durExprText = chordExprMatch[2] || "";
      const dots = chordExprMatch[3]?.length || 0;
      if (durExprText) {
        currentDurationExpr = durExprText;
        currentDots = dots;
      }
      const effectiveExpr = durExprText || currentDurationExpr;
      const effectiveDots = durExprText ? dots : currentDots;
      const pitches = chordExprMatch[1]
        .split(/\s+/)
        .map((entry) => {
          const parsed = parseLilyPitchToken(entry);
          if (!parsed) return null;
          if (relative.relativeMode) {
            const resolvedFromAnchor = resolveRelativePitch(parsed.step, parsed.alter, previousAnchor);
            const resolved = applyLilyOctaveMarks(
              resolvedFromAnchor,
              parsed.octaveMarks,
              parsed.step,
              parsed.alter
            );
            previousAnchor = resolved;
            return { step: parsed.step, alter: parsed.alter, octave: resolved.octave };
          }
          return parseLilyAbsolutePitch(entry);
        })
        .filter((entry): entry is LilyParsedPitch => Boolean(entry));
      if (!pitches.length) {
        warnings.push(`${contextLabel}: chord had no parseable pitches; skipped.`);
        continue;
      }
      if (relative.relativeMode) {
        // LilyPond relative anchoring after a chord follows the first chord tone.
        const firstPitch = pitches[0];
        previousAnchor = {
          step: firstPitch.step,
          octave: firstPitch.octave,
          midi: firstPitch.octave * 12 + lilyPitchClassToSemitone(firstPitch.step, firstPitch.alter),
        };
      }
      const event: LilyDirectEvent = {
        kind: "chord",
        durationDiv: lilyDurationExprToDivisions(effectiveExpr, effectiveDots, divisions),
        type: lilyDurationToMusicXmlType(parseLilyDurationExpr(effectiveExpr).base),
        dots: effectiveDots,
        pitches,
        tieStop: pendingTieStop || undefined,
        tieStart: chordExprMatch[4] === "~" ? true : undefined,
      };
      if (activeTuplet) {
        event.tupletActual = activeTuplet.actual;
        event.tupletNormal = activeTuplet.normal;
        if (activeTuplet.needsStart) {
          event.tupletStart = true;
          activeTuplet.needsStart = false;
        }
      }
      applyPendingOrnaments(event);
      if (pendingGlissStop) {
        event.glissHints = [...(event.glissHints ?? []), { type: "stop" }];
        pendingGlissStop = false;
      }
      if (pendingSlurStart > 0) {
        event.slurHints = Array.from({ length: pendingSlurStart }, () => ({ type: "start" as const }));
        pendingSlurStart = 0;
      }
      pendingTieStop = chordExprMatch[4] === "~";
      noteEventNoInMeasure += 1;
      if (voiceId && graceHintByKey.size > 0) {
        const graceHint = graceHintByKey.get(`${voiceId}#${measures.length}#${noteEventNoInMeasure}`);
        if (graceHint) {
          event.graceSlash = graceHint.slash;
          event.durationDiv = 0;
        }
      }
      pushEvent(event);
      previousPitched = { kind: "chord", pitches: event.pitches.map((pitch) => ({ ...pitch })) };
      continue;
    }
    const m = token.match(/^([a-grs])(isis|eses|is|es)?([,']*)((?:\d+(?:\*\d+(?:\/\d+)?)?)?)(\.*)(~?)$/);
    if (!m) continue;
    const durExprText = m[4] || "";
    const dots = m[5]?.length || 0;
    if (durExprText) {
      currentDurationExpr = durExprText;
      currentDots = dots;
    }
    const effectiveExpr = durExprText || currentDurationExpr;
    const effectiveDots = durExprText ? dots : currentDots;
    const parsedDuration = parseLilyDurationExpr(effectiveExpr).base;
    const durationDiv = lilyDurationExprToDivisions(effectiveExpr, effectiveDots, divisions);
    const type = lilyDurationToMusicXmlType(parsedDuration);
    if (m[1] === "r" || m[1] === "s") {
      pendingTieStop = false;
      pushEvent({ kind: "rest", durationDiv, type, dots: effectiveDots });
      continue;
    }
    const pitch = parseLilyAbsolutePitch(`${m[1]}${m[2] || ""}${m[3] || ""}`);
    const pitchResolved =
      relative.relativeMode
        ? (() => {
            const parsed = parseLilyPitchToken(`${m[1]}${m[2] || ""}${m[3] || ""}`);
            if (!parsed) return null;
            const resolvedFromAnchor = resolveRelativePitch(parsed.step, parsed.alter, previousAnchor);
            const resolved = applyLilyOctaveMarks(
              resolvedFromAnchor,
              parsed.octaveMarks,
              parsed.step,
              parsed.alter
            );
            previousAnchor = resolved;
            return { step: parsed.step, alter: parsed.alter, octave: resolved.octave };
          })()
        : pitch;
    if (!pitchResolved) {
      warnings.push(`${contextLabel}: note pitch parse failed; skipped.`);
      continue;
    }
    const event: LilyDirectEvent = {
      kind: "note",
      durationDiv,
      type,
      dots: effectiveDots,
      pitch: pitchResolved,
      tieStop: pendingTieStop || undefined,
      tieStart: m[6] === "~" ? true : undefined,
    };
    if (activeTuplet) {
      event.tupletActual = activeTuplet.actual;
      event.tupletNormal = activeTuplet.normal;
      if (activeTuplet.needsStart) {
        event.tupletStart = true;
        activeTuplet.needsStart = false;
      }
    }
    applyPendingOrnaments(event);
    if (pendingGlissStop) {
      event.glissHints = [...(event.glissHints ?? []), { type: "stop" }];
      pendingGlissStop = false;
    }
    if (pendingSlurStart > 0) {
      event.slurHints = Array.from({ length: pendingSlurStart }, () => ({ type: "start" as const }));
      pendingSlurStart = 0;
    }
    pendingTieStop = m[6] === "~";
    noteEventNoInMeasure += 1;
    if (voiceId && graceHintByKey.size > 0) {
      const graceHint = graceHintByKey.get(`${voiceId}#${measures.length}#${noteEventNoInMeasure}`);
      if (graceHint) {
        event.graceSlash = graceHint.slash;
        event.durationDiv = 0;
      }
    }
    pushEvent(event);
    previousPitched = { kind: "note", pitch: event.pitch };
  }

  while (measures.length > 1 && measures[measures.length - 1].length === 0) {
    measures.pop();
  }
  return measures;
};

const buildDirectMusicXmlFromStaffBlocks = (params: {
  title: string;
  composer: string;
  beats: number;
  beatType: number;
  fifths: number;
  mode: "major" | "minor";
  staffs: Array<{
    voiceId: string;
    partName?: string;
    clef: string;
    measures: LilyDirectEvent[][];
    transpose?: LilyTransposeHint | null;
    measureHintsByIndex?: Map<number, LilyMeasureHint>;
    octaveShiftHintsByMeasure?: Map<number, LilyOctaveShiftHint[]>;
  }>;
}): string => {
  const accidentalTextFromAlter = (alter: number): string | null => {
    const safeAlter = Number.isFinite(alter) ? Math.round(alter) : 0;
    if (safeAlter === 2) return "double-sharp";
    if (safeAlter === 1) return "sharp";
    if (safeAlter === -1) return "flat";
    if (safeAlter === -2) return "flat-flat";
    return null;
  };
  const buildNoteExtrasXml = (event: Extract<LilyDirectEvent, { kind: "note" | "chord" }>): string => {
    const graceXml = event.graceSlash === undefined ? "" : `<grace${event.graceSlash ? ' slash="yes"' : ""}/>`;
    const durationXml = event.graceSlash === undefined ? `<duration>${event.durationDiv}</duration>` : "";
    const timeModXml =
      Number.isFinite(event.tupletActual)
      && (event.tupletActual as number) > 0
      && Number.isFinite(event.tupletNormal)
      && (event.tupletNormal as number) > 0
        ? `<time-modification><actual-notes>${Math.round(event.tupletActual as number)}</actual-notes><normal-notes>${Math.round(event.tupletNormal as number)}</normal-notes></time-modification>`
        : "";
    const tokens = Array.from(new Set(event.articulationSubtypes ?? []));
    const nodes: string[] = [];
    if (tokens.includes("staccato")) nodes.push("<staccato/>");
    if (tokens.includes("accent")) nodes.push("<accent/>");
    if (tokens.includes("up-bow")) nodes.push("<up-bow/>");
    if (tokens.includes("down-bow")) nodes.push("<down-bow/>");
    if (tokens.includes("snap-pizzicato")) nodes.push("<snap-pizzicato/>");
    const technicalTokens = Array.from(new Set(event.technicalSubtypes ?? []));
    const technicalNodes: string[] = [];
    if (technicalTokens.includes("harmonic")) technicalNodes.push("<harmonic/>");
    const tupletNodes: string[] = [];
    const tupletNumberAttr =
      Number.isFinite(event.tupletNumber) && (event.tupletNumber as number) > 0
        ? ` number="${Math.round(event.tupletNumber as number)}"`
        : "";
    if (event.tupletStart) tupletNodes.push(`<tuplet type="start"${tupletNumberAttr}/>`);
    if (event.tupletStop) tupletNodes.push(`<tuplet type="stop"${tupletNumberAttr}/>`);
    const slurNodes = (event.slurHints ?? []).map((slur) => {
      const numberAttr = Number.isFinite(slur.number) && (slur.number as number) > 0
        ? ` number="${Math.round(slur.number as number)}"`
        : "";
      const placementAttr = slur.type === "start" && slur.placement ? ` placement="${slur.placement}"` : "";
      return `<slur type="${slur.type}"${numberAttr}${placementAttr}/>`;
    });
    const glissNodes = (event.glissHints ?? []).map((gliss) => {
      const numberAttr = Number.isFinite(gliss.number) && (gliss.number as number) > 0
        ? ` number="${Math.round(gliss.number as number)}"`
        : "";
      return `<glissando type="${gliss.type}"${numberAttr}/>`;
    });
    const wavyNodes = (event.wavyLineHints ?? []).map((wavy) => {
      const numberAttr = Number.isFinite(wavy.number) && (wavy.number as number) > 0
        ? ` number="${Math.round(wavy.number as number)}"`
        : "";
      return `<wavy-line type="${wavy.type}"${numberAttr}/>`;
    });
    const tieXml = `${event.tieStart ? '<tie type="start"/>' : ""}${event.tieStop ? '<tie type="stop"/>' : ""}`;
    const tiedXml = `${event.tieStart ? '<tied type="start"/>' : ""}${event.tieStop ? '<tied type="stop"/>' : ""}`;
    const ornamentsXml = event.trillMark || wavyNodes.length
      ? `<ornaments>${event.trillMark ? "<trill-mark/>" : ""}${wavyNodes.join("")}</ornaments>`
      : "";
    const lyricXml = event.lyricText
      ? `<lyric><syllabic>single</syllabic><text>${xmlEscape(event.lyricText)}</text></lyric>`
      : "";
    const notationXml = nodes.length || technicalNodes.length || tupletNodes.length || slurNodes.length || glissNodes.length || ornamentsXml || tiedXml
      ? `<notations>${nodes.length ? `<articulations>${nodes.join("")}</articulations>` : ""}${technicalNodes.length ? `<technical>${technicalNodes.join("")}</technical>` : ""}${tupletNodes.join("")}${slurNodes.join("")}${glissNodes.join("")}${tiedXml}${ornamentsXml}</notations>`
      : "";
    return `${graceXml}${durationXml}${timeModXml}${tieXml}${lyricXml}${notationXml}`;
  };
  const partList = params.staffs
    .map((staff, i) => {
      const name = (staff.partName ?? "").trim() || staff.voiceId || `Part ${i + 1}`;
      return `<score-part id="P${i + 1}"><part-name>${xmlEscape(name)}</part-name></score-part>`;
    })
    .join("");
  const measureCount = params.staffs.reduce((max, staff) => Math.max(max, staff.measures.length), 1);
  const parts = params.staffs
    .map((staff, i) => {
      const partId = `P${i + 1}`;
      const measuresXml: string[] = [];
      const measureCapacity = Math.max(1, Math.round((480 * 4 * params.beats) / Math.max(1, params.beatType)));
      let currentBeats = Math.max(1, Math.round(params.beats));
      let currentBeatType = Math.max(1, Math.round(params.beatType));
      for (let m = 0; m < measureCount; m += 1) {
        const events = staff.measures[m] || [];
        const index1 = m + 1;
        const hint = staff.measureHintsByIndex?.get(index1) ?? null;
        const numberText = hint?.number?.trim() || String(index1);
        const implicitAttr = hint?.implicit ? ' implicit="yes"' : "";
        const measureBeats = Math.max(1, Math.round(hint?.beats ?? currentBeats));
        const measureBeatType = Math.max(1, Math.round(hint?.beatType ?? currentBeatType));
        const shouldEmitTime =
          m === 0
          || hint?.explicitTime === true
          || measureBeats !== currentBeats
          || measureBeatType !== currentBeatType;
        let body = "";
        if (m === 0) {
          const clefXml =
            staff.clef === "bass"
              ? "<clef><sign>F</sign><line>4</line></clef>"
              : staff.clef === "alto"
                ? "<clef><sign>C</sign><line>3</line></clef>"
                : staff.clef === "tenor"
                  ? "<clef><sign>C</sign><line>4</line></clef>"
                  : "<clef><sign>G</sign><line>2</line></clef>";
          const transpose = staff.transpose || null;
          const transposeXml = transpose && (Number.isFinite(transpose.chromatic) || Number.isFinite(transpose.diatonic))
            ? `<transpose>${Number.isFinite(transpose.diatonic) ? `<diatonic>${Math.round(Number(transpose.diatonic))}</diatonic>` : ""}${Number.isFinite(transpose.chromatic) ? `<chromatic>${Math.round(Number(transpose.chromatic))}</chromatic>` : ""}</transpose>`
            : "";
          body += `<attributes><divisions>480</divisions><key><fifths>${params.fifths}</fifths><mode>${params.mode}</mode></key><time><beats>${measureBeats}</beats><beat-type>${measureBeatType}</beat-type></time>${transposeXml}${clefXml}</attributes>`;
        } else if (shouldEmitTime) {
          body += `<attributes><time><beats>${measureBeats}</beats><beat-type>${measureBeatType}</beat-type></time></attributes>`;
        }
        if (hint?.doubleBar === "left" || hint?.doubleBar === "both") {
          body += `<barline location="left"><bar-style>light-light</bar-style></barline>`;
        }
        const octaveShiftHints = staff.octaveShiftHintsByMeasure?.get(index1) ?? [];
        for (const octaveShiftHint of octaveShiftHints) {
          const sizeAttr = Number.isFinite(octaveShiftHint.size) ? ` size="${Math.round(octaveShiftHint.size as number)}"` : "";
          const numberAttr = Number.isFinite(octaveShiftHint.number) ? ` number="${Math.round(octaveShiftHint.number as number)}"` : "";
          body += `<direction><direction-type><octave-shift type="${octaveShiftHint.type}"${sizeAttr}${numberAttr}/></direction-type></direction>`;
        }
        if (!events.length) {
          body += `<note><rest/><duration>${measureCapacity}</duration><voice>1</voice><type>whole</type></note>`;
          if (hint?.repeat === "forward") {
            body = `<barline location="left"><repeat direction="forward"/></barline>${body}`;
          } else if (hint?.repeat === "backward") {
            const timesText = Number.isFinite(hint.times) && (hint.times as number) > 1
              ? `<bar-style>light-heavy</bar-style><repeat direction="backward"/><ending number="${Math.round(hint.times as number)}" type="stop"/>`
              : `<repeat direction="backward"/>`;
            body += `<barline location="right">${timesText}</barline>`;
          }
          if (hint?.doubleBar === "right" || hint?.doubleBar === "both") {
            body += `<barline location="right"><bar-style>light-light</bar-style></barline>`;
          }
          currentBeats = measureBeats;
          currentBeatType = measureBeatType;
          measuresXml.push(`<measure number="${xmlEscape(numberText)}"${implicitAttr}>${body}</measure>`);
          continue;
        }
        for (const event of events) {
          if (event.kind === "direction") {
            body += event.xml;
            continue;
          }
          if (event.kind === "backup") {
            body += `<backup><duration>${event.durationDiv}</duration></backup>`;
            continue;
          }
          if (event.kind === "rest") {
            body += `<note><rest/><duration>${event.durationDiv}</duration><voice>1</voice><type>${event.type}</type>${"<dot/>".repeat(event.dots)}</note>`;
            continue;
          }
          if (event.kind === "note") {
            const accidentalText = event.accidentalText || accidentalTextFromAlter(event.pitch.alter);
            const accidentalXml = accidentalText ? `<accidental>${accidentalText}</accidental>` : "";
            body += `<note>${buildNoteExtrasXml(event)}<pitch><step>${event.pitch.step}</step>${event.pitch.alter !== 0 ? `<alter>${event.pitch.alter}</alter>` : ""}<octave>${event.pitch.octave}</octave></pitch><voice>1</voice><type>${event.type}</type>${"<dot/>".repeat(event.dots)}${accidentalXml}</note>`;
            continue;
          }
          for (let pi = 0; pi < event.pitches.length; pi += 1) {
            const pitch = event.pitches[pi];
            const chordDurationXml = event.graceSlash === undefined ? `<duration>${event.durationDiv}</duration>` : "";
            const accidentalText =
              (pi === 0 && event.accidentalText ? event.accidentalText : null)
              || accidentalTextFromAlter(pitch.alter);
            const accidentalXml = accidentalText ? `<accidental>${accidentalText}</accidental>` : "";
            body += `<note>${pi > 0 ? "<chord/>" : ""}${pi === 0 ? buildNoteExtrasXml(event) : chordDurationXml}<pitch><step>${pitch.step}</step>${pitch.alter !== 0 ? `<alter>${pitch.alter}</alter>` : ""}<octave>${pitch.octave}</octave></pitch><voice>1</voice><type>${event.type}</type>${"<dot/>".repeat(event.dots)}${accidentalXml}</note>`;
          }
        }
        if (hint?.repeat === "forward") {
          body = `<barline location="left"><repeat direction="forward"/></barline>${body}`;
        } else if (hint?.repeat === "backward") {
          const timesText = Number.isFinite(hint.times) && (hint.times as number) > 1
            ? `<bar-style>light-heavy</bar-style><repeat direction="backward"/><ending number="${Math.round(hint.times as number)}" type="stop"/>`
            : `<repeat direction="backward"/>`;
          body += `<barline location="right">${timesText}</barline>`;
        }
        if (hint?.doubleBar === "right" || hint?.doubleBar === "both") {
          body += `<barline location="right"><bar-style>light-light</bar-style></barline>`;
        }
        currentBeats = measureBeats;
        currentBeatType = measureBeatType;
        measuresXml.push(`<measure number="${xmlEscape(numberText)}"${implicitAttr}>${body}</measure>`);
      }
      return `<part id="${partId}">${measuresXml.join("")}</part>`;
    })
    .join("");
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<score-partwise version="4.0">` +
    `<work><work-title>${xmlEscape(params.title || "Imported LilyPond")}</work-title></work>` +
    `${params.composer ? `<identification><creator type="composer">${xmlEscape(params.composer)}</creator></identification>` : ""}` +
    `<part-list>${partList}</part-list>${parts}</score-partwise>`;
  return prettyPrintMusicXmlText(xml);
};

const tryConvertLilyPondToMusicXmlDirect = (source: string): { xml: string; warnings: string[] } | null => {
  const title = parseHeaderField(source, "title") || "Imported LilyPond";
  const composer = parseHeaderField(source, "composer");
  const meter = parseTimeSignature(source);
  const keyAbc = parseKeySignature(source);
  const keyInfo = keyModeAndFifthsFromAbcKey(keyAbc);
  const staffBlocks = extractAllStaffBlocks(source);
  const transposeHintByVoiceId = parseMksTransposeHints(source);
  const measureHintByVoiceId = parseMksMeasureHints(source);
  const articulationHintByKey = parseMksArticulationHints(source);
  const graceHintByKey = parseMksGraceHints(source);
  const tupletHintByKey = parseMksTupletHints(source);
  const accidentalHintByKey = parseMksAccidentalHints(source);
  const laneHintByVoiceId = parseMksLaneHints(source);
  const slurHintByKey = parseMksSlurHints(source);
  const trillHintByKey = parseMksTrillHints(source);
  const octaveShiftHintByVoiceId = parseMksOctaveShiftHints(source);
  const lyricAssignments = parseLilyLyricAssignments(source);
  const variableMap = parseLilyVariableBlocks(source);
  const standaloneBlocks = extractStandaloneMusicBlocks(source);
  if (!staffBlocks.length && !standaloneBlocks.length) return null;
  const warnings: string[] = [];
  type LilyImportStaff = {
    voiceId: string;
    partName?: string;
    clef: string;
    measures: LilyDirectEvent[][];
    transpose?: LilyTransposeHint | null;
    measureHintsByIndex?: Map<number, LilyMeasureHint>;
    octaveShiftHintsByMeasure?: Map<number, LilyOctaveShiftHint[]>;
    autoSplitEligible?: boolean;
  };
  const staffsFromStaffBlocks = staffBlocks.map((staff, index) => {
    const normalizedVoiceId = normalizeVoiceId(staff.voiceId, `P${index + 1}`);
    const expandedBody = expandLilyVariablesInBody(staff.body, variableMap);
    const measures = parseLilyDirectBody(expandedBody, warnings, `staff ${index + 1}`, meter.beats, meter.beatType, {
      voiceId: normalizedVoiceId,
      graceHintByKey,
    });
    const laneHintsForVoice = laneHintByVoiceId.get(normalizedVoiceId);
    if (laneHintsForVoice && laneHintsForVoice.size > 0) {
      for (const [measureNo, laneBodies] of laneHintsForVoice.entries()) {
        if (!Number.isFinite(measureNo) || measureNo <= 0 || laneBodies.length <= 1) continue;
        const merged: LilyDirectEvent[] = [];
        let previousLaneDuration = 0;
        for (let laneIndex = 0; laneIndex < laneBodies.length; laneIndex += 1) {
          const laneParsed = parseLilyDirectBody(
            laneBodies[laneIndex],
            warnings,
            `staff ${index + 1} lane ${laneIndex + 1}`,
            meter.beats,
            meter.beatType,
            {
              voiceId: normalizedVoiceId,
              graceHintByKey,
            }
          );
          const laneEvents = laneParsed[0] ?? [];
          if (laneIndex > 0 && previousLaneDuration > 0) {
            merged.push({ kind: "backup", durationDiv: previousLaneDuration });
          }
          merged.push(...laneEvents);
          previousLaneDuration = laneEvents.reduce(
            (sum, event) => sum + (event.kind === "backup" ? 0 : event.durationDiv),
            0
          );
        }
        measures[measureNo - 1] = merged;
      }
    }
    const explicitClef = /\\clef\s+/i.test(staff.body);
    const omittedRelativeRoot = hasOmittedRelativeRoot(staff.body);
    return {
      voiceId: staff.voiceId || `P${index + 1}`,
      partName: (staff.partName || "").trim() || staff.voiceId || `P${index + 1}`,
      clef: explicitClef
        ? normalizeAbcClefName(staff.clef || "treble")
        : omittedRelativeRoot
          ? "treble"
          : chooseLilyClefFromMeasures(measures),
      measures: applyArticulationHintsToMeasures(
        measures,
        normalizedVoiceId,
        articulationHintByKey,
        graceHintByKey,
        tupletHintByKey,
        accidentalHintByKey,
        slurHintByKey,
        trillHintByKey
      ),
      transpose: transposeHintByVoiceId.get(normalizedVoiceId) || staff.transpose || null,
      measureHintsByIndex: measureHintByVoiceId.get(normalizedVoiceId) || undefined,
      octaveShiftHintsByMeasure: octaveShiftHintByVoiceId.get(normalizedVoiceId) || undefined,
      autoSplitEligible: !explicitClef,
    } satisfies LilyImportStaff;
  });
  const staffsFromStandaloneBlocks =
    staffBlocks.length > 0
      ? []
      : standaloneBlocks
          .map((body, index) => {
            const voiceId = `P${index + 1}`;
            const omittedRelativeRoot = hasOmittedRelativeRoot(body);
            const measures = parseLilyDirectBody(body, warnings, `block ${index + 1}`, meter.beats, meter.beatType, {
              voiceId,
              graceHintByKey,
            });
            return {
              voiceId,
              partName: voiceId,
              clef: omittedRelativeRoot ? "treble" : chooseLilyClefFromMeasures(measures),
              measures: applyArticulationHintsToMeasures(
                measures,
                voiceId,
                articulationHintByKey,
                graceHintByKey,
                tupletHintByKey,
                accidentalHintByKey,
                slurHintByKey,
                trillHintByKey
              ),
              transpose: transposeHintByVoiceId.get(voiceId) || null,
              measureHintsByIndex: measureHintByVoiceId.get(voiceId) || undefined,
              octaveShiftHintsByMeasure: octaveShiftHintByVoiceId.get(voiceId) || undefined,
              // Keep bare blocks conservative: avoid auto grand-staff split unless user writes explicit staff blocks.
              autoSplitEligible: false,
            } satisfies LilyImportStaff;
          })
          .filter((staff) => staff.measures.some((measure) => measure.length > 0));
  const mergedStaffs: LilyImportStaff[] = staffsFromStaffBlocks.length
    ? staffsFromStaffBlocks
    : staffsFromStandaloneBlocks;
  const staffs: LilyImportStaff[] = [];
  for (const staff of mergedStaffs) {
    if (!staff.autoSplitEligible) {
      staffs.push(staff);
      continue;
    }
    const split = autoSplitMeasuresToGrandStaff(staff.measures);
    if (!split.splitApplied) {
      staffs.push(staff);
      continue;
    }
    staffs.push({
      ...staff,
      voiceId: `${staff.voiceId}_s1`,
      clef: "treble",
      measures: split.upper,
      autoSplitEligible: false,
    });
    staffs.push({
      ...staff,
      voiceId: `${staff.voiceId}_s2`,
      clef: "bass",
      measures: split.lower,
      autoSplitEligible: false,
    });
  }
  if (lyricAssignments.length > 0 && staffs.length > 0) {
    for (const assignment of lyricAssignments) {
      if (!assignment.syllables.length) continue;
      if (!assignment.targetVoiceId) {
        applyLyricsToMeasures(staffs[0].measures, assignment.syllables);
        continue;
      }
      const target = staffs.find((staff) => normalizeVoiceId(staff.voiceId, "") === assignment.targetVoiceId);
      if (target) {
        applyLyricsToMeasures(target.measures, assignment.syllables);
      } else {
        const fallbackSplitTarget = staffs.find((staff) =>
          normalizeVoiceId(staff.voiceId, "").startsWith(`${assignment.targetVoiceId}_s`)
        );
        applyLyricsToMeasures((fallbackSplitTarget || staffs[0]).measures, assignment.syllables);
      }
    }
  }
  if (!staffs.some((staff) => staff.measures.some((measure) => measure.length > 0))) {
    return null;
  }
  const xml = buildDirectMusicXmlFromStaffBlocks({
    title,
    composer,
    beats: meter.beats,
    beatType: meter.beatType,
    fifths: keyInfo.fifths,
    mode: keyInfo.mode,
    staffs,
  });
  return { xml, warnings };
};

const parseLilyBodyToAbc = (body: string, warnings: string[], contextLabel: string): string => {
  const relative = unwrapRelativeBlock(body);
  const clean = stripLilyComments(relative.body).replace(/~/g, " ");
  const tokens =
    clean.match(/<[^>]+>\d*\.{0,3}|[a-grs](?:isis|eses|is|es)?[,']*\d*\.{0,3}|\\[A-Za-z]+|\\bar|[|:]+|[{}()]/g) || [];
  const out: string[] = [];
  // LilyPond absolute octave baseline: c = C3, c' = C4, c'' = C5.
  let currentOctave = 3;
  let previousAnchor: LilyRelativeAnchor | null = relative.relativeRoot
    ? {
      step: relative.relativeRoot.step,
      octave: relative.relativeRoot.octave,
      midi: relative.relativeRoot.octave * 12 + lilyPitchClassToSemitone(relative.relativeRoot.step, relative.relativeRoot.alter),
    }
    : null;
  let currentDuration = 4;

  for (const token of tokens) {
    if (!token || token === "{" || token === "}" || token === "(" || token === ")") continue;
    if (token === "|" || token === "||" || token === "|." || token === "|:" || token === ":|") {
      out.push("|");
      continue;
    }
    if (token.startsWith("\\")) {
      const lower = token.toLowerCase();
      if (lower === "\\bar" || lower === "\\clef" || lower === "\\tempo" || lower === "\\partial") continue;
      warnings.push(`${contextLabel}: unsupported command skipped: ${token}`);
      continue;
    }

    if (token.startsWith("<") && token.includes(">")) {
      const chordMatch = token.match(/^<([^>]+)>(\d+)?(\.*)$/);
      if (!chordMatch) {
        warnings.push(`${contextLabel}: unsupported chord token skipped: ${token}`);
        continue;
      }
      const bodyText = chordMatch[1].trim();
      const durText = chordMatch[2] || "";
      const dots = chordMatch[3]?.length || 0;
      if (durText) {
        const parsedDuration = Number.parseInt(durText, 10);
        if (Number.isFinite(parsedDuration) && parsedDuration > 0) currentDuration = parsedDuration;
      }
      const len = lilyDurationToAbcLen(currentDuration, dots);
      const chordMembers: string[] = [];
      let chordFirstAnchor: LilyRelativeAnchor | null = null;
      for (const memberRaw of bodyText.split(/\s+/).filter(Boolean)) {
        const parsed = parseLilyPitchToken(memberRaw);
        if (!parsed) {
          warnings.push(`${contextLabel}: unsupported chord pitch skipped: ${memberRaw}`);
          continue;
        }
        let octave = currentOctave;
        if (relative.relativeMode) {
          const resolvedFromAnchor = resolveRelativePitch(parsed.step, parsed.alter, previousAnchor);
          const resolved = applyLilyOctaveMarks(
            resolvedFromAnchor,
            parsed.octaveMarks,
            parsed.step,
            parsed.alter
          );
          octave = resolved.octave;
          if (!chordFirstAnchor) chordFirstAnchor = resolved;
          previousAnchor = resolved;
        } else if (parsed.octaveMarks.length > 0) {
          const up = (parsed.octaveMarks.match(/'/g) || []).length;
          const down = (parsed.octaveMarks.match(/,/g) || []).length;
          octave = 3 + up - down;
        } else {
          // Absolute LilyPond: no octave mark means base octave (C3) for note letters.
          octave = 3;
        }
        currentOctave = octave;
        const accidental = parsed.alter > 0 ? "^".repeat(Math.min(2, parsed.alter)) : parsed.alter < 0 ? "_".repeat(Math.min(2, Math.abs(parsed.alter))) : "";
        chordMembers.push(`${accidental}${abcPitchFromStepOctave(parsed.step, octave)}`);
      }
      if (chordMembers.length > 0) {
        out.push(`[${chordMembers.join("")}]${len}`);
        if (relative.relativeMode && chordFirstAnchor) previousAnchor = chordFirstAnchor;
      }
      continue;
    }

    const m = token.match(/^([a-g]|r|s)(isis|eses|is|es)?([,']*)(\d+)?(\.*)$/);
    if (!m) {
      warnings.push(`${contextLabel}: unsupported token skipped: ${token}`);
      continue;
    }
    const isRest = m[1] === "r" || m[1] === "s";
    const accidentalText = m[2] || "";
    const octaveMarks = m[3] || "";
    const durText = m[4] || "";
    const dots = m[5]?.length || 0;
    const duration = durText ? Number.parseInt(durText, 10) : currentDuration;
    if (durText && Number.isFinite(duration) && duration > 0) {
      currentDuration = duration;
    }
    const len = lilyDurationToAbcLen(currentDuration, dots);

    if (isRest) {
      out.push(`z${len}`);
      continue;
    }

    const step = m[1].toUpperCase();
    if (relative.relativeMode) {
      let alter = 0;
      if (accidentalText === "is") alter = 1;
      if (accidentalText === "isis") alter = 2;
      if (accidentalText === "es") alter = -1;
      if (accidentalText === "eses") alter = -2;
      const resolvedFromAnchor = resolveRelativePitch(step, alter, previousAnchor);
      const resolved = applyLilyOctaveMarks(resolvedFromAnchor, octaveMarks, step, alter);
      currentOctave = resolved.octave;
      previousAnchor = resolved;
    } else if (octaveMarks.length > 0) {
      const up = (octaveMarks.match(/'/g) || []).length;
      const down = (octaveMarks.match(/,/g) || []).length;
      currentOctave = 3 + up - down;
    } else {
      // Absolute LilyPond: no octave mark means base octave (C3).
      currentOctave = 3;
    }
    let accidental = "";
    if (accidentalText === "is") accidental = "^";
    if (accidentalText === "isis") accidental = "^^";
    if (accidentalText === "es") accidental = "_";
    if (accidentalText === "eses") accidental = "__";
    out.push(`${accidental}${abcPitchFromStepOctave(step, currentOctave)}${len}`);
  }
  return out.join(" ").replace(/\s+\|/g, " |").replace(/\|\s+\|/g, " |");
};

const buildLilySourceMiscFields = (source: string): Array<{ name: string; value: string }> => {
  const raw = String(source ?? "");
  if (!raw.length) return [];
  const encoded = raw
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
  const chunkSize = 240;
  const maxChunks = 512;
  const chunks: string[] = [];
  for (let i = 0; i < encoded.length && chunks.length < maxChunks; i += chunkSize) {
    chunks.push(encoded.slice(i, i + chunkSize));
  }
  const truncated = chunks.join("").length < encoded.length;
  const fields: Array<{ name: string; value: string }> = [
    { name: "mks:src:lilypond:raw-encoding", value: "escape-v1" },
    { name: "mks:src:lilypond:raw-length", value: String(raw.length) },
    { name: "mks:src:lilypond:raw-encoded-length", value: String(encoded.length) },
    { name: "mks:src:lilypond:raw-chunks", value: String(chunks.length) },
    { name: "mks:src:lilypond:raw-truncated", value: truncated ? "1" : "0" },
  ];
  for (let i = 0; i < chunks.length; i += 1) {
    fields.push({
      name: `mks:src:lilypond:raw-${String(i + 1).padStart(4, "0")}`,
      value: chunks[i],
    });
  }
  return fields;
};

const buildLilyDiagMiscFields = (warnings: string[]): Array<{ name: string; value: string }> => {
  if (!warnings.length) return [];
  const maxEntries = Math.min(256, warnings.length);
  const fields: Array<{ name: string; value: string }> = [
    { name: "mks:diag:count", value: String(maxEntries) },
  ];
  for (let i = 0; i < maxEntries; i += 1) {
    const payload = `level=warn;code=LILYPOND_IMPORT_WARNING;fmt=lilypond;message=${warnings[i]}`;
    fields.push({
      name: `mks:diag:${String(i + 1).padStart(4, "0")}`,
      value: payload,
    });
  }
  return fields;
};

const appendMiscFieldsToFirstMeasure = (
  xmlText: string,
  fields: Array<{ name: string; value: string }>
): string => {
  if (!fields.length) return xmlText;
  const doc = parseMusicXmlDocument(xmlText);
  if (!doc) return xmlText;
  const measure = doc.querySelector("score-partwise > part > measure");
  if (!measure) return xmlText;
  let attributes = measure.querySelector(":scope > attributes");
  if (!attributes) {
    attributes = doc.createElement("attributes");
    measure.insertBefore(attributes, measure.firstChild);
  }
  let misc = attributes.querySelector(":scope > miscellaneous");
  if (!misc) {
    misc = doc.createElement("miscellaneous");
    attributes.appendChild(misc);
  }
  for (const field of fields) {
    const node = doc.createElement("miscellaneous-field");
    node.setAttribute("name", field.name);
    node.textContent = field.value;
    misc.appendChild(node);
  }
  return serializeMusicXmlDocument(doc);
};

const extractSimpleComposerFromDoc = (doc: Document): string => {
  const creator = doc.querySelector('score-partwise > identification > creator[type="composer"]')?.textContent?.trim();
  if (creator) return creator;
  return "";
};

const noteTypeToLilyDuration = (typeText: string): string => {
  const normalized = String(typeText || "").trim().toLowerCase();
  switch (normalized) {
    case "whole":
      return "1";
    case "half":
      return "2";
    case "quarter":
      return "4";
    case "eighth":
      return "8";
    case "16th":
      return "16";
    case "32nd":
      return "32";
    case "64th":
      return "64";
    default:
      return "4";
  }
};

const noteTypeToDivisionsFallback = (typeText: string, divisions: number): number => {
  const safeDiv = Math.max(1, Math.round(divisions));
  const normalized = String(typeText || "").trim().toLowerCase();
  switch (normalized) {
    case "whole":
      return safeDiv * 4;
    case "half":
      return safeDiv * 2;
    case "quarter":
      return safeDiv;
    case "eighth":
      return Math.max(1, Math.round(safeDiv / 2));
    case "16th":
      return Math.max(1, Math.round(safeDiv / 4));
    case "32nd":
      return Math.max(1, Math.round(safeDiv / 8));
    case "64th":
      return Math.max(1, Math.round(safeDiv / 16));
    default:
      return safeDiv;
  }
};

const collectStaffNumbersForPart = (part: Element): number[] => {
  const set = new Set<number>();
  for (const stavesNode of Array.from(part.querySelectorAll(":scope > measure > attributes > staves"))) {
    const count = Number.parseInt(stavesNode.textContent || "", 10);
    if (!Number.isFinite(count) || count <= 0) continue;
    for (let i = 1; i <= count; i += 1) set.add(i);
  }
  for (const staffNode of Array.from(part.querySelectorAll(":scope > measure > note > staff"))) {
    const staff = Number.parseInt(staffNode.textContent || "", 10);
    if (Number.isFinite(staff) && staff > 0) set.add(staff);
  }
  if (!set.size) set.add(1);
  return Array.from(set.values()).sort((a, b) => a - b);
};

const collectActiveStaffNumbersForPart = (part: Element): number[] => {
  const set = new Set<number>();
  for (const note of Array.from(part.querySelectorAll(":scope > measure > note"))) {
    if (note.querySelector(":scope > rest")) continue;
    const hasPitch = Boolean(note.querySelector(":scope > pitch > step"));
    if (!hasPitch) continue;
    const staff = Number.parseInt(note.querySelector(":scope > staff")?.textContent || "1", 10);
    if (Number.isFinite(staff) && staff > 0) set.add(staff);
  }
  return Array.from(set.values()).sort((a, b) => a - b);
};

const resolveLilyClefForPartStaff = (part: Element, staffNo: number): string => {
  for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
    const clefNodes = Array.from(measure.querySelectorAll(":scope > attributes > clef"));
    for (const clefNode of clefNodes) {
      const numberAttr = clefNode.getAttribute("number");
      const applies = numberAttr === null ? staffNo === 1 : Number.parseInt(numberAttr, 10) === staffNo;
      if (!applies) continue;
      const sign = (clefNode.querySelector(":scope > sign")?.textContent || "").trim().toUpperCase();
      const line = Number.parseInt(clefNode.querySelector(":scope > line")?.textContent || "", 10);
      if (sign === "F" && line === 4) return "bass";
      if (sign === "G" && line === 2) return "treble";
      if (sign === "C" && line === 3) return "alto";
      if (sign === "C" && line === 4) return "tenor";
      if (sign === "PERCUSSION") return "percussion";
      return "treble";
    }
  }
  const keys: number[] = [];
  for (const note of Array.from(part.querySelectorAll(":scope > measure > note"))) {
    const noteStaff = Number.parseInt(note.querySelector(":scope > staff")?.textContent || "1", 10);
    if (noteStaff !== staffNo) continue;
    if (note.querySelector(":scope > rest")) continue;
    const step = (note.querySelector(":scope > pitch > step")?.textContent || "").trim().toUpperCase();
    const alter = Number.parseInt(note.querySelector(":scope > pitch > alter")?.textContent || "0", 10);
    const octave = Number.parseInt(note.querySelector(":scope > pitch > octave")?.textContent || "", 10);
    const midi = pitchToMidiKey(step, alter, octave);
    if (midi !== null) keys.push(midi);
  }
  return chooseSingleClefByKeys(keys) === "F" ? "bass" : "treble";
};

const buildLilyBodyFromPart = (
  part: Element,
  warnings: string[],
  options: {
    targetStaffNo?: number | null;
    laneHintVoiceId?: string;
    laneHintCommentsOut?: string[];
  } = {}
): string => {
  const SMALL_OVERFLOW_TOLERANCE_DIV = 8;
  const targetStaffNo = options.targetStaffNo ?? null;
  const laneHintVoiceId = options.laneHintVoiceId ?? "";
  const laneHintCommentsOut = options.laneHintCommentsOut;
  const tokens: string[] = [];
  let currentDivisions = 480;
  let currentBeats = 4;
  let currentBeatType = 4;
  const measures = Array.from(part.querySelectorAll(":scope > measure"));
  for (let measureIndex = 0; measureIndex < measures.length; measureIndex += 1) {
    const measure = measures[measureIndex];
    const parsedDivisions = Number.parseInt(measure.querySelector(":scope > attributes > divisions")?.textContent || "", 10);
    if (Number.isFinite(parsedDivisions) && parsedDivisions > 0) {
      currentDivisions = parsedDivisions;
    }
    const parsedBeats = Number.parseInt(measure.querySelector(":scope > attributes > time > beats")?.textContent || "", 10);
    if (Number.isFinite(parsedBeats) && parsedBeats > 0) {
      currentBeats = parsedBeats;
    }
    const parsedBeatType = Number.parseInt(
      measure.querySelector(":scope > attributes > time > beat-type")?.textContent || "",
      10
    );
    if (Number.isFinite(parsedBeatType) && parsedBeatType > 0) {
      currentBeatType = parsedBeatType;
    }
    const measureCapacityDiv = Math.max(
      1,
      Math.round((currentDivisions * 4 * currentBeats) / Math.max(1, currentBeatType))
    );

    const measureTokens: string[] = [];
    let occupiedDiv = 0;
    let laneNoteCount = 0;
    const finalizedLanes: Array<{ tokens: string[]; occupiedDiv: number; noteCount: number }> = [];
    let bestLaneTokens: string[] = [];
    let bestLaneOccupiedDiv = -1;
    let bestLaneNoteCount = -1;
    const finalizeLane = (): void => {
      if (targetStaffNo === null) return;
      const hasAny = measureTokens.length > 0;
      if (!hasAny) return;
      finalizedLanes.push({
        tokens: measureTokens.slice(),
        occupiedDiv,
        noteCount: laneNoteCount,
      });
      // Prefer lane with richer note content; tie-break by occupied timeline.
      if (
        laneNoteCount > bestLaneNoteCount
        || (laneNoteCount === bestLaneNoteCount && occupiedDiv > bestLaneOccupiedDiv)
      ) {
        bestLaneTokens = measureTokens.slice();
        bestLaneOccupiedDiv = occupiedDiv;
        bestLaneNoteCount = laneNoteCount;
      }
    };
    const children = Array.from(measure.children);
    for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
      const child = children[childIndex];
      if (child.tagName === "backup") {
        const backupDur = Number.parseInt(child.querySelector(":scope > duration")?.textContent || "0", 10);
        if (targetStaffNo !== null) {
          // In per-staff export, treat backup as lane boundary and keep the densest lane.
          if (Number.isFinite(backupDur) && backupDur > 0) {
            finalizeLane();
            measureTokens.length = 0;
            occupiedDiv = 0;
            laneNoteCount = 0;
          }
          continue;
        }
        if (Number.isFinite(backupDur) && backupDur > 0) {
          // Voice reset for simultaneous lanes; avoid double-counting in single-lane LilyPond export.
          break;
        }
        continue;
      }
      if (child.tagName !== "note") continue;
      const note = child;
      const noteStaff = Number.parseInt(note.querySelector(":scope > staff")?.textContent || "1", 10);
      if (targetStaffNo !== null && noteStaff !== targetStaffNo) continue;
      if (note.querySelector(":scope > chord")) {
        warnings.push("export: skipped malformed standalone chord-follow note.");
        continue;
      }
      const dots = note.querySelectorAll(":scope > dot").length;
      const durationDivRaw = Number.parseInt(note.querySelector(":scope > duration")?.textContent || "0", 10);
      const durationDiv = Number.isFinite(durationDivRaw) && durationDivRaw > 0
        ? durationDivRaw
        : noteTypeToDivisionsFallback(note.querySelector(":scope > type")?.textContent || "", currentDivisions);
      const timelineDurationDiv = note.querySelector(":scope > grace") ? 0 : durationDiv;
      const durWithDots = noteDurationToLilyToken(
        note.querySelector(":scope > type")?.textContent || "",
        dots,
        durationDiv,
        currentDivisions
      );
      if (occupiedDiv + timelineDurationDiv > measureCapacityDiv) {
        const overflow = occupiedDiv + timelineDurationDiv - measureCapacityDiv;
        if (overflow > SMALL_OVERFLOW_TOLERANCE_DIV) {
          warnings.push("export: dropped note/rest that would overfill a measure.");
          continue;
        }
      }
      if (note.querySelector(":scope > rest")) {
        measureTokens.push(`r${durWithDots}`);
        occupiedDiv += durationDiv;
        continue;
      }
      const chordNotes: Element[] = [note];
      for (let lookahead = childIndex + 1; lookahead < children.length; lookahead += 1) {
        const next = children[lookahead];
        if (next.tagName !== "note") break;
        const nextStaff = Number.parseInt(next.querySelector(":scope > staff")?.textContent || "1", 10);
        if (targetStaffNo !== null && nextStaff !== targetStaffNo) break;
        if (!next.querySelector(":scope > chord")) break;
        chordNotes.push(next);
        childIndex = lookahead;
      }
      const chordPitches: string[] = [];
      for (const chordNote of chordNotes) {
        const step = chordNote.querySelector(":scope > pitch > step")?.textContent?.trim().toUpperCase() || "C";
        const octave = Number.parseInt(chordNote.querySelector(":scope > pitch > octave")?.textContent || "4", 10);
        const alter = Number.parseInt(chordNote.querySelector(":scope > pitch > alter")?.textContent || "0", 10);
        if (!/^[A-G]$/.test(step) || !Number.isFinite(octave)) {
          warnings.push("export: skipped unsupported note pitch.");
          continue;
        }
        chordPitches.push(lilyPitchFromStepAlterOctave(step, alter, octave));
      }
      if (!chordPitches.length) continue;
      if (chordPitches.length === 1) {
        measureTokens.push(`${chordPitches[0]}${durWithDots}`);
      } else {
        measureTokens.push(`<${chordPitches.join(" ")}>${durWithDots}`);
      }
      laneNoteCount += 1;
      occupiedDiv += timelineDurationDiv;
    }
    finalizeLane();
    if (targetStaffNo !== null && finalizedLanes.length > 1 && laneHintVoiceId && laneHintCommentsOut) {
      const encodedLanes = finalizedLanes
        .map((lane) => encodeURIComponent(lane.tokens.join(" ")))
        .join(",");
      laneHintCommentsOut.push(`%@mks lanes voice=${laneHintVoiceId} measure=${measureIndex + 1} data=${encodedLanes}`);
    }
    if (targetStaffNo !== null && bestLaneTokens.length > 0) {
      measureTokens.length = 0;
      measureTokens.push(...bestLaneTokens);
      occupiedDiv = Math.max(0, bestLaneOccupiedDiv);
    }
    if (!measureTokens.length) {
      const safeBeats = Math.max(1, Math.round(currentBeats));
      const safeBeatType = Math.max(1, Math.round(currentBeatType));
      for (let i = 0; i < safeBeats; i += 1) {
        measureTokens.push(`r${safeBeatType}`);
      }
    }
    tokens.push(measureTokens.join(" "));
  }
  return tokens.join(" | ");
};

export const convertLilyPondToMusicXml = (
  lilySource: string,
  options: LilyPondImportOptions = {}
): string => {
  const source = String(lilySource ?? "");
  const warnings: string[] = [];
  const direct = tryConvertLilyPondToMusicXmlDirect(source);
  if (!direct) {
    throw new Error("No parseable notes/rests were found in LilyPond source.");
  }
  warnings.push(...direct.warnings);
  const extraFields = [
    ...buildLilyDiagMiscFields(warnings),
    ...(options.sourceMetadata === false ? [] : buildLilySourceMiscFields(source)),
  ];
  const xml = appendMiscFieldsToFirstMeasure(direct.xml, extraFields);
  const normalized = applyImplicitBeamsToMusicXmlText(xml);
  if (options.debugPrettyPrint === false) {
    const doc = parseMusicXmlDocument(normalized);
    return doc ? serializeMusicXmlDocument(doc) : normalized;
  }
  return prettyPrintMusicXmlText(normalized);
};

export const exportMusicXmlDomToLilyPond = (doc: Document): string => {
  const parts = Array.from(doc.querySelectorAll("score-partwise > part"));
  if (!parts.length) {
    throw new Error("MusicXML part is missing.");
  }
  const partNameById = new Map<string, string>();
  for (const scorePart of Array.from(doc.querySelectorAll("score-partwise > part-list > score-part"))) {
    const partId = scorePart.getAttribute("id")?.trim() ?? "";
    if (!partId) continue;
    const partName =
      scorePart.querySelector(":scope > part-name")?.textContent?.trim() ||
      scorePart.querySelector(":scope > part-abbreviation")?.textContent?.trim() ||
      partId;
    partNameById.set(partId, partName);
  }
  const title =
    doc.querySelector("score-partwise > work > work-title")?.textContent?.trim() ||
    doc.querySelector("score-partwise > movement-title")?.textContent?.trim() ||
    "mikuscore export";
  const composer = extractSimpleComposerFromDoc(doc);
  const firstMeasure = doc.querySelector("score-partwise > part > measure");
  const beats = Number.parseInt(firstMeasure?.querySelector(":scope > attributes > time > beats")?.textContent || "4", 10);
  const beatType = Number.parseInt(
    firstMeasure?.querySelector(":scope > attributes > time > beat-type")?.textContent || "4",
    10
  );
  const fifths = Number.parseInt(firstMeasure?.querySelector(":scope > attributes > key > fifths")?.textContent || "0", 10);
  const mode = firstMeasure?.querySelector(":scope > attributes > key > mode")?.textContent?.trim().toLowerCase() === "minor"
    ? "minor"
    : "major";
  const keyByFifthsMajor = ["ces", "ges", "des", "aes", "ees", "bes", "f", "c", "g", "d", "a", "e", "b", "fis", "cis"];
  const keyByFifthsMinor = ["aes", "ees", "bes", "f", "c", "g", "d", "a", "e", "b", "fis", "cis", "gis", "dis", "ais"];
  const keyIndex = Math.max(0, Math.min(14, (Number.isFinite(fifths) ? Math.round(fifths) : 0) + 7));
  const keyToken = mode === "minor" ? keyByFifthsMinor[keyIndex] : keyByFifthsMajor[keyIndex];
  const warnings: string[] = [];
  const transposeComments: string[] = [];
  const measureComments: string[] = [];
  const blocks: string[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    const partId = part.getAttribute("id") || `P${i + 1}`;
    const partName = partNameById.get(partId) || partId;
    let partTranspose: LilyTransposeHint | null = null;
    for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
      const transposeNode = measure.querySelector(":scope > attributes > transpose");
      if (!transposeNode) continue;
      const chromatic = Number.parseInt(transposeNode.querySelector(":scope > chromatic")?.textContent || "", 10);
      const diatonic = Number.parseInt(transposeNode.querySelector(":scope > diatonic")?.textContent || "", 10);
      if (!Number.isFinite(chromatic) && !Number.isFinite(diatonic)) continue;
      partTranspose = {};
      if (Number.isFinite(chromatic)) partTranspose.chromatic = Math.round(chromatic);
      if (Number.isFinite(diatonic)) partTranspose.diatonic = Math.round(diatonic);
      break;
    }
    const transposeCommentForVoice = (voiceId: string): string | null => {
      if (!partTranspose) return null;
      const fields = [`%@mks transpose voice=${voiceId}`];
      if (Number.isFinite(partTranspose.chromatic)) fields.push(`chromatic=${Math.round(Number(partTranspose.chromatic))}`);
      if (Number.isFinite(partTranspose.diatonic)) fields.push(`diatonic=${Math.round(Number(partTranspose.diatonic))}`);
      return fields.length > 1 ? fields.join(" ") : null;
    };
    const measureCommentsForVoice = (voiceId: string, targetStaffNo: number | null = null): string[] => {
      const out: string[] = [];
      const measures = Array.from(part.querySelectorAll(":scope > measure"));
      for (let mi = 0; mi < measures.length; mi += 1) {
        const measure = measures[mi];
        const fields = [`%@mks measure voice=${voiceId} measure=${mi + 1}`];
        const rawNo = (measure.getAttribute("number") || "").trim();
        if (rawNo) fields.push(`number=${rawNo}`);
        const implicitRaw = (measure.getAttribute("implicit") || "").trim().toLowerCase();
        const isImplicit = implicitRaw === "yes" || implicitRaw === "true" || implicitRaw === "1";
        fields.push(`implicit=${isImplicit ? 1 : 0}`);
        const leftRepeat = measure.querySelector(':scope > barline[location="left"] > repeat[direction="forward"]');
        const rightRepeat = measure.querySelector(':scope > barline[location="right"] > repeat[direction="backward"]');
        const explicitTimeNode = measure.querySelector(":scope > attributes > time");
        const beats = Number.parseInt(explicitTimeNode?.querySelector(":scope > beats")?.textContent || "", 10);
        const beatType = Number.parseInt(explicitTimeNode?.querySelector(":scope > beat-type")?.textContent || "", 10);
        const hasLeftDouble = (measure.querySelector(':scope > barline[location="left"] > bar-style')?.textContent || "")
          .trim()
          .toLowerCase() === "light-light";
        const hasRightDouble = (measure.querySelector(':scope > barline[location="right"] > bar-style')?.textContent || "")
          .trim()
          .toLowerCase() === "light-light";
        if (leftRepeat) {
          fields.push("repeat=forward");
        } else if (rightRepeat) {
          fields.push("repeat=backward");
          const times = Number.parseInt(
            measure.querySelector(':scope > barline[location="right"] > ending[type="stop"]')?.getAttribute("number") || "",
            10
          );
          if (Number.isFinite(times) && times > 1) fields.push(`times=${times}`);
        }
        if (explicitTimeNode) {
          fields.push("explicitTime=1");
          if (Number.isFinite(beats) && beats > 0) fields.push(`beats=${Math.round(beats)}`);
          if (Number.isFinite(beatType) && beatType > 0) fields.push(`beatType=${Math.round(beatType)}`);
        }
        if (hasLeftDouble && hasRightDouble) {
          fields.push("doubleBar=both");
        } else if (hasLeftDouble) {
          fields.push("doubleBar=left");
        } else if (hasRightDouble) {
          fields.push("doubleBar=right");
        }
        out.push(fields.join(" "));
        const octaveShiftNodes = Array.from(measure.querySelectorAll(":scope > direction > direction-type > octave-shift"));
        for (const octaveShiftNode of octaveShiftNodes) {
          const type = (octaveShiftNode.getAttribute("type") || "").trim().toLowerCase();
          if (type !== "up" && type !== "down" && type !== "stop") continue;
          const octFields = [`%@mks octshift voice=${voiceId} measure=${mi + 1} type=${type}`];
          const size = Number.parseInt(octaveShiftNode.getAttribute("size") || "", 10);
          if (Number.isFinite(size) && size > 0) octFields.push(`size=${Math.round(size)}`);
          const number = Number.parseInt(octaveShiftNode.getAttribute("number") || "", 10);
          if (Number.isFinite(number) && number > 0) octFields.push(`number=${Math.round(number)}`);
          out.push(octFields.join(" "));
        }

        let eventNo = 0;
        const children = Array.from(measure.children);
        for (let ci = 0; ci < children.length; ci += 1) {
          const child = children[ci];
          if (child.tagName !== "note") continue;
          if (targetStaffNo !== null) {
            const noteStaff = Number.parseInt(child.querySelector(":scope > staff")?.textContent || "1", 10);
            if (noteStaff !== targetStaffNo) continue;
          }
          if (child.querySelector(":scope > chord")) continue;
          if (child.querySelector(":scope > rest")) continue;
          eventNo += 1;
          const kinds: string[] = [];
          if (child.querySelector(":scope > notations > articulations > staccato")) kinds.push("staccato");
          if (child.querySelector(":scope > notations > articulations > accent")) kinds.push("accent");
          if (kinds.length) {
            out.push(`%@mks articul voice=${voiceId} measure=${mi + 1} event=${eventNo} kind=${kinds.join(",")}`);
          }
          const slurs = Array.from(child.querySelectorAll(":scope > notations > slur"));
          for (const slur of slurs) {
            const slurType = (slur.getAttribute("type") || "").trim().toLowerCase();
            if (slurType !== "start" && slurType !== "stop") continue;
            const slurFields = [`%@mks slur voice=${voiceId} measure=${mi + 1} event=${eventNo} type=${slurType}`];
            const slurNumber = Number.parseInt(slur.getAttribute("number") || "", 10);
            if (Number.isFinite(slurNumber) && slurNumber > 0) slurFields.push(`number=${Math.round(slurNumber)}`);
            const slurPlacement = (slur.getAttribute("placement") || "").trim().toLowerCase();
            if (slurPlacement === "above" || slurPlacement === "below") slurFields.push(`placement=${slurPlacement}`);
            out.push(slurFields.join(" "));
          }
          const trillMark = child.querySelector(":scope > notations > ornaments > trill-mark");
          if (trillMark) {
            out.push(`%@mks trill voice=${voiceId} measure=${mi + 1} event=${eventNo} mark=1`);
          }
          const wavyLines = Array.from(child.querySelectorAll(":scope > notations > ornaments > wavy-line"));
          for (const wavy of wavyLines) {
            const wavyType = (wavy.getAttribute("type") || "").trim().toLowerCase();
            if (wavyType !== "start" && wavyType !== "stop") continue;
            const wavyFields = [`%@mks trill voice=${voiceId} measure=${mi + 1} event=${eventNo} wavy=${wavyType}`];
            const wavyNumber = Number.parseInt(wavy.getAttribute("number") || "", 10);
            if (Number.isFinite(wavyNumber) && wavyNumber > 0) wavyFields.push(`number=${Math.round(wavyNumber)}`);
            out.push(wavyFields.join(" "));
          }
          const accidentalText = child.querySelector(":scope > accidental")?.textContent?.trim().toLowerCase() || "";
          if (accidentalText) {
            out.push(`%@mks accidental voice=${voiceId} measure=${mi + 1} event=${eventNo} value=${accidentalText}`);
          }
          const grace = child.querySelector(":scope > grace");
          if (grace) {
            out.push(`%@mks grace voice=${voiceId} measure=${mi + 1} event=${eventNo} slash=${grace.getAttribute("slash") === "yes" ? 1 : 0}`);
          }
          const timeMod = child.querySelector(":scope > time-modification");
          const actualNotes = Number.parseInt(timeMod?.querySelector(":scope > actual-notes")?.textContent || "", 10);
          const normalNotes = Number.parseInt(timeMod?.querySelector(":scope > normal-notes")?.textContent || "", 10);
          const tupletNode = child.querySelector(":scope > notations > tuplet");
          const tupletType = tupletNode?.getAttribute("type")?.trim().toLowerCase() || "";
          const tupletNumber = Number.parseInt(tupletNode?.getAttribute("number") || "", 10);
          const tupletFields = [`%@mks tuplet voice=${voiceId} measure=${mi + 1} event=${eventNo}`];
          if (Number.isFinite(actualNotes) && actualNotes > 0) tupletFields.push(`actual=${Math.round(actualNotes)}`);
          if (Number.isFinite(normalNotes) && normalNotes > 0) tupletFields.push(`normal=${Math.round(normalNotes)}`);
          if (tupletType === "start") tupletFields.push("start=1");
          if (tupletType === "stop") tupletFields.push("stop=1");
          if (Number.isFinite(tupletNumber) && tupletNumber > 0) tupletFields.push(`number=${Math.round(tupletNumber)}`);
          if (tupletFields.length > 1) out.push(tupletFields.join(" "));
        }
      }
      return out;
    };
    const declaredStaffNumbers = collectStaffNumbersForPart(part);
    const activeStaffNumbers = collectActiveStaffNumbersForPart(part);
    const staffNumbers = activeStaffNumbers.length ? activeStaffNumbers : declaredStaffNumbers.slice(0, 1);
    if (staffNumbers.length <= 1) {
      const staffNo = staffNumbers[0] ?? 1;
      const body = buildLilyBodyFromPart(part, warnings, {
        targetStaffNo: staffNo,
        laneHintVoiceId: partId,
        laneHintCommentsOut: measureComments,
      });
      const clef = resolveLilyClefForPartStaff(part, staffNo);
      const clefPrefix = clef === "treble" ? "" : `\\clef ${clef} `;
      const withPartName = `\\with { instrumentName = "${xmlEscape(partName)}" }`;
      blocks.push(`\\new Staff = "${partId}" ${withPartName} { ${clefPrefix}${body} }`);
      const transposeComment = transposeCommentForVoice(partId);
      if (transposeComment) transposeComments.push(transposeComment);
      measureComments.push(...measureCommentsForVoice(partId, staffNo));
      continue;
    }
    const staffBlocks = staffNumbers.map((staffNo) => {
      const voiceId = `${partId}_s${staffNo}`;
      const body = buildLilyBodyFromPart(part, warnings, {
        targetStaffNo: staffNo,
        laneHintVoiceId: voiceId,
        laneHintCommentsOut: measureComments,
      });
      const clef = resolveLilyClefForPartStaff(part, staffNo);
      const clefPrefix = clef === "treble" ? "" : `\\clef ${clef} `;
      const transposeComment = transposeCommentForVoice(voiceId);
      if (transposeComment) transposeComments.push(transposeComment);
      measureComments.push(...measureCommentsForVoice(voiceId, staffNo));
      const withPartName = `\\with { instrumentName = "${xmlEscape(partName)}" }`;
      return `\\new Staff = "${partId}_s${staffNo}" ${withPartName} { ${clefPrefix}${body} }`;
    });
    blocks.push(`\\new PianoStaff = "${partId}" << ${staffBlocks.join(" ")} >>`);
  }
  const diagComments: string[] = [];
  for (const measure of Array.from(doc.querySelectorAll("score-partwise > part > measure"))) {
    const measureNo = (measure.getAttribute("number") || "").trim() || "1";
    for (const field of Array.from(measure.querySelectorAll(':scope > attributes > miscellaneous > miscellaneous-field[name^="mks:diag:"]'))) {
      const name = field.getAttribute("name")?.trim() || "";
      if (!name) continue;
      const value = field.textContent?.trim() || "";
      diagComments.push(`%@mks diag measure=${measureNo} name=${name} enc=uri-v1 value=${encodeURIComponent(value)}`);
    }
  }
  const warningCountByMessage = new Map<string, number>();
  for (const warning of warnings) {
    warningCountByMessage.set(warning, (warningCountByMessage.get(warning) ?? 0) + 1);
  }
  const warningComments = Array.from(warningCountByMessage.entries()).map(([warning, count]) =>
    `%@mks diag name=diag:export value=${encodeURIComponent(`level=warn;code=LILYPOND_EXPORT_WARNING;fmt=lilypond;count=${count};message=${warning}`)}`
  );
  const head = [
    "\\version \"2.24.0\"",
    "\\header {",
    `  title = "${xmlEscape(title)}"`,
    composer ? `  composer = "${xmlEscape(composer)}"` : "",
    "}",
    `\\time ${Number.isFinite(beats) && beats > 0 ? beats : 4}/${Number.isFinite(beatType) && beatType > 0 ? beatType : 4}`,
    `\\key ${keyToken} \\${mode}`,
    ...transposeComments.map((line) => `% ${line}`),
    ...measureComments.map((line) => `% ${line}`),
    ...diagComments.map((line) => `% ${line}`),
    ...warningComments.map((line) => `% ${line}`),
    "\\score {",
    "  <<",
    ...blocks.map((line) => `    ${line}`),
    "  >>",
    "  \\layout { }",
    "}",
  ].filter(Boolean);
  return head.join("\n");
};
