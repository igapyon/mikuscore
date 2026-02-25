import { describe, expect, it } from "vitest";
import {
  accidentalTextFromAlter,
  keySignatureAlterForStep,
  midiToPitch,
  resolveAccidentalTextForPitch,
} from "../../core/accidentalSpelling";

describe("accidentalSpelling", () => {
  it("maps key signature sharps/flats to default alters", () => {
    expect(keySignatureAlterForStep(4, "F")).toBe(1);
    expect(keySignatureAlterForStep(4, "D")).toBe(1);
    expect(keySignatureAlterForStep(4, "B")).toBe(0);
    expect(keySignatureAlterForStep(-3, "B")).toBe(-1);
    expect(keySignatureAlterForStep(-3, "A")).toBe(-1);
    expect(keySignatureAlterForStep(-3, "F")).toBe(0);
  });

  it("chooses pitch spelling from midi with key preference", () => {
    const sharp = midiToPitch(61, { keyFifths: 4 });
    const flat = midiToPitch(61, { keyFifths: -4 });
    expect(`${sharp.step}${sharp.alter}`).toBe("C1");
    expect(`${flat.step}${flat.alter}`).toBe("D-1");
  });

  it("resolves natural accidental when canceling key signature", () => {
    const state = new Map<string, number>();
    const p = midiToPitch(62, { keyFifths: 4 });
    const text = resolveAccidentalTextForPitch(p, {
      keyFifths: 4,
      previousAlterByPitchKey: state,
      pitchKey: "1:4:D",
    });
    expect(text).toBe("natural");
  });

  it("maps alter value to accidental text", () => {
    expect(accidentalTextFromAlter(-2)).toBe("flat-flat");
    expect(accidentalTextFromAlter(-1)).toBe("flat");
    expect(accidentalTextFromAlter(0)).toBe("natural");
    expect(accidentalTextFromAlter(1)).toBe("sharp");
    expect(accidentalTextFromAlter(2)).toBe("double-sharp");
  });
});
