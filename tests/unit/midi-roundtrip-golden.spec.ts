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
});
