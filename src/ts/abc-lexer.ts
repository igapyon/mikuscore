/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

export type AbcLengthTokenLex = {
  token: string;
  nextIdx: number;
};

export type AbcAccidentalLex = {
  accidentalText: string;
  nextIdx: number;
};

export type AbcNoteLex = {
  accidentalText: string;
  pitchChar: string;
  octaveShift: string;
  lengthToken: string;
  nextIdx: number;
};

export const lexAbcLengthToken = (text: string, startIdx: number): AbcLengthTokenLex | null => {
  const start = Math.max(0, Number(startIdx) || 0);
  const first = text[start];
  if (!first) return null;

  if (first === "/") {
    let idx = start;
    while (text[idx] === "/") {
      idx += 1;
    }
    if (idx > start + 1) {
      return { token: text.slice(start, idx), nextIdx: idx };
    }
    while (/\d/.test(text[idx] || "")) {
      idx += 1;
    }
    return { token: text.slice(start, idx), nextIdx: idx };
  }

  if (!/\d/.test(first)) {
    return null;
  }

  let idx = start;
  while (/\d/.test(text[idx] || "")) {
    idx += 1;
  }
  if (text[idx] === "/") {
    idx += 1;
    while (/\d/.test(text[idx] || "")) {
      idx += 1;
    }
  }
  return { token: text.slice(start, idx), nextIdx: idx };
};

export const lexAbcAccidental = (text: string, startIdx: number): AbcAccidentalLex | null => {
  let idx = Math.max(0, Number(startIdx) || 0);
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
  return accidentalText ? { accidentalText, nextIdx: idx } : null;
};

export const lexAbcNote = (text: string, startIdx: number): AbcNoteLex | null => {
  let idx = Math.max(0, Number(startIdx) || 0);
  const accidental = lexAbcAccidental(text, idx);
  const accidentalText = accidental?.accidentalText || "";
  if (accidental) {
    idx = accidental.nextIdx;
  }

  const pitchChar = text[idx];
  if (!pitchChar || !/[A-Ga-gzZxX]/.test(pitchChar)) {
    return null;
  }
  idx += 1;

  const octaveStart = idx;
  while (text[idx] === "'" || text[idx] === ",") {
    idx += 1;
  }
  const octaveShift = text.slice(octaveStart, idx);

  const length = lexAbcLengthToken(text, idx);
  const lengthToken = length?.token || "";
  if (length) {
    idx = length.nextIdx;
  }

  return {
    accidentalText,
    pitchChar,
    octaveShift,
    lengthToken,
    nextIdx: idx,
  };
};