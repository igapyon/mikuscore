// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getMeasureCapacity, getOccupiedTime } from "../../core/timeIndex";
import {
  buildMidiBytesForPlayback,
  buildPlaybackEventsFromMusicXmlDoc,
  collectMidiControlEventsFromMusicXmlDoc,
  collectMidiKeySignatureEventsFromMusicXmlDoc,
  collectMidiProgramOverridesFromMusicXmlDoc,
  collectMidiTempoEventsFromMusicXmlDoc,
  collectMidiTimeSignatureEventsFromMusicXmlDoc,
  convertMidiToMusicXml,
} from "../../src/ts/midi-io";
import { parseMusicXmlDocument } from "../../src/ts/musicxml-io";
import { loadFixture } from "./fixtureLoader";

const parseDoc = (xml: string): Document => {
  const doc = parseMusicXmlDocument(xml);
  expect(doc).not.toBeNull();
  if (!doc) throw new Error("Invalid XML.");
  return doc;
};

const firstMeter = (doc: Document): string => {
  const beats = doc.querySelector("part > measure > attributes > time > beats")?.textContent?.trim() ?? "";
  const beatType = doc.querySelector("part > measure > attributes > time > beat-type")?.textContent?.trim() ?? "";
  return beats && beatType ? `${beats}/${beatType}` : "";
};

const firstKey = (doc: Document): { fifths: number | null; mode: string | null } => {
  const fifthsText = doc.querySelector("part > measure > attributes > key > fifths")?.textContent?.trim() ?? "";
  const fifths = Number(fifthsText);
  const mode = doc.querySelector("part > measure > attributes > key > mode")?.textContent?.trim() ?? null;
  return {
    fifths: Number.isFinite(fifths) ? fifths : null,
    mode,
  };
};

const firstTempo = (doc: Document): number | null => {
  const soundTempo = Number(doc.querySelector("part > measure > direction > sound")?.getAttribute("tempo") ?? "");
  if (Number.isFinite(soundTempo) && soundTempo > 0) return Math.round(soundTempo);
  const metronomeTempo = Number(
    doc.querySelector("part > measure > direction > direction-type > metronome > per-minute")?.textContent?.trim() ?? ""
  );
  if (Number.isFinite(metronomeTempo) && metronomeTempo > 0) return Math.round(metronomeTempo);
  return null;
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

type SimpleNoteEvent = {
  onsetAbs: number;
  duration: number;
  step: string;
  alter: string;
  octave: string;
};

const collectSimpleNoteEvents = (doc: Document): SimpleNoteEvent[] => {
  const out: SimpleNoteEvent[] = [];
  const part = doc.querySelector("score-partwise > part");
  if (!part) return out;
  let partOffset = 0;
  for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
    let cursor = 0;
    let measureMax = 0;
    for (const child of Array.from(measure.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === "backup") {
        const d = Number(child.querySelector(":scope > duration")?.textContent?.trim() ?? "0");
        if (Number.isFinite(d) && d > 0) cursor = Math.max(0, cursor - Math.round(d));
        continue;
      }
      if (tag === "forward") {
        const d = Number(child.querySelector(":scope > duration")?.textContent?.trim() ?? "0");
        if (Number.isFinite(d) && d > 0) {
          cursor += Math.round(d);
          measureMax = Math.max(measureMax, cursor);
        }
        continue;
      }
      if (tag !== "note") continue;
      if (child.querySelector(":scope > rest")) continue;
      const duration = Number(child.querySelector(":scope > duration")?.textContent?.trim() ?? "0");
      const roundedDuration = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0;
      const isChord = child.querySelector(":scope > chord") !== null;
      const onset = isChord ? Math.max(0, cursor - roundedDuration) : cursor;
      const step = child.querySelector(":scope > pitch > step")?.textContent?.trim() ?? "";
      const octave = child.querySelector(":scope > pitch > octave")?.textContent?.trim() ?? "";
      if (step && octave) {
        out.push({
          onsetAbs: partOffset + onset,
          duration: roundedDuration,
          step,
          alter: child.querySelector(":scope > pitch > alter")?.textContent?.trim() ?? "",
          octave,
        });
      }
      if (!isChord && roundedDuration > 0) {
        cursor += roundedDuration;
        measureMax = Math.max(measureMax, cursor);
      }
    }
    if (measureMax > 0) partOffset += measureMax;
  }
  return out;
};

const practicalDiffCount = (source: SimpleNoteEvent[], target: SimpleNoteEvent[]): number => {
  const toMap = (events: SimpleNoteEvent[]): Map<string, number> => {
    const map = new Map<string, number>();
    for (const e of events) {
      const key = `${e.onsetAbs}|${e.duration}|${e.step}|${e.alter}|${e.octave}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  };
  const a = toMap(source);
  const b = toMap(target);
  const keys = new Set<string>([...a.keys(), ...b.keys()]);
  let diff = 0;
  for (const key of keys) {
    diff += Math.abs((a.get(key) ?? 0) - (b.get(key) ?? 0));
  }
  return diff;
};

const onsetStrictDurationRatioDiffCount = (
  source: SimpleNoteEvent[],
  target: SimpleNoteEvent[],
  minRatio = 0.5,
  maxRatio = 2
): number => {
  const bucketOf = (event: SimpleNoteEvent): string =>
    `${event.onsetAbs}|${event.step}|${event.alter}|${event.octave}`;

  const toBuckets = (events: SimpleNoteEvent[]): Map<string, number[]> => {
    const buckets = new Map<string, number[]>();
    for (const e of events) {
      const key = bucketOf(e);
      const arr = buckets.get(key) ?? [];
      arr.push(e.duration);
      buckets.set(key, arr);
    }
    for (const arr of buckets.values()) arr.sort((a, b) => a - b);
    return buckets;
  };

  const srcBuckets = toBuckets(source);
  const dstBuckets = toBuckets(target);
  const keys = new Set<string>([...srcBuckets.keys(), ...dstBuckets.keys()]);
  let diff = 0;

  for (const key of keys) {
    const srcDurations = [...(srcBuckets.get(key) ?? [])];
    const dstDurations = [...(dstBuckets.get(key) ?? [])];
    const used = new Array<boolean>(dstDurations.length).fill(false);

    for (const srcDur of srcDurations) {
      let matched = false;
      for (let i = 0; i < dstDurations.length; i += 1) {
        if (used[i]) continue;
        const ratio = srcDur > 0 ? dstDurations[i] / srcDur : Number.POSITIVE_INFINITY;
        if (ratio >= minRatio && ratio <= maxRatio) {
          used[i] = true;
          matched = true;
          break;
        }
      }
      if (!matched) diff += 1;
    }
    for (let i = 0; i < dstDurations.length; i += 1) {
      if (!used[i]) diff += 1;
    }
  }

  return diff;
};

const ensureMidiWriterLoaded = (): void => {
  const maybeWindow = window as Window & { MidiWriter?: unknown };
  if (maybeWindow.MidiWriter) return;
  const runtimeJs = readFileSync(resolve(process.cwd(), "src", "js", "midi-writer.js"), "utf-8");
  window.eval(runtimeJs);
  expect(maybeWindow.MidiWriter).toBeDefined();
};

const runRoundtrip = (fixtureName: string): { srcDoc: Document; dstDoc: Document } => {
  const srcDoc = parseDoc(loadFixture(fixtureName));
  const ticksPerQuarter = 128;
  const playback = buildPlaybackEventsFromMusicXmlDoc(srcDoc, ticksPerQuarter, { mode: "midi" });
  expect(playback.events.length).toBeGreaterThan(0);
  const midiBytes = buildMidiBytesForPlayback(
    playback.events,
    playback.tempo,
    "electric_piano_2",
    collectMidiProgramOverridesFromMusicXmlDoc(srcDoc),
    collectMidiControlEventsFromMusicXmlDoc(srcDoc, ticksPerQuarter),
    collectMidiTempoEventsFromMusicXmlDoc(srcDoc, ticksPerQuarter),
    collectMidiTimeSignatureEventsFromMusicXmlDoc(srcDoc, ticksPerQuarter),
    collectMidiKeySignatureEventsFromMusicXmlDoc(srcDoc, ticksPerQuarter)
  );
  const imported = convertMidiToMusicXml(midiBytes, { quantizeGrid: "1/16" });
  expect(imported.ok).toBe(true);
  const dstDoc = parseDoc(imported.xml);
  assertNoOverfull(dstDoc);
  return { srcDoc, dstDoc };
};

describe("MIDI roundtrip golden", () => {
  beforeAll(() => {
    ensureMidiWriterLoaded();
  });

  const fixtures = ["base.musicxml", "interleaved_voices.musicxml", "roundtrip_piano_tempo.musicxml"];
  for (const fixture of fixtures) {
    it(`MusicXML -> MIDI -> MusicXML keeps key meter tempo baseline: ${fixture}`, () => {
      const { srcDoc, dstDoc } = runRoundtrip(fixture);
      expect(firstMeter(dstDoc)).toBe(firstMeter(srcDoc));
      const srcKey = firstKey(srcDoc);
      const dstKey = firstKey(dstDoc);
      if (srcKey.fifths !== null) {
        expect(dstKey.fifths).toBe(srcKey.fifths);
      }
      const srcTempo = firstTempo(srcDoc);
      if (srcTempo !== null) {
        expect(firstTempo(dstDoc)).toBe(srcTempo);
      }
    });
  }

  it("keeps practical note timing/pitch close on moonlight-like m13-m16 fragment", () => {
    const fixtureName = "roundtrip_moonlight_m13_m16_like.musicxml";
    const { srcDoc, dstDoc } = runRoundtrip(fixtureName);
    const src = collectSimpleNoteEvents(srcDoc);
    const dst = collectSimpleNoteEvents(dstDoc);
    expect(src.length).toBeGreaterThan(0);
    expect(dst.length).toBeGreaterThan(0);
    // This fragment is triplet-heavy and used as a regression guard.
    // Keep current behavior within a bounded envelope (worsening detection).
    expect(practicalDiffCount(src, dst)).toBeLessThanOrEqual(90);
  });

  it("keeps onset/pitch close with duration ratio tolerance on triplet-heavy head fragment", () => {
    const fixtureName = "roundtrip_triplet_m1_m4_like.musicxml";
    const { srcDoc, dstDoc } = runRoundtrip(fixtureName);
    const src = collectSimpleNoteEvents(srcDoc);
    const dst = collectSimpleNoteEvents(dstDoc);
    expect(src.length).toBeGreaterThan(0);
    expect(dst.length).toBeGreaterThan(0);

    const strictPractical = practicalDiffCount(src, dst);
    const ratioTolerant = onsetStrictDurationRatioDiffCount(src, dst, 0.5, 2);
    expect(ratioTolerant).toBeLessThanOrEqual(strictPractical);
    // Guardrail for major onset/pitch regressions while allowing duration interpretation differences.
    expect(ratioTolerant).toBeLessThanOrEqual(120);
  });
});
