// @ts-nocheck
import { computeBeamAssignments } from "./beam-common";

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

const parseAbcLengthToken = (token: string, lineNo: number): Fraction => {
  if (!token) {
    return { num: 1, den: 1 };
  }
  if (token === "/") {
    return { num: 1, den: 2 };
  }
  if (/^\d+$/.test(token)) {
    return { num: Number(token), den: 1 };
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
    const declaredVoiceIds = [];
    const voiceNameById = {};
    const voiceClefById = {};
    const voiceTransposeById = {};
    let currentVoiceId = "1";
    let scoreDirective = "";

    for (let i = 0; i < lines.length; i += 1) {
      const lineNo = i + 1;
      const raw = lines[i];
      const rawTrimmed = raw.trim();
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
          const repeatTimesRaw = Number.parseInt(String(params.times || ""), 10);
          measureMetaByKey.set(`${voiceId}#${measureNo}`, {
            number: measureNumberText || String(measureNo),
            implicit: implicitRaw === "1" || implicitRaw === "true" || implicitRaw === "yes",
            repeat:
              repeatRaw === "forward" || repeatRaw === "backward"
                ? repeatRaw
                : "",
            repeatTimes: Number.isFinite(repeatTimesRaw) && repeatTimesRaw > 1 ? repeatTimesRaw : null
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

      if (!trimmed) {
        continue;
      }

      const scoreMatch = trimmed.match(/^%%\s*score\s+(.+)$/i);
      if (scoreMatch) {
        scoreDirective = scoreMatch[1].trim();
        continue;
      }

      const headerMatch = trimmed.match(/^([A-Za-z]):\s*(.*)$/);
      if (headerMatch && /^[A-Za-z]$/.test(headerMatch[1])) {
        const key = headerMatch[1];
        const value = headerMatch[2].trim();
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
          if (parsedVoice.bodyText) {
            bodyEntries.push({ text: parsedVoice.bodyText, lineNo, voiceId: currentVoiceId });
          }
          continue;
        }
        headers[key] = value;
        continue;
      }

      if (!declaredVoiceIds.includes(currentVoiceId)) {
        declaredVoiceIds.push(currentVoiceId);
      }
      bodyEntries.push({ text: noComment, lineNo, voiceId: currentVoiceId });
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
    let noteCount = 0;

    function ensureVoice(voiceId) {
      if (!Object.prototype.hasOwnProperty.call(measuresByVoice, voiceId)) {
        measuresByVoice[voiceId] = [[]];
      }
      return measuresByVoice[voiceId];
    }

    for (const entry of bodyEntries) {
      const measures = ensureVoice(entry.voiceId);
      let currentMeasure = measures[measures.length - 1];
      let measureAccidentals = {};
      let lastNote = null;
      let lastEventNotes = [];
      let pendingTieToNext = false;
      let pendingTrill = false;
      let pendingTurn: "" | "turn" | "inverted-turn" = "";
      let pendingStaccato = false;
      let pendingSlurStart = 0;
      let pendingRhythmScale = null;
      let tupletRemaining = 0;
      let tupletScale = null;
      let tupletSpec = null;
      let currentMeasureNo = Math.max(1, measures.length);
      let currentEventNo = 0;
      let idx = 0;
      const text = entry.text;

      while (idx < text.length) {
        const ch = text[idx];

        if (ch === " " || ch === "\t") {
          idx += 1;
          continue;
        }

        if (ch === "," || ch === "'") {
          // Lenient compatibility: some real-world sources include standalone octave marks.
          // They are non-standard in strict ABC, but skipping them improves interoperability.
          idx += 1;
          continue;
        }

        if (ch === "|" || ch === ":") {
          if (ch === "|" && (currentMeasure.length > 0 || measures.length === 0)) {
            currentMeasure = [];
            measures.push(currentMeasure);
            currentMeasureNo = Math.max(1, measures.length);
            currentEventNo = 0;
          }
          if (ch === "|") {
            measureAccidentals = {};
            lastNote = null;
          }
          idx += 1;
          continue;
        }

        if (ch === ">" || ch === "<") {
          if (!lastEventNotes || lastEventNotes.length === 0 || lastEventNotes.some((n) => n.isRest)) {
            warnings.push("line " + entry.lineNo + ": broken rhythm(" + ch + ")  has no preceding note; skipped.");
            idx += 1;
            continue;
          }
          const lastScale = ch === ">" ? { num: 3, den: 2 } : { num: 1, den: 2 };
          pendingRhythmScale = ch === ">" ? { num: 1, den: 2 } : { num: 3, den: 2 };
          scaleNotesDuration(lastEventNotes, lastScale);
          idx += 1;
          continue;
        }

        if (ch === "(") {
          const tupletMatch = text.slice(idx).match(/^\((\d)(?::(\d))?(?::(\d))?/);
          if (tupletMatch) {
            const n = Number(tupletMatch[1] || 0);
            const qRaw = tupletMatch[2] ? Number(tupletMatch[2]) : NaN;
            const rRaw = tupletMatch[3] ? Number(tupletMatch[3]) : NaN;
            const q = Number.isFinite(qRaw) && qRaw > 0 ? qRaw : (n === 3 ? 2 : n);
            const r = Number.isFinite(rRaw) && rRaw > 0 ? rRaw : n;
            if (n > 0 && q > 0 && r > 0) {
              tupletScale = { num: q, den: n };
              tupletRemaining = r;
              tupletSpec = { actual: n, normal: q, remaining: r };
            } else {
              warnings.push("line " + entry.lineNo + ": Failed to parse tuplet notation: " + tupletMatch[0]);
            }
            idx += tupletMatch[0].length;
            continue;
          }
          pendingSlurStart += 1;
          idx += 1;
          continue;
        }

        if (ch === "-") {
          if (lastNote && !lastNote.isRest) {
            lastNote.tieStart = true;
            pendingTieToNext = true;
          } else {
            warnings.push("line " + entry.lineNo + ": tie(-)  has no preceding note; skipped.");
          }
          idx += 1;
          continue;
        }

        if (ch === "\"") {
          const endQuote = text.indexOf("\"", idx + 1);
          if (endQuote >= 0) {
            idx = endQuote + 1;
          } else {
            idx = text.length;
          }
          warnings.push("line " + entry.lineNo + ': Skipped inline string ("...").');
          continue;
        }

        if (ch === "!" || ch === "+") {
          const endMark = text.indexOf(ch, idx + 1);
          if (endMark < 0) {
            idx += 1;
            warnings.push("line " + entry.lineNo + ": Unterminated decoration marker: " + ch);
            continue;
          }
          const decoration = text.slice(idx + 1, endMark).trim().toLowerCase();
          if (decoration === "trill" || decoration === "tr" || decoration === "triller") {
            pendingTrill = true;
          } else if (decoration === "turn") {
            pendingTurn = "turn";
          } else if (decoration === "invertedturn" || decoration === "inverted-turn" || decoration === "lowerturn") {
            pendingTurn = "inverted-turn";
          } else if (
            decoration === "staccato" ||
            decoration === "stacc" ||
            decoration === "stac" ||
            decoration === "staccatissimo"
          ) {
            pendingStaccato = true;
          } else if (decoration) {
            warnings.push("line " + entry.lineNo + ": Skipped decoration: " + ch + decoration + ch);
          }
          idx = endMark + 1;
          continue;
        }

        if (ch === "{") {
          const graceResult = parseGraceGroupAt(
            text,
            idx,
            entry.lineNo,
            unitLength,
            keySignatureAccidentals,
            measureAccidentals,
            entry.voiceId
          );
          if (!graceResult) {
            warnings.push("line " + entry.lineNo + ": Failed to parse grace group; skipped.");
            idx += 1;
            continue;
          }
          idx = graceResult.nextIdx;
          for (const graceNote of graceResult.notes) {
            currentMeasure.push(graceNote);
            noteCount += 1;
          }
          continue;
        }

        if (ch === ".") {
          pendingStaccato = true;
          idx += 1;
          continue;
        }

        if (ch === "[") {
          const chordResult = parseChordAt(text, idx, entry.lineNo);
          if (!chordResult) {
            warnings.push("line " + entry.lineNo + ": Failed to parse chord notation; skipped.");
            idx += 1;
            continue;
          }
          idx = chordResult.nextIdx;
          let chordLength = parseLengthToken(chordResult.lengthToken, entry.lineNo);
          if (!chordResult.lengthToken && chordResult.notes.length > 0 && chordResult.notes[0].lengthToken) {
            chordLength = parseLengthToken(chordResult.notes[0].lengthToken, entry.lineNo);
          }
          let absoluteLength = multiplyFractions(unitLength, chordLength);
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
          if (idx < text.length && (text[idx] === ">" || text[idx] === "<")) {
            const rhythmChar = text[idx];
            idx += 1;
            if (rhythmChar === ">") {
              absoluteLength = multiplyFractions(absoluteLength, { num: 3, den: 2 });
              pendingRhythmScale = { num: 1, den: 2 };
            } else {
              absoluteLength = multiplyFractions(absoluteLength, { num: 1, den: 2 });
              pendingRhythmScale = { num: 3, den: 2 };
            }
          }
          const dur = durationInDivisions(absoluteLength, 960);
          if (dur <= 0) {
            throw new Error("line " + entry.lineNo + ": Invalid length");
          }
          const chordNotes = [];
          currentEventNo += 1;
          const trillHint = trillWidthHintByKey.get(`${entry.voiceId}#${currentMeasureNo}#${currentEventNo}`) || "";
          for (let chordIndex = 0; chordIndex < chordResult.notes.length; chordIndex += 1) {
            const chordNote = chordResult.notes[chordIndex];
            const note = buildNoteData(
              chordNote.pitchChar,
              chordNote.accidentalText,
              chordNote.octaveShift,
              absoluteLength,
              dur,
              entry.lineNo,
              keySignatureAccidentals,
              measureAccidentals
            );
            note.voice = entry.voiceId;
            if (chordIndex === 0 && pendingTrill && !note.isRest) {
              note.trill = true;
              pendingTrill = false;
            }
            if (chordIndex === 0 && pendingTurn && !note.isRest) {
              note.turnType = pendingTurn;
              pendingTurn = "";
            }
            if (chordIndex === 0 && pendingSlurStart > 0 && !note.isRest) {
              note.slurStart = true;
              pendingSlurStart = 0;
            }
            if (chordIndex === 0 && note.trill && trillHint) {
              note.trillAccidentalText = trillHint;
            }
            if (chordIndex === 0 && pendingStaccato && !note.isRest) {
              note.staccato = true;
              pendingStaccato = false;
            }
            if (chordIndex > 0) {
              note.chord = true;
            }
            if (chordIndex === 0 && activeTuplet) {
              note.timeModification = { actual: activeTuplet.actual, normal: activeTuplet.normal };
              if (activeTuplet.remaining === activeTuplet.actual) {
                note.tupletStart = true;
              }
              if (activeTuplet.remaining === 1) {
                note.tupletStop = true;
              }
            }
            chordNotes.push(note);
          }
          if (pendingTieToNext && chordNotes.length > 0) {
            chordNotes[0].tieStop = true;
            pendingTieToNext = false;
          }
          for (const note of chordNotes) {
            currentMeasure.push(note);
          }
          lastNote = chordNotes[0] || null;
          lastEventNotes = chordNotes;
          noteCount += chordNotes.length;
          continue;
        }

        if (ch === ")") {
          if (lastNote && !lastNote.isRest) {
            lastNote.slurStop = true;
          } else {
            warnings.push("line " + entry.lineNo + ": slur stop()) has no preceding note; skipped.");
          }
          idx += 1;
          continue;
        }

        if (ch === "]" || ch === "}") {
          warnings.push("line " + entry.lineNo + ": Skipped unsupported notation: " + ch);
          idx += 1;
          continue;
        }

        let accidentalText = "";
        while (idx < text.length && (text[idx] === "^" || text[idx] === "_" || text[idx] === "=")) {
          accidentalText += text[idx];
          idx += 1;
          if (accidentalText === "=" || accidentalText.startsWith("^") || accidentalText.startsWith("_")) {
            if (accidentalText.length >= 2 && accidentalText[0] !== accidentalText[1]) {
              break;
            }
            if (accidentalText.length >= 2 && accidentalText[0] === "=") {
              accidentalText = "=";
              break;
            }
          }
        }

        const pitchChar = text[idx];
        if (!pitchChar || !/[A-Ga-gzZxX]/.test(pitchChar)) {
          throw new Error("line " + entry.lineNo + ": Failed to parse note/rest: " + text.slice(idx, idx + 12));
        }
        idx += 1;

        let octaveShift = "";
        while (idx < text.length && (text[idx] === "'" || text[idx] === ",")) {
          octaveShift += text[idx];
          idx += 1;
        }

        let lengthToken = "";
        const lengthMatch = text.slice(idx).match(/^(\d+\/\d+|\d+|\/\d+|\/)/);
        if (lengthMatch) {
          lengthToken = lengthMatch[1];
          idx += lengthToken.length;
        }

        const len = parseLengthToken(lengthToken, entry.lineNo);
        let absoluteLength = multiplyFractions(unitLength, len);
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

        if (idx < text.length && (text[idx] === ">" || text[idx] === "<")) {
          const rhythmChar = text[idx];
          idx += 1;
          if (rhythmChar === ">") {
            absoluteLength = multiplyFractions(absoluteLength, { num: 3, den: 2 });
            pendingRhythmScale = { num: 1, den: 2 };
          } else {
            absoluteLength = multiplyFractions(absoluteLength, { num: 1, den: 2 });
            pendingRhythmScale = { num: 3, den: 2 };
          }
        }

        const dur = durationInDivisions(absoluteLength, 960);
        if (dur <= 0) {
          throw new Error("line " + entry.lineNo + ": Invalid length");
        }

        const note = buildNoteData(
          pitchChar,
          accidentalText,
          octaveShift,
          absoluteLength,
          dur,
          entry.lineNo,
          keySignatureAccidentals,
          measureAccidentals
        );
        if (pendingTrill && !note.isRest) {
          note.trill = true;
          pendingTrill = false;
        }
        if (pendingTurn && !note.isRest) {
          note.turnType = pendingTurn;
          pendingTurn = "";
        }
        if (pendingSlurStart > 0 && !note.isRest) {
          note.slurStart = true;
          pendingSlurStart = 0;
        }
        currentEventNo += 1;
        const trillHint = trillWidthHintByKey.get(`${entry.voiceId}#${currentMeasureNo}#${currentEventNo}`) || "";
        if (note.trill && trillHint) {
          note.trillAccidentalText = trillHint;
        }
        if (pendingStaccato && !note.isRest) {
          note.staccato = true;
          pendingStaccato = false;
        }
        if (pendingTieToNext && !note.isRest) {
          note.tieStop = true;
          pendingTieToNext = false;
        } else if (note.isRest && pendingTieToNext) {
          warnings.push("line " + entry.lineNo + ": tie(-) was followed by a rest; tie removed.");
          pendingTieToNext = false;
        }
        if (activeTuplet) {
          note.timeModification = { actual: activeTuplet.actual, normal: activeTuplet.normal };
          if (activeTuplet.remaining === activeTuplet.actual) {
            note.tupletStart = true;
          }
          if (activeTuplet.remaining === 1) {
            note.tupletStop = true;
          }
        }
        note.voice = entry.voiceId;
        currentMeasure.push(note);
        lastNote = note;
        lastEventNotes = [note];
        noteCount += 1;
      }
    }

    for (const voiceId of Object.keys(measuresByVoice)) {
      const measures = measuresByVoice[voiceId];
      while (measures.length > 1 && measures[measures.length - 1].length === 0) {
        measures.pop();
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
      const measureMetaByIndex: Record<number, { number: string; implicit: boolean; repeat: string; repeatTimes: number | null }> = {};
      for (let m = 1; m <= normalizedMeasures.length; m += 1) {
        const hinted = keyHintFifthsByKey.get(`${voiceId}#${m}`);
        if (Number.isFinite(hinted)) {
          keyByMeasure[m] = Number(hinted);
        }
        const meta = measureMetaByKey.get(`${voiceId}#${m}`);
        if (meta) {
          measureMetaByIndex[m] = meta;
        }
      }
      return {
        partId: "P" + String(index + 1),
        partName,
        clef: voiceClefById[voiceId] || "",
        transpose,
        voiceId,
        keyByMeasure,
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
      return { name: "", clef: "", transpose: null, bodyText: "" };
    }
    let bodyText = String(raw);
    let name = "";
    let clef = "";
    let transpose = null;
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
      }
      return " ";
    });
    return {
      name: name.trim(),
      clef: clef.trim(),
      transpose,
      bodyText: bodyText.trim()
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

  function parseChordAt(text, startIdx, lineNo) {
    if (text[startIdx] !== "[") {
      return null;
    }
    const closeIdx = text.indexOf("]", startIdx + 1);
    if (closeIdx < 0) {
      return null;
    }
    const inner = text.slice(startIdx + 1, closeIdx);
    const noteRegex = /(\^{1,2}|_{1,2}|=)?([A-Ga-g])([',]*)(\d+\/\d+|\d+|\/\d+|\/)?/g;
    const notes = [];
    let match;
    while ((match = noteRegex.exec(inner)) !== null) {
      notes.push({
        accidentalText: match[1] || "",
        pitchChar: match[2],
        octaveShift: match[3] || "",
        lengthToken: match[4] || ""
      });
    }
    if (notes.length === 0) {
      return null;
    }
    const after = text.slice(closeIdx + 1);
    const lengthMatch = after.match(/^(\d+\/\d+|\d+|\/\d+|\/)/);
    const lengthToken = lengthMatch ? lengthMatch[1] : "";
    const nextIdx = closeIdx + 1 + (lengthMatch ? lengthMatch[1].length : 0);
    return {
      notes,
      lengthToken,
      nextIdx
    };
  }

  function parseGraceGroupAt(text, startIdx, lineNo, unitLength, keySignatureAccidentals, measureAccidentals, voiceId) {
    if (text[startIdx] !== "{") return null;
    const closeIdx = text.indexOf("}", startIdx + 1);
    if (closeIdx < 0) return null;
    const inner = text.slice(startIdx + 1, closeIdx);
    const graceAccidentals = { ...measureAccidentals };
    const notes = [];
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
      let accidentalText = "";
      while (idx < inner.length && (inner[idx] === "^" || inner[idx] === "_" || inner[idx] === "=")) {
        accidentalText += inner[idx];
        idx += 1;
      }
      const pitchChar = inner[idx];
      if (!pitchChar || !/[A-Ga-gzZxX]/.test(pitchChar)) {
        idx += 1;
        continue;
      }
      idx += 1;
      let octaveShift = "";
      while (idx < inner.length && (inner[idx] === "'" || inner[idx] === ",")) {
        octaveShift += inner[idx];
        idx += 1;
      }
      let lengthToken = "";
      const lengthMatch = inner.slice(idx).match(/^(\d+\/\d+|\d+|\/\d+|\/)/);
      if (lengthMatch) {
        lengthToken = lengthMatch[1];
        idx += lengthToken.length;
      }
      const len = parseLengthToken(lengthToken, lineNo);
      const absoluteLength = multiplyFractions(unitLength, len);
      const dur = durationInDivisions(absoluteLength, 960);
      if (dur <= 0) continue;
      const note = buildNoteData(
        pitchChar,
        accidentalText,
        octaveShift,
        absoluteLength,
        dur,
        lineNo,
        keySignatureAccidentals,
        graceAccidentals
      );
      note.voice = voiceId;
      note.grace = true;
      note.graceSlash = graceSlashPending;
      graceSlashPending = false;
      notes.push(note);
    }
    return { notes, nextIdx: closeIdx + 1 };
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
  const emittedKeyMetaByVoiceMeasure = new Set<string>();
  const emitDiagMetaForMeasure = (
    normalizedVoiceId: string,
    measure: Element,
    safeMeasureNumber: number
  ): void => {
    const fields = Array.from(
      measure.querySelectorAll(
        ':scope > attributes > miscellaneous > miscellaneous-field[name^="diag:"]'
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
      if (a === "diag:count") return -1;
      if (b === "diag:count") return 1;
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
      let lastEmittedKeyFifths: number | null = null;
      let currentBeats = Number(meterBeats) || 4;
      let currentBeatType = Number(meterBeatType) || 4;
      const measureTexts: string[] = [];
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
        const leftRepeatDir = (leftRepeatNode?.getAttribute("direction") || "").trim().toLowerCase();
        const rightRepeatDir = (rightRepeatNode?.getAttribute("direction") || "").trim().toLowerCase();
        const repeatDir =
          rightRepeatDir === "backward"
            ? "backward"
            : (leftRepeatDir === "forward" ? "forward" : "");
        const repeatTimes = Number.parseInt(String(rightRepeatNode?.getAttribute("times") || ""), 10);
        if (isImplicit || repeatDir || rawMeasureNumber !== String(safeMeasureNumber)) {
          const metaChunks = [
            `%@mks measure voice=${normalizedVoiceId} measure=${safeMeasureNumber}`,
            `number=${rawMeasureNumber}`,
            `implicit=${isImplicit ? 1 : 0}`,
          ];
          if (repeatDir) {
            metaChunks.push(`repeat=${repeatDir}`);
          }
          if (repeatDir === "backward" && Number.isFinite(repeatTimes) && repeatTimes > 1) {
            metaChunks.push(`times=${Math.round(repeatTimes)}`);
          }
          metaLines.push(metaChunks.join(" "));
        }
        emitDiagMetaForMeasure(normalizedVoiceId, measure, safeMeasureNumber);
        const isFirstMeasureForLane = measureTexts.length === 0;
        const hasExplicitKeyInMeasure = parsedFifths !== null;
        const shouldEmitMeasureHint = hasExplicitKeyInMeasure || isFirstMeasureForLane;
        if (shouldEmitMeasureHint) {
          if (lastEmittedKeyFifths === null || lastEmittedKeyFifths !== currentFifths) {
            const metaKey = `${normalizedVoiceId}#${safeMeasureNumber}`;
            if (!emittedKeyMetaByVoiceMeasure.has(metaKey)) {
              metaLines.push(
                `%@mks key voice=${normalizedVoiceId} measure=${safeMeasureNumber} fifths=${Math.max(-7, Math.min(7, Math.round(currentFifths)))}`
              );
              emittedKeyMetaByVoiceMeasure.add(metaKey);
            }
            lastEmittedKeyFifths = currentFifths;
          }
        }
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
          const hasWavyLineStart = Array.from(
            child.querySelectorAll(":scope > notations > ornaments > wavy-line")
          ).some((node) => {
            const type = (node.getAttribute("type") ?? "").trim().toLowerCase();
            return type === "" || type === "start";
          });
          const hasTrill = hasTrillMark || hasWavyLineStart;
          const turnType: "" | "turn" | "inverted-turn" = hasInvertedTurn ? "inverted-turn" : (hasTurn ? "turn" : "");
          const trillAccidentalText = child.querySelector(":scope > notations > ornaments > accidental-mark")?.textContent?.trim() || "";
          const hasStaccato = Boolean(child.querySelector(":scope > notations > articulations > staccato"));
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
            const accidentalText = child.querySelector(":scope > accidental")?.textContent?.trim() ?? "";
            const accidentalAlter = accidentalTextToAlter(accidentalText);

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
          const trillPrefix = hasTrill ? "!trill!" : "";
          const turnPrefix = turnType === "inverted-turn" ? "!invertedturn!" : (turnType === "turn" ? "!turn!" : "");
          const staccatoPrefix = hasStaccato ? "!staccato!" : "";
          const slurStartPrefix = hasSlurStart ? "(" : "";
          const eventPrefix = `${tupletPrefix}${slurStartPrefix}${gracePrefix}${trillPrefix}${turnPrefix}${staccatoPrefix}`;
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
        measureTexts.push(tokens.join(" "));
      }

      bodyLines.push(`V:${normalizedVoiceId}`);
      bodyLines.push(`${measureTexts.join(" | ")} |`);
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
  step?: string;
  octave?: number;
  alter?: number | null;
  accidentalText?: string | null;
  tieStart?: boolean;
  tieStop?: boolean;
  slurStart?: boolean;
  slurStop?: boolean;
  chord?: boolean;
  grace?: boolean;
  graceSlash?: boolean;
  trill?: boolean;
  trillAccidentalText?: string;
  turnType?: "turn" | "inverted-turn";
  staccato?: boolean;
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
  measureMetaByIndex?: Record<number, { number: string; implicit: boolean; repeat: string; repeatTimes: number | null }>;
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
  xml += `<miscellaneous-field name="mks:abc-meta-count">${toHex(notes.length, 4)}</miscellaneous-field>`;
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
    xml += `<miscellaneous-field name="mks:abc-meta-${String(i + 1).padStart(4, "0")}">${payload}</miscellaneous-field>`;
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
  xml += `<miscellaneous-field name="src:abc:raw-encoding">escape-v1</miscellaneous-field>`;
  xml += `<miscellaneous-field name="src:abc:raw-length">${xmlEscape(String(source.length))}</miscellaneous-field>`;
  xml += `<miscellaneous-field name="src:abc:raw-encoded-length">${xmlEscape(String(encoded.length))}</miscellaneous-field>`;
  xml += `<miscellaneous-field name="src:abc:raw-chunks">${xmlEscape(String(chunks.length))}</miscellaneous-field>`;
  xml += `<miscellaneous-field name="src:abc:raw-truncated">${truncated ? "1" : "0"}</miscellaneous-field>`;
  for (let i = 0; i < chunks.length; i += 1) {
    xml += `<miscellaneous-field name="src:abc:raw-${String(i + 1).padStart(4, "0")}">${xmlEscape(chunks[i])}</miscellaneous-field>`;
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
  xml += `<miscellaneous-field name="diag:count">${maxEntries}</miscellaneous-field>`;
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
    xml += `<miscellaneous-field name="diag:${String(i + 1).padStart(4, "0")}">${payload}</miscellaneous-field>`;
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
  const measureCount = parts.reduce((max, part) => Math.max(max, part.measures.length), 1);
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

  const partListXml = parts
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

  const partBodyXml = parts
    .map((part, partIndex) => {
      const measuresXml: string[] = [];
      let currentPartFifths = Math.max(-7, Math.min(7, Math.round(defaultFifths)));
      for (let i = 0; i < measureCount; i += 1) {
        const measureNo = i + 1;
        const notes = part.measures[i] ?? [];
        const measureMeta = part.measureMetaByIndex?.[measureNo] ?? null;
        const hintedFifths = Number.isFinite(part.keyByMeasure?.[measureNo])
          ? Math.max(-7, Math.min(7, Math.round(Number(part.keyByMeasure?.[measureNo]))))
          : null;
        if (hintedFifths !== null) {
          currentPartFifths = hintedFifths;
        }
        const header =
          i === 0
            ? [
                "<attributes>",
                "<divisions>960</divisions>",
                `<key><fifths>${Math.round(currentPartFifths)}</fifths></key>`,
                `<time><beats>${Math.round(beats)}</beats><beat-type>${Math.round(beatType)}</beat-type></time>`,
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
                tempoBpm !== null && partIndex === 0
                  ? `<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${tempoBpm}</per-minute></metronome></direction-type><sound tempo="${tempoBpm}"/></direction>`
                  : "",
              ].join("")
            : hintedFifths !== null
              ? `<attributes><key><fifths>${Math.round(currentPartFifths)}</fifths></key></attributes>`
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
                  const chunks: string[] = ["<note>"];
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
                    chunks.push(`<accidental>${xmlEscape(String(note.accidentalText))}</accidental>`);
                  }
                  if (note.tieStart) chunks.push('<tie type="start"/>');
                  if (note.tieStop) chunks.push('<tie type="stop"/>');
                  if (
                    note.tieStart ||
                    note.tieStop ||
                    note.slurStart ||
                    note.slurStop ||
                    note.trill ||
                    note.turnType ||
                    note.staccato ||
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
                    if (note.trill) {
                      const trillParts: string[] = [];
                      trillParts.push("<trill-mark/>");
                      if (note.trillAccidentalText) {
                        trillParts.push(`<accidental-mark>${xmlEscape(String(note.trillAccidentalText))}</accidental-mark>`);
                      }
                      chunks.push(`<ornaments>${trillParts.join("")}</ornaments>`);
                    }
                    if (note.turnType) {
                      const tag = note.turnType === "inverted-turn" ? "inverted-turn" : "turn";
                      chunks.push(`<ornaments><${tag}/></ornaments>`);
                    }
                    if (note.staccato) chunks.push("<articulations><staccato/></articulations>");
                    chunks.push("</notations>");
                  }
                  chunks.push("</note>");
                  return chunks.join("");
                })
                .join("");
              })()
            : `<note><rest/><duration>${measureDurationDiv}</duration><voice>1</voice><type>${emptyMeasureRestType}</type></note>`;

        const xmlMeasureNumber = xmlEscape(String(measureMeta?.number || measureNo));
        const implicitAttr = measureMeta?.implicit ? ' implicit="yes"' : "";
        const repeatStartXml =
          measureMeta?.repeat === "forward"
            ? '<barline location="left"><repeat direction="forward" winged="none"/></barline>'
            : "";
        const repeatEndXml =
          measureMeta?.repeat === "backward"
            ? `<barline location="right"><repeat direction="backward" winged="none"${
                Number.isFinite(measureMeta.repeatTimes) && Number(measureMeta.repeatTimes) > 1
                  ? ` times="${Math.round(Number(measureMeta.repeatTimes))}"`
                  : ""
              }/></barline>`
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
          `<measure number="${xmlMeasureNumber}"${implicitAttr}>${repeatStartXml}${header}${debugMiscXml}${diagMiscXml}${sourceMiscXml}${notesXml}${repeatEndXml}</measure>`
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
