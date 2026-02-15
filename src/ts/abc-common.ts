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
  throw new Error(`line ${lineNo}: 長さ指定を解釈できません: ${token}`);
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
