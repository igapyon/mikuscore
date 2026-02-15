// @ts-nocheck
import { AbcCommon } from "./abc-common";

const abcCommon = AbcCommon;

  function parseForMusicXml(source, settings) {
    const warnings = [];
    const lines = String(source || "").split("\n");
    const headers = {};
    const bodyEntries = [];
    const declaredVoiceIds = [];
    const voiceNameById = {};
    let currentVoiceId = "1";
    let scoreDirective = "";

    for (let i = 0; i < lines.length; i += 1) {
      const lineNo = i + 1;
      const raw = lines[i];
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
      throw new Error("本文が見つかりません。ABCのノート列を入力してください。 (line 1)");
    }

    const meter = parseMeter(headers.M || "4/4", warnings);
    const unitLength = parseFraction(headers.L || "1/8", "L", warnings);
    const keyInfo = parseKey(headers.K || "C", warnings);
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
      let pendingRhythmScale = null;
      let tupletRemaining = 0;
      let tupletScale = null;
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
            warnings.push("line " + entry.lineNo + ": broken rhythm(" + ch + ") の前にノートがないためスキップしました。");
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
            } else {
              warnings.push("line " + entry.lineNo + ": 連符記法の解釈に失敗しました: " + tupletMatch[0]);
            }
            idx += tupletMatch[0].length;
            continue;
          }
          warnings.push("line " + entry.lineNo + ": 非対応の連符記法をスキップしました: (");
          idx += 1;
          continue;
        }

        if (ch === "-") {
          if (lastNote && !lastNote.isRest) {
            lastNote.tieStart = true;
            pendingTieToNext = true;
          } else {
            warnings.push("line " + entry.lineNo + ": tie(-) の前にノートがないためスキップしました。");
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
          warnings.push("line " + entry.lineNo + ': インライン文字列("...")はスキップしました。');
          continue;
        }

        if (ch === "!" || ch === "+") {
          const endMark = text.indexOf(ch, idx + 1);
          if (endMark >= 0) {
            idx = endMark + 1;
          } else {
            idx += 1;
          }
          warnings.push("line " + entry.lineNo + ": 装飾記法をスキップしました: " + ch + "..." + ch);
          continue;
        }

        if (ch === "[") {
          const chordResult = parseChordAt(text, idx, entry.lineNo);
          if (!chordResult) {
            warnings.push("line " + entry.lineNo + ": 和音記法の解釈に失敗したためスキップしました。");
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
          if (tupletRemaining > 0 && tupletScale) {
            absoluteLength = multiplyFractions(absoluteLength, tupletScale);
            tupletRemaining -= 1;
            if (tupletRemaining <= 0) {
              tupletScale = null;
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
            throw new Error("line " + entry.lineNo + ": 長さが不正です");
          }
          const chordNotes = [];
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
            if (chordIndex > 0) {
              note.chord = true;
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

        if (ch === "]" || ch === ")" || ch === "{" || ch === "}") {
          warnings.push("line " + entry.lineNo + ": 非対応記法をスキップしました: " + ch);
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
          throw new Error("line " + entry.lineNo + ": ノート/休符の解釈に失敗しました: " + text.slice(idx, idx + 12));
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
        if (tupletRemaining > 0 && tupletScale) {
          absoluteLength = multiplyFractions(absoluteLength, tupletScale);
          tupletRemaining -= 1;
          if (tupletRemaining <= 0) {
            tupletScale = null;
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
          throw new Error("line " + entry.lineNo + ": 長さが不正です");
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
        if (pendingTieToNext && !note.isRest) {
          note.tieStop = true;
          pendingTieToNext = false;
        } else if (note.isRest && pendingTieToNext) {
          warnings.push("line " + entry.lineNo + ": tie(-) の後ろが休符のため tie を解除しました。");
          pendingTieToNext = false;
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
      throw new Error("ノートまたは休符が見つかりませんでした。 (line 1)");
    }

    const orderedVoiceIds = parseScoreVoiceOrder(scoreDirective, declaredVoiceIds);
    const parts = orderedVoiceIds.map((voiceId, index) => {
      const partName = voiceNameById[voiceId] || ("Voice " + voiceId);
      return {
        partId: "P" + String(index + 1),
        partName,
        transpose: settings.inferTransposeFromPartName ? inferTransposeFromPartName(partName) : null,
        voiceId,
        measures: measuresByVoice[voiceId] || [[]]
      };
    });
    const measureCount = parts.reduce((acc, part) => Math.max(acc, part.measures.length), 0);

    return {
      meta: {
        title: headers.T || settings.defaultTitle,
        composer: headers.C || settings.defaultComposer,
        meter,
        meterText: headers.M || "4/4",
        unitLength,
        unitLengthText: headers.L || "1/8",
        keyInfo,
        keyText: headers.K || "C"
      },
      parts,
      measures: parts[0] ? parts[0].measures : [[]],
      voiceCount: parts.length,
      measureCount,
      noteCount,
      warnings
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
      return { name: "", bodyText: "" };
    }
    let bodyText = String(raw);
    let name = "";
    const attrRegex = /([A-Za-z][A-Za-z0-9_-]*)\s*=\s*("([^"]*)"|(\S+))/g;
    bodyText = bodyText.replace(attrRegex, (_full, key, _quotedValue, quotedInner, bareValue) => {
      if (String(key).toLowerCase() === "name") {
        name = quotedInner || bareValue || "";
      }
      return " ";
    });
    return {
      name: name.trim(),
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
      warnings.push("拍子 M: の形式が不正なため 4/4 を使用しました: " + raw);
      return { beats: 4, beatType: 4 };
    }
    return { beats: Number(m[1]), beatType: Number(m[2]) };
  }

  function parseFraction(raw, fieldName, warnings) {
    const parsed = abcCommon.parseFractionText(raw, { num: 1, den: 8 });
    if (parsed.num === 1 && parsed.den === 8 && !/^\s*\d+\/\d+\s*$/.test(String(raw || ""))) {
      warnings.push(fieldName + " の形式が不正なため 1/8 を使用しました: " + raw);
      return parsed;
    }
    const m = String(raw || "").match(/^\s*(\d+)\/(\d+)\s*$/);
    if (!m || !Number(m[1]) || !Number(m[2])) {
      warnings.push(fieldName + " の値が不正なため 1/8 を使用しました: " + raw);
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

    warnings.push("K: 非対応キーのため C を使用しました: " + key);
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
      throw new Error("line " + lineNo + ": オクターブが範囲外です");
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

  function multiplyFractions(a, b) {
    return abcCommon.multiplyFractions(a, b, { num: 1, den: 1 });
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
