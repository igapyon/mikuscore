export type SpelledPitch = {
  step: string;
  alter: number;
  octave: number;
};

export const midiToPitch = (
  midiNumber: number,
  options?: { keyFifths?: number | null; preferAccidental?: string | null }
): SpelledPitch => {
  const n = Math.max(0, Math.min(127, Math.round(midiNumber)));
  const octave = Math.floor(n / 12) - 1;
  const semitone = n % 12;
  const sharpTable: Array<{ step: string; alter: number }> = [
    { step: "C", alter: 0 },
    { step: "C", alter: 1 },
    { step: "D", alter: 0 },
    { step: "D", alter: 1 },
    { step: "E", alter: 0 },
    { step: "F", alter: 0 },
    { step: "F", alter: 1 },
    { step: "G", alter: 0 },
    { step: "G", alter: 1 },
    { step: "A", alter: 0 },
    { step: "A", alter: 1 },
    { step: "B", alter: 0 },
  ];
  const flatTable: Array<{ step: string; alter: number }> = [
    { step: "C", alter: 0 },
    { step: "D", alter: -1 },
    { step: "D", alter: 0 },
    { step: "E", alter: -1 },
    { step: "E", alter: 0 },
    { step: "F", alter: 0 },
    { step: "G", alter: -1 },
    { step: "G", alter: 0 },
    { step: "A", alter: -1 },
    { step: "A", alter: 0 },
    { step: "B", alter: -1 },
    { step: "B", alter: 0 },
  ];
  const pref = String(options?.preferAccidental ?? "").trim().toLowerCase();
  const preferFlatByAccidental = pref === "flat" || pref === "flat-flat";
  const preferSharpByAccidental = pref === "sharp" || pref === "double-sharp";
  const keyFifths = Number(options?.keyFifths ?? 0);
  const preferFlatByKey = Number.isFinite(keyFifths) && keyFifths < 0;
  const preferFlat = preferFlatByAccidental || (!preferSharpByAccidental && preferFlatByKey);
  const table = preferFlat ? flatTable : sharpTable;
  const mapped = table[semitone] ?? { step: "C", alter: 0 };
  return { step: mapped.step, alter: mapped.alter, octave };
};

export const keySignatureAlterForStep = (fifths: number, step: string): number => {
  const sharps = ["F", "C", "G", "D", "A", "E", "B"];
  const flats = ["B", "E", "A", "D", "G", "C", "F"];
  const s = String(step || "").trim().toUpperCase();
  if (!s) return 0;
  const n = Math.max(-7, Math.min(7, Math.round(Number(fifths) || 0)));
  if (n > 0 && sharps.slice(0, n).includes(s)) return 1;
  if (n < 0 && flats.slice(0, Math.abs(n)).includes(s)) return -1;
  return 0;
};

export const accidentalTextFromAlter = (alter: number): string | null => {
  switch (Math.round(alter)) {
    case -2:
      return "flat-flat";
    case -1:
      return "flat";
    case 0:
      return "natural";
    case 1:
      return "sharp";
    case 2:
      return "double-sharp";
    default:
      return null;
  }
};

export const resolveAccidentalTextForPitch = (
  pitch: SpelledPitch,
  options: {
    keyFifths: number;
    previousAlterByPitchKey: Map<string, number>;
    pitchKey: string;
    preferredAccidentalText?: string | null;
  }
): string => {
  const alter = Math.round(pitch.alter);
  const keyAlter = keySignatureAlterForStep(options.keyFifths, pitch.step);
  const activeAlter = options.previousAlterByPitchKey.has(options.pitchKey)
    ? (options.previousAlterByPitchKey.get(options.pitchKey) as number)
    : keyAlter;
  let accidentalText = (options.preferredAccidentalText ?? "").trim();
  if (!accidentalText && alter !== activeAlter) {
    accidentalText = accidentalTextFromAlter(alter) ?? "";
  }
  options.previousAlterByPitchKey.set(options.pitchKey, alter);
  return accidentalText;
};
