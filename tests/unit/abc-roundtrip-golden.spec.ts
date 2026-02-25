// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ScoreCore } from "../../core/ScoreCore";
import { getMeasureCapacity, getOccupiedTime } from "../../core/timeIndex";
import { convertAbcToMusicXml, exportMusicXmlDomToAbc } from "../../src/ts/abc-io";
import { parseMusicXmlDocument } from "../../src/ts/musicxml-io";
import { loadFixture } from "./fixtureLoader";

type RoundtripStats = {
  noteCount: number;
  restCount: number;
  pitchedCount: number;
  nonChordQuarterSum: number;
  firstMeter: string;
  firstTempo: number | null;
};

const isChordNote = (note: Element): boolean =>
  Array.from(note.children).some((c) => c.tagName === "chord");

const countStats = (doc: Document): RoundtripStats => {
  const notes = Array.from(doc.querySelectorAll("note"));
  let restCount = 0;
  let pitchedCount = 0;
  let nonChordQuarterSum = 0;

  for (const note of notes) {
    const isRest = note.querySelector(":scope > rest") !== null;
    if (isRest) restCount += 1;
    else pitchedCount += 1;
  }
  for (const part of Array.from(doc.querySelectorAll("score-partwise > part"))) {
    let currentDivisions = 1;
    for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
      const parsedDivisions = Number(measure.querySelector(":scope > attributes > divisions")?.textContent?.trim() ?? "");
      if (Number.isFinite(parsedDivisions) && parsedDivisions > 0) {
        currentDivisions = parsedDivisions;
      }
      for (const note of Array.from(measure.querySelectorAll(":scope > note"))) {
        if (isChordNote(note)) continue;
        const duration = Number(note.querySelector(":scope > duration")?.textContent?.trim() || "0");
        if (!Number.isFinite(duration) || duration <= 0) continue;
        nonChordQuarterSum += duration / currentDivisions;
      }
    }
  }

  const beats = doc.querySelector("part > measure > attributes > time > beats")?.textContent?.trim() || "";
  const beatType = doc.querySelector("part > measure > attributes > time > beat-type")?.textContent?.trim() || "";
  const firstMeter = beats && beatType ? `${beats}/${beatType}` : "";

  const explicitTempo = Number(doc.querySelector("sound[tempo]")?.getAttribute("tempo") ?? "");
  const metronomeTempo = Number(doc.querySelector("direction-type > metronome > per-minute")?.textContent?.trim() ?? "");
  const firstTempo =
    Number.isFinite(explicitTempo) && explicitTempo > 0
      ? Math.round(explicitTempo)
      : Number.isFinite(metronomeTempo) && metronomeTempo > 0
        ? Math.round(metronomeTempo)
        : null;

  return {
    noteCount: notes.length,
    restCount,
    pitchedCount,
    nonChordQuarterSum,
    firstMeter,
    firstTempo,
  };
};

const assertNoOverfull = (doc: Document): void => {
  for (const measure of Array.from(doc.querySelectorAll("part > measure"))) {
    const capacity = getMeasureCapacity(measure);
    if (!Number.isFinite(capacity as number) || !capacity || capacity <= 0) continue;
    const voices = Array.from(
      new Set(
        Array.from(measure.querySelectorAll("note > voice"))
          .map((v) => v.textContent?.trim() ?? "")
          .filter(Boolean)
      )
    );
    for (const voice of voices) {
      const occupied = getOccupiedTime(measure, voice);
      expect(occupied).toBeLessThanOrEqual(capacity as number);
    }
  }
};

const runRoundtrip = (fixtureName: string): { srcStats: RoundtripStats; dstStats: RoundtripStats; dstDoc: Document } => {
  const srcXml = loadFixture(fixtureName);
  const srcDoc = parseMusicXmlDocument(srcXml);
  expect(srcDoc).not.toBeNull();
  if (!srcDoc) {
    throw new Error(`failed to parse source fixture: ${fixtureName}`);
  }
  const abc = exportMusicXmlDomToAbc(srcDoc);
  expect(abc.includes("V:")).toBe(true);

  const dstXml = convertAbcToMusicXml(abc);
  const dstDoc = parseMusicXmlDocument(dstXml);
  expect(dstDoc).not.toBeNull();
  if (!dstDoc) {
    throw new Error(`failed to parse roundtrip xml: ${fixtureName}`);
  }

  const core = new ScoreCore();
  core.load(dstXml);
  const save = core.save();
  expect(save.ok).toBe(true);

  assertNoOverfull(dstDoc);
  return {
    srcStats: countStats(srcDoc),
    dstStats: countStats(dstDoc),
    dstDoc,
  };
};

describe("ABC roundtrip golden", () => {
  const fixtures = [
    "base.musicxml",
    "with_backup_safe.musicxml",
    "interleaved_voices.musicxml",
    "roundtrip_piano_tempo.musicxml",
  ];

  for (const fixture of fixtures) {
    it(`MusicXML -> ABC -> MusicXML keeps core invariants: ${fixture}`, () => {
      const { srcStats, dstStats } = runRoundtrip(fixture);
      expect(dstStats.noteCount).toBe(srcStats.noteCount);
      expect(dstStats.restCount).toBe(srcStats.restCount);
      expect(dstStats.pitchedCount).toBe(srcStats.pitchedCount);
      expect(dstStats.nonChordQuarterSum).toBeCloseTo(srcStats.nonChordQuarterSum, 6);
      expect(dstStats.firstMeter).toBe(srcStats.firstMeter);
      if (srcStats.firstTempo !== null) {
        expect(dstStats.firstTempo).toBe(srcStats.firstTempo);
      }
    });
  }
});
