/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";
import {
  parseAbcBareRepeatEndingMarkerAt,
  parseAbcBodyEntryAt,
  parseAbcBodyTokenAt,
  parseAbcBracketTokenAt,
  parseAbcBrokenRhythmAt,
  parseAbcBarlineTokenAt,
  parseAbcDecorationAt,
  parseAbcDelimitedSpanAt,
  parseAbcInlineFieldAt,
  parseAbcParenTokenAt,
  parseAbcPlayableEventAt,
  parseAbcQuotedStringAt,
  parseAbcRepeatEndingMarkerAt,
  parseAbcSingleCharShorthandAt,
  parseAbcSlurStopAt,
  parseAbcStandaloneBodyFieldAt,
  parseAbcTieAt,
  parseAbcUnsupportedBodyNumberAt,
  parseAbcUnsupportedBodyTokenAt,
} from "../../src/ts/abc-parser";

// Atomic token and payload helpers.
const pitchSource = (pitchChar: string, accidentalText = "", octaveShift = "") => ({
  accidentalText,
  pitchChar,
  octaveShift,
});

// Playable-event helpers.
const playableEvent = (
  source: "note" | "chord",
  pitchChars: string[],
  rawLengthToken: string,
  nextIdx: number
) => ({
  kind: "playable" as const,
  pitchSources: pitchChars.map((pitchChar) => pitchSource(pitchChar)),
  rawLengthToken,
  nextIdx,
  source,
});

const malformedAccidental = (accidentalText: string, nextIdx: number) => ({
  kind: "malformed-accidental" as const,
  accidentalText,
  nextIdx,
});

const invalidChord = (nextIdx: number) => ({
  kind: "invalid-chord" as const,
  nextIdx,
});

// Token result helpers.
const barlineToken = (
  nextIdx: number,
  endsMeasure: boolean,
  repeatEnd: boolean,
  repeatStart: boolean,
  endingStop: boolean
) => ({
  nextIdx,
  endsMeasure,
  repeatEnd,
  repeatStart,
  endingStop,
});

const brokenRhythmToken = (symbol: ">" | "<", nextIdx: number) => ({
  symbol,
  leftScale: symbol === ">" ? { num: 3, den: 2 } : { num: 1, den: 2 },
  rightScale: symbol === ">" ? { num: 1, den: 2 } : { num: 3, den: 2 },
  nextIdx,
});

const inlineField = (fieldName: string, fieldValue: string, nextIdx: number) => ({
  fieldName,
  fieldValue,
  nextIdx,
});

const repeatEndingMarker = (marker: string, nextIdx: number) => ({
  marker,
  nextIdx,
});

const standaloneBodyField = (fieldName: string, fieldValue: string, token: string, nextIdx: number) => ({
  fieldName,
  fieldValue,
  token,
  nextIdx,
});

const unsupportedBodyToken = (token: string, nextIdx: number) => ({
  token,
  nextIdx,
});

const nextIdxToken = (nextIdx: number) => ({
  nextIdx,
});

const delimitedSpan = (delimiter: string, text: string, nextIdx: number) => ({
  delimiter,
  text,
  nextIdx,
});

const quotedStringToken = (
  rawText: string,
  normalizedText: string,
  nextIdx: number,
  terminated: boolean
) => ({
  rawText,
  normalizedText,
  nextIdx,
  terminated,
});

const singleCharShorthandToken = (kind: string, nextIdx: number) => ({
  kind,
  nextIdx,
});

// Structural token helpers.
const tupletToken = (actual: number, normal: number, count: number, nextIdx: number, raw: string) => ({
  actual,
  normal,
  count,
  nextIdx,
  raw,
});

const parenToken = (kind: string, payload: Record<string, unknown>) => ({
  kind,
  ...payload,
});

// Dispatcher wrapper helpers.
const bracketToken = (kind: string, payload: Record<string, unknown>) => ({
  kind,
  ...payload,
});

const bodyToken = (kind: string, payload: Record<string, unknown>) => ({
  kind,
  ...payload,
});

const bodyEntry = (kind: string, payload: Record<string, unknown>) => ({
  kind,
  ...payload,
});

const decorationToken = (
  rawDecoration: string,
  decoration: string,
  delimiter: string,
  nextIdx: number,
  terminated: boolean
) => ({
  rawDecoration,
  decoration,
  delimiter,
  nextIdx,
  terminated,
});

describe("ABC parser helpers", () => {
  describe("field and barline helpers", () => {
    it("parses inline body fields with normalized field names", () => {
      expect(parseAbcInlineFieldAt("[k: Cmaj ] rest", 0)).toEqual(inlineField("K", "Cmaj", 10));
    });

    it("parses repeat ending markers in bracketed and bare forms", () => {
      expect(parseAbcRepeatEndingMarkerAt("[1,2 C", 0)).toEqual(repeatEndingMarker("1,2", 4));
      expect(parseAbcBareRepeatEndingMarkerAt("2-3 z", 0)).toEqual(repeatEndingMarker("2-3", 3));
    });

    it("parses barline tokens with repeat metadata", () => {
      expect(parseAbcBarlineTokenAt(":|] next", 0)).toEqual(barlineToken(3, true, true, false, true));
      expect(parseAbcBarlineTokenAt(":: next", 0)).toEqual(barlineToken(2, true, true, true, false));
      expect(parseAbcBarlineTokenAt(": orphan", 0)).toEqual(barlineToken(1, false, false, false, false));
    });

    it("returns null when field and barline helpers do not match", () => {
      expect(parseAbcInlineFieldAt("K:C", 0)).toBeNull();
      expect(parseAbcRepeatEndingMarkerAt("|1", 0)).toBeNull();
      expect(parseAbcBareRepeatEndingMarkerAt("abc", 0)).toBeNull();
      expect(parseAbcBarlineTokenAt("abc", 0)).toBeNull();
    });

    it("parses standalone body fields and unsupported fallback tokens", () => {
      expect(parseAbcStandaloneBodyFieldAt("q:120 rest", 0)).toEqual(
        standaloneBodyField("Q", "120", "q:120", 5)
      );
      expect(parseAbcUnsupportedBodyTokenAt("restLike next", 0)).toEqual(unsupportedBodyToken("restLike", 8));
      expect(parseAbcUnsupportedBodyNumberAt("123 abc", 0)).toEqual(unsupportedBodyToken("123", 3));
    });
  });

  describe("span and token helpers", () => {
    it("parses delimited quoted and decoration spans", () => {
      expect(parseAbcDelimitedSpanAt("\"text\" tail", 0, '"')).toEqual(delimitedSpan('"', "\"text\"", 6));
      expect(parseAbcDelimitedSpanAt("!trill!C", 0, "!")).toEqual(delimitedSpan("!", "!trill!", 7));
      expect(parseAbcDelimitedSpanAt("+sym", 0, "+")).toEqual(delimitedSpan("+", "+sym", 4));
    });

    it("parses quoted strings and decorations with termination state", () => {
      expect(parseAbcQuotedStringAt("\"^Cmaj7\" tail", 0)).toEqual(
        quotedStringToken("^Cmaj7", "Cmaj7", 8, true)
      );
      expect(parseAbcQuotedStringAt("\"unterminated", 0)).toEqual(
        quotedStringToken("unterminated", "unterminated", 13, false)
      );
      expect(parseAbcDecorationAt("!Trill!C", 0)).toEqual(decorationToken("Trill", "trill", "!", 7, true));
      expect(parseAbcDecorationAt("+unterminated", 0)).toEqual(
        decorationToken("unterminated", "unterminated", "+", 13, false)
      );
    });

    it("parses broken-rhythm shorthand", () => {
      expect(parseAbcBrokenRhythmAt("> next", 0)).toEqual(brokenRhythmToken(">", 1));
      expect(parseAbcBrokenRhythmAt("< next", 0)).toEqual(brokenRhythmToken("<", 1));
    });

    it("parses single-character body shorthand tokens", () => {
      expect(parseAbcSingleCharShorthandAt("~", 0)).toEqual(singleCharShorthandToken("arpeggiate", 1));
      expect(parseAbcSingleCharShorthandAt("P", 0)).toEqual(singleCharShorthandToken("inverted-mordent", 1));
      expect(parseAbcSingleCharShorthandAt(".", 0)).toEqual(singleCharShorthandToken("staccato", 1));
      expect(parseAbcSingleCharShorthandAt("x", 0)).toBeNull();
    });

    it("parses tie and slur-stop tokens", () => {
      expect(parseAbcTieAt("-", 0)).toEqual(nextIdxToken(1));
      expect(parseAbcSlurStopAt(")", 0)).toEqual(nextIdxToken(1));
      expect(parseAbcTieAt("x", 0)).toBeNull();
      expect(parseAbcSlurStopAt("x", 0)).toBeNull();
    });
  });

  describe("structural token helpers", () => {
    it("parses parenthesis tokens as tuplet or slur-start", () => {
      expect(parseAbcParenTokenAt("(3ABC", 0)).toEqual(
        parenToken("tuplet", { tuplet: tupletToken(3, 2, 3, 2, "(3") })
      );
      expect(parseAbcParenTokenAt("(C", 0)).toEqual(parenToken("slur-start", { nextIdx: 1 }));
      expect(parseAbcParenTokenAt("(", 0)).toEqual(parenToken("slur-start", { nextIdx: 1 }));
      expect(parseAbcParenTokenAt("C", 0)).toBeNull();
    });

    it("parses bracket tokens as inline-field, repeat-ending, or chord-start", () => {
      expect(parseAbcBracketTokenAt("[K:C] C", 0)).toEqual(
        bracketToken("inline-field", { inlineField: inlineField("K", "C", 5) })
      );
      expect(parseAbcBracketTokenAt("[1,2 C", 0)).toEqual(
        bracketToken("repeat-ending", { repeatEndingMarker: repeatEndingMarker("1,2", 4) })
      );
      expect(parseAbcBracketTokenAt("[CEG]2", 0)).toEqual(bracketToken("chord-start", { nextIdx: 1 }));
      expect(parseAbcBracketTokenAt("[", 0)).toEqual(bracketToken("chord-start", { nextIdx: 1 }));
      expect(parseAbcBracketTokenAt("C", 0)).toBeNull();
    });

    it("dispatches common body tokens through a single parser entrypoint", () => {
      expect(parseAbcBodyTokenAt(">A", 0)).toEqual(
        bodyToken("broken-rhythm", { brokenRhythm: brokenRhythmToken(">", 1) })
      );
      expect(parseAbcBodyTokenAt("\"txt\"", 0)).toEqual(
        bodyToken("quoted-string", { quotedString: quotedStringToken("txt", "txt", 5, true) })
      );
      expect(parseAbcBodyTokenAt("!trill!", 0)).toEqual(
        bodyToken("decoration", { decoration: decorationToken("trill", "trill", "!", 7, true) })
      );
      expect(parseAbcBodyTokenAt("[K:C]", 0)).toEqual(
        bodyToken("bracket", {
          bracketToken: bracketToken("inline-field", { inlineField: inlineField("K", "C", 5) }),
        })
      );
      expect(parseAbcBodyTokenAt(")", 0)).toEqual(bodyToken("slur-stop", { slurStop: nextIdxToken(1) }));
      expect(parseAbcBodyTokenAt("-", 0)).toEqual(bodyToken("tie", { tie: nextIdxToken(1) }));
      expect(parseAbcBodyTokenAt("C", 0)).toBeNull();
    });
  });

  describe("high-level entrypoints", () => {
    it("parses playable note and chord events through a shared parser entrypoint", () => {
      expect(parseAbcPlayableEventAt("C2", 0)).toEqual(playableEvent("note", ["C"], "2", 2));
      expect(parseAbcPlayableEventAt("[CEG]2", 0)).toEqual(playableEvent("chord", ["C", "E", "G"], "2", 6));
      expect(parseAbcPlayableEventAt("^", 0)).toEqual(malformedAccidental("^", 1));
      expect(parseAbcPlayableEventAt("[", 0)).toEqual(invalidChord(1));
      expect(parseAbcPlayableEventAt("x", 0)).toEqual(playableEvent("note", ["x"], "", 1));
      expect(parseAbcPlayableEventAt("!", 0)).toBeNull();
    });

    it("dispatches body entries through a higher-level parser entrypoint", () => {
      expect(parseAbcBodyEntryAt("|: C", 0)).toEqual(
        bodyEntry("barline", { barlineToken: barlineToken(2, true, false, true, false) })
      );
      expect(parseAbcBodyEntryAt("Q:120 C", 0)).toEqual(
        bodyEntry("standalone-body-field", {
          standaloneBodyField: standaloneBodyField("Q", "120", "Q:120", 5),
        })
      );
      expect(parseAbcBodyEntryAt("restLike", 0)).toEqual(
        bodyEntry("unsupported-body-token", { unsupportedBodyToken: unsupportedBodyToken("restLike", 8) })
      );
      expect(parseAbcBodyEntryAt("123abc", 0)).toEqual(
        bodyEntry("unsupported-body-number", { unsupportedBodyNumber: unsupportedBodyToken("123", 3) })
      );
      expect(parseAbcBodyEntryAt(">A", 0)).toEqual(
        bodyEntry("body-token", {
          bodyToken: bodyToken("broken-rhythm", { brokenRhythm: brokenRhythmToken(">", 1) }),
        })
      );
      expect(parseAbcBodyEntryAt("C2", 0)).toEqual(
        bodyEntry("playable-event", { playableEvent: playableEvent("note", ["C"], "2", 2) })
      );
      expect(parseAbcBodyEntryAt("!", 0)).toEqual(
        bodyEntry("body-token", {
          bodyToken: bodyToken("decoration", { decoration: decorationToken("", "", "!", 1, false) }),
        })
      );
    });
  });
});