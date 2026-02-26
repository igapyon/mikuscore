import {
  applyImplicitBeamsToMusicXmlText,
  parseMusicXmlDocument,
  prettyPrintMusicXmlText,
  serializeMusicXmlDocument,
} from "./musicxml-io";

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
  | { kind: "rest"; durationDiv: number; type: string; dots: number }
  | {
    kind: "note";
    durationDiv: number;
    type: string;
    dots: number;
    pitch: LilyParsedPitch;
    articulationSubtypes?: string[];
    graceSlash?: boolean;
    tupletActual?: number;
    tupletNormal?: number;
    tupletStart?: boolean;
    tupletStop?: boolean;
    tupletNumber?: number;
    accidentalText?: string;
  }
  | {
    kind: "chord";
    durationDiv: number;
    type: string;
    dots: number;
    pitches: LilyParsedPitch[];
    articulationSubtypes?: string[];
    graceSlash?: boolean;
    tupletActual?: number;
    tupletNormal?: number;
    tupletStart?: boolean;
    tupletStop?: boolean;
    tupletNumber?: number;
    accidentalText?: string;
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

const applyArticulationHintsToMeasures = (
  measures: LilyDirectEvent[][],
  voiceId: string,
  articulationHintByKey: Map<string, string[]>,
  graceHintByKey: Map<string, { slash: boolean }>,
  tupletHintByKey: Map<string, { actual?: number; normal?: number; start?: boolean; stop?: boolean; number?: number }>,
  accidentalHintByKey: Map<string, string>
): LilyDirectEvent[][] => {
  for (let mi = 0; mi < measures.length; mi += 1) {
    let noteEventNo = 0;
    for (const event of measures[mi] ?? []) {
      if (event.kind === "rest") continue;
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
        }
        const accidentalText = accidentalHintByKey.get(key);
        if (accidentalText) event.accidentalText = accidentalText;
      }
    }
  }
  return measures;
};

const extractAllStaffBlocks = (source: string): Array<{
  voiceId: string;
  body: string;
  clef: string;
  transpose: LilyTransposeHint | null;
}> => {
  const out: Array<{ voiceId: string; body: string; clef: string; transpose: LilyTransposeHint | null }> = [];
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
          const bodyTranspositionMatch = block.content.match(
            /\\transposition\s+([a-g](?:isis|eses|is|es)?[,']*)/i
          );
          const bodyTranspose = bodyTranspositionMatch
            ? lilyTranspositionTokenToHint(bodyTranspositionMatch[1])
            : null;
          out.push({
            voiceId: normalizeVoiceId(voiceId, `P${out.length + 1}`),
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
    const bodyTranspositionMatch = block.content.match(/\\transposition\s+([a-g](?:isis|eses|is|es)?[,']*)/i);
    const bodyTranspose = bodyTranspositionMatch
      ? lilyTranspositionTokenToHint(bodyTranspositionMatch[1])
      : null;
    out.push({
      voiceId: normalizeVoiceId(voiceId, `P${out.length + 1}`),
      body: block.content,
      clef,
      transpose: bodyTranspose,
    });
    regex.lastIndex = block.endPos;
  }
  return out;
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

const resolveRelativeOctave = (
  step: string,
  alter: number,
  previousMidi: number | null
): { octave: number; midi: number } => {
  if (!Number.isFinite(previousMidi)) {
    const fallbackOctave = 4;
    return {
      octave: fallbackOctave,
      midi: fallbackOctave * 12 + lilyPitchClassToSemitone(step, alter),
    };
  }
  const prevMidi = Number(previousMidi);
  let bestOctave = 4;
  let bestMidi = 4 * 12 + lilyPitchClassToSemitone(step, alter);
  let bestDist = Number.POSITIVE_INFINITY;
  for (let octave = 0; octave <= 9; octave += 1) {
    const midi = octave * 12 + lilyPitchClassToSemitone(step, alter);
    const dist = Math.abs(midi - prevMidi);
    if (dist < bestDist) {
      bestDist = dist;
      bestOctave = octave;
      bestMidi = midi;
      continue;
    }
    if (dist === bestDist && midi > bestMidi) {
      bestOctave = octave;
      bestMidi = midi;
    }
  }
  return { octave: bestOctave, midi: bestMidi };
};

const unwrapRelativeBlock = (
  sourceBody: string
): { body: string; relativeMode: boolean; relativeMidi: number | null } => {
  const relativeMatch = sourceBody.match(/\\relative\s+([a-g](?:isis|eses|is|es)?[,']*)\s*\{/i);
  if (!relativeMatch || relativeMatch.index === undefined) {
    return { body: sourceBody, relativeMode: false, relativeMidi: null };
  }
  const bracePos = sourceBody.indexOf("{", relativeMatch.index + relativeMatch[0].length - 1);
  if (bracePos < 0) return { body: sourceBody, relativeMode: false, relativeMidi: null };
  const block = findBalancedBlock(sourceBody, bracePos);
  if (!block) return { body: sourceBody, relativeMode: false, relativeMidi: null };
  const root = parseRelativeRoot(relativeMatch[1]);
  const relativeMidi = root
    ? root.octave * 12 + lilyPitchClassToSemitone(root.step, root.alter)
    : null;
  return {
    body: block.content,
    relativeMode: true,
    relativeMidi,
  };
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
  const relative = unwrapRelativeBlock(body);
  let previousMidi: number | null = relative.relativeMidi;
  const clean = stripLilyComments(relative.body)
    .replace(/\\clef\s+[A-Za-z]+/g, " ")
    .replace(/\\bar\s+\"[^\"]*\"/g, "|")
    .replace(/\\bar/g, " ")
    .replace(/\\[A-Za-z]+/g, " ")
    .replace(/[{}()~]/g, " ");
  const tokens =
    clean.match(/<[^>]+>(?:\d+(?:\*\d+(?:\/\d+)?)?)?\.{0,3}|[a-grs](?:isis|eses|is|es)?[,']*(?:\d+(?:\*\d+(?:\/\d+)?)?)?\.{0,3}|\|/g) || [];
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

  const pushEvent = (event: LilyDirectEvent): void => {
    const current = measures[measures.length - 1];
    const used = current.reduce((sum, item) => sum + item.durationDiv, 0);
    if (used + event.durationDiv > measureCapacity) {
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
    const chordExprMatch = token.match(/^<([^>]+)>((?:\d+(?:\*\d+(?:\/\d+)?)?)?)(\.*)$/);
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
            const resolved = resolveRelativeOctave(parsed.step, parsed.alter, previousMidi);
            previousMidi = resolved.midi;
            return { step: parsed.step, alter: parsed.alter, octave: resolved.octave };
          }
          return parseLilyAbsolutePitch(entry);
        })
        .filter((entry): entry is LilyParsedPitch => Boolean(entry));
      if (!pitches.length) {
        warnings.push(`${contextLabel}: chord had no parseable pitches; skipped.`);
        continue;
      }
      const event: LilyDirectEvent = {
        kind: "chord",
        durationDiv: lilyDurationExprToDivisions(effectiveExpr, effectiveDots, divisions),
        type: lilyDurationToMusicXmlType(parseLilyDurationExpr(effectiveExpr).base),
        dots: effectiveDots,
        pitches,
      };
      noteEventNoInMeasure += 1;
      if (voiceId && graceHintByKey.size > 0) {
        const graceHint = graceHintByKey.get(`${voiceId}#${measures.length}#${noteEventNoInMeasure}`);
        if (graceHint) {
          event.graceSlash = graceHint.slash;
          event.durationDiv = 0;
        }
      }
      pushEvent(event);
      continue;
    }
    const m = token.match(/^([a-grs])(isis|eses|is|es)?([,']*)((?:\d+(?:\*\d+(?:\/\d+)?)?)?)(\.*)$/);
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
      pushEvent({ kind: "rest", durationDiv, type, dots: effectiveDots });
      continue;
    }
    const pitch = parseLilyAbsolutePitch(`${m[1]}${m[2] || ""}${m[3] || ""}`);
    const pitchResolved =
      relative.relativeMode
        ? (() => {
            const parsed = parseLilyPitchToken(`${m[1]}${m[2] || ""}${m[3] || ""}`);
            if (!parsed) return null;
            const resolved = resolveRelativeOctave(parsed.step, parsed.alter, previousMidi);
            previousMidi = resolved.midi;
            return { step: parsed.step, alter: parsed.alter, octave: resolved.octave };
          })()
        : pitch;
    if (!pitchResolved) {
      warnings.push(`${contextLabel}: note pitch parse failed; skipped.`);
      continue;
    }
    const event: LilyDirectEvent = { kind: "note", durationDiv, type, dots: effectiveDots, pitch: pitchResolved };
    noteEventNoInMeasure += 1;
    if (voiceId && graceHintByKey.size > 0) {
      const graceHint = graceHintByKey.get(`${voiceId}#${measures.length}#${noteEventNoInMeasure}`);
      if (graceHint) {
        event.graceSlash = graceHint.slash;
        event.durationDiv = 0;
      }
    }
    pushEvent(event);
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
    clef: string;
    measures: LilyDirectEvent[][];
    transpose?: LilyTransposeHint | null;
    measureHintsByIndex?: Map<number, LilyMeasureHint>;
  }>;
}): string => {
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
    const tupletNodes: string[] = [];
    const tupletNumberAttr =
      Number.isFinite(event.tupletNumber) && (event.tupletNumber as number) > 0
        ? ` number="${Math.round(event.tupletNumber as number)}"`
        : "";
    if (event.tupletStart) tupletNodes.push(`<tuplet type="start"${tupletNumberAttr}/>`);
    if (event.tupletStop) tupletNodes.push(`<tuplet type="stop"${tupletNumberAttr}/>`);
    const notationXml = nodes.length || tupletNodes.length
      ? `<notations>${nodes.length ? `<articulations>${nodes.join("")}</articulations>` : ""}${tupletNodes.join("")}</notations>`
      : "";
    return `${graceXml}${durationXml}${timeModXml}${notationXml}`;
  };
  const partList = params.staffs
    .map((staff, i) => `<score-part id="P${i + 1}"><part-name>${xmlEscape(staff.voiceId || `Part ${i + 1}`)}</part-name></score-part>`)
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
          const accidentalXml = event.kind !== "rest" && event.accidentalText
            ? `<accidental>${event.accidentalText}</accidental>`
            : "";
          if (event.kind === "rest") {
            body += `<note><rest/><duration>${event.durationDiv}</duration><voice>1</voice><type>${event.type}</type>${"<dot/>".repeat(event.dots)}</note>`;
            continue;
          }
          if (event.kind === "note") {
            body += `<note>${buildNoteExtrasXml(event)}<pitch><step>${event.pitch.step}</step>${event.pitch.alter !== 0 ? `<alter>${event.pitch.alter}</alter>` : ""}<octave>${event.pitch.octave}</octave></pitch><voice>1</voice><type>${event.type}</type>${"<dot/>".repeat(event.dots)}${accidentalXml}</note>`;
            continue;
          }
          for (let pi = 0; pi < event.pitches.length; pi += 1) {
            const pitch = event.pitches[pi];
            const chordDurationXml = event.graceSlash === undefined ? `<duration>${event.durationDiv}</duration>` : "";
            body += `<note>${pi > 0 ? "<chord/>" : ""}${pi === 0 ? buildNoteExtrasXml(event) : chordDurationXml}<pitch><step>${pitch.step}</step>${pitch.alter !== 0 ? `<alter>${pitch.alter}</alter>` : ""}<octave>${pitch.octave}</octave></pitch><voice>1</voice><type>${event.type}</type>${"<dot/>".repeat(event.dots)}${pi === 0 ? accidentalXml : ""}</note>`;
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
  if (!staffBlocks.length) return null;
  const warnings: string[] = [];
  const staffs = staffBlocks.map((staff, index) => ({
    voiceId: staff.voiceId || `P${index + 1}`,
    clef: normalizeAbcClefName(staff.clef || "treble"),
    measures: applyArticulationHintsToMeasures(
      parseLilyDirectBody(staff.body, warnings, `staff ${index + 1}`, meter.beats, meter.beatType, {
        voiceId: normalizeVoiceId(staff.voiceId, `P${index + 1}`),
        graceHintByKey,
      }),
      normalizeVoiceId(staff.voiceId, `P${index + 1}`),
      articulationHintByKey,
      graceHintByKey,
      tupletHintByKey,
      accidentalHintByKey
    ),
    transpose: transposeHintByVoiceId.get(normalizeVoiceId(staff.voiceId, `P${index + 1}`)) || staff.transpose || null,
    measureHintsByIndex: measureHintByVoiceId.get(normalizeVoiceId(staff.voiceId, `P${index + 1}`)) || undefined,
  }));
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
  let previousMidi: number | null = relative.relativeMidi;
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
      for (const memberRaw of bodyText.split(/\s+/).filter(Boolean)) {
        const parsed = parseLilyPitchToken(memberRaw);
        if (!parsed) {
          warnings.push(`${contextLabel}: unsupported chord pitch skipped: ${memberRaw}`);
          continue;
        }
        let octave = currentOctave;
        if (relative.relativeMode) {
          const resolved = resolveRelativeOctave(parsed.step, parsed.alter, previousMidi);
          octave = resolved.octave;
          previousMidi = resolved.midi;
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
      const resolved = resolveRelativeOctave(step, alter, previousMidi);
      currentOctave = resolved.octave;
      previousMidi = resolved.midi;
      if (octaveMarks.length > 0) {
        const up = (octaveMarks.match(/'/g) || []).length;
        const down = (octaveMarks.match(/,/g) || []).length;
        currentOctave += up - down;
        previousMidi = currentOctave * 12 + lilyPitchClassToSemitone(step, alter);
      }
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
    { name: "src:lilypond:raw-encoding", value: "escape-v1" },
    { name: "src:lilypond:raw-length", value: String(raw.length) },
    { name: "src:lilypond:raw-encoded-length", value: String(encoded.length) },
    { name: "src:lilypond:raw-chunks", value: String(chunks.length) },
    { name: "src:lilypond:raw-truncated", value: truncated ? "1" : "0" },
  ];
  for (let i = 0; i < chunks.length; i += 1) {
    fields.push({
      name: `src:lilypond:raw-${String(i + 1).padStart(4, "0")}`,
      value: chunks[i],
    });
  }
  return fields;
};

const buildLilyDiagMiscFields = (warnings: string[]): Array<{ name: string; value: string }> => {
  if (!warnings.length) return [];
  const maxEntries = Math.min(256, warnings.length);
  const fields: Array<{ name: string; value: string }> = [{ name: "diag:count", value: String(maxEntries) }];
  for (let i = 0; i < maxEntries; i += 1) {
    fields.push({
      name: `diag:${String(i + 1).padStart(4, "0")}`,
      value: `level=warn;code=LILYPOND_IMPORT_WARNING;fmt=lilypond;message=${warnings[i]}`,
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
  const octaves: number[] = [];
  for (const note of Array.from(part.querySelectorAll(":scope > measure > note"))) {
    const noteStaff = Number.parseInt(note.querySelector(":scope > staff")?.textContent || "1", 10);
    if (noteStaff !== staffNo) continue;
    if (note.querySelector(":scope > rest")) continue;
    const octave = Number.parseInt(note.querySelector(":scope > pitch > octave")?.textContent || "", 10);
    if (Number.isFinite(octave)) octaves.push(octave);
  }
  if (octaves.length > 0) {
    const sorted = octaves.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median <= 3) return "bass";
  }
  return "treble";
};

const buildLilyBodyFromPart = (
  part: Element,
  warnings: string[],
  targetStaffNo: number | null = null
): string => {
  const tokens: string[] = [];
  let currentDivisions = 480;
  let currentBeats = 4;
  let currentBeatType = 4;
  for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
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
    const children = Array.from(measure.children);
    for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
      const child = children[childIndex];
      if (child.tagName === "backup") {
        const backupDur = Number.parseInt(child.querySelector(":scope > duration")?.textContent || "0", 10);
        if (targetStaffNo !== null) {
          // In per-staff export, backup only represents cross-lane timeline control.
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
        warnings.push("export: dropped note/rest that would overfill a measure.");
        continue;
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
      occupiedDiv += timelineDurationDiv;
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
      const body = buildLilyBodyFromPart(part, warnings, staffNo);
      const clef = resolveLilyClefForPartStaff(part, staffNo);
      const clefPrefix = clef === "treble" ? "" : `\\clef ${clef} `;
      blocks.push(`\\new Staff = "${partId}" { ${clefPrefix}${body} }`);
      const transposeComment = transposeCommentForVoice(partId);
      if (transposeComment) transposeComments.push(transposeComment);
      measureComments.push(...measureCommentsForVoice(partId, staffNo));
      continue;
    }
    const staffBlocks = staffNumbers.map((staffNo) => {
      const body = buildLilyBodyFromPart(part, warnings, staffNo);
      const clef = resolveLilyClefForPartStaff(part, staffNo);
      const clefPrefix = clef === "treble" ? "" : `\\clef ${clef} `;
      const voiceId = `${partId}_s${staffNo}`;
      const transposeComment = transposeCommentForVoice(voiceId);
      if (transposeComment) transposeComments.push(transposeComment);
      measureComments.push(...measureCommentsForVoice(voiceId, staffNo));
      return `\\new Staff = "${partId}_s${staffNo}" { ${clefPrefix}${body} }`;
    });
    blocks.push(`\\new PianoStaff = "${partId}" << ${staffBlocks.join(" ")} >>`);
  }
  const diagComments: string[] = [];
  for (const measure of Array.from(doc.querySelectorAll("score-partwise > part > measure"))) {
    const measureNo = (measure.getAttribute("number") || "").trim() || "1";
    for (const field of Array.from(measure.querySelectorAll(':scope > attributes > miscellaneous > miscellaneous-field[name^="diag:"]'))) {
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
