// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getMeasureCapacity, getOccupiedTime } from "../../../core/timeIndex";
import { parseMusicXmlDocument } from "../../../src/ts/musicxml-io";
import { convertMuseScoreToMusicXml, exportMusicXmlDomToMuseScore } from "../../../src/ts/musescore-io";

type ScoreStats = {
  partCount: number;
  measureCount: number;
  noteCount: number;
  restCount: number;
  firstMeter: string;
  firstTempo: number | null;
};

type MeasureStats = {
  measureNo: string;
  noteCount: number;
  restCount: number;
  chordFollowerCount: number;
  tieStartCount: number;
  tieStopCount: number;
};

type PitchEvent = {
  measureNo: string;
  onset: number;
  duration: number;
  staff: string;
  pitch: string;
};

type RoundtripCase = {
  id: string;
  sourcePath: string;
  firstMeasuresToCompare?: number;
};

const parseDoc = (xml: string): Document => {
  const doc = parseMusicXmlDocument(xml);
  expect(doc).not.toBeNull();
  if (!doc) throw new Error("failed to parse MusicXML");
  return doc;
};

const loadCaseFile = (pathFromRepoRoot: string): RoundtripCase[] => {
  const fullPath = resolve(process.cwd(), pathFromRepoRoot);
  if (!existsSync(fullPath)) return [];
  const raw = readFileSync(fullPath, "utf-8");
  const parsed = JSON.parse(raw) as { cases?: RoundtripCase[] };
  return Array.isArray(parsed.cases) ? parsed.cases : [];
};

const loadRoundtripCases = (): RoundtripCase[] => {
  const publicCases = loadCaseFile("tests/roundtrip/musescore/cases.public.json");
  const localCases = loadCaseFile("tests/roundtrip/musescore/cases.local.json");
  const merged = [...publicCases, ...localCases];
  if (!merged.length) {
    throw new Error("No MuseScore roundtrip cases found.");
  }
  return merged;
};

const collectStats = (doc: Document): ScoreStats => {
  const parts = Array.from(doc.querySelectorAll("score-partwise > part"));
  const measures = Array.from(doc.querySelectorAll("score-partwise > part > measure"));
  const notes = Array.from(doc.querySelectorAll("score-partwise note"));
  const restCount = notes.filter((note) => note.querySelector(":scope > rest") !== null).length;
  const beats = doc.querySelector("part > measure > attributes > time > beats")?.textContent?.trim() ?? "";
  const beatType = doc.querySelector("part > measure > attributes > time > beat-type")?.textContent?.trim() ?? "";
  const firstMeter = beats && beatType ? `${beats}/${beatType}` : "";
  const tempoText = doc.querySelector("part > measure > direction > sound[tempo]")?.getAttribute("tempo") ?? "";
  const tempo = Number(tempoText);
  return {
    partCount: parts.length,
    measureCount: measures.length,
    noteCount: notes.length,
    restCount,
    firstMeter,
    firstTempo: Number.isFinite(tempo) && tempo > 0 ? Math.round(tempo) : null,
  };
};

const collectFirstMeasureStats = (doc: Document, maxMeasures: number): MeasureStats[] => {
  const out: MeasureStats[] = [];
  const measures = Array.from(doc.querySelectorAll("score-partwise > part > measure")).slice(0, maxMeasures);
  for (const measure of measures) {
    const notes = Array.from(measure.querySelectorAll(":scope > note"));
    const restCount = notes.filter((note) => note.querySelector(":scope > rest") !== null).length;
    const chordFollowerCount = notes.filter((note) => note.querySelector(":scope > chord") !== null).length;
    const tieStartCount = notes.filter((note) => note.querySelector(':scope > tie[type="start"]') !== null).length;
    const tieStopCount = notes.filter((note) => note.querySelector(':scope > tie[type="stop"]') !== null).length;
    out.push({
      measureNo: measure.getAttribute("number") ?? "",
      noteCount: notes.length,
      restCount,
      chordFollowerCount,
      tieStartCount,
      tieStopCount,
    });
  }
  return out;
};

const collectPitchEvents = (doc: Document, maxMeasures: number): PitchEvent[] => {
  const out: PitchEvent[] = [];
  const measures = Array.from(doc.querySelectorAll("score-partwise > part > measure")).slice(0, maxMeasures);
  for (const measure of measures) {
    let cursor = 0;
    const measureNo = measure.getAttribute("number") ?? "";
    for (const child of Array.from(measure.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === "backup") {
        const backDur = Number(child.querySelector(":scope > duration")?.textContent?.trim() ?? "0");
        if (Number.isFinite(backDur) && backDur > 0) cursor = Math.max(0, cursor - Math.round(backDur));
        continue;
      }
      if (tag === "forward") {
        const fwdDur = Number(child.querySelector(":scope > duration")?.textContent?.trim() ?? "0");
        if (Number.isFinite(fwdDur) && fwdDur > 0) cursor += Math.round(fwdDur);
        continue;
      }
      if (tag !== "note") continue;
      const duration = Number(child.querySelector(":scope > duration")?.textContent?.trim() ?? "0");
      const roundedDuration = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0;
      const isChordFollower = child.querySelector(":scope > chord") !== null;
      const step = child.querySelector(":scope > pitch > step")?.textContent?.trim() ?? "";
      const alter = child.querySelector(":scope > pitch > alter")?.textContent?.trim() ?? "";
      const octave = child.querySelector(":scope > pitch > octave")?.textContent?.trim() ?? "";
      if (step && octave) {
        const onset = isChordFollower ? Math.max(0, cursor - roundedDuration) : cursor;
        const alt = alter ? (Number(alter) > 0 ? `+${alter}` : alter) : "";
        out.push({
          measureNo,
          onset,
          duration: roundedDuration,
          staff: child.querySelector(":scope > staff")?.textContent?.trim() ?? "1",
          pitch: `${step}${alt}/${octave}`,
        });
      }
      if (!isChordFollower) cursor += roundedDuration;
    }
  }
  return out;
};

const countPitchEvents = (
  events: PitchEvent[],
  cond: { measureNo: string; staff: string; onset: number; duration: number; pitch: string }
): number => {
  return events.filter((e) =>
    e.measureNo === cond.measureNo
    && e.staff === cond.staff
    && e.onset === cond.onset
    && e.duration === cond.duration
    && e.pitch === cond.pitch
  ).length;
};

const assertNoOverfull = (doc: Document): void => {
  for (const measure of Array.from(doc.querySelectorAll("part > measure"))) {
    const capacity = getMeasureCapacity(measure);
    if (!capacity || !Number.isFinite(capacity) || capacity <= 0) continue;
    const voices = Array.from(
      new Set(
        Array.from(measure.querySelectorAll("note > voice"))
          .map((v) => v.textContent?.trim() ?? "")
          .filter(Boolean)
      )
    );
    for (const voice of voices) {
      const occupied = getOccupiedTime(measure, voice);
      expect(occupied).toBeLessThanOrEqual(capacity);
    }
  }
};

describe("MuseScore roundtrip (public/local cases)", () => {
  const cases = loadRoundtripCases();
  for (const roundtripCase of cases) {
    it(`keeps baseline invariants: ${roundtripCase.id}`, () => {
    const srcXml = readFileSync(resolve(process.cwd(), roundtripCase.sourcePath), "utf-8");
    const srcDoc = parseDoc(srcXml);

    const mscx = exportMusicXmlDomToMuseScore(srcDoc);
    expect(mscx.includes("<museScore")).toBe(true);

    const dstXml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: true });
    const dstDoc = parseDoc(dstXml);
    assertNoOverfull(dstDoc);

    const src = collectStats(srcDoc);
    const dst = collectStats(dstDoc);
    const firstMeasuresToCompare = Math.max(1, Math.round(roundtripCase.firstMeasuresToCompare ?? 5));
    const srcEarlyMeasures = collectFirstMeasureStats(srcDoc, firstMeasuresToCompare);
    const dstEarlyMeasures = collectFirstMeasureStats(dstDoc, firstMeasuresToCompare);
    expect(dstEarlyMeasures).toEqual(srcEarlyMeasures);
    expect(dst.partCount).toBe(src.partCount);
    expect(dst.measureCount).toBe(src.measureCount);
    expect(dst.noteCount).toBe(src.noteCount);
    expect(dst.restCount).toBe(src.restCount);
    expect(dst.firstMeter).toBe(src.firstMeter);
    if (src.firstTempo !== null) {
      expect(dst.firstTempo).toBe(src.firstTempo);
    }
    if (roundtripCase.id === "sample1" || roundtripCase.id === "sample1-m1-m2") {
      const srcPitchEvents = collectPitchEvents(srcDoc, 2);
      const dstPitchEvents = collectPitchEvents(dstDoc, 2);
      expect(dstPitchEvents).toEqual(srcPitchEvents);

      // Spot-check 1: pickup B must keep octave doubling (B4 + B5).
      expect(countPitchEvents(dstPitchEvents, {
        measureNo: "1",
        staff: "1",
        onset: 12,
        duration: 4,
        pitch: "B/4",
      })).toBe(1);
      expect(countPitchEvents(dstPitchEvents, {
        measureNo: "1",
        staff: "1",
        onset: 12,
        duration: 4,
        pitch: "B/5",
      })).toBe(1);

      // Spot-check 2: measure 2, beat 4 must keep E-layer notes in both treble and bass lanes.
      expect(countPitchEvents(dstPitchEvents, {
        measureNo: "2",
        staff: "1",
        onset: 12,
        duration: 4,
        pitch: "E/4",
      })).toBe(1);
      expect(countPitchEvents(dstPitchEvents, {
        measureNo: "2",
        staff: "1",
        onset: 12,
        duration: 4,
        pitch: "E/5",
      })).toBe(1);
      expect(countPitchEvents(dstPitchEvents, {
        measureNo: "2",
        staff: "6",
        onset: 8,
        duration: 4,
        pitch: "E/3",
      })).toBe(1);
    }
    }, 15000);
  }
});
