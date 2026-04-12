// @ts-nocheck
import { computeBeamAssignments } from "./beam-common";
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
  const m = String(text || "").match(/^\s*(\d+)\/(\d+)\s*$/);
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
  /^\[\s*\/?\s*abcjs(?:-[A-Za-z0-9_-]+)?(?:\s+[^\]]*)?\]$/i.test(String(text || "").trim());

const estimateAbcMeasureContentDiv = (notes: any[]): number => {
  const byVoice = new Map<string, number>();
  const lastStartByVoice = new Map<string, number>();
  for (const note of Array.isArray(notes) ? notes : []) {
    if (!note || note.grace) continue;
    const voice = String(note.voice || "1");
    const durationDiv = Math.max(0, Math.round(Number(note.duration) || 0));
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
  const upperStep = String(step || "").toUpperCase();
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
  const lowerMode = String(mode || "").toLowerCase();
  if (lowerMode === "minor") {
    return minor[idx];
  }
  return major[idx];
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
  const normalized = String(raw || "").trim().replace(/\s+/g, "");
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
    const raw = String(text || "").trim();
    if (!raw) return [];
    const chunks = raw
      .replace(/\|/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
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
    let activeVoiceId = String(initialVoiceId || "1").trim() || "1";
    let buffer = "";
    const raw = String(text || "");
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
          const voiceMatch = String(inlineField.fieldValue || "").match(/^(\S+)/);
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
    const raw = String(text || "");
    const normalizedBaseVoiceId = String(baseVoiceId || "1").trim() || "1";
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
    const text = String(rawValue || "").trim();
    const match = text.match(/^(\S)(?:\s*=\s*|\s+)(.+)$/);
    if (!match) return null;
    const symbol = String(match[1] || "");
    const rhs = String(match[2] || "").trim();
    if (!symbol || !rhs) return null;
    const wrapped = rhs.match(/^[!+](.+)[!+]$/);
    const decoration = String(wrapped ? wrapped[1] : rhs).trim();
    if (!decoration) return null;
    return { symbol, decoration };
  }

  function expandUserDefinedDecorationSymbols(text, userDefinedDecorationBySymbol) {
    const raw = String(text || "");
    const symbolMap = userDefinedDecorationBySymbol || {};
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
    const raw = String(rawQ || "").trim();
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
    const lines = String(source || "").split("\n");
    const trillWidthHintByKey = new Map();
    const keyHintFifthsByKey = new Map();
    const measureMetaByKey = new Map();
    const transposeHintByVoiceId = new Map();
    const headers = {};
    const bodyEntries = [];
    const lyricEntriesByVoice = {};
    const declaredVoiceIds = [];
    const voiceNameById = {};
    const voiceClefById = {};
    const voiceTransposeById = {};
    const userDefinedDecorationBySymbol = {};
    const supportedStandaloneBodyFieldNames = new Set(["K", "L", "M", "Q"]);
    let currentVoiceId = "1";
    let scoreDirective = "";
    let bodyStarted = false;
    let pendingUnsupportedContinuedFieldName = "";

    function pushBodyText(rawBodyText, lineNo, voiceId) {
      const normalizedBodyText = String(rawBodyText || "").replace(/\\\s*$/, "");
      if (!normalizedBodyText.trim()) {
        return;
      }
      bodyStarted = true;
      const { segments: inlineVoiceSegments, finalVoiceId } = splitBodyTextByInlineVoice(normalizedBodyText, voiceId);
      for (const segment of inlineVoiceSegments) {
        const overlaySegments = splitBodyTextByOverlay(segment.text, segment.voiceId);
        for (const overlaySegment of overlaySegments) {
          if (!declaredVoiceIds.includes(overlaySegment.voiceId)) {
            declaredVoiceIds.push(overlaySegment.voiceId);
          }
          if (overlaySegment.overlayIndex > 0) {
            const overlayLabel = `overlay ${overlaySegment.overlayIndex + 1}`;
            voiceNameById[overlaySegment.voiceId] = voiceNameById[segment.voiceId]
              ? `${voiceNameById[segment.voiceId]} ${overlayLabel}`
              : `Voice ${segment.voiceId} ${overlayLabel}`;
            if (voiceClefById[segment.voiceId] && !voiceClefById[overlaySegment.voiceId]) {
              voiceClefById[overlaySegment.voiceId] = voiceClefById[segment.voiceId];
            }
            if (voiceTransposeById[segment.voiceId] && !voiceTransposeById[overlaySegment.voiceId]) {
              voiceTransposeById[overlaySegment.voiceId] = { ...voiceTransposeById[segment.voiceId] };
            }
          }
          bodyEntries.push({ text: overlaySegment.text, lineNo, voiceId: overlaySegment.voiceId });
        }
      }
      currentVoiceId = String(finalVoiceId || voiceId || "1").trim() || "1";
    }

    for (let i = 0; i < lines.length; i += 1) {
      const lineNo = i + 1;
      const raw = lines[i];
      const rawTrimmed = raw.trim();
      if (!rawTrimmed) {
        pendingUnsupportedContinuedFieldName = "";
        continue;
      }
      if (isAbcjsWrapperLine(rawTrimmed)) {
        warnings.push("line " + lineNo + ": Skipped unsupported abcjs wrapper line: " + rawTrimmed);
        pendingUnsupportedContinuedFieldName = "";
        continue;
      }
      if (
        pendingUnsupportedContinuedFieldName &&
        !bodyStarted &&
        !/^%@mks\s+/i.test(rawTrimmed) &&
        !/^%%\s*/i.test(rawTrimmed) &&
        !/^[A-Za-z]:\s*(.*)$/.test(rawTrimmed)
      ) {
        warnings.push(
          "line " +
            lineNo +
            ": Skipped unsupported continued field text for " +
            pendingUnsupportedContinuedFieldName +
            ": " +
            rawTrimmed
        );
        if (!/\\\s*$/.test(raw)) {
          pendingUnsupportedContinuedFieldName = "";
        }
        continue;
      }
      if (
        pendingUnsupportedContinuedFieldName &&
        !bodyStarted &&
        (/^%@mks\s+/i.test(rawTrimmed) || /^%%\s*/i.test(rawTrimmed) || /^[A-Za-z]:\s*(.*)$/.test(rawTrimmed))
      ) {
        pendingUnsupportedContinuedFieldName = "";
      }
      const metaMatch = rawTrimmed.match(/^%@mks\s+trill\s+(.+)$/i);
      if (metaMatch) {
        const params = {};
        const kvRegex = /([A-Za-z][A-Za-z0-9_-]*)=([^\s]+)/g;
        let kv;
        while ((kv = kvRegex.exec(metaMatch[1])) !== null) {
          params[String(kv[1]).toLowerCase()] = String(kv[2]);
        }
        const voiceId = String(params.voice || "").trim();
        const measureNo = Number.parseInt(String(params.measure || ""), 10);
        const eventNo = Number.parseInt(String(params.event || ""), 10);
        const upper = String(params.upper || "").trim();
        if (voiceId && Number.isFinite(measureNo) && measureNo > 0 && Number.isFinite(eventNo) && eventNo > 0 && upper) {
          trillWidthHintByKey.set(`${voiceId}#${measureNo}#${eventNo}`, upper);
        }
        continue;
      }
      const keyMetaMatch = rawTrimmed.match(/^%@mks\s+key\s+(.+)$/i);
      if (keyMetaMatch) {
        const params = {};
        const kvRegex = /([A-Za-z][A-Za-z0-9_-]*)=([^\s]+)/g;
        let kv;
        while ((kv = kvRegex.exec(keyMetaMatch[1])) !== null) {
          params[String(kv[1]).toLowerCase()] = String(kv[2]);
        }
        const voiceId = String(params.voice || "").trim();
        const measureNo = Number.parseInt(String(params.measure || ""), 10);
        const fifths = Number.parseInt(String(params.fifths || ""), 10);
        if (voiceId && Number.isFinite(measureNo) && measureNo > 0 && Number.isFinite(fifths)) {
          const key = `${voiceId}#${measureNo}`;
          if (!keyHintFifthsByKey.has(key)) {
            keyHintFifthsByKey.set(key, Math.max(-7, Math.min(7, Math.round(fifths))));
          }
        }
        continue;
      }
      const measureMetaMatch = rawTrimmed.match(/^%@mks\s+measure\s+(.+)$/i);
      if (measureMetaMatch) {
        const params = {};
        const kvRegex = /([A-Za-z][A-Za-z0-9_-]*)=([^\s]+)/g;
        let kv;
        while ((kv = kvRegex.exec(measureMetaMatch[1])) !== null) {
          params[String(kv[1]).toLowerCase()] = String(kv[2]);
        }
        const voiceId = String(params.voice || "").trim();
        const measureNo = Number.parseInt(String(params.measure || ""), 10);
        if (voiceId && Number.isFinite(measureNo) && measureNo > 0) {
          const measureNumberText = String(params.number || "").trim();
          const implicitRaw = String(params.implicit || "").trim().toLowerCase();
          const repeatRaw = String(params.repeat || "").trim().toLowerCase();
          const leftRepeatRaw = String(params["left-repeat"] || "").trim().toLowerCase();
          const rightRepeatRaw = String(params["right-repeat"] || "").trim().toLowerCase();
          const repeatTimesRaw = Number.parseInt(String(params.times || ""), 10);
          const endingStart = String(params["ending-start"] || "").trim();
          const endingStop = String(params["ending-stop"] || "").trim();
          const endingStopTypeRaw = String(params["ending-type"] || "").trim().toLowerCase();
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
                : (endingStop ? "stop" : "")
          });
        }
        continue;
      }
      const transposeMetaMatch = rawTrimmed.match(/^%@mks\s+transpose\s+(.+)$/i);
      if (transposeMetaMatch) {
        const params = {};
        const kvRegex = /([A-Za-z][A-Za-z0-9_-]*)=([^\s]+)/g;
        let kv;
        while ((kv = kvRegex.exec(transposeMetaMatch[1])) !== null) {
          params[String(kv[1]).toLowerCase()] = String(kv[2]);
        }
        const voiceId = String(params.voice || "").trim();
        const chromatic = Number.parseInt(String(params.chromatic || ""), 10);
        const diatonic = Number.parseInt(String(params.diatonic || ""), 10);
        if (voiceId && (Number.isFinite(chromatic) || Number.isFinite(diatonic))) {
          const metaTranspose: { chromatic?: number; diatonic?: number } = {};
          if (Number.isFinite(chromatic)) metaTranspose.chromatic = chromatic;
          if (Number.isFinite(diatonic)) metaTranspose.diatonic = diatonic;
          if (Object.keys(metaTranspose).length > 0) {
            transposeHintByVoiceId.set(voiceId, metaTranspose);
          }
        }
        continue;
      }
      const noComment = raw.split("%")[0];
      const trimmed = noComment.trim();

      const scoreMatch = trimmed.match(/^%%\s*score\s+(.+)$/i);
      if (scoreMatch) {
        scoreDirective = scoreMatch[1].trim();
        continue;
      }
      if (/^%%\s*/.test(rawTrimmed)) {
        warnings.push("line " + lineNo + ": Skipped unsupported ABC directive: " + rawTrimmed);
        continue;
      }

      const headerMatch = trimmed.match(/^([A-Za-z]):\s*(.*)$/);
      if (headerMatch && /^[A-Za-z]$/.test(headerMatch[1])) {
        const key = headerMatch[1];
        const valueHasContinuation = /\\\s*$/.test(headerMatch[2]);
        const value = headerMatch[2].replace(/\\\s*$/, "").trim();
        if (key === "w") {
          if (!Object.prototype.hasOwnProperty.call(lyricEntriesByVoice, currentVoiceId)) {
            lyricEntriesByVoice[currentVoiceId] = [];
          }
          lyricEntriesByVoice[currentVoiceId].push({ text: value, lineNo });
          continue;
        }
        if (bodyStarted && supportedStandaloneBodyFieldNames.has(key)) {
          pushBodyText(`[${key}:${value}]`, lineNo, currentVoiceId);
          continue;
        }
        if (key === "V") {
          const m = value.match(/^(\S+)\s*(.*)$/);
          if (!m) {
            continue;
          }
          currentVoiceId = m[1];
          if (!declaredVoiceIds.includes(currentVoiceId)) {
            declaredVoiceIds.push(currentVoiceId);
          }
          const rest = m[2].trim();
          const parsedVoice = parseVoiceDirectiveTail(rest);
          if (parsedVoice.name) {
            voiceNameById[currentVoiceId] = parsedVoice.name;
          }
          if (parsedVoice.clef) {
            voiceClefById[currentVoiceId] = parsedVoice.clef;
          }
          if (parsedVoice.transpose) {
            voiceTransposeById[currentVoiceId] = parsedVoice.transpose;
          }
          if (parsedVoice.skippedText) {
            warnings.push(
              "line " +
                lineNo +
                ": Skipped unsupported V: directive tail token: " +
                parsedVoice.skippedText
            );
          }
          for (const unsupportedKey of parsedVoice.unsupportedKeys || []) {
            warnings.push(
              "line " +
                lineNo +
                ": Skipped unsupported V: property: " +
                unsupportedKey
            );
          }
          if (parsedVoice.bodyText) {
            const expandedBodyText = expandUserDefinedDecorationSymbols(parsedVoice.bodyText, userDefinedDecorationBySymbol);
            pushBodyText(expandedBodyText, lineNo, currentVoiceId);
          }
          if (!bodyStarted && valueHasContinuation) {
            warnings.push("line " + lineNo + ": Unsupported continued field after V:; following continuation text will be skipped.");
            pendingUnsupportedContinuedFieldName = "V:";
          }
          continue;
        }
        if (bodyStarted) {
          warnings.push("line " + lineNo + ": Skipped unsupported standalone body field: " + key + ":" + value);
          continue;
        }
        if (key === "U") {
          const parsedUserDefinedDecoration = parseUserDefinedDecoration(value);
          if (parsedUserDefinedDecoration) {
            userDefinedDecorationBySymbol[parsedUserDefinedDecoration.symbol] = parsedUserDefinedDecoration.decoration;
          }
          continue;
        }
        headers[key] = value;
        if (!bodyStarted && valueHasContinuation) {
          warnings.push("line " + lineNo + ": Unsupported continued field after " + key + ":; following continuation text will be skipped.");
          pendingUnsupportedContinuedFieldName = key + ":";
        }
        continue;
      }

      const expandedBodyText = expandUserDefinedDecorationSymbols(noComment, userDefinedDecorationBySymbol);
      pushBodyText(expandedBodyText, lineNo, currentVoiceId);
    }

    if (bodyEntries.length === 0) {
      throw new Error("Body not found. Please provide ABC note content. (line 1)");
    }

    const meter = parseMeter(headers.M || "4/4", warnings);
    const unitLength = parseFraction(headers.L || "1/8", "L", warnings);
    const keyInfo = parseKey(headers.K || "C", warnings);
    const tempoBpm = parseTempoFromQ(headers.Q || "", warnings);
    const keySignatureAccidentals = keySignatureAlterByStep(keyInfo.fifths);
    const measuresByVoice = {};
    const notationMeasureMetaByVoice = {};
    const activeEndingByVoice = {};
    const currentKeyFifthsByVoice = {};
    const meterByMeasureByVoice = {};
    const tempoByMeasureByVoice = {};
    let noteCount = 0;

    function ensureVoice(voiceId) {
      if (!Object.prototype.hasOwnProperty.call(measuresByVoice, voiceId)) {
        measuresByVoice[voiceId] = [[]];
      }
      return measuresByVoice[voiceId];
    }

    function ensureNotationMeasureMeta(voiceId, measureNo) {
      if (!Object.prototype.hasOwnProperty.call(notationMeasureMetaByVoice, voiceId)) {
        notationMeasureMetaByVoice[voiceId] = {};
      }
      if (!Object.prototype.hasOwnProperty.call(notationMeasureMetaByVoice[voiceId], measureNo)) {
        notationMeasureMetaByVoice[voiceId][measureNo] = {
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
      return notationMeasureMetaByVoice[voiceId][measureNo];
    }

    function ensureMeterByMeasure(voiceId) {
      if (!Object.prototype.hasOwnProperty.call(meterByMeasureByVoice, voiceId)) {
        meterByMeasureByVoice[voiceId] = {};
      }
      return meterByMeasureByVoice[voiceId];
    }

    function ensureTempoByMeasure(voiceId) {
      if (!Object.prototype.hasOwnProperty.call(tempoByMeasureByVoice, voiceId)) {
        tempoByMeasureByVoice[voiceId] = {};
      }
      return tempoByMeasureByVoice[voiceId];
    }

    for (const entry of bodyEntries) {
      const measures = ensureVoice(entry.voiceId);
      let currentMeasure = measures[measures.length - 1];
      let measureAccidentals = {};
      let activeUnitLength = unitLength;
      let activeMeter = meter;
      let activeTempoBpm = Number.isFinite(tempoBpm) ? Number(tempoBpm) : null;
      let activeKeyFifths = Number.isFinite(currentKeyFifthsByVoice[entry.voiceId])
        ? Number(currentKeyFifthsByVoice[entry.voiceId])
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
      let activeEndingMarker = String(activeEndingByVoice[entry.voiceId] || "");
      let idx = 0;
      const text = entry.text;

      const warnBody = (message) => {
        warnings.push("line " + entry.lineNo + ": " + message);
      };

      // Field and decoration application.
      const applyBodyField = (fieldName, fieldValue) => {
        if (fieldName === "K") {
          const inlineKeyInfo = parseKey(fieldValue || "C", warnings);
          activeKeyFifths = inlineKeyInfo.fifths;
          activeKeySignatureAccidentals = keySignatureAlterByStep(activeKeyFifths);
          currentKeyFifthsByVoice[entry.voiceId] = activeKeyFifths;
          keyHintFifthsByKey.set(`${entry.voiceId}#${currentMeasureNo}`, activeKeyFifths);
          measureAccidentals = {};
          return true;
        }
        if (fieldName === "L") {
          activeUnitLength = parseFraction(fieldValue || "1/8", "L", warnings);
          return true;
        }
        if (fieldName === "M") {
          activeMeter = parseMeter(fieldValue || "4/4", warnings);
          ensureMeterByMeasure(entry.voiceId)[currentMeasureNo] = {
            beats: activeMeter.beats,
            beatType: activeMeter.beatType,
          };
          return true;
        }
        if (fieldName === "Q") {
          activeTempoBpm = parseTempoFromQ(fieldValue || "", warnings);
          if (Number.isFinite(activeTempoBpm)) {
            ensureTempoByMeasure(entry.voiceId)[currentMeasureNo] = Math.max(20, Math.min(300, Math.round(Number(activeTempoBpm))));
          }
          return true;
        }
        return false;
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
        if (pendingTrill && !note.isRest) {
          note.trill = true;
          note.trillLineStart = pendingTrillLineStart;
          pendingTrill = false;
          pendingTrillLineStart = false;
        }
        if (pendingTrillLineStop && !note.isRest) {
          note.trillLineStop = true;
          pendingTrillLineStop = false;
        }
        if (pendingTurn && !note.isRest) {
          note.turnType = pendingTurn;
          note.turnSlash = pendingTurnSlash;
          note.delayedTurn = pendingDelayedTurn;
          pendingTurn = "";
          pendingTurnSlash = false;
          pendingDelayedTurn = false;
        }
        if (!note.isRest && (pendingEditorialAccidental || pendingCourtesyAccidental)) {
          if (note.accidentalText) {
            note.accidentalEditorial = pendingEditorialAccidental || undefined;
            note.accidentalCautionary = pendingCourtesyAccidental || undefined;
          }
          pendingEditorialAccidental = false;
          pendingCourtesyAccidental = false;
        }
        if (pendingMordent && !note.isRest) {
          note.mordentType = pendingMordent;
          pendingMordent = "";
        }
        if (pendingPhraseMark && !note.isRest) {
          note.phraseMark = pendingPhraseMark;
          pendingPhraseMark = "";
        }
        if (pendingTremolo && !note.isRest) {
          note.tremoloType = pendingTremolo.type;
          note.tremoloMarks = pendingTremolo.marks;
          pendingTremolo = null;
        }
        if (pendingGlissandoStart && !note.isRest) {
          note.glissandoStart = true;
          pendingGlissandoStart = false;
        }
        if (pendingGlissandoStop && !note.isRest) {
          note.glissandoStop = true;
          pendingGlissandoStop = false;
        }
        if (pendingSlideStart && !note.isRest) {
          note.slideStart = true;
          pendingSlideStart = false;
        }
        if (pendingSlideStop && !note.isRest) {
          note.slideStop = true;
          pendingSlideStop = false;
        }
        if (pendingSchleifer && !note.isRest) {
          note.schleifer = true;
          pendingSchleifer = false;
        }
        if (pendingShake && !note.isRest) {
          note.shake = true;
          pendingShake = false;
        }
        if (pendingArpeggiate && !note.isRest) {
          note.arpeggiate = true;
          pendingArpeggiate = false;
        }
        if (applySlurStart && pendingSlurStart > 0 && !note.isRest) {
          note.slurStart = true;
          pendingSlurStart = 0;
        }
        if (note.trill && trillHint) {
          note.trillAccidentalText = trillHint;
        }
      };

      const applyPendingArticulationState = (note) => {
        if (pendingStaccato && !note.isRest) {
          note.staccato = true;
          pendingStaccato = false;
        }
        if (pendingStaccatissimo && !note.isRest) {
          note.staccatissimo = true;
          pendingStaccatissimo = false;
        }
        if (pendingAccent && !note.isRest) {
          note.accent = true;
          pendingAccent = false;
        }
        if (pendingTenuto && !note.isRest) {
          note.tenuto = true;
          pendingTenuto = false;
        }
        if (pendingStress && !note.isRest) {
          note.stress = true;
          pendingStress = false;
        }
        if (pendingUnstress && !note.isRest) {
          note.unstress = true;
          pendingUnstress = false;
        }
        if (pendingFermata && !note.isRest) {
          note.fermataType = pendingFermata;
          pendingFermata = "";
        }
        if (pendingStrongAccent && !note.isRest) {
          note.strongAccent = true;
          pendingStrongAccent = false;
        }
        if (pendingBreathMark && !note.isRest) {
          note.breathMark = true;
          pendingBreathMark = false;
        }
        if (pendingCaesura && !note.isRest) {
          note.caesura = true;
          pendingCaesura = false;
        }
      };

      const applyPendingDirectionState = (note) => {
        if (pendingSegno && !note.isRest) {
          note.segno = true;
          pendingSegno = false;
        }
        if (pendingCoda && !note.isRest) {
          note.coda = true;
          pendingCoda = false;
        }
        if (pendingFine && !note.isRest) {
          note.fine = true;
          pendingFine = false;
        }
        if (pendingDaCapo && !note.isRest) {
          note.daCapo = true;
          pendingDaCapo = false;
        }
        if (pendingDalSegno && !note.isRest) {
          note.dalSegno = true;
          pendingDalSegno = false;
        }
        if (pendingToCoda && !note.isRest) {
          note.toCoda = true;
          pendingToCoda = false;
        }
        if (pendingCrescendoStart && !note.isRest) {
          note.crescendoStart = true;
          pendingCrescendoStart = false;
        }
        if (pendingCrescendoStop && !note.isRest) {
          note.crescendoStop = true;
          pendingCrescendoStop = false;
        }
        if (pendingDiminuendoStart && !note.isRest) {
          note.diminuendoStart = true;
          pendingDiminuendoStart = false;
        }
        if (pendingDiminuendoStop && !note.isRest) {
          note.diminuendoStop = true;
          pendingDiminuendoStop = false;
        }
        if (pendingDynamicMark && !note.isRest) {
          note.dynamicMark = pendingDynamicMark;
          pendingDynamicMark = "";
        }
        if (pendingSfz && !note.isRest) {
          note.sfz = true;
          pendingSfz = false;
        }
        if (pendingRehearsalMark && !note.isRest) {
          note.rehearsalMark = pendingRehearsalMark;
          pendingRehearsalMark = "";
        }
      };

      const applyPendingTechnicalState = (note) => {
        if (pendingUpBow && !note.isRest) {
          note.upBow = true;
          pendingUpBow = false;
        }
        if (pendingDownBow && !note.isRest) {
          note.downBow = true;
          pendingDownBow = false;
        }
        if (pendingDoubleTongue && !note.isRest) {
          note.doubleTongue = true;
          pendingDoubleTongue = false;
        }
        if (pendingTripleTongue && !note.isRest) {
          note.tripleTongue = true;
          pendingTripleTongue = false;
        }
        if (pendingHeel && !note.isRest) {
          note.heel = true;
          pendingHeel = false;
        }
        if (pendingToe && !note.isRest) {
          note.toe = true;
          pendingToe = false;
        }
        if (pendingFingerings.length > 0 && !note.isRest) {
          note.fingerings = pendingFingerings.slice();
          pendingFingerings = [];
        }
        if (pendingStrings.length > 0 && !note.isRest) {
          note.strings = pendingStrings.slice();
          pendingStrings = [];
        }
        if (pendingPlucks.length > 0 && !note.isRest) {
          note.plucks = pendingPlucks.slice();
          pendingPlucks = [];
        }
        if (pendingChordSymbols.length > 0 && !note.isRest) {
          note.chordSymbols = pendingChordSymbols.slice();
          pendingChordSymbols = [];
        }
        if (pendingOpenString && !note.isRest) {
          note.openString = true;
          pendingOpenString = false;
        }
        if (pendingSnapPizzicato && !note.isRest) {
          note.snapPizzicato = true;
          pendingSnapPizzicato = false;
        }
        if (pendingHarmonic && !note.isRest) {
          note.harmonic = true;
          pendingHarmonic = false;
        }
        if (pendingStopped && !note.isRest) {
          note.stopped = true;
          pendingStopped = false;
        }
        if (pendingThumbPosition && !note.isRest) {
          note.thumbPosition = true;
          pendingThumbPosition = false;
        }
        if (pendingAnnotations.length > 0 && !note.isRest) {
          note.annotations = pendingAnnotations.slice();
          pendingAnnotations = [];
        }
      };

      const applyPendingToPlayableNote = (note, options = {}) => {
        const {
          applySlurStart = true,
          applyTieStop = true,
          trillHint = "",
        } = options;

        applyPendingOrnamentState(note, { applySlurStart, trillHint });
        applyPendingArticulationState(note);
        applyPendingDirectionState(note);
        applyPendingTechnicalState(note);

        if (applyTieStop && pendingTieToNext && !note.isRest) {
          note.tieStop = true;
          pendingTieToNext = false;
        } else if (applyTieStop && note.isRest && pendingTieToNext) {
          warnBody("tie(-) was followed by a rest; tie removed.");
          pendingTieToNext = false;
        }
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
        const trillHint = trillWidthHintByKey.get(`${entry.voiceId}#${currentMeasureNo}#${currentEventNo}`) || "";
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
          if (error instanceof Error && /Octave out of range/i.test(error.message || "")) {
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
        lastNote = notes[0] || null;
        lastEventNotes = notes;
        noteCount += notes.length;
        return true;
      };

      const buildPlayableEventFromPitches = (pitchSources, timing, options = {}) => {
        const octaveWarningMessage = options.octaveWarningMessage || "Skipped note with unsupported octave range.";
        const firstNoteOptions = options.firstNoteOptions || {};
        const notes = [];
        for (let pitchIndex = 0; pitchIndex < pitchSources.length; pitchIndex += 1) {
          const note = buildPlayableNoteForBody(pitchSources[pitchIndex], timing.absoluteLength, timing.dur, octaveWarningMessage);
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
        if (!bodyToken) {
          return false;
        }
        const bodyTokenHandlers = {
          "broken-rhythm": () => handleBrokenRhythmBodyToken(bodyToken),
          "decoration": () => handleDecorationBodyToken(bodyToken, char),
          "paren": () => handleParenBodyToken(bodyToken),
          "quoted-string": () => handleQuotedStringBodyToken(bodyToken),
          "single-char-shorthand": () => handleSingleCharShorthandBodyToken(bodyToken, char),
          "slur-stop": () => handleSlurStopBodyToken(bodyToken),
          "tie": () => handleTieBodyToken(bodyToken),
        };
        const handler = bodyTokenHandlers[bodyToken.kind];
        return handler ? handler() : false;
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
        if (!bodyToken || bodyToken.kind !== "bracket") {
          return false;
        }
        const { bracketToken } = bodyToken;
        if (bracketToken.kind === "inline-field") {
          return handleInlineFieldBracketToken(bracketToken);
        }
        if (bracketToken.kind === "repeat-ending") {
          return handleRepeatEndingBracketToken(bracketToken);
        }
        const playableEvent = parseAbcPlayableEventAt(text, idx);
        return handlePlayableEvent(playableEvent, { fallbackToNextChar: true });
      };

      const handleGraceGroup = (char) => {
        if (char !== "{") {
          return false;
        }
        const graceResult = parseGraceGroupAt(
          text,
          idx,
          entry.lineNo,
          activeUnitLength,
          activeKeySignatureAccidentals,
          measureAccidentals,
          entry.voiceId,
          warnings
        );
        if (!graceResult) {
          warnBody("Failed to parse grace group; skipped.");
          idx += 1;
          return true;
        }
        idx = graceResult.nextIdx;
        appendGraceNotes(graceResult.notes);
        return true;
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
        const measureMeta = ensureNotationMeasureMeta(entry.voiceId, currentMeasureNo);
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
        const measureMeta = ensureNotationMeasureMeta(entry.voiceId, measureNo);
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

      const applyBarlineRepeatMarkers = (barlineToken) => {
        if (barlineToken.repeatEnd) {
          ensureNotationMeasureMeta(entry.voiceId, currentMeasureNo).repeatEnd = true;
        }
        if (barlineToken.repeatStart) {
          ensureNotationMeasureMeta(entry.voiceId, currentMeasureNo).repeatStart = true;
        }
      };

      const applyBarlineMeasureBoundary = (barlineToken, bareRepeatEndingMarker) => {
        if ((barlineToken.endingStop || bareRepeatEndingMarker) && activeEndingMarker) {
          stopActiveEndingAtMeasure(currentMeasureNo);
        }
        if (barlineToken.endsMeasure && (currentMeasure.length > 0 || measures.length === 0)) {
          advanceToNextMeasure();
        }
        if (barlineToken.endsMeasure) {
          measureAccidentals = {};
          lastNote = null;
        }
      };

      const advanceAfterBarline = (barlineToken, bareRepeatEndingMarker) => {
        if (bareRepeatEndingMarker) {
          return startEndingAtCurrentMeasure(bareRepeatEndingMarker.marker, bareRepeatEndingMarker.nextIdx);
        }
        idx = barlineToken.nextIdx;
        resetBeamContext();
        return true;
      };

      const handleBarlineEntry = (bodyEntry) => {
        if (!bodyEntry || bodyEntry.kind !== "barline") {
          return false;
        }
        const { barlineToken } = bodyEntry;
        const bareRepeatEndingMarker =
          barlineToken.endsMeasure ? parseAbcBareRepeatEndingMarkerAt(text, barlineToken.nextIdx) : null;
        applyBarlineRepeatMarkers(barlineToken);
        applyBarlineMeasureBoundary(barlineToken, bareRepeatEndingMarker);
        return advanceAfterBarline(barlineToken, bareRepeatEndingMarker);
      };

      const handleStandaloneBodyFieldEntry = (bodyEntry) => {
        const { standaloneBodyField } = bodyEntry;
        if (!applyBodyField(standaloneBodyField.fieldName, standaloneBodyField.fieldValue)) {
          warnBody("Skipped unsupported standalone body field token: " + standaloneBodyField.token);
        }
        idx = standaloneBodyField.nextIdx;
        return true;
      };

      const handleUnsupportedTokenEntry = (bodyEntry) => {
        if (bodyEntry.kind === "unsupported-body-token") {
          const { unsupportedBodyToken } = bodyEntry;
          warnBody("Skipped unsupported body token: " + unsupportedBodyToken.token);
          idx = unsupportedBodyToken.nextIdx;
          return true;
        }
        if (bodyEntry.kind === "unsupported-body-number") {
          const { unsupportedBodyNumber } = bodyEntry;
          warnBody("Skipped unsupported body number token: " + unsupportedBodyNumber.token);
          idx = unsupportedBodyNumber.nextIdx;
          return true;
        }
        return false;
      };

      const handleNonPlayableBodyEntry = (bodyEntry) => {
        if (!bodyEntry) {
          return false;
        }
        if (bodyEntry.kind === "standalone-body-field") {
          return handleStandaloneBodyFieldEntry(bodyEntry);
        }
        return handleUnsupportedTokenEntry(bodyEntry);
      };

      // Playable-event and fallback handlers.
      const handleResolvedPlayableEvent = (playableEvent) => {
        const timing = consumePlayableTiming(playableEvent.rawLengthToken, playableEvent.nextIdx);
        idx = timing.nextIdx;
        const eventOptions = playableEventOptionsForSource(playableEvent.source);
        if (timing.dur <= 0) {
          warnBody(eventOptions.invalidLengthMessage);
          return true;
        }
        const eventNotes = buildPlayableEventFromPitches(playableEvent.pitchSources, timing, {
          octaveWarningMessage: eventOptions.octaveWarningMessage,
          firstNoteOptions: eventOptions.firstNoteOptions,
        });
        if (eventNotes.length === 0) {
          clearLastEventState();
          return true;
        }
        commitPlayableEvent(eventNotes, eventOptions.commitOptions);
        return true;
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
          () => handleBarlineEntry(bodyEntry),
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
        const fallbackHandlers = [
          () => handleClosingNotation(char),
          () => handleUnsupportedPunctuation(char),
        ];
        for (const handler of fallbackHandlers) {
          if (handler()) {
            return true;
          }
        }
        if (!bodyEntry) {
          throwBodyParseError();
        }
        return false;
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
        Boolean(
          note &&
          !note.isRest &&
          !note.grace &&
          ["eighth", "16th", "32nd", "64th"].includes(String(note.type || "").trim().toLowerCase())
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

      while (idx < text.length) {
        const ch = text[idx];

        if (consumeIgnorableBodyChar(ch)) {
          continue;
        }

        const bodyEntry = parseAbcBodyEntryAt(text, idx);

        if (handleBodyEntry(bodyEntry, ch)) {
          continue;
        }

        if (handleBodyFallback(bodyEntry, ch)) {
          continue;
        }
      }
      activeEndingByVoice[entry.voiceId] = activeEndingMarker;
      currentKeyFifthsByVoice[entry.voiceId] = activeKeyFifths;
    }

    for (const voiceId of Object.keys(measuresByVoice)) {
      const measures = measuresByVoice[voiceId];
      while (measures.length > 1 && measures[measures.length - 1].length === 0) {
        measures.pop();
      }
      const activeEndingMarker = String(activeEndingByVoice[voiceId] || "");
      if (activeEndingMarker) {
        const lastMeasureNo = measures.length;
        if (lastMeasureNo >= 1) {
          const measureMeta = ensureNotationMeasureMeta(voiceId, lastMeasureNo);
          if (!measureMeta.endingStop) {
            measureMeta.endingStop = activeEndingMarker;
            measureMeta.endingStopType = "stop";
          }
        }
      }
    }

    for (const voiceId of Object.keys(lyricEntriesByVoice)) {
      const measures = measuresByVoice[voiceId];
      if (!Array.isArray(measures) || measures.length === 0) continue;
      const lyricTargets = [];
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

    if (noteCount === 0) {
      throw new Error("No notes or rests were found. (line 1)");
    }

    const orderedVoiceIds = parseScoreVoiceOrder(scoreDirective, declaredVoiceIds);
    const measureCapacity = Math.max(
      1,
      Math.round((Number(meter.beats) || 4) * (4 / (Number(meter.beatType) || 4)) * 960)
    );
    const importDiagnostics = [];
    const overfullCompatibilityMode = settings?.overfullCompatibilityMode !== false;
    const parts = orderedVoiceIds.map((voiceId, index) => {
      const partName = voiceNameById[voiceId] || ("Voice " + voiceId);
      const transpose =
        transposeHintByVoiceId.get(voiceId) ||
        voiceTransposeById[voiceId] ||
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
      const keyByMeasure: Record<number, number> = {};
      const meterByMeasure: Record<number, { beats: number; beatType: number }> = {};
      const tempoByMeasure: Record<number, number> = {};
      const measureMetaByIndex: Record<number, {
        number: string;
        implicit: boolean;
        repeatStart: boolean;
        repeatEnd: boolean;
        repeatTimes: number | null;
        endingStart: string;
        endingStop: string;
        endingStopType: "" | "stop" | "discontinue";
      }> = {};
      for (let m = 1; m <= normalizedMeasures.length; m += 1) {
        const hinted = keyHintFifthsByKey.get(`${voiceId}#${m}`);
        if (Number.isFinite(hinted)) {
          keyByMeasure[m] = Number(hinted);
        }
        const notationMeta = notationMeasureMetaByVoice[voiceId]?.[m] || null;
        const hintedMeta = measureMetaByKey.get(`${voiceId}#${m}`) || null;
        const meterHint = meterByMeasureByVoice[voiceId]?.[m] || null;
        const tempoHint = tempoByMeasureByVoice[voiceId]?.[m] || null;
        if (notationMeta || hintedMeta) {
          measureMetaByIndex[m] = {
            number: hintedMeta?.number || notationMeta?.number || String(m),
            implicit: hintedMeta?.implicit ?? notationMeta?.implicit ?? false,
            repeatStart: Boolean(notationMeta?.repeatStart || hintedMeta?.repeatStart),
            repeatEnd: Boolean(notationMeta?.repeatEnd || hintedMeta?.repeatEnd),
            repeatTimes: hintedMeta?.repeatTimes ?? notationMeta?.repeatTimes ?? null,
            endingStart: String(notationMeta?.endingStart || hintedMeta?.endingStart || ""),
            endingStop: String(notationMeta?.endingStop || hintedMeta?.endingStop || ""),
            endingStopType: hintedMeta?.endingStopType || notationMeta?.endingStopType || "",
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
      return {
        partId: "P" + String(index + 1),
        partName,
        clef: voiceClefById[voiceId] || "",
        transpose,
        voiceId,
        keyByMeasure,
        meterByMeasure,
        tempoByMeasure,
        measureMetaByIndex,
        measures: normalizedMeasures
      };
    });
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

  function parseScoreVoiceOrder(raw, declaredVoiceIds) {
    const baseOrder = Array.from(declaredVoiceIds || []);
    if (!raw) {
      return baseOrder.length > 0 ? baseOrder : ["1"];
    }

    const ordered = [];
    const seen = new Set();
    const groupRegex = /\(([^)]*)\)|([^\s()]+)/g;
    let m;
    while ((m = groupRegex.exec(raw)) !== null) {
      const chunk = m[1] || m[2] || "";
      const ids = chunk
        .split(/\s+/)
        .map((v) => v.trim())
        .filter((v) => /^[A-Za-z0-9_.-]+$/.test(v));
      for (const id of ids) {
        if (!seen.has(id)) {
          seen.add(id);
          ordered.push(id);
        }
      }
    }
    for (const id of baseOrder) {
      if (!seen.has(id)) {
        seen.add(id);
        ordered.push(id);
      }
    }
    return ordered.length > 0 ? ordered : ["1"];
  }

  function parseVoiceDirectiveTail(raw) {
    if (!raw) {
      return { name: "", clef: "", transpose: null, bodyText: "", skippedText: "", unsupportedKeys: [] };
    }
    let bodyText = String(raw);
    let name = "";
    let clef = "";
    let transpose = null;
    const unsupportedKeys = [];
    const bareClefMatch = bodyText.match(/^\s*(bass|treble|alto|tenor|c3|c4)(?=\s|$)/i);
    if (bareClefMatch) {
      clef = String(bareClefMatch[1] || "").trim().toLowerCase();
      bodyText = bodyText.slice(bareClefMatch[0].length);
    }
    const attrRegex = /([A-Za-z][A-Za-z0-9_-]*)\s*=\s*("([^"]*)"|(\S+))/g;
    bodyText = bodyText.replace(attrRegex, (_full, key, _quotedValue, quotedInner, bareValue) => {
      const lowerKey = String(key).toLowerCase();
      if (lowerKey === "name") {
        name = quotedInner || bareValue || "";
      } else if (lowerKey === "clef") {
        clef = String(quotedInner || bareValue || "").trim().toLowerCase();
      } else if (lowerKey === "transpose") {
        const parsed = Number.parseInt(String(quotedInner || bareValue || "").trim(), 10);
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
    const firstToken = firstTokenMatch ? firstTokenMatch[1] : "";
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

    const tonic = String(m[1]).toUpperCase() + (m[2] || "");
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
    const normalized = String(raw || "").trim();
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
    if (parsed.num === 1 && parsed.den === 8 && !/^\s*\d+\/\d+\s*$/.test(String(raw || ""))) {
      warnings.push(fieldName + " has invalid format; defaulted to 1/8: " + raw);
      return parsed;
    }
    const m = String(raw || "").match(/^\s*(\d+)\/(\d+)\s*$/);
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
        if (error instanceof Error && /Octave out of range/i.test(error.message || "")) {
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

export const exportMusicXmlDomToAbc = (doc: Document): string => {
  const title =
    doc.querySelector("work > work-title")?.textContent?.trim() ||
    doc.querySelector("movement-title")?.textContent?.trim() ||
    "mikuscore";
  const composer =
    doc.querySelector('identification > creator[type="composer"]')?.textContent?.trim() || "";

  const firstMeasure = doc.querySelector("score-partwise > part > measure");
  const meterBeats = firstMeasure?.querySelector("attributes > time > beats")?.textContent?.trim() || "4";
  const meterBeatType = firstMeasure?.querySelector("attributes > time > beat-type")?.textContent?.trim() || "4";
  const fifths = Number(firstMeasure?.querySelector("attributes > key > fifths")?.textContent?.trim() || "0");
  const mode = firstMeasure?.querySelector("attributes > key > mode")?.textContent?.trim() || "major";
  const key = AbcCommon.keyFromFifthsMode(Number.isFinite(fifths) ? fifths : 0, mode);
  const explicitTempo = Number(doc.querySelector("sound[tempo]")?.getAttribute("tempo") ?? "");
  const metronomeTempo = Number(
    doc.querySelector("direction-type > metronome > per-minute")?.textContent?.trim() ?? ""
  );
  const tempoBpm = Number.isFinite(explicitTempo) && explicitTempo > 0
    ? explicitTempo
    : (Number.isFinite(metronomeTempo) && metronomeTempo > 0 ? metronomeTempo : NaN);

  const partNameById = new Map<string, string>();
  for (const scorePart of Array.from(doc.querySelectorAll("part-list > score-part"))) {
    const id = scorePart.getAttribute("id") ?? "";
    if (!id) continue;
    const name = scorePart.querySelector("part-name")?.textContent?.trim() || id;
    partNameById.set(id, name);
  }

  const unitLength = { num: 1, den: 8 };
  const abcClefFromMusicXmlPart = (part: Element): string => {
    const firstClef = part.querySelector(":scope > measure > attributes > clef");
    if (!firstClef) return "";
    const sign = firstClef.querySelector(":scope > sign")?.textContent?.trim().toUpperCase() ?? "";
    const line = Number(firstClef.querySelector(":scope > line")?.textContent?.trim() ?? "");
    if (sign === "F" && line === 4) return "bass";
    if (sign === "G" && line === 2) return "treble";
    if (sign === "C" && line === 3) return "alto";
    if (sign === "C" && line === 4) return "tenor";
    return "";
  };
  const keySignatureAlterByStep = (fifthsValue: number): Record<string, number> => {
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
  const accidentalTextToAlter = (text: string): number | null => {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === "sharp") return 1;
    if (normalized === "flat") return -1;
    if (normalized === "natural") return 0;
    if (normalized === "double-sharp") return 2;
    if (normalized === "flat-flat") return -2;
    return null;
  };
  const parseOptionalNumber = (text: string | null | undefined): number | null => {
    const raw = String(text ?? "").trim();
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const headerLines = [
    "X:1",
    `T:${title}`,
    composer ? `C:${composer}` : "",
    `M:${meterBeats}/${meterBeatType}`,
    "L:1/8",
    Number.isFinite(tempoBpm) ? `Q:1/4=${Math.round(tempoBpm)}` : "",
    `K:${key}`,
  ].filter(Boolean);

  const bodyLines: string[] = [];
  const metaLines: string[] = [];
  const emitDiagMetaForMeasure = (
    normalizedVoiceId: string,
    measure: Element,
    safeMeasureNumber: number
  ): void => {
    const fields = Array.from(
      measure.querySelectorAll(
        ':scope > attributes > miscellaneous > miscellaneous-field[name^="mks:diag:"]'
      )
    );
    if (!fields.length) return;
    const byName = new Map<string, string>();
    for (const field of fields) {
      const name = (field.getAttribute("name") || "").trim();
      if (!name) continue;
      const value = (field.textContent || "").trim();
      byName.set(name, value);
    }
    const orderedNames = Array.from(byName.keys()).sort((a, b) => {
      const isCountA = a === "mks:diag:count";
      const isCountB = b === "mks:diag:count";
      if (isCountA && !isCountB) return -1;
      if (!isCountA && isCountB) return 1;
      return a.localeCompare(b);
    });
    for (const name of orderedNames) {
      const value = byName.get(name) || "";
      metaLines.push(
        `%@mks diag voice=${normalizedVoiceId} measure=${safeMeasureNumber} name=${name} enc=uri-v1 value=${encodeURIComponent(value)}`
      );
    }
  };
  const parts = Array.from(doc.querySelectorAll("score-partwise > part"));
  parts.forEach((part, partIndex) => {
    const partId = part.getAttribute("id") || `P${partIndex + 1}`;
    const partName = partNameById.get(partId) || partId;
    const measures = Array.from(part.querySelectorAll(":scope > measure"));
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
    const laneDefsRaw =
      laneMap.size > 0 ? Array.from(laneMap.values()) : [{ staff: null as string | null, voice: null as string | null }];
    const laneDefs = laneDefsRaw
      .sort((a, b) => {
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
      })
      .map((lane, laneIndex) => {
        if (laneDefsRaw.length === 1) {
          return { ...lane, voiceId: partId };
        }
        const staffSuffix = lane.staff ? `_s${lane.staff}` : "";
        const voiceSuffix = lane.voice ? `_v${lane.voice}` : "";
        return { ...lane, voiceId: `${partId}${staffSuffix}${voiceSuffix || `_l${laneIndex + 1}`}` };
      });

    const resolveLaneClef = (staff: string | null): string => {
      if (!staff) return abcClefFromMusicXmlPart(part);
      for (const measure of measures) {
        const clefNode = measure.querySelector(`:scope > attributes > clef[number="${staff}"]`);
        if (!clefNode) continue;
        const sign = clefNode.querySelector(":scope > sign")?.textContent?.trim().toUpperCase() ?? "";
        const line = Number(clefNode.querySelector(":scope > line")?.textContent?.trim() ?? "");
        if (sign === "F" && line === 4) return "bass";
        if (sign === "G" && line === 2) return "treble";
        if (sign === "C" && line === 3) return "alto";
        if (sign === "C" && line === 4) return "tenor";
      }
      return abcClefFromMusicXmlPart(part);
    };

    for (const lane of laneDefs) {
      const normalizedVoiceId = lane.voiceId.replace(/[^A-Za-z0-9_.-]/g, "_");
      const laneName =
        laneDefs.length <= 1
          ? partName
          : lane.staff && lane.voice
            ? `${partName} (Staff ${lane.staff} Voice ${lane.voice})`
            : lane.staff
              ? `${partName} (Staff ${lane.staff})`
              : lane.voice
                ? `${partName} (Voice ${lane.voice})`
                : `${partName} (Lane)`;
      const abcClef = resolveLaneClef(lane.staff);
      const clefSuffix = abcClef ? ` clef=${abcClef}` : "";
      headerLines.push(`V:${normalizedVoiceId} name="${laneName}"${clefSuffix}`);
      for (const measure of measures) {
        const transposeNode = measure.querySelector(":scope > attributes > transpose");
        if (!transposeNode) continue;
        const chromatic = Number(transposeNode.querySelector(":scope > chromatic")?.textContent?.trim() || "");
        const diatonic = Number(transposeNode.querySelector(":scope > diatonic")?.textContent?.trim() || "");
        if (Number.isFinite(chromatic) || Number.isFinite(diatonic)) {
          const parts: string[] = [`%@mks transpose voice=${normalizedVoiceId}`];
          if (Number.isFinite(chromatic)) parts.push(`chromatic=${Math.round(chromatic)}`);
          if (Number.isFinite(diatonic)) parts.push(`diatonic=${Math.round(diatonic)}`);
          metaLines.push(parts.join(" "));
        }
        break;
      }

      const partInitialFifthsRaw = parseOptionalNumber(
        part.querySelector(":scope > measure > attributes > key > fifths")?.textContent
      );
      const partInitialFifths = partInitialFifthsRaw !== null
        ? Math.round(partInitialFifthsRaw)
        : (Number.isFinite(fifths) ? Math.round(fifths) : 0);

      let currentDivisions = 480;
      let currentFifths = partInitialFifths;
      let lastEmittedKeyFifths: number | null = Number.isFinite(fifths) ? Math.round(fifths) : 0;
      let currentBeats = Number(meterBeats) || 4;
      let currentBeatType = Number(meterBeatType) || 4;
      const measureTexts: string[] = [];
      const lyricTokens: string[] = [];
      let pendingLyricExtension = false;
      for (const measure of measures) {
        let activeTuplet: { actual: number; normal: number; remaining: number } | null = null;
        let eventNo = 0;
        const parsedDiv = parseOptionalNumber(measure.querySelector("attributes > divisions")?.textContent);
        if (parsedDiv !== null && parsedDiv > 0) {
          currentDivisions = parsedDiv;
        }
        const parsedFifths = parseOptionalNumber(measure.querySelector("attributes > key > fifths")?.textContent);
        if (parsedFifths !== null) {
          currentFifths = Math.round(parsedFifths);
        }
        const safeMeasureNumber = measureTexts.length + 1;
        const rawMeasureNumber = (measure.getAttribute("number") || "").trim() || String(safeMeasureNumber);
        const implicitAttr = (measure.getAttribute("implicit") || "").trim().toLowerCase();
        const isImplicit = implicitAttr === "yes" || implicitAttr === "true" || implicitAttr === "1";
        const leftRepeatNode = measure.querySelector(':scope > barline[location="left"] > repeat');
        const rightRepeatNode = measure.querySelector(':scope > barline[location="right"] > repeat');
        const leftEndingNode = measure.querySelector(':scope > barline[location="left"] > ending');
        const rightEndingNode = measure.querySelector(':scope > barline[location="right"] > ending');
        const leftRepeatDir = (leftRepeatNode?.getAttribute("direction") || "").trim().toLowerCase();
        const rightRepeatDir = (rightRepeatNode?.getAttribute("direction") || "").trim().toLowerCase();
        const hasLeftRepeat = leftRepeatDir === "forward";
        const hasRightRepeat = rightRepeatDir === "backward";
        const repeatTimes = Number.parseInt(String(rightRepeatNode?.getAttribute("times") || ""), 10);
        const leftEndingNumber = (leftEndingNode?.getAttribute("number") || "").trim();
        const rightEndingNumber = (rightEndingNode?.getAttribute("number") || "").trim();
        const rightEndingType = (rightEndingNode?.getAttribute("type") || "").trim().toLowerCase();
        if (
          isImplicit ||
          rawMeasureNumber !== String(safeMeasureNumber) ||
          (hasRightRepeat && Number.isFinite(repeatTimes) && repeatTimes > 2) ||
          (rightEndingNumber && rightEndingType === "discontinue")
        ) {
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
          metaLines.push(metaChunks.join(" "));
        }
        emitDiagMetaForMeasure(normalizedVoiceId, measure, safeMeasureNumber);
        const needsInlineKeyChange = lastEmittedKeyFifths === null || lastEmittedKeyFifths !== currentFifths;
        const parsedBeats = parseOptionalNumber(measure.querySelector("attributes > time > beats")?.textContent);
        if (parsedBeats !== null && parsedBeats > 0) {
          currentBeats = parsedBeats;
        }
        const parsedBeatType = parseOptionalNumber(measure.querySelector("attributes > time > beat-type")?.textContent);
        if (parsedBeatType !== null && parsedBeatType > 0) {
          currentBeatType = parsedBeatType;
        }
        const keyAlterMap = keySignatureAlterByStep(currentFifths);
        const measureAccidentalByStepOctave = new Map<string, number>();

        let pending: { pitches: string[]; len: string; tie: boolean; slurStop: boolean; prefix: string } | null = null;
        const pendingGraceTokens: string[] = [];
        const pendingHarmonySymbols: string[] = [];
        const pendingDirectionWords: string[] = [];
        const pendingDirectionDecorations: string[] = [];
        let activeWedgeType: "" | "crescendo" | "diminuendo" = "";
        const tokens: string[] = [];
        const flush = (): void => {
          if (!pending) return;
          if (pending.pitches.length === 1) {
            tokens.push(`${pending.prefix}${pending.pitches[0]}${pending.len}${pending.tie ? "-" : ""}${pending.slurStop ? ")" : ""}`);
          } else {
            tokens.push(`${pending.prefix}[${pending.pitches.join("")}]${pending.len}${pending.tie ? "-" : ""}${pending.slurStop ? ")" : ""}`);
          }
          pending = null;
        };

        for (const child of Array.from(measure.children)) {
          if (child.tagName === "harmony") {
            const chordSymbol = abcChordSymbolFromHarmony(child);
            if (chordSymbol) {
              pendingHarmonySymbols.push(chordSymbol);
            }
            continue;
          }
          if (child.tagName === "direction") {
            const rehearsalTexts = Array.from(child.querySelectorAll(":scope > direction-type > rehearsal"))
              .map((node) => abcQuotedTextEscape(node.textContent || ""))
              .filter(Boolean);
            for (const rehearsalText of rehearsalTexts) {
              pendingDirectionDecorations.push(`!rehearsal:${rehearsalText}!`);
            }
            const words = Array.from(child.querySelectorAll(":scope > direction-type > words"))
              .map((node) => abcQuotedTextEscape(node.textContent || ""))
              .filter(Boolean);
            pendingDirectionWords.push(...words);
            if (child.querySelector(":scope > direction-type > segno")) {
              pendingDirectionDecorations.push("!segno!");
            }
            if (child.querySelector(":scope > direction-type > coda")) {
              pendingDirectionDecorations.push("!coda!");
            }
            if (child.querySelector(':scope > sound[fine="yes"]')) {
              pendingDirectionDecorations.push("!fine!");
            }
            const hasDaCapo = Boolean(child.querySelector(':scope > sound[dacapo="yes"]'));
            const hasToCoda = Boolean(child.querySelector(":scope > sound[tocoda]"));
            if (hasDaCapo && hasToCoda) {
              pendingDirectionDecorations.push("!dacoda!");
            } else if (hasDaCapo) {
              pendingDirectionDecorations.push("!dacapo!");
            }
            if (child.querySelector(":scope > sound[dalsegno]")) {
              pendingDirectionDecorations.push("!dalsegno!");
            }
            if (hasToCoda && !hasDaCapo) {
              pendingDirectionDecorations.push("!tocoda!");
            }
            for (const wedgeNode of Array.from(child.querySelectorAll(":scope > direction-type > wedge"))) {
              const wedgeType = (wedgeNode.getAttribute("type") || "").trim().toLowerCase();
              if (wedgeType === "crescendo") {
                pendingDirectionDecorations.push("!crescendo(!");
                activeWedgeType = "crescendo";
              } else if (wedgeType === "diminuendo") {
                pendingDirectionDecorations.push("!diminuendo(!");
                activeWedgeType = "diminuendo";
              } else if (wedgeType === "stop") {
                pendingDirectionDecorations.push(activeWedgeType === "diminuendo" ? "!diminuendo)!" : "!crescendo)!");
                activeWedgeType = "";
              }
            }
            for (const dynamicName of ["pppp", "ppp", "pp", "p", "mp", "mf", "f", "ff", "fff", "ffff", "fp", "fz", "rfz", "sf", "sfp", "sfz"]) {
              if (child.querySelector(`:scope > direction-type > dynamics > ${dynamicName}`)) {
                pendingDirectionDecorations.push(`!${dynamicName}!`);
              }
            }
            continue;
          }
          if (child.tagName !== "note") continue;
          if (lane.staff) {
            const noteStaff = child.querySelector(":scope > staff")?.textContent?.trim() ?? "";
            if (noteStaff !== lane.staff) continue;
          }
          if (lane.voice) {
            const noteVoiceRaw = child.querySelector(":scope > voice")?.textContent?.trim() ?? "";
            const noteVoice = noteVoiceRaw || "1";
            if (noteVoice !== lane.voice) continue;
          }
          const isChord = Boolean(child.querySelector(":scope > chord"));
          const isGrace = Boolean(child.querySelector(":scope > grace"));
          const duration = Number(child.querySelector(":scope > duration")?.textContent?.trim() || "0");
          if (!isGrace && (!Number.isFinite(duration) || duration <= 0)) continue;
          const noteDuration = isGrace
            ? (Number.isFinite(duration) && duration > 0 ? duration : Math.round(currentDivisions / 2))
            : duration;

          const hasTieStart = Boolean(child.querySelector(':scope > tie[type="start"]'));
          const hasTrillMark = Boolean(child.querySelector(":scope > notations > ornaments > trill-mark"));
          const hasTurn = Boolean(child.querySelector(":scope > notations > ornaments > turn"));
          const hasInvertedTurn = Boolean(child.querySelector(":scope > notations > ornaments > inverted-turn"));
          const hasTurnSlash = Array.from(child.querySelectorAll(":scope > notations > ornaments > turn, :scope > notations > ornaments > inverted-turn"))
            .some((node) => (node.getAttribute("slash") || "").trim().toLowerCase() === "yes");
          const hasDelayedTurn = Boolean(child.querySelector(":scope > notations > ornaments > delayed-turn"));
          const hasMordent = Boolean(child.querySelector(":scope > notations > ornaments > mordent"));
          const hasInvertedMordent = Boolean(child.querySelector(":scope > notations > ornaments > inverted-mordent"));
          const tremoloNode = child.querySelector(":scope > notations > ornaments > tremolo");
          const hasSchleifer = Boolean(child.querySelector(":scope > notations > ornaments > schleifer"));
          const hasShake = Boolean(child.querySelector(":scope > notations > ornaments > shake"));
          const hasGlissandoStart = Boolean(child.querySelector(':scope > notations > glissando[type="start"]'));
          const hasGlissandoStop = Boolean(child.querySelector(':scope > notations > glissando[type="stop"]'));
          const hasSlideStart = Boolean(child.querySelector(':scope > notations > slide[type="start"]'));
          const hasSlideStop = Boolean(child.querySelector(':scope > notations > slide[type="stop"]'));
          const hasArpeggiate = Boolean(child.querySelector(":scope > notations > arpeggiate"));
          const hasWavyLineStart = Array.from(
            child.querySelectorAll(":scope > notations > ornaments > wavy-line")
          ).some((node) => {
            const type = (node.getAttribute("type") ?? "").trim().toLowerCase();
            return type === "" || type === "start";
          });
          const hasWavyLineStop = Array.from(
            child.querySelectorAll(":scope > notations > ornaments > wavy-line")
          ).some((node) => {
            const type = (node.getAttribute("type") ?? "").trim().toLowerCase();
            return type === "stop";
          });
          const hasTrill = hasTrillMark || hasWavyLineStart;
          const turnType: "" | "turn" | "inverted-turn" = hasInvertedTurn ? "inverted-turn" : (hasTurn ? "turn" : "");
          const mordentType: "" | "mordent" | "inverted-mordent" = hasInvertedMordent ? "inverted-mordent" : (hasMordent ? "mordent" : "");
          const tremoloTypeRaw = (tremoloNode?.getAttribute("type") || "").trim().toLowerCase();
          const tremoloType: "" | "single" | "start" | "stop" =
            tremoloTypeRaw === "single" || tremoloTypeRaw === "start" || tremoloTypeRaw === "stop"
              ? tremoloTypeRaw
              : "";
          const tremoloMarks = Math.max(1, Math.min(8, Number.parseInt(tremoloNode?.textContent?.trim() || "", 10) || 0));
          const trillAccidentalText = child.querySelector(":scope > notations > ornaments > accidental-mark")?.textContent?.trim() || "";
          const hasStaccato = Boolean(child.querySelector(":scope > notations > articulations > staccato"));
          const hasStaccatissimo = Boolean(child.querySelector(":scope > notations > articulations > staccatissimo"));
          const hasAccent = Boolean(child.querySelector(":scope > notations > articulations > accent"));
          const hasTenuto = Boolean(child.querySelector(":scope > notations > articulations > tenuto"));
          const hasStress = Boolean(child.querySelector(":scope > notations > articulations > stress"));
          const hasUnstress = Boolean(child.querySelector(":scope > notations > articulations > unstress"));
          const hasStrongAccent = Boolean(child.querySelector(":scope > notations > articulations > strong-accent"));
          const hasBreathMark = Boolean(child.querySelector(":scope > notations > articulations > breath-mark"));
          const hasCaesura = Boolean(child.querySelector(":scope > notations > articulations > caesura"));
          const phraseMarkText = Array.from(child.querySelectorAll(":scope > notations > articulations > other-articulation"))
            .map((node) => (node.textContent || "").trim().toLowerCase())
            .find((text) => text === "shortphrase" || text === "mediumphrase" || text === "longphrase") || "";
          const hasUpBow = Boolean(child.querySelector(":scope > notations > technical > up-bow"));
          const hasDownBow = Boolean(child.querySelector(":scope > notations > technical > down-bow"));
          const hasDoubleTongue = Boolean(child.querySelector(":scope > notations > technical > double-tongue"));
          const hasTripleTongue = Boolean(child.querySelector(":scope > notations > technical > triple-tongue"));
          const hasHeel = Boolean(child.querySelector(":scope > notations > technical > heel"));
          const hasToe = Boolean(child.querySelector(":scope > notations > technical > toe"));
          const fingeringTexts = Array.from(child.querySelectorAll(":scope > notations > technical > fingering"))
            .map((node) => (node.textContent || "").trim())
            .filter(Boolean);
          const stringTexts = Array.from(child.querySelectorAll(":scope > notations > technical > string"))
            .map((node) => (node.textContent || "").trim())
            .filter(Boolean);
          const pluckTexts = Array.from(child.querySelectorAll(":scope > notations > technical > pluck"))
            .map((node) => (node.textContent || "").trim())
            .filter(Boolean);
          const hasOpenString = Boolean(child.querySelector(":scope > notations > technical > open-string"));
          const hasSnapPizzicato = Boolean(child.querySelector(":scope > notations > technical > snap-pizzicato"));
          const hasHarmonic = Boolean(child.querySelector(":scope > notations > technical > harmonic"));
          const hasStopped = Boolean(child.querySelector(":scope > notations > technical > stopped"));
          const hasThumbPosition = Boolean(child.querySelector(":scope > notations > technical > thumb-position"));
          const fermataNode = child.querySelector(":scope > notations > fermata");
          const fermataTypeRaw = fermataNode?.getAttribute("type")?.trim().toLowerCase() || "";
          const fermataShapeRaw = fermataNode?.textContent?.trim().toLowerCase() || "";
          const fermataType: "" | "normal" | "inverted" =
            !fermataNode
              ? ""
              : (fermataTypeRaw === "inverted" || fermataShapeRaw === "inverted" ? "inverted" : "normal");
          const hasSlurStart = Boolean(child.querySelector(':scope > notations > slur[type="start"]'));
          const hasSlurStop = Boolean(child.querySelector(':scope > notations > slur[type="stop"]'));
          const hasGraceSlash = (child.querySelector(":scope > grace")?.getAttribute("slash") ?? "").trim().toLowerCase() === "yes";
          const hasTupletStart = Boolean(child.querySelector(':scope > notations > tuplet[type="start"]'));
          const tmActual = Number(child.querySelector(":scope > time-modification > actual-notes")?.textContent?.trim() || "");
          const tmNormal = Number(child.querySelector(":scope > time-modification > normal-notes")?.textContent?.trim() || "");
          const hasTimeModification = Number.isFinite(tmActual) && tmActual > 0 && Number.isFinite(tmNormal) && tmNormal > 0;
          const rawWholeFraction = AbcCommon.reduceFraction(noteDuration, currentDivisions * 4, { num: 1, den: 4 });
          const abcBaseWholeFraction = hasTimeModification
            ? AbcCommon.multiplyFractions(rawWholeFraction, {
                num: Math.round(tmActual),
                den: Math.round(tmNormal)
              }, { num: 1, den: 4 })
            : rawWholeFraction;
          const lenRatio = AbcCommon.divideFractions(abcBaseWholeFraction, unitLength, { num: 1, den: 1 });
          const len = AbcCommon.abcLengthTokenFromFraction(lenRatio);

          let pitchToken = "z";
          if (!child.querySelector(":scope > rest")) {
            const step = child.querySelector(":scope > pitch > step")?.textContent?.trim() || "C";
            const octave = Number(child.querySelector(":scope > pitch > octave")?.textContent?.trim() || "4");
            const upperStep = /^[A-G]$/.test(step.toUpperCase()) ? step.toUpperCase() : "C";
            const safeOctave = Number.isFinite(octave) ? Math.max(0, Math.min(9, Math.round(octave))) : 4;
            const stepOctaveKey = `${upperStep}${safeOctave}`;

            const alterRaw = child.querySelector(":scope > pitch > alter")?.textContent?.trim() ?? "";
            const explicitAlter =
              alterRaw !== "" && Number.isFinite(Number(alterRaw)) ? Math.round(Number(alterRaw)) : null;
            const accidentalNode = child.querySelector(":scope > accidental");
            const accidentalText = accidentalNode?.textContent?.trim() ?? "";
            const accidentalAlter = accidentalTextToAlter(accidentalText);
            const accidentalEditorial = ((accidentalNode?.getAttribute("editorial") || "").trim().toLowerCase() === "yes");
            const accidentalCautionary = ((accidentalNode?.getAttribute("cautionary") || "").trim().toLowerCase() === "yes");

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
            pitchToken = `${accidental}${AbcCommon.abcPitchFromStepOctave(step, Number.isFinite(octave) ? octave : 4)}`;
            if (accidentalEditorial && accidental) {
              pitchToken = `!editorial!${pitchToken}`;
            }
            if (accidentalCautionary && accidental) {
              pitchToken = `!courtesy!${pitchToken}`;
            }
          }
          if (isGrace) {
            const graceSlashPrefix = hasGraceSlash ? "/" : "";
            if (!isChord || pendingGraceTokens.length === 0) {
              pendingGraceTokens.push(`${graceSlashPrefix}${pitchToken}${len}${hasTieStart ? "-" : ""}`);
            } else {
              const last = pendingGraceTokens.pop() ?? "";
              const merged = last.startsWith("[")
                ? last.replace("]", `${graceSlashPrefix}${pitchToken}]`)
                : `[${last}${graceSlashPrefix}${pitchToken}]`;
              pendingGraceTokens.push(merged);
            }
            continue;
          }

          const gracePrefix =
            pendingGraceTokens.length > 0 ? `{${pendingGraceTokens.join("")}}` : "";
          if (!isGrace && !isChord) {
            if (hasTupletStart && hasTimeModification) {
              activeTuplet = { actual: Math.round(tmActual), normal: Math.round(tmNormal), remaining: Math.round(tmActual) };
            } else if (!activeTuplet && hasTimeModification) {
              activeTuplet = { actual: Math.round(tmActual), normal: Math.round(tmNormal), remaining: Math.round(tmActual) };
            }
          }
          const tupletPrefix =
            !isGrace && !isChord && activeTuplet
              ? (activeTuplet.remaining === activeTuplet.actual
                  ? `(${activeTuplet.actual}:${activeTuplet.normal}:${activeTuplet.actual}`
                  : "")
              : "";
          const trillPrefix = hasWavyLineStop
            ? "!trill)!"
            : (hasWavyLineStart && !hasTrillMark ? "!trill!" : (hasWavyLineStart ? "!trill(!" : (hasTrill ? "!trill!" : "")));
          const turnPrefix =
            turnType === "inverted-turn"
              ? (hasDelayedTurn ? "!delayedinvertedturn!" : (hasTurnSlash ? "!invertedturnx!" : "!invertedturn!"))
              : (turnType === "turn" ? (hasDelayedTurn ? "!delayedturn!" : (hasTurnSlash ? "!turnx!" : "!turn!")) : "");
          const mordentPrefix = mordentType === "inverted-mordent" ? "!pralltriller!" : (mordentType === "mordent" ? "!mordent!" : "");
          const tremoloPrefix = tremoloType ? `!tremolo-${tremoloType}-${tremoloMarks}!` : "";
          const glissandoPrefix = hasGlissandoStart ? "!gliss-start!" : (hasGlissandoStop ? "!gliss-stop!" : "");
          const slidePrefix = hasSlideStart ? "!slide!" : (hasSlideStop ? "!slide-stop!" : "");
          const schleiferPrefix = hasSchleifer ? "!schleifer!" : "";
          const shakePrefix = hasShake ? "!shake!" : "";
          const arpeggiatePrefix = hasArpeggiate ? "!arpeggio!" : "";
          const staccatoPrefix = hasStaccatissimo ? "!wedge!" : (hasStaccato ? "!staccato!" : "");
          const accentPrefix = hasAccent ? "!accent!" : "";
          const tenutoPrefix = hasTenuto ? "!tenuto!" : "";
          const stressPrefix = hasStress ? "!stress!" : "";
          const unstressPrefix = hasUnstress ? "!unstress!" : "";
          const strongAccentPrefix = hasStrongAccent ? "!marcato!" : "";
          const breathMarkPrefix = hasBreathMark ? "!breath!" : "";
          const caesuraPrefix = hasCaesura ? "!caesura!" : "";
          const phraseMarkPrefix =
            phraseMarkText === "shortphrase" || phraseMarkText === "mediumphrase" || phraseMarkText === "longphrase"
              ? `!${phraseMarkText}!`
              : "";
          const upBowPrefix = hasUpBow ? "!upbow!" : "";
          const downBowPrefix = hasDownBow ? "!downbow!" : "";
          const doubleTonguePrefix = hasDoubleTongue ? "!doubletongue!" : "";
          const tripleTonguePrefix = hasTripleTongue ? "!tripletongue!" : "";
          const heelPrefix = hasHeel ? "!heel!" : "";
          const toePrefix = hasToe ? "!toe!" : "";
          const fingeringPrefix = fingeringTexts
            .map((value) => (/^[0-5]$/.test(value) ? `!${value}!` : `!fingering:${value}!`))
            .join("");
          const stringPrefix = stringTexts.map((value) => `!string:${value}!`).join("");
          const pluckPrefix = pluckTexts.map((value) => `!pluck:${value}!`).join("");
          const openStringPrefix = hasOpenString ? "!open!" : "";
          const snapPizzicatoPrefix = hasSnapPizzicato ? "!snap!" : "";
          const harmonicPrefix = hasHarmonic ? "!harmonic!" : "";
          const stoppedPrefix = hasStopped ? "!stopped!" : "";
          const thumbPrefix = hasThumbPosition ? "!thumb!" : "";
          const fermataPrefix = fermataType === "inverted" ? "!invertedfermata!" : (fermataType === "normal" ? "!fermata!" : "");
          const slurStartPrefix = hasSlurStart ? "(" : "";
          const wordsPrefix =
            !isChord && pendingDirectionWords.length > 0
              ? `${pendingDirectionWords.map((word) => `"${word}"`).join("")}`
              : "";
          const harmonyPrefix =
            !isChord && pendingHarmonySymbols.length > 0
              ? `${pendingHarmonySymbols.map((symbol) => `"${abcQuotedTextEscape(symbol)}"`).join("")}`
              : "";
          const directionDecorationPrefix =
            !isChord && pendingDirectionDecorations.length > 0 ? pendingDirectionDecorations.join("") : "";
          const eventPrefix = `${harmonyPrefix}${wordsPrefix}${directionDecorationPrefix}${tupletPrefix}${slurStartPrefix}${gracePrefix}${trillPrefix}${turnPrefix}${mordentPrefix}${tremoloPrefix}${glissandoPrefix}${slidePrefix}${schleiferPrefix}${shakePrefix}${arpeggiatePrefix}${staccatoPrefix}${accentPrefix}${tenutoPrefix}${stressPrefix}${unstressPrefix}${strongAccentPrefix}${breathMarkPrefix}${caesuraPrefix}${phraseMarkPrefix}${upBowPrefix}${downBowPrefix}${doubleTonguePrefix}${tripleTonguePrefix}${heelPrefix}${toePrefix}${fingeringPrefix}${stringPrefix}${pluckPrefix}${openStringPrefix}${snapPizzicatoPrefix}${harmonicPrefix}${stoppedPrefix}${thumbPrefix}${fermataPrefix}`;
          if (!isChord && pendingHarmonySymbols.length > 0) {
            pendingHarmonySymbols.length = 0;
          }
          if (!isChord && pendingDirectionWords.length > 0) {
            pendingDirectionWords.length = 0;
          }
          if (!isChord && pendingDirectionDecorations.length > 0) {
            pendingDirectionDecorations.length = 0;
          }
          if (pendingGraceTokens.length > 0) {
            pendingGraceTokens.length = 0;
          }

          if (!isChord) {
            eventNo += 1;
            if (hasTrill && trillAccidentalText) {
              metaLines.push(`%@mks trill voice=${normalizedVoiceId} measure=${measure.getAttribute("number") || (measureTexts.length + 1)} event=${eventNo} upper=${trillAccidentalText}`);
            }
            flush();
            pending = { pitches: [pitchToken], len, tie: hasTieStart, slurStop: hasSlurStop, prefix: eventPrefix };
          } else if (!pending) {
            eventNo += 1;
            if (hasTrill && trillAccidentalText) {
              metaLines.push(`%@mks trill voice=${normalizedVoiceId} measure=${measure.getAttribute("number") || (measureTexts.length + 1)} event=${eventNo} upper=${trillAccidentalText}`);
            }
            pending = { pitches: [pitchToken], len, tie: hasTieStart, slurStop: hasSlurStop, prefix: eventPrefix };
          } else {
            pending.pitches.push(pitchToken);
            pending.tie = pending.tie || hasTieStart;
            pending.slurStop = pending.slurStop || hasSlurStop;
          }
          if (!isGrace && !isChord && activeTuplet) {
            activeTuplet.remaining -= 1;
            if (activeTuplet.remaining <= 0) {
              activeTuplet = null;
            }
          }
          if (!isGrace && !isChord && !child.querySelector(":scope > rest")) {
            const lyric = child.querySelector(":scope > lyric");
            const lyricText = lyric?.querySelector(":scope > text")?.textContent?.trim() || "";
            const lyricSyllabic = lyric?.querySelector(":scope > syllabic")?.textContent?.trim() || "single";
            const lyricExtend = Boolean(lyric?.querySelector(":scope > extend"));
            if (lyricText) {
              lyricTokens.push(abcLyricTokenFromMusicXml(lyricText, lyricSyllabic));
              pendingLyricExtension = lyricExtend;
            } else if (pendingLyricExtension) {
              lyricTokens.push("_");
            } else {
              lyricTokens.push("*");
            }
            if (lyricText && !lyricExtend) {
              pendingLyricExtension = false;
            }
          }
        }
        if (pendingGraceTokens.length > 0) {
          tokens.push(`{${pendingGraceTokens.join("")}}`);
          pendingGraceTokens.length = 0;
        }
        flush();
        if (tokens.length === 0) {
          const measureDuration = Math.max(
            1,
            Math.round(currentDivisions * Number(currentBeats) * (4 / Number(currentBeatType || 4)))
          );
          const wholeFraction = AbcCommon.reduceFraction(measureDuration, currentDivisions * 4, { num: 1, den: 4 });
          const lenRatio = AbcCommon.divideFractions(wholeFraction, unitLength, { num: 1, den: 1 });
          tokens.push(`z${AbcCommon.abcLengthTokenFromFraction(lenRatio)}`);
        }
        const measureTokenText = tokens.join(" ");
        const keyPrefix = needsInlineKeyChange
          ? `[K:${AbcCommon.keyFromFifthsMode(Math.max(-7, Math.min(7, Math.round(currentFifths))), "major")}]`
          : "";
        const leftPrefix = `${hasLeftRepeat ? "|:" : ""}${leftEndingNumber ? `[${leftEndingNumber}` : ""}`;
        let rightSuffix = "|";
        if (hasRightRepeat && rightEndingNumber) {
          rightSuffix = `:|]`;
        } else if (hasRightRepeat) {
          rightSuffix = ":|";
        } else if (rightEndingNumber) {
          rightSuffix = "]|";
        }
        measureTexts.push(`${leftPrefix}${leftPrefix ? " " : ""}${keyPrefix}${keyPrefix ? " " : ""}${measureTokenText} ${rightSuffix}`.trim());
        lastEmittedKeyFifths = currentFifths;
      }

      bodyLines.push(`V:${normalizedVoiceId}`);
      bodyLines.push(measureTexts.join(" "));
      if (lyricTokens.some((token) => token !== "*")) {
        bodyLines.push(`w: ${lyricTokens.join(" ")}`);
      }
    }
  });

  const metaBlock = metaLines.length > 0 ? `\n${metaLines.join("\n")}\n` : "\n";
  return `${headerLines.join("\n")}\n\n${bodyLines.join("\n")}${metaBlock}`;
};

const xmlEscape = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const abcQuotedTextEscape = (text: string): string =>
  String(text || "")
    .replace(/"/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const normalizeChordToken = (raw: string): string =>
  String(raw || "")
    .trim()
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .replace(/\s+/g, "");

const isLikelyAbcChordSymbol = (raw: string): boolean => {
  const text = normalizeChordToken(raw);
  return /^[A-G](?:#|b)?(?:[^/\s"]*)?(?:\/[A-G](?:#|b)?)?$/.test(text);
};

const xmlHarmonyKindFromChordSuffix = (suffixRaw: string): string | null => {
  const suffix = String(suffixRaw || "").trim().toLowerCase();
  if (!suffix) return "major";
  if (suffix === "m" || suffix === "min") return "minor";
  if (suffix === "6") return "major-sixth";
  if (suffix === "m6" || suffix === "min6") return "minor-sixth";
  if (suffix === "7") return "dominant";
  if (suffix === "7sus4") return "suspended-fourth";
  if (suffix === "9") return "dominant-ninth";
  if (suffix === "11") return "dominant-11th";
  if (suffix === "13") return "dominant-13th";
  if (suffix === "maj7") return "major-seventh";
  if (suffix === "maj9") return "major-ninth";
  if (suffix === "m9" || suffix === "min9") return "minor-ninth";
  if (suffix === "m7" || suffix === "min7") return "minor-seventh";
  if (suffix === "dim") return "diminished";
  if (suffix === "dim7") return "diminished-seventh";
  if (suffix === "aug" || suffix === "+") return "augmented";
  if (suffix === "sus4") return "suspended-fourth";
  if (suffix === "sus2") return "suspended-second";
  if (suffix === "m7b5" || suffix === "min7b5" || suffix === "ø") return "half-diminished";
  return null;
};

const xmlHarmonyRootFromChordToken = (token: string): { step: string; alter: number } | null => {
  const m = String(token || "").match(/^([A-G])(#|b)?$/);
  if (!m) return null;
  return {
    step: m[1],
    alter: m[2] === "#" ? 1 : (m[2] === "b" ? -1 : 0),
  };
};

const buildHarmonyXmlFromChordSymbol = (raw: string): string => {
  const normalized = normalizeChordToken(raw);
  const match = normalized.match(/^([A-G](?:#|b)?)([^/]*)?(?:\/([A-G](?:#|b)?))?$/);
  if (!match) return "";
  const root = xmlHarmonyRootFromChordToken(match[1] || "");
  if (!root) return "";
  const suffix = String(match[2] || "");
  const bass = match[3] ? xmlHarmonyRootFromChordToken(match[3]) : null;
  const kind = xmlHarmonyKindFromChordSuffix(suffix);
  if (!kind) return "";
  return [
    "<harmony>",
    "<root>",
    `<root-step>${xmlEscape(root.step)}</root-step>`,
    root.alter !== 0 ? `<root-alter>${root.alter}</root-alter>` : "",
    "</root>",
    bass
      ? `<bass><bass-step>${xmlEscape(bass.step)}</bass-step>${bass.alter !== 0 ? `<bass-alter>${bass.alter}</bass-alter>` : ""}</bass>`
      : "",
    `<kind text="${xmlEscape(normalized)}">${kind}</kind>`,
    "</harmony>",
  ].join("");
};

const abcChordSymbolFromHarmony = (harmony: Element | null): string => {
  if (!harmony) return "";
  const rootStep = (harmony.querySelector(":scope > root > root-step")?.textContent || "").trim().toUpperCase();
  if (!/^[A-G]$/.test(rootStep)) return "";
  const rootAlter = Number(harmony.querySelector(":scope > root > root-alter")?.textContent || "0");
  const kindNode = harmony.querySelector(":scope > kind");
  const kindTextAttr = (kindNode?.getAttribute("text") || "").trim();
  if (kindTextAttr) return abcQuotedTextEscape(kindTextAttr);
  const kindValue = (kindNode?.textContent || "").trim().toLowerCase();
  const rootToken = `${rootStep}${rootAlter === 1 ? "#" : (rootAlter === -1 ? "b" : "")}`;
  const suffix =
    kindValue === "major" ? "" :
    kindValue === "minor" ? "m" :
    kindValue === "major-sixth" ? "6" :
    kindValue === "minor-sixth" ? "m6" :
    kindValue === "dominant" ? "7" :
    kindValue === "dominant-11th" ? "11" :
    kindValue === "dominant-13th" ? "13" :
    kindValue === "dominant-ninth" ? "9" :
    kindValue === "major-seventh" ? "maj7" :
    kindValue === "major-ninth" ? "maj9" :
    kindValue === "minor-ninth" ? "m9" :
    kindValue === "minor-seventh" ? "m7" :
    kindValue === "diminished" ? "dim" :
    kindValue === "diminished-seventh" ? "dim7" :
    kindValue === "augmented" ? "aug" :
    kindValue === "suspended-fourth" ? "sus4" :
    kindValue === "suspended-second" ? "sus2" :
    kindValue === "half-diminished" ? "m7b5" :
    "";
  const bassStep = (harmony.querySelector(":scope > bass > bass-step")?.textContent || "").trim().toUpperCase();
  const bassAlter = Number(harmony.querySelector(":scope > bass > bass-alter")?.textContent || "0");
  const bassToken = /^[A-G]$/.test(bassStep)
    ? `/${bassStep}${bassAlter === 1 ? "#" : (bassAlter === -1 ? "b" : "")}`
    : "";
  return `${rootToken}${suffix}${bassToken}`;
};

const abcLyricTokenFromMusicXml = (
  text: string,
  syllabic?: "single" | "begin" | "middle" | "end" | string
): string => {
  const normalized = String(text || "").trim().replace(/\s+/g, "~");
  const mode = String(syllabic || "single").trim().toLowerCase();
  if (!normalized) return "*";
  if (mode === "begin" || mode === "middle") {
    return `${normalized}-`;
  }
  return normalized;
};

const normalizeTypeForMusicXml = (t?: string): string => {
  const raw = String(t || "").trim();
  if (!raw) return "quarter";
  if (raw === "16th" || raw === "32nd" || raw === "64th" || raw === "128th") return raw;
  if (raw === "whole" || raw === "half" || raw === "quarter" || raw === "eighth") return raw;
  return "quarter";
};

const normalizeVoiceForMusicXml = (voice?: string): string => {
  const raw = String(voice || "").trim();
  if (!raw) return "1";
  if (/^[1-9]\d*$/.test(raw)) return raw;
  const m = raw.match(/\d+/);
  if (!m) return "1";
  const n = Number(m[0]);
  if (!Number.isFinite(n) || n <= 0) return "1";
  return String(Math.round(n));
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

const noteToMidiForAbcClefInference = (note?: AbcParsedNote): number | null => {
  if (!note || note.isRest) return null;
  const step = String(note.step || "").trim().toUpperCase();
  if (!Object.prototype.hasOwnProperty.call(midiByStepForAbcImport, step)) {
    return null;
  }
  const octave = Number.isFinite(note.octave) ? Math.round(Number(note.octave)) : 4;
  const alter = Number.isFinite(note.alter) ? Math.round(Number(note.alter)) : 0;
  return (octave + 1) * 12 + midiByStepForAbcImport[step] + alter;
};

const resolveAbcImportClef = (part: AbcParsedPart): string => {
  const explicit = String(part?.clef || "").trim().toLowerCase();
  if (explicit) return explicit;
  const keys: number[] = [];
  for (const measure of part?.measures || []) {
    for (const note of measure || []) {
      const midi = noteToMidiForAbcClefInference(note);
      if (Number.isFinite(midi)) {
        keys.push(midi as number);
      }
    }
  }
  if (!keys.length) return "";
  return chooseSingleClefByKeys(keys) === "F" ? "bass" : "treble";
};

export const clefXmlFromAbcClef = (rawClef?: string): string => {
  const clef = String(rawClef || "").trim().toLowerCase();
  if (clef === "bass" || clef === "f") {
    return "<clef><sign>F</sign><line>4</line></clef>";
  }
  if (clef === "alto" || clef === "c3") {
    return "<clef><sign>C</sign><line>3</line></clef>";
  }
  if (clef === "tenor" || clef === "c4") {
    return "<clef><sign>C</sign><line>4</line></clef>";
  }
  return "<clef><sign>G</sign><line>2</line></clef>";
};

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

type AbcParsedPart = {
  partId: string;
  partName: string;
  clef?: string;
  transpose?: { chromatic?: number; diatonic?: number } | null;
  voiceId?: string;
  keyByMeasure?: Record<number, number>;
  meterByMeasure?: Record<number, { beats: number; beatType: number }>;
  tempoByMeasure?: Record<number, number>;
  measureMetaByIndex?: Record<number, {
    number: string;
    implicit: boolean;
    repeatStart: boolean;
    repeatEnd: boolean;
    repeatTimes: number | null;
    endingStart: string;
    endingStop: string;
    endingStopType: "" | "stop" | "discontinue";
  }>;
  measures: AbcParsedNote[][];
};

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

export type AbcImportOptions = {
  debugMetadata?: boolean;
  debugPrettyPrint?: boolean;
  sourceMetadata?: boolean;
  overfullCompatibilityMode?: boolean;
};

const toHex = (value: number, width = 2): string => {
  const safe = Math.max(0, Math.round(Number(value) || 0));
  return `0x${safe.toString(16).toUpperCase().padStart(width, "0")}`;
};

const buildAbcMeasureDebugMiscXml = (notes: AbcParsedNote[], measureNo: number): string => {
  if (!notes.length) return "";
  let xml = "<attributes><miscellaneous>";
  xml += `<miscellaneous-field name="mks:dbg:abc:meta:count">${toHex(notes.length, 4)}</miscellaneous-field>`;
  for (let i = 0; i < notes.length; i += 1) {
    const note = notes[i];
    const voice = normalizeVoiceForMusicXml(note.voice);
    const step = note.isRest ? "R" : (/^[A-G]$/.test(String(note.step || "").toUpperCase()) ? String(note.step).toUpperCase() : "C");
    const octave = Number.isFinite(note.octave) ? Math.max(0, Math.min(9, Math.round(Number(note.octave)))) : 4;
    const alter = Number.isFinite(note.alter) ? Math.round(Number(note.alter)) : 0;
    const dur = note.grace ? 0 : Math.max(1, Math.round(Number(note.duration) || 1));
    const payload = [
      `idx=${toHex(i, 4)}`,
      `m=${toHex(measureNo, 4)}`,
      `v=${xmlEscape(voice)}`,
      `r=${note.isRest ? "1" : "0"}`,
      `g=${note.grace ? "1" : "0"}`,
      `ch=${note.chord ? "1" : "0"}`,
      `st=${step}`,
      `al=${String(alter)}`,
      `oc=${toHex(octave, 2)}`,
      `dd=${toHex(dur, 4)}`,
      `tp=${xmlEscape(normalizeTypeForMusicXml(note.type))}`,
    ].join(";");
    xml += `<miscellaneous-field name="mks:dbg:abc:meta:${String(i + 1).padStart(4, "0")}">${payload}</miscellaneous-field>`;
  }
  xml += "</miscellaneous></attributes>";
  return xml;
};

const buildAbcSourceMiscXml = (abcSource: string): string => {
  const source = String(abcSource ?? "");
  if (!source.length) return "";
  const encoded = source
    .replace(/\\/g, "\\\\")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
  const CHUNK_SIZE = 240;
  const MAX_CHUNKS = 512;
  const chunks: string[] = [];
  for (let i = 0; i < encoded.length && chunks.length < MAX_CHUNKS; i += CHUNK_SIZE) {
    chunks.push(encoded.slice(i, i + CHUNK_SIZE));
  }
  const truncated = chunks.join("").length < encoded.length;
  let xml = "<attributes><miscellaneous>";
  xml += `<miscellaneous-field name="mks:src:abc:raw-encoding">escape-v1</miscellaneous-field>`;
  xml += `<miscellaneous-field name="mks:src:abc:raw-length">${xmlEscape(String(source.length))}</miscellaneous-field>`;
  xml += `<miscellaneous-field name="mks:src:abc:raw-encoded-length">${xmlEscape(String(encoded.length))}</miscellaneous-field>`;
  xml += `<miscellaneous-field name="mks:src:abc:raw-chunks">${xmlEscape(String(chunks.length))}</miscellaneous-field>`;
  xml += `<miscellaneous-field name="mks:src:abc:raw-truncated">${truncated ? "1" : "0"}</miscellaneous-field>`;
  for (let i = 0; i < chunks.length; i += 1) {
    xml += `<miscellaneous-field name="mks:src:abc:raw-${String(i + 1).padStart(4, "0")}">${xmlEscape(chunks[i])}</miscellaneous-field>`;
  }
  xml += "</miscellaneous></attributes>";
  return xml;
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
): string => {
  if (!diagnostics.length) return "";
  const maxEntries = Math.min(256, diagnostics.length);
  let xml = "<attributes><miscellaneous>";
  xml += `<miscellaneous-field name="mks:diag:count">${maxEntries}</miscellaneous-field>`;
  for (let i = 0; i < maxEntries; i += 1) {
    const item = diagnostics[i];
    const payload = [
      `level=${item.level}`,
      `code=${item.code}`,
      `fmt=${item.fmt}`,
      Number.isFinite(item.measure) ? `measure=${Math.max(1, Math.round(Number(item.measure)))}` : "",
      item.voiceId ? `voice=${xmlEscape(item.voiceId)}` : "",
      item.action ? `action=${xmlEscape(item.action)}` : "",
      item.message ? `message=${xmlEscape(item.message)}` : "",
      Number.isFinite(item.movedEvents) ? `movedEvents=${Math.max(0, Math.round(Number(item.movedEvents)))}` : "",
    ]
      .filter(Boolean)
      .join(";");
    xml += `<miscellaneous-field name="mks:diag:${String(i + 1).padStart(4, "0")}">${payload}</miscellaneous-field>`;
  }
  xml += "</miscellaneous></attributes>";
  return xml;
};

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

const buildMusicXmlFromAbcParsed = (
  parsed: AbcParsedResult,
  abcSource: string,
  options: AbcImportOptions = {}
): string => {
  const debugMetadata = options.debugMetadata ?? true;
  const sourceMetadata = options.sourceMetadata ?? true;
  const debugPrettyPrint = options.debugPrettyPrint ?? debugMetadata;
  const parts =
    parsed.parts && parsed.parts.length > 0
      ? parsed.parts
      : [{ partId: "P1", partName: "Voice 1", measures: [[]] }];
  const resolvedParts = parts.map((part) => ({
    ...part,
    clef: resolveAbcImportClef(part),
  }));
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

  const partListXml = resolvedParts
    .map((part, index) => {
      const midiChannel = ((index % 16) + 1 === 10) ? 11 : ((index % 16) + 1);
      return [
        `<score-part id="${xmlEscape(part.partId)}">`,
        `<part-name>${xmlEscape(part.partName || part.partId)}</part-name>`,
        `<midi-instrument id="${xmlEscape(part.partId)}-I1">`,
        `<midi-channel>${midiChannel}</midi-channel>`,
        `<midi-program>6</midi-program>`,
        "</midi-instrument>",
        "</score-part>",
      ].join("");
    })
    .join("");

  const partBodyXml = resolvedParts
    .map((part, partIndex) => {
      const measuresXml: string[] = [];
      let currentPartFifths = Math.max(-7, Math.min(7, Math.round(defaultFifths)));
      let currentPartMeter = { beats: Math.round(beats), beatType: Math.round(beatType) };
      let currentPartTempo = tempoBpm;
      for (let i = 0; i < measureCount; i += 1) {
        const measureNo = i + 1;
        const notes = part.measures[i] ?? [];
        const measureMeta = part.measureMetaByIndex?.[measureNo] ?? null;
        const hintedFifths = Number.isFinite(part.keyByMeasure?.[measureNo])
          ? Math.max(-7, Math.min(7, Math.round(Number(part.keyByMeasure?.[measureNo]))))
          : null;
        const hintedMeter = part.meterByMeasure?.[measureNo] ?? null;
        const hintedTempo = Number.isFinite(part.tempoByMeasure?.[measureNo])
          ? Math.max(20, Math.min(300, Math.round(Number(part.tempoByMeasure?.[measureNo]))))
          : null;
        if (hintedFifths !== null) {
          currentPartFifths = hintedFifths;
        }
        if (hintedMeter) {
          currentPartMeter = {
            beats: Math.max(1, Math.round(Number(hintedMeter.beats) || beats)),
            beatType: Math.max(1, Math.round(Number(hintedMeter.beatType) || beatType)),
          };
        }
        if (hintedTempo !== null) {
          currentPartTempo = hintedTempo;
        }
        const currentMeasureDurationDiv = Math.max(
          1,
          Math.round((960 * 4 * Math.max(1, Math.round(currentPartMeter.beats))) / Math.max(1, Math.round(currentPartMeter.beatType)))
        );
        const currentMeasureContentDiv = estimateAbcMeasureContentDiv(notes);
        const inferredImplicitPickup =
          i === 0 &&
          !measureMeta?.implicit &&
          currentMeasureContentDiv > 0 &&
          currentMeasureContentDiv < currentMeasureDurationDiv;
        const header =
          i === 0
            ? [
                "<attributes>",
                "<divisions>960</divisions>",
                `<key><fifths>${Math.round(currentPartFifths)}</fifths></key>`,
                `<time><beats>${Math.round(currentPartMeter.beats)}</beats><beat-type>${Math.round(currentPartMeter.beatType)}</beat-type></time>`,
                part.transpose && (Number.isFinite(part.transpose.chromatic) || Number.isFinite(part.transpose.diatonic))
                  ? [
                      "<transpose>",
                      Number.isFinite(part.transpose.diatonic)
                        ? `<diatonic>${Math.round(Number(part.transpose.diatonic))}</diatonic>`
                        : "",
                      Number.isFinite(part.transpose.chromatic)
                        ? `<chromatic>${Math.round(Number(part.transpose.chromatic))}</chromatic>`
                        : "",
                      "</transpose>",
                    ].join("")
                  : "",
                clefXmlFromAbcClef(part.clef),
                "</attributes>",
                currentPartTempo !== null && partIndex === 0
                  ? `<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${currentPartTempo}</per-minute></metronome></direction-type><sound tempo="${currentPartTempo}"/></direction>`
                  : "",
              ].join("")
            : (hintedFifths !== null || hintedMeter)
              ? `<attributes>${
                  hintedFifths !== null ? `<key><fifths>${Math.round(currentPartFifths)}</fifths></key>` : ""
                }${
                  hintedMeter
                    ? `<time><beats>${Math.round(currentPartMeter.beats)}</beats><beat-type>${Math.round(currentPartMeter.beatType)}</beat-type></time>`
                    : ""
                }</attributes>`
              : "";
        const tempoDirectionXml =
          i > 0 && hintedTempo !== null && partIndex === 0
            ? `<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${hintedTempo}</per-minute></metronome></direction-type><sound tempo="${hintedTempo}"/></direction>`
            : "";

        const notesXml =
          notes.length > 0
            ? (() => {
                const beamXmlByNoteIndex = (() => {
                  const out = new Map();
                  const levelFromType = (typeText) => {
                    switch (String(typeText || "").trim().toLowerCase()) {
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
                  const byVoice = new Map();
                  for (let i = 0; i < notes.length; i += 1) {
                    const n = notes[i];
                    const voice = normalizeVoiceForMusicXml(n.voice);
                    const bucket = byVoice.get(voice) ?? [];
                    bucket.push({ note: n, noteIndex: i });
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
                          chord: !Boolean(ev.note?.isRest),
                          grace: Boolean(ev.note?.grace),
                          durationDiv: ev.note?.grace ? 0 : Math.max(1, Math.round(Number(ev.note?.duration) || 1)),
                          levels: levelFromType(type),
                          explicitMode: ev.note?.beamMode,
                        };
                      },
                      { splitAtBeatBoundaryWhenImplicit: true }
                    );
                    for (const [eventIndex, assignment] of assignments.entries()) {
                      if (!assignment || assignment.levels <= 0) continue;
                      let beamXml = "";
                      for (let level = 1; level <= assignment.levels; level += 1) {
                        beamXml += `<beam number="${level}">${assignment.state}</beam>`;
                      }
                      if (!beamXml) continue;
                      const target = primary[eventIndex];
                      if (!target) continue;
                      out.set(target.noteIndex, beamXml);
                    }
                  }
                  return out;
                })();
                return notes
                  .map((note, noteIndex) => {
                  const chunks: string[] = [];
                  if (!note.chord && Array.isArray(note.chordSymbols) && note.chordSymbols.length > 0) {
                    for (const chordSymbol of note.chordSymbols) {
                      const harmonyXml = buildHarmonyXmlFromChordSymbol(chordSymbol);
                      if (harmonyXml) {
                        chunks.push(harmonyXml);
                      } else {
                        chunks.push(
                          `<direction><direction-type><words>${xmlEscape(String(chordSymbol))}</words></direction-type></direction>`
                        );
                      }
                    }
                  }
                  if (!note.chord && Array.isArray(note.annotations) && note.annotations.length > 0) {
                    for (const annotation of note.annotations) {
                      if (!annotation) continue;
                      chunks.push(
                        `<direction><direction-type><words>${xmlEscape(String(annotation))}</words></direction-type></direction>`
                      );
                    }
                  }
                  if (!note.chord && note.segno) {
                    chunks.push("<direction><direction-type><segno/></direction-type></direction>");
                  }
                  if (!note.chord && note.coda) {
                    chunks.push("<direction><direction-type><coda/></direction-type></direction>");
                  }
                  if (!note.chord && note.rehearsalMark) {
                    chunks.push(`<direction><direction-type><rehearsal>${xmlEscape(String(note.rehearsalMark))}</rehearsal></direction-type></direction>`);
                  }
                  if (!note.chord && note.fine) {
                    chunks.push('<direction><sound fine="yes"/></direction>');
                  }
                  if (!note.chord && note.daCapo) {
                    chunks.push('<direction><sound dacapo="yes"/></direction>');
                  }
                  if (!note.chord && note.dalSegno) {
                    chunks.push('<direction><sound dalsegno="segno"/></direction>');
                  }
                  if (!note.chord && note.toCoda) {
                    chunks.push('<direction><sound tocoda="coda"/></direction>');
                  }
                  if (!note.chord && note.crescendoStart) {
                    chunks.push('<direction><direction-type><wedge type="crescendo"/></direction-type></direction>');
                  }
                  if (!note.chord && note.diminuendoStart) {
                    chunks.push('<direction><direction-type><wedge type="diminuendo"/></direction-type></direction>');
                  }
                  if (!note.chord && (note.crescendoStop || note.diminuendoStop)) {
                    chunks.push('<direction><direction-type><wedge type="stop"/></direction-type></direction>');
                  }
                  if (!note.chord && note.dynamicMark) {
                    chunks.push(`<direction><direction-type><dynamics><${xmlEscape(String(note.dynamicMark))}/></dynamics></direction-type></direction>`);
                  }
                  if (!note.chord && note.sfz) {
                    chunks.push("<direction><direction-type><dynamics><sfz/></dynamics></direction-type></direction>");
                  }
                  chunks.push("<note>");
                  if (note.chord) chunks.push("<chord/>");
                  if (note.grace) {
                    chunks.push(note.graceSlash ? '<grace slash="yes"/>' : "<grace/>");
                  }
                  if (note.isRest) {
                    chunks.push("<rest/>");
                  } else {
                    const step = /^[A-G]$/.test(String(note.step || "").toUpperCase())
                      ? String(note.step).toUpperCase()
                      : "C";
                    const octave = Number.isFinite(note.octave)
                      ? Math.max(0, Math.min(9, Math.round(note.octave as number)))
                      : 4;
                    chunks.push("<pitch>");
                    chunks.push(`<step>${step}</step>`);
                    if (Number.isFinite(note.alter as number) && Number(note.alter) !== 0) {
                      chunks.push(`<alter>${Math.round(Number(note.alter))}</alter>`);
                    }
                    chunks.push(`<octave>${octave}</octave>`);
                    chunks.push("</pitch>");
                  }
                  if (!note.grace) {
                    const duration = Math.max(1, Math.round(Number(note.duration) || 1));
                    chunks.push(`<duration>${duration}</duration>`);
                  }
                  chunks.push(`<voice>${xmlEscape(normalizeVoiceForMusicXml(note.voice))}</voice>`);
                  if (note.lyricText) {
                    chunks.push(
                      `<lyric><syllabic>${xmlEscape(String(note.lyricSyllabic || "single"))}</syllabic><text>${xmlEscape(String(note.lyricText))}</text>${
                        note.lyricExtend ? "<extend/>" : ""
                      }</lyric>`
                    );
                  }
                  chunks.push(`<type>${normalizeTypeForMusicXml(note.type)}</type>`);
                  if (!note.chord && beamXmlByNoteIndex.has(noteIndex)) {
                    chunks.push(String(beamXmlByNoteIndex.get(noteIndex)));
                  }
                  if (
                    note.timeModification &&
                    Number.isFinite(note.timeModification.actual) &&
                    Number.isFinite(note.timeModification.normal) &&
                    Number(note.timeModification.actual) > 0 &&
                    Number(note.timeModification.normal) > 0
                  ) {
                    chunks.push(
                      `<time-modification><actual-notes>${Math.round(Number(note.timeModification.actual))}</actual-notes><normal-notes>${Math.round(Number(note.timeModification.normal))}</normal-notes></time-modification>`
                    );
                  }
                  if (note.accidentalText) {
                    const accidentalAttrs = [
                      note.accidentalEditorial ? 'editorial="yes"' : "",
                      note.accidentalCautionary ? 'cautionary="yes"' : "",
                    ].filter(Boolean).join(" ");
                    chunks.push(
                      accidentalAttrs
                        ? `<accidental ${accidentalAttrs}>${xmlEscape(String(note.accidentalText))}</accidental>`
                        : `<accidental>${xmlEscape(String(note.accidentalText))}</accidental>`,
                    );
                  }
                  if (note.tieStart) chunks.push('<tie type="start"/>');
                  if (note.tieStop) chunks.push('<tie type="stop"/>');
                  if (
                    note.tieStart ||
                    note.tieStop ||
                    note.slurStart ||
                    note.slurStop ||
                    note.trill ||
                    note.trillLineStop ||
                    note.turnType ||
                    note.delayedTurn ||
                    note.mordentType ||
                    note.tremoloType ||
                    note.glissandoStart ||
                    note.glissandoStop ||
                    note.slideStart ||
                    note.slideStop ||
                    note.schleifer ||
                    note.shake ||
                    note.arpeggiate ||
                    note.staccato ||
                    note.staccatissimo ||
                    note.accent ||
                    note.tenuto ||
                    note.stress ||
                    note.unstress ||
                    note.fermataType ||
                    note.strongAccent ||
                    note.breathMark ||
                    note.caesura ||
                    note.phraseMark ||
                    note.upBow ||
                    note.downBow ||
                    note.doubleTongue ||
                    note.tripleTongue ||
                    note.heel ||
                    note.toe ||
                    (Array.isArray(note.fingerings) && note.fingerings.length > 0) ||
                    (Array.isArray(note.strings) && note.strings.length > 0) ||
                    (Array.isArray(note.plucks) && note.plucks.length > 0) ||
                    note.openString ||
                    note.snapPizzicato ||
                    note.harmonic ||
                    note.stopped ||
                    note.thumbPosition ||
                    note.tupletStart ||
                    note.tupletStop
                  ) {
                    chunks.push("<notations>");
                    if (note.tieStart) chunks.push('<tied type="start"/>');
                    if (note.tieStop) chunks.push('<tied type="stop"/>');
                    if (note.slurStart) chunks.push('<slur type="start"/>');
                    if (note.slurStop) chunks.push('<slur type="stop"/>');
                    if (note.tupletStart) chunks.push('<tuplet type="start"/>');
                    if (note.tupletStop) chunks.push('<tuplet type="stop"/>');
                    if (note.trill || note.trillLineStop) {
                      const trillParts: string[] = [];
                    if (note.trill) {
                      trillParts.push("<trill-mark/>");
                    }
                    if (note.trillLineStop) {
                      trillParts.push('<wavy-line type="stop"/>');
                    } else if (note.trillLineStart) {
                      trillParts.push('<wavy-line type="start"/>');
                    }
                      if (note.trillAccidentalText) {
                        trillParts.push(`<accidental-mark>${xmlEscape(String(note.trillAccidentalText))}</accidental-mark>`);
                      }
                      chunks.push(`<ornaments>${trillParts.join("")}</ornaments>`);
                    }
                    if (note.turnType) {
                      const tag = note.turnType === "inverted-turn" ? "inverted-turn" : "turn";
                      const slashAttr = note.turnSlash ? ' slash="yes"' : "";
                      chunks.push(`<ornaments><${tag}${slashAttr}/>${note.delayedTurn ? "<delayed-turn/>" : ""}</ornaments>`);
                    }
                    if (note.mordentType) {
                      const tag = note.mordentType === "inverted-mordent" ? "inverted-mordent" : "mordent";
                      chunks.push(`<ornaments><${tag}/></ornaments>`);
                    }
                    if (note.tremoloType) {
                      const marks = Math.max(1, Math.min(8, Math.round(Number(note.tremoloMarks) || 1)));
                      chunks.push(`<ornaments><tremolo type="${xmlEscape(String(note.tremoloType))}">${marks}</tremolo></ornaments>`);
                    }
                    if (note.glissandoStart) {
                      chunks.push('<glissando type="start" number="1">wavy</glissando>');
                    }
                    if (note.glissandoStop) {
                      chunks.push('<glissando type="stop" number="1">wavy</glissando>');
                    }
                    if (note.slideStart) {
                      chunks.push('<slide type="start" number="1"/>');
                    }
                    if (note.slideStop) {
                      chunks.push('<slide type="stop" number="1"/>');
                    }
                    if (note.schleifer) {
                      chunks.push("<ornaments><schleifer/></ornaments>");
                    }
                    if (note.shake) {
                      chunks.push("<ornaments><shake/></ornaments>");
                    }
                    if (note.arpeggiate) {
                      chunks.push("<arpeggiate/>");
                    }
                    const articulationParts: string[] = [];
                    if (note.staccato) articulationParts.push("<staccato/>");
                    if (note.staccatissimo) articulationParts.push("<staccatissimo/>");
                    if (note.accent) articulationParts.push("<accent/>");
                    if (note.tenuto) articulationParts.push("<tenuto/>");
                    if (note.stress) articulationParts.push("<stress/>");
                    if (note.unstress) articulationParts.push("<unstress/>");
                    if (note.strongAccent) articulationParts.push("<strong-accent/>");
                    if (note.breathMark) articulationParts.push("<breath-mark/>");
                    if (note.caesura) articulationParts.push("<caesura/>");
                    if (note.phraseMark) articulationParts.push(`<other-articulation>${xmlEscape(String(note.phraseMark))}</other-articulation>`);
                    if (articulationParts.length > 0) {
                      chunks.push(`<articulations>${articulationParts.join("")}</articulations>`);
                    }
                    const technicalParts: string[] = [];
                    if (note.upBow) technicalParts.push("<up-bow/>");
                    if (note.downBow) technicalParts.push("<down-bow/>");
                    if (note.doubleTongue) technicalParts.push("<double-tongue/>");
                    if (note.tripleTongue) technicalParts.push("<triple-tongue/>");
                    if (note.heel) technicalParts.push("<heel/>");
                    if (note.toe) technicalParts.push("<toe/>");
                    if (Array.isArray(note.fingerings) && note.fingerings.length > 0) {
                      for (const fingering of note.fingerings) {
                        if (fingering) technicalParts.push(`<fingering>${xmlEscape(String(fingering))}</fingering>`);
                      }
                    }
                    if (Array.isArray(note.strings) && note.strings.length > 0) {
                      for (const stringText of note.strings) {
                        if (stringText) technicalParts.push(`<string>${xmlEscape(String(stringText))}</string>`);
                      }
                    }
                    if (Array.isArray(note.plucks) && note.plucks.length > 0) {
                      for (const pluckText of note.plucks) {
                        if (pluckText) technicalParts.push(`<pluck>${xmlEscape(String(pluckText))}</pluck>`);
                      }
                    }
                    if (note.openString) technicalParts.push("<open-string/>");
                    if (note.snapPizzicato) technicalParts.push("<snap-pizzicato/>");
                    if (note.harmonic) technicalParts.push("<harmonic/>");
                    if (note.stopped) technicalParts.push("<stopped/>");
                    if (note.thumbPosition) technicalParts.push("<thumb-position/>");
                    if (technicalParts.length > 0) {
                      chunks.push(`<technical>${technicalParts.join("")}</technical>`);
                    }
                    if (note.fermataType) {
                      const fermataText = note.fermataType === "inverted" ? "inverted" : "normal";
                      chunks.push(`<fermata>${fermataText}</fermata>`);
                    }
                    chunks.push("</notations>");
                  }
                  chunks.push("</note>");
                  return chunks.join("");
                })
                .join("");
              })()
            : `<note><rest/><duration>${measureDurationDiv}</duration><voice>1</voice><type>${emptyMeasureRestType}</type></note>`;

        const xmlMeasureNumber = xmlEscape(String(measureMeta?.number || measureNo));
        const implicitAttr = measureMeta?.implicit || inferredImplicitPickup ? ' implicit="yes"' : "";
        const leftBarlineChunks: string[] = [];
        if (measureMeta?.endingStart) {
          leftBarlineChunks.push(`<ending number="${xmlEscape(String(measureMeta.endingStart))}" type="start"/>`);
        }
        if (measureMeta?.repeatStart) {
          leftBarlineChunks.push('<repeat direction="forward" winged="none"/>');
        }
        const repeatStartXml =
          leftBarlineChunks.length > 0
            ? `<barline location="left">${leftBarlineChunks.join("")}</barline>`
            : "";
        const rightBarlineChunks: string[] = [];
        if (measureMeta?.endingStop) {
          rightBarlineChunks.push(
            `<ending number="${xmlEscape(String(measureMeta.endingStop))}" type="${measureMeta.endingStopType || "stop"}"/>`
          );
        }
        if (measureMeta?.repeatEnd) {
          rightBarlineChunks.push(
            `<repeat direction="backward" winged="none"${
              Number.isFinite(measureMeta.repeatTimes) && Number(measureMeta.repeatTimes) > 1
                ? ` times="${Math.round(Number(measureMeta.repeatTimes))}"`
                : ""
            }/>`
          );
        }
        const repeatEndXml =
          rightBarlineChunks.length > 0
            ? `<barline location="right">${rightBarlineChunks.join("")}</barline>`
            : "";
        const debugMiscXml = debugMetadata ? buildAbcMeasureDebugMiscXml(notes, measureNo) : "";
        const diagMiscXml =
          partIndex === 0 && measureNo === 1
            ? buildAbcDiagMiscXml(
                (parsed.diagnostics ?? []).filter(
                  (diag) => !diag.voiceId || diag.voiceId === (part.voiceId || "")
                )
              )
            : "";
        const sourceMiscXml =
          sourceMetadata && partIndex === 0 && measureNo === 1
            ? buildAbcSourceMiscXml(abcSource)
            : "";
        measuresXml.push(
          `<measure number="${xmlMeasureNumber}"${implicitAttr}>${repeatStartXml}${header}${tempoDirectionXml}${debugMiscXml}${diagMiscXml}${sourceMiscXml}${notesXml}${repeatEndXml}</measure>`
        );
      }
      return `<part id="${xmlEscape(part.partId)}">${measuresXml.join("")}</part>`;
    })
    .join("");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<score-partwise version="4.0">',
    `<work><work-title>${xmlEscape(title)}</work-title></work>`,
    `<identification><creator type="composer">${xmlEscape(composer)}</creator></identification>`,
    `<part-list>${partListXml}</part-list>`,
    partBodyXml,
    "</score-partwise>",
  ].join("");
  return debugPrettyPrint ? prettyPrintXml(xml) : xml;
};

export const convertAbcToMusicXml = (abcSource: string, options: AbcImportOptions = {}): string => {
  const parsed = AbcCompatParser.parseForMusicXml(abcSource, {
    defaultTitle: "mikuscore",
    defaultComposer: "Unknown",
    inferTransposeFromPartName: true,
    overfullCompatibilityMode: options.overfullCompatibilityMode !== false,
  }) as AbcParsedResult;
  return buildMusicXmlFromAbcParsed(parsed, abcSource, options);
};
