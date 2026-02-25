// @vitest-environment jsdom
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildMidiBytesForPlayback,
  buildPlaybackEventsFromMusicXmlDoc,
  collectMidiControlEventsFromMusicXmlDoc,
  collectMidiKeySignatureEventsFromMusicXmlDoc,
  collectMidiProgramOverridesFromMusicXmlDoc,
  collectMidiTempoEventsFromMusicXmlDoc,
  collectMidiTimeSignatureEventsFromMusicXmlDoc,
  convertMidiToMusicXml,
  type GraceTimingMode,
  type RawMidiRetriggerPolicy,
} from "../../src/ts/midi-io";
import { parseMusicXmlDocument } from "../../src/ts/musicxml-io";

type NoteEvent = {
  part: string;
  measure: string;
  onsetAbs: number;
  onset: number;
  duration: number;
  staff: string;
  step: string;
  alter: string;
  octave: string;
};

const parseDoc = (xml: string): Document => {
  const doc = parseMusicXmlDocument(xml);
  expect(doc).not.toBeNull();
  if (!doc) throw new Error("failed to parse MusicXML");
  return doc;
};

const ensureMidiWriterLoaded = (): void => {
  const maybeWindow = window as Window & { MidiWriter?: unknown };
  if (maybeWindow.MidiWriter) return;
  const runtimeJs = readFileSync(resolve(process.cwd(), "src", "js", "midi-writer.js"), "utf-8");
  window.eval(runtimeJs);
  expect(maybeWindow.MidiWriter).toBeDefined();
};

const collectNoteEvents = (doc: Document): NoteEvent[] => {
  const out: NoteEvent[] = [];
  for (const part of Array.from(doc.querySelectorAll("score-partwise > part"))) {
    const partId = part.getAttribute("id") ?? "";
    let partOffset = 0;
    for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
      const measureNo = measure.getAttribute("number") ?? "";
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
        const duration = Number(child.querySelector(":scope > duration")?.textContent?.trim() ?? "0");
        const roundedDuration = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0;
        const isChord = child.querySelector(":scope > chord") !== null;
        const onset = isChord ? Math.max(0, cursor - roundedDuration) : cursor;
        const onsetAbs = partOffset + onset;
        if (child.querySelector(":scope > rest")) {
          if (!isChord && roundedDuration > 0) {
            cursor += roundedDuration;
            measureMax = Math.max(measureMax, cursor);
          }
          continue;
        }
        const step = child.querySelector(":scope > pitch > step")?.textContent?.trim() ?? "";
        const octave = child.querySelector(":scope > pitch > octave")?.textContent?.trim() ?? "";
        if (!step || !octave) continue;
        out.push({
          part: partId,
          measure: measureNo,
          onsetAbs,
          onset,
          duration: roundedDuration,
          staff: child.querySelector(":scope > staff")?.textContent?.trim() ?? "1",
          step,
          alter: child.querySelector(":scope > pitch > alter")?.textContent?.trim() ?? "",
          octave,
        });
        if (!isChord && roundedDuration > 0) {
          cursor += roundedDuration;
          measureMax = Math.max(measureMax, cursor);
        }
      }
      if (measureMax > 0) partOffset += measureMax;
    }
  }
  return out;
};

const toMultisetStrict = (events: NoteEvent[]): Map<string, number> => {
  const map = new Map<string, number>();
  for (const e of events) {
    const key = `${e.part}|${e.onsetAbs}|${e.duration}|${e.staff}|${e.step}|${e.alter}|${e.octave}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
};

const toMultisetPractical = (events: NoteEvent[]): Map<string, number> => {
  const map = new Map<string, number>();
  for (const e of events) {
    const key = `${e.onsetAbs}|${e.duration}|${e.step}|${e.alter}|${e.octave}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
};

const diffMultiset = (a: Map<string, number>, b: Map<string, number>): string[] => {
  const out: string[] = [];
  const keys = new Set<string>([...a.keys(), ...b.keys()]);
  for (const key of Array.from(keys).sort()) {
    const av = a.get(key) ?? 0;
    const bv = b.get(key) ?? 0;
    if (av !== bv) out.push(`${key} :: ref=${av} cand=${bv}`);
  }
  return out;
};

const summarizeDuplicatePitchAtSameTick = (events: NoteEvent[], maxMeasure: number): string[] => {
  const byKey = new Map<string, number>();
  for (const e of events) {
    const measureNo = Number.parseInt(e.measure, 10);
    if (!Number.isFinite(measureNo) || measureNo > maxMeasure) continue;
    const key = `${e.part}|m${e.measure}|${e.onset}|${e.step}|${e.alter}|${e.octave}`;
    byKey.set(key, (byKey.get(key) ?? 0) + 1);
  }
  return Array.from(byKey.entries())
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 40)
    .map(([key, count]) => `${key} :: count=${count}`);
};

const keepHeadMeasures = (events: NoteEvent[], maxMeasure: number): NoteEvent[] =>
  events.filter((e) => {
    const measureNo = Number.parseInt(e.measure, 10);
    return Number.isFinite(measureNo) && measureNo <= maxMeasure;
  });

const summarizePracticalDiffByMeasure = (refEvents: NoteEvent[], candEvents: NoteEvent[], maxMeasure = 16): string[] => {
  const refMap = new Map<string, number>();
  const candMap = new Map<string, number>();
  for (const e of refEvents) {
    const key = `${e.measure}|${e.onset}|${e.duration}|${e.step}|${e.alter}|${e.octave}`;
    refMap.set(key, (refMap.get(key) ?? 0) + 1);
  }
  for (const e of candEvents) {
    const key = `${e.measure}|${e.onset}|${e.duration}|${e.step}|${e.alter}|${e.octave}`;
    candMap.set(key, (candMap.get(key) ?? 0) + 1);
  }
  const byMeasure = new Map<string, number>();
  const keys = new Set<string>([...refMap.keys(), ...candMap.keys()]);
  for (const key of keys) {
    const refCount = refMap.get(key) ?? 0;
    const candCount = candMap.get(key) ?? 0;
    if (refCount === candCount) continue;
    const measure = key.split("|", 1)[0] ?? "";
    const measureNo = Number.parseInt(measure, 10);
    if (!Number.isFinite(measureNo) || measureNo > maxMeasure) continue;
    byMeasure.set(measure, (byMeasure.get(measure) ?? 0) + Math.abs(refCount - candCount));
  }
  return Array.from(byMeasure.entries())
    .sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
    .slice(0, 12)
    .map(([measure, count]) => `m${measure}: ${count}`);
};

const extractPracticalDiffForMeasures = (
  refEvents: NoteEvent[],
  candEvents: NoteEvent[],
  measures: readonly number[],
  limit = 80
): string[] => {
  const filter = (events: NoteEvent[]) =>
    events.filter((e) => {
      const measureNo = Number.parseInt(e.measure, 10);
      return Number.isFinite(measureNo) && measures.includes(measureNo);
    });
  const diff = diffMultiset(toMultisetPractical(filter(refEvents)), toMultisetPractical(filter(candEvents)));
  return diff.slice(0, limit);
};

describe("Local parity (moonlight): musicxml => midi vs reference midi", () => {
  it("exports MIDI from musicxml and reports semantic diffs against reference MIDI import", () => {
    ensureMidiWriterLoaded();
    const root = resolve(process.cwd(), "tests", "fixtures-local", "roundtrip", "musescore", "moonlight");
    const sourcePath = resolve(root, "pianosonata-di14fanyue-guang-di1le-zhang.musicxml");
    const referenceMidPath = resolve(root, "pianosonata-di14fanyue-guang-di1le-zhang.mid");

    const sourceXml = readFileSync(sourcePath, "utf-8");
    const sourceDoc = parseDoc(sourceXml);
    const referenceMid = new Uint8Array(readFileSync(referenceMidPath));

    const ticksPerQuarter = 480;
    const buildCandidateMidi = (
      mode: "midi" | "playback",
      normalizeForParity = false,
      includeGraceInPlaybackLikeMode = false,
      includeOrnamentInPlaybackLikeMode = false,
      includeTieInPlaybackLikeMode = false,
      applyDefaultDetacheInPlaybackLikeMode = false,
      rawWriter = false,
      rawRetriggerPolicy: RawMidiRetriggerPolicy = "off_before_on",
      graceTimingMode: GraceTimingMode = "before_beat",
      tpq = ticksPerQuarter
    ): Uint8Array => {
      const playback = buildPlaybackEventsFromMusicXmlDoc(sourceDoc, tpq, { mode });
      const playbackWithParityOptions =
        mode === "playback" && (includeGraceInPlaybackLikeMode || includeOrnamentInPlaybackLikeMode)
          ? buildPlaybackEventsFromMusicXmlDoc(sourceDoc, tpq, {
              mode,
              graceTimingMode,
              includeGraceInPlaybackLikeMode,
              includeOrnamentInPlaybackLikeMode,
              includeTieInPlaybackLikeMode,
              applyDefaultDetacheInPlaybackLikeMode,
            })
          : playback;
      return buildMidiBytesForPlayback(
        playbackWithParityOptions.events,
        playbackWithParityOptions.tempo,
        "electric_piano_2",
        collectMidiProgramOverridesFromMusicXmlDoc(sourceDoc),
        collectMidiControlEventsFromMusicXmlDoc(sourceDoc, tpq),
        collectMidiTempoEventsFromMusicXmlDoc(sourceDoc, tpq),
        collectMidiTimeSignatureEventsFromMusicXmlDoc(sourceDoc, tpq),
        collectMidiKeySignatureEventsFromMusicXmlDoc(sourceDoc, tpq),
        { embedMksSysEx: true, ticksPerQuarter: tpq, normalizeForParity, rawWriter, rawRetriggerPolicy }
      );
    };
    const candidateMidMidiMode = buildCandidateMidi("midi");
    const candidateMidPlaybackMode = buildCandidateMidi("playback");
    const candidateMidMidiModeParity = buildCandidateMidi("playback", false, true, true, true);
    const candidateMidMidiModeParityNorm = buildCandidateMidi("playback", true, true, true, true);
    const candidateMidMidiModeParityNormNoTie = buildCandidateMidi("playback", true, true, true, false);
    const candidateMidMidiModeParityNormDetache = buildCandidateMidi("playback", true, true, true, true, true);
    const candidateMidMidiModeParityRawOff = buildCandidateMidi(
      "playback",
      true,
      true,
      true,
      true,
      false,
      true,
      "off_before_on"
    );
    const candidateMidMidiModeParityRawOn = buildCandidateMidi(
      "playback",
      true,
      true,
      true,
      true,
      false,
      true,
      "on_before_off"
    );
    const candidateMidMidiModeParityRawPitch = buildCandidateMidi(
      "playback",
      true,
      true,
      true,
      true,
      false,
      true,
      "pitch_order"
    );
    const candidateMidMidiModeParityNorm960 = buildCandidateMidi(
      "playback",
      true,
      true,
      true,
      true,
      false,
      false,
      "off_before_on",
      "before_beat",
      960
    );
    const candidateMidMidiModeParityOnBeat = buildCandidateMidi(
      "playback",
      false,
      true,
      true,
      true,
      false,
      false,
      "off_before_on",
      "on_beat"
    );
    const candidateMidMidiModeParityClassical = buildCandidateMidi(
      "playback",
      false,
      true,
      true,
      true,
      false,
      false,
      "off_before_on",
      "classical_equal"
    );

    const artifactsDir = resolve(process.cwd(), "tests", "artifacts", "roundtrip", "musescore", "moonlight");
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(resolve(artifactsDir, "candidate-from-musicxml.mid"), candidateMidMidiMode);
    writeFileSync(resolve(artifactsDir, "candidate-from-musicxml-playback.mid"), candidateMidPlaybackMode);
    writeFileSync(resolve(artifactsDir, "candidate-from-musicxml-parity.mid"), candidateMidMidiModeParity);
    writeFileSync(resolve(artifactsDir, "candidate-from-musicxml-parity-norm.mid"), candidateMidMidiModeParityNorm);
    writeFileSync(resolve(artifactsDir, "candidate-from-musicxml-parity-norm-960.mid"), candidateMidMidiModeParityNorm960);
    writeFileSync(
      resolve(artifactsDir, "candidate-from-musicxml-parity-norm-no-tie.mid"),
      candidateMidMidiModeParityNormNoTie
    );
    writeFileSync(
      resolve(artifactsDir, "candidate-from-musicxml-parity-norm-detache.mid"),
      candidateMidMidiModeParityNormDetache
    );
    writeFileSync(resolve(artifactsDir, "candidate-from-musicxml-parity-raw-off.mid"), candidateMidMidiModeParityRawOff);
    writeFileSync(resolve(artifactsDir, "candidate-from-musicxml-parity-raw-on.mid"), candidateMidMidiModeParityRawOn);
    writeFileSync(
      resolve(artifactsDir, "candidate-from-musicxml-parity-raw-pitch.mid"),
      candidateMidMidiModeParityRawPitch
    );
    writeFileSync(resolve(artifactsDir, "candidate-from-musicxml-parity-on-beat.mid"), candidateMidMidiModeParityOnBeat);
    writeFileSync(
      resolve(artifactsDir, "candidate-from-musicxml-parity-classical.mid"),
      candidateMidMidiModeParityClassical
    );

    const refImported = convertMidiToMusicXml(referenceMid, { quantizeGrid: "1/16", debugMetadata: false });
    const candImportedMidi = convertMidiToMusicXml(candidateMidMidiMode, { quantizeGrid: "1/16", debugMetadata: false });
    const candImportedPlayback = convertMidiToMusicXml(candidateMidPlaybackMode, {
      quantizeGrid: "1/16",
      debugMetadata: false,
    });
    const candImportedParity = convertMidiToMusicXml(candidateMidMidiModeParity, {
      quantizeGrid: "1/16",
      debugMetadata: false,
    });
    const candImportedParityNorm = convertMidiToMusicXml(candidateMidMidiModeParityNorm, {
      quantizeGrid: "1/16",
      debugMetadata: false,
    });
    const candImportedParityNorm960 = convertMidiToMusicXml(candidateMidMidiModeParityNorm960, {
      quantizeGrid: "1/16",
      debugMetadata: false,
    });
    const candImportedParityNormNoTie = convertMidiToMusicXml(candidateMidMidiModeParityNormNoTie, {
      quantizeGrid: "1/16",
      debugMetadata: false,
    });
    const candImportedParityNormDetache = convertMidiToMusicXml(candidateMidMidiModeParityNormDetache, {
      quantizeGrid: "1/16",
      debugMetadata: false,
    });
    const candImportedParityRawOff = convertMidiToMusicXml(candidateMidMidiModeParityRawOff, {
      quantizeGrid: "1/16",
      debugMetadata: false,
    });
    const candImportedParityRawOn = convertMidiToMusicXml(candidateMidMidiModeParityRawOn, {
      quantizeGrid: "1/16",
      debugMetadata: false,
    });
    const candImportedParityRawPitch = convertMidiToMusicXml(candidateMidMidiModeParityRawPitch, {
      quantizeGrid: "1/16",
      debugMetadata: false,
    });
    const candImportedParityOnBeat = convertMidiToMusicXml(candidateMidMidiModeParityOnBeat, {
      quantizeGrid: "1/16",
      debugMetadata: false,
    });
    const candImportedParityClassical = convertMidiToMusicXml(candidateMidMidiModeParityClassical, {
      quantizeGrid: "1/16",
      debugMetadata: false,
    });
    expect(refImported.ok).toBe(true);
    expect(candImportedMidi.ok).toBe(true);
    expect(candImportedPlayback.ok).toBe(true);
    expect(candImportedParity.ok).toBe(true);
    expect(candImportedParityNorm.ok).toBe(true);
    expect(candImportedParityNorm960.ok).toBe(true);
    expect(candImportedParityNormNoTie.ok).toBe(true);
    expect(candImportedParityNormDetache.ok).toBe(true);
    expect(candImportedParityRawOff.ok).toBe(true);
    expect(candImportedParityRawOn.ok).toBe(true);
    expect(candImportedParityRawPitch.ok).toBe(true);
    expect(candImportedParityOnBeat.ok).toBe(true);
    expect(candImportedParityClassical.ok).toBe(true);
    if (
      !refImported.ok ||
      !candImportedMidi.ok ||
      !candImportedPlayback.ok ||
      !candImportedParity.ok ||
      !candImportedParityNorm.ok ||
      !candImportedParityNorm960.ok ||
      !candImportedParityNormNoTie.ok ||
      !candImportedParityNormDetache.ok ||
      !candImportedParityRawOff.ok ||
      !candImportedParityRawOn.ok ||
      !candImportedParityRawPitch.ok ||
      !candImportedParityOnBeat.ok ||
      !candImportedParityClassical.ok
    )
      return;

    const refDoc = parseDoc(refImported.xml);
    const candDocMidi = parseDoc(candImportedMidi.xml);
    const candDocPlayback = parseDoc(candImportedPlayback.xml);
    const candDocParity = parseDoc(candImportedParity.xml);
    const candDocParityNorm = parseDoc(candImportedParityNorm.xml);
    const candDocParityNorm960 = parseDoc(candImportedParityNorm960.xml);
    const candDocParityNormNoTie = parseDoc(candImportedParityNormNoTie.xml);
    const candDocParityNormDetache = parseDoc(candImportedParityNormDetache.xml);
    const candDocParityRawOff = parseDoc(candImportedParityRawOff.xml);
    const candDocParityRawOn = parseDoc(candImportedParityRawOn.xml);
    const candDocParityRawPitch = parseDoc(candImportedParityRawPitch.xml);
    const candDocParityOnBeat = parseDoc(candImportedParityOnBeat.xml);
    const candDocParityClassical = parseDoc(candImportedParityClassical.xml);
    const sourceEvents = collectNoteEvents(sourceDoc);
    const refEvents = collectNoteEvents(refDoc);
    const candEventsMidi = collectNoteEvents(candDocMidi);
    const candEventsPlayback = collectNoteEvents(candDocPlayback);
    const candEventsParity = collectNoteEvents(candDocParity);
    const candEventsParityNorm = collectNoteEvents(candDocParityNorm);
    const candEventsParityNorm960 = collectNoteEvents(candDocParityNorm960);
    const candEventsParityNormNoTie = collectNoteEvents(candDocParityNormNoTie);
    const candEventsParityNormDetache = collectNoteEvents(candDocParityNormDetache);
    const candEventsParityRawOff = collectNoteEvents(candDocParityRawOff);
    const candEventsParityRawOn = collectNoteEvents(candDocParityRawOn);
    const candEventsParityRawPitch = collectNoteEvents(candDocParityRawPitch);
    const candEventsParityOnBeat = collectNoteEvents(candDocParityOnBeat);
    const candEventsParityClassical = collectNoteEvents(candDocParityClassical);
    const diffStrictMidi = diffMultiset(toMultisetStrict(refEvents), toMultisetStrict(candEventsMidi));
    const diffPracticalMidi = diffMultiset(toMultisetPractical(refEvents), toMultisetPractical(candEventsMidi));
    const diffStrictPlayback = diffMultiset(toMultisetStrict(refEvents), toMultisetStrict(candEventsPlayback));
    const diffPracticalPlayback = diffMultiset(
      toMultisetPractical(refEvents),
      toMultisetPractical(candEventsPlayback)
    );
    const diffStrictParity = diffMultiset(toMultisetStrict(refEvents), toMultisetStrict(candEventsParity));
    const diffPracticalParity = diffMultiset(toMultisetPractical(refEvents), toMultisetPractical(candEventsParity));
    const diffPracticalParityNorm = diffMultiset(
      toMultisetPractical(refEvents),
      toMultisetPractical(candEventsParityNorm)
    );
    const diffPracticalParityNorm960 = diffMultiset(
      toMultisetPractical(refEvents),
      toMultisetPractical(candEventsParityNorm960)
    );
    const diffPracticalParityNormNoTie = diffMultiset(
      toMultisetPractical(refEvents),
      toMultisetPractical(candEventsParityNormNoTie)
    );
    const diffPracticalParityNormDetache = diffMultiset(
      toMultisetPractical(refEvents),
      toMultisetPractical(candEventsParityNormDetache)
    );
    const diffPracticalParityRawOff = diffMultiset(
      toMultisetPractical(refEvents),
      toMultisetPractical(candEventsParityRawOff)
    );
    const diffPracticalParityRawOn = diffMultiset(
      toMultisetPractical(refEvents),
      toMultisetPractical(candEventsParityRawOn)
    );
    const diffPracticalParityRawPitch = diffMultiset(
      toMultisetPractical(refEvents),
      toMultisetPractical(candEventsParityRawPitch)
    );
    const diffPracticalParityOnBeat = diffMultiset(
      toMultisetPractical(refEvents),
      toMultisetPractical(candEventsParityOnBeat)
    );
    const diffPracticalParityClassical = diffMultiset(
      toMultisetPractical(refEvents),
      toMultisetPractical(candEventsParityClassical)
    );
    const bestPractical = Math.min(
      diffPracticalMidi.length,
      diffPracticalPlayback.length,
      diffPracticalParity.length,
      diffPracticalParityNorm.length,
      diffPracticalParityNorm960.length,
      diffPracticalParityNormNoTie.length,
      diffPracticalParityNormDetache.length,
      diffPracticalParityRawOff.length,
      diffPracticalParityRawOn.length,
      diffPracticalParityRawPitch.length,
      diffPracticalParityOnBeat.length,
      diffPracticalParityClassical.length
    );
    const sourceDupHead = summarizeDuplicatePitchAtSameTick(sourceEvents, 8);
    const measureHotspotsMidi = summarizePracticalDiffByMeasure(refEvents, candEventsMidi);
    const measureHotspotsParity = summarizePracticalDiffByMeasure(refEvents, candEventsParity);
    const focusedParityDiff = extractPracticalDiffForMeasures(refEvents, candEventsParity, [13, 14, 15, 16]);

    // eslint-disable-next-line no-console
    console.log(
      `moonlight midi ref notes=${refEvents.length} cand(midi)=${candEventsMidi.length} cand(playback)=${candEventsPlayback.length} cand(parity)=${candEventsParity.length} cand(parity-norm)=${candEventsParityNorm.length} cand(parity-norm-960)=${candEventsParityNorm960.length} cand(parity-norm-no-tie)=${candEventsParityNormNoTie.length} cand(parity-norm-detache)=${candEventsParityNormDetache.length} cand(parity-raw-off)=${candEventsParityRawOff.length} cand(parity-raw-on)=${candEventsParityRawOn.length} cand(parity-raw-pitch)=${candEventsParityRawPitch.length} cand(parity-onbeat)=${candEventsParityOnBeat.length} cand(parity-classical)=${candEventsParityClassical.length}`
    );
    // eslint-disable-next-line no-console
    console.log(
      `moonlight midi diff strict(midi)=${diffStrictMidi.length} practical(midi)=${diffPracticalMidi.length} strict(playback)=${diffStrictPlayback.length} practical(playback)=${diffPracticalPlayback.length} strict(parity)=${diffStrictParity.length} practical(parity)=${diffPracticalParity.length} practical(parity-norm)=${diffPracticalParityNorm.length} practical(parity-norm-960)=${diffPracticalParityNorm960.length} practical(parity-norm-no-tie)=${diffPracticalParityNormNoTie.length} practical(parity-norm-detache)=${diffPracticalParityNormDetache.length} practical(parity-raw-off)=${diffPracticalParityRawOff.length} practical(parity-raw-on)=${diffPracticalParityRawOn.length} practical(parity-raw-pitch)=${diffPracticalParityRawPitch.length} practical(parity-onbeat)=${diffPracticalParityOnBeat.length} practical(parity-classical)=${diffPracticalParityClassical.length}`
    );
    if (sourceDupHead.length > 0) {
      // eslint-disable-next-line no-console
      console.log("moonlight source duplicates first 8 measures:\n" + sourceDupHead.join("\n"));
    }
    if (measureHotspotsMidi.length > 0) {
      // eslint-disable-next-line no-console
      console.log("moonlight practical diff hotspots (safe, first 16 measures):\n" + measureHotspotsMidi.join(", "));
    }
    if (measureHotspotsParity.length > 0) {
      // eslint-disable-next-line no-console
      console.log("moonlight practical diff hotspots (parity, first 16 measures):\n" + measureHotspotsParity.join(", "));
    }
    if (focusedParityDiff.length > 0) {
      // eslint-disable-next-line no-console
      console.log("moonlight practical diff detail (parity m13-m16):\n" + focusedParityDiff.join("\n"));
    }
    if (diffPracticalMidi.length > 0) {
      // eslint-disable-next-line no-console
      console.log("moonlight midi practical(midi) sample:\n" + diffPracticalMidi.slice(0, 60).join("\n"));
    }
    if (diffPracticalPlayback.length > 0) {
      // eslint-disable-next-line no-console
      console.log("moonlight midi practical(playback) sample:\n" + diffPracticalPlayback.slice(0, 60).join("\n"));
    }
    if (diffPracticalParity.length > 0) {
      // eslint-disable-next-line no-console
      console.log("moonlight midi practical(parity) sample:\n" + diffPracticalParity.slice(0, 60).join("\n"));
    }

    expect(refEvents.length).toBeGreaterThan(0);
    expect(candEventsMidi.length).toBeGreaterThan(0);
    expect(candEventsPlayback.length).toBeGreaterThan(0);
    expect(candEventsParity.length).toBeGreaterThan(0);
    // Diagnostic ceiling to detect catastrophic regressions while allowing source-MIDI variance.
    expect(bestPractical).toBeLessThanOrEqual(8000);
  }, 20000);

  it("reports practical diff focused on head measures", () => {
    ensureMidiWriterLoaded();
    const root = resolve(process.cwd(), "tests", "fixtures-local", "roundtrip", "musescore", "moonlight");
    const sourcePath = resolve(root, "pianosonata-di14fanyue-guang-di1le-zhang.musicxml");
    const referenceMidPath = resolve(root, "pianosonata-di14fanyue-guang-di1le-zhang.mid");

    const sourceXml = readFileSync(sourcePath, "utf-8");
    const sourceDoc = parseDoc(sourceXml);
    const referenceMid = new Uint8Array(readFileSync(referenceMidPath));
    const ticksPerQuarter = 480;
    const playback = buildPlaybackEventsFromMusicXmlDoc(sourceDoc, ticksPerQuarter, { mode: "midi" });
    const candidateMid = buildMidiBytesForPlayback(
      playback.events,
      playback.tempo,
      "electric_piano_2",
      collectMidiProgramOverridesFromMusicXmlDoc(sourceDoc),
      collectMidiControlEventsFromMusicXmlDoc(sourceDoc, ticksPerQuarter),
      collectMidiTempoEventsFromMusicXmlDoc(sourceDoc, ticksPerQuarter),
      collectMidiTimeSignatureEventsFromMusicXmlDoc(sourceDoc, ticksPerQuarter),
      collectMidiKeySignatureEventsFromMusicXmlDoc(sourceDoc, ticksPerQuarter),
      { embedMksSysEx: true, ticksPerQuarter, normalizeForParity: true }
    );

    const quantizeGrids = ["1/8", "1/16", "1/32"] as const;
    const results: Array<{ grid: (typeof quantizeGrids)[number]; diff: number; refCount: number; candCount: number }> =
      [];
    for (const grid of quantizeGrids) {
      const refImported = convertMidiToMusicXml(referenceMid, { quantizeGrid: grid, debugMetadata: false });
      const candImported = convertMidiToMusicXml(candidateMid, { quantizeGrid: grid, debugMetadata: false });
      expect(refImported.ok).toBe(true);
      expect(candImported.ok).toBe(true);
      if (!refImported.ok || !candImported.ok) continue;
      const headMeasures = 8;
      const refHead = keepHeadMeasures(collectNoteEvents(parseDoc(refImported.xml)), headMeasures);
      const candHead = keepHeadMeasures(collectNoteEvents(parseDoc(candImported.xml)), headMeasures);
      const headDiff = diffMultiset(toMultisetPractical(refHead), toMultisetPractical(candHead));
      results.push({ grid, diff: headDiff.length, refCount: refHead.length, candCount: candHead.length });
      if (grid === "1/16" && headDiff.length > 0) {
        // eslint-disable-next-line no-console
        console.log("moonlight head practical sample:\n" + headDiff.slice(0, 60).join("\n"));
      }
    }
    expect(results.length).toBeGreaterThan(0);
    const best = results.reduce((min, current) => (current.diff < min.diff ? current : min), results[0]);
    const grid16 = results.find((r) => r.grid === "1/16") ?? best;

    // eslint-disable-next-line no-console
    console.log(
      `moonlight head(8) practical: ${results
        .map((r) => `${r.grid}=${r.diff}(ref=${r.refCount},cand=${r.candCount})`)
        .join(" ")} best=${best.grid}:${best.diff}`
    );
    expect(grid16.refCount).toBeGreaterThan(0);
    expect(grid16.candCount).toBeGreaterThan(0);
    expect(best.diff).toBeLessThanOrEqual(220);
  });
});
