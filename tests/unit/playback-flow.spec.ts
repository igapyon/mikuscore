/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMeasureTimelineForPart,
  compactSynthScheduleForPlayback,
  createBasicWaveSynthEngine,
  startPlayback,
  type SynthSchedule,
} from "../../src/ts/playback-flow";
import { parseMusicXmlDocument } from "../../src/ts/musicxml-io";

type MutableWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

const SAMPLE_SCHEDULE: SynthSchedule = {
  tempo: 120,
  events: [{ midiNumber: 69, start: 0, ticks: 64, channel: 1 }],
};

const createMockAudioContext = (): AudioContext => {
  const destination = {} as AudioNode;
  let state: AudioContextState = "suspended";
  return {
    get state() {
      return state;
    },
    currentTime: 0,
    destination,
    resume: vi.fn(async () => {
      state = "running";
    }),
    createBuffer: vi.fn(() => ({} as AudioBuffer)),
    createBufferSource: vi.fn(() => ({
      buffer: null,
      connect: vi.fn(() => undefined),
      disconnect: vi.fn(() => undefined),
      start: vi.fn(() => undefined),
      stop: vi.fn(() => undefined),
      onended: null,
    })),
    createGain: vi.fn(() => ({
      gain: { setValueAtTime: vi.fn(() => undefined) },
      connect: vi.fn(() => undefined),
      disconnect: vi.fn(() => undefined),
    })),
    createOscillator: vi.fn(() => ({
      type: "sine",
      frequency: { setValueAtTime: vi.fn(() => undefined) },
      connect: vi.fn(() => undefined),
      disconnect: vi.fn(() => undefined),
      start: vi.fn(() => undefined),
      stop: vi.fn(() => undefined),
      onended: null,
    })),
  } as unknown as AudioContext;
};

type ScheduledOscillator = {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

const createInspectableAudioContext = (): { context: AudioContext; oscillators: ScheduledOscillator[] } => {
  const destination = {} as AudioNode;
  let state: AudioContextState = "suspended";
  const oscillators: ScheduledOscillator[] = [];
  const context = {
    get state() {
      return state;
    },
    currentTime: 0,
    destination,
    resume: vi.fn(async () => {
      state = "running";
    }),
    createBuffer: vi.fn(() => ({} as AudioBuffer)),
    createBufferSource: vi.fn(() => ({
      buffer: null,
      connect: vi.fn(() => undefined),
      disconnect: vi.fn(() => undefined),
      start: vi.fn(() => undefined),
      stop: vi.fn(() => undefined),
      onended: null,
    })),
    createGain: vi.fn(() => ({
      gain: {
        setValueAtTime: vi.fn(() => undefined),
        linearRampToValueAtTime: vi.fn(() => undefined),
      },
      connect: vi.fn(() => undefined),
      disconnect: vi.fn(() => undefined),
    })),
    createOscillator: vi.fn(() => {
      const start = vi.fn(() => undefined);
      const stop = vi.fn(() => undefined);
      oscillators.push({ start, stop });
      return {
        type: "sine",
        frequency: { setValueAtTime: vi.fn(() => undefined) },
        connect: vi.fn(() => undefined),
        disconnect: vi.fn(() => undefined),
        start,
        stop,
        onended: null,
      };
    }),
  } as unknown as AudioContext;
  return { context, oscillators };
};

describe("playback-flow audio context bootstrap", () => {
  const mutableWindow = window as MutableWindow;
  const originalAudioContext = mutableWindow.AudioContext;
  const originalWebkitAudioContext = mutableWindow.webkitAudioContext;

  afterEach(() => {
    mutableWindow.AudioContext = originalAudioContext;
    mutableWindow.webkitAudioContext = originalWebkitAudioContext;
  });

  it("uses webkitAudioContext fallback when AudioContext is unavailable", async () => {
    const mockContext = createMockAudioContext();
    const webkitCtor = vi.fn(function MockWebkitAudioContext() {
      return mockContext as unknown as AudioContext;
    }) as unknown as typeof AudioContext;
    mutableWindow.AudioContext = undefined as unknown as typeof AudioContext;
    mutableWindow.webkitAudioContext = webkitCtor;

    const engine = createBasicWaveSynthEngine({ ticksPerQuarter: 128 });
    const unlocked = await engine.unlockFromUserGesture();

    expect(unlocked).toBe(true);
    expect(webkitCtor).toHaveBeenCalledTimes(1);
    expect(mockContext.resume).toHaveBeenCalledTimes(1);
  });

  it("fails gracefully when Web Audio API is unavailable", async () => {
    mutableWindow.AudioContext = undefined as unknown as typeof AudioContext;
    mutableWindow.webkitAudioContext = undefined;
    const engine = createBasicWaveSynthEngine({ ticksPerQuarter: 128 });

    const unlocked = await engine.unlockFromUserGesture();
    expect(unlocked).toBe(false);
    await expect(engine.playSchedule(SAMPLE_SCHEDULE, "sine")).rejects.toThrow(
      "Web Audio API is not available in this browser."
    );
  });
});

describe("playback-flow midi-like scheduling", () => {
  const mutableWindow = window as MutableWindow;
  const originalAudioContext = mutableWindow.AudioContext;
  const originalWebkitAudioContext = mutableWindow.webkitAudioContext;

  afterEach(() => {
    mutableWindow.AudioContext = originalAudioContext;
    mutableWindow.webkitAudioContext = originalWebkitAudioContext;
  });

  it("applies tempo map when scheduling start times", async () => {
    const { context, oscillators } = createInspectableAudioContext();
    mutableWindow.AudioContext = vi.fn(function MockAudioContext() {
      return context as unknown as AudioContext;
    }) as unknown as typeof AudioContext;
    mutableWindow.webkitAudioContext = undefined;
    const engine = createBasicWaveSynthEngine({ ticksPerQuarter: 128 });

    await engine.playSchedule(
      {
        tempo: 120,
        tempoEvents: [
          { startTick: 0, bpm: 120 },
          { startTick: 128, bpm: 60 },
        ],
        events: [
          { midiNumber: 60, start: 0, ticks: 128, channel: 1 },
          { midiNumber: 62, start: 128, ticks: 128, channel: 1 },
        ],
      },
      "sine"
    );

    expect(oscillators).toHaveLength(2);
    expect(oscillators[0].start).toHaveBeenCalledWith(expect.closeTo(0.04, 6));
    expect(oscillators[1].start).toHaveBeenCalledWith(expect.closeTo(0.54, 6));
  });

  it("extends note release when pedal range is active", async () => {
    const { context, oscillators } = createInspectableAudioContext();
    mutableWindow.AudioContext = vi.fn(function MockAudioContext() {
      return context as unknown as AudioContext;
    }) as unknown as typeof AudioContext;
    mutableWindow.webkitAudioContext = undefined;
    const engine = createBasicWaveSynthEngine({ ticksPerQuarter: 128 });

    await engine.playSchedule(
      {
        tempo: 120,
        pedalRanges: [{ channel: 1, startTick: 0, endTick: 128 }],
        events: [{ midiNumber: 69, start: 0, ticks: 64, channel: 1 }],
      },
      "sine"
    );

    expect(oscillators).toHaveLength(1);
    expect(oscillators[0].stop).toHaveBeenCalledWith(expect.closeTo(0.51, 6));
  });

  it("reports playback tick progress when scheduling starts", async () => {
    const { context } = createInspectableAudioContext();
    mutableWindow.AudioContext = vi.fn(function MockAudioContext() {
      return context as unknown as AudioContext;
    }) as unknown as typeof AudioContext;
    mutableWindow.webkitAudioContext = undefined;
    const engine = createBasicWaveSynthEngine({ ticksPerQuarter: 128 });
    const onTickUpdate = vi.fn();

    await engine.playSchedule(
      {
        tempo: 120,
        events: [{ midiNumber: 69, start: 0, ticks: 64, channel: 1 }],
      },
      "sine",
      onTickUpdate
    );

    expect(onTickUpdate).toHaveBeenCalledWith(0);
  });

  it("compacts dense schedules by capping notes per onset and overall event budget", () => {
    const schedule: SynthSchedule = {
      tempo: 120,
      events: Array.from({ length: 120 }, (_, onset) =>
        Array.from({ length: 60 }, (_, pitch) => ({
          midiNumber: 30 + (pitch % 60),
          start: onset * 10,
          ticks: pitch < 10 ? 1 : 64 + (pitch % 3),
          channel: 1,
          trackId: `t${pitch}`,
        }))
      ).flat(),
    };

    const compacted = compactSynthScheduleForPlayback(schedule, 128);

    expect(compacted.summary.applied).toBe(true);
    expect(compacted.summary.originalEventCount).toBe(7200);
    expect(compacted.summary.finalEventCount).toBeLessThanOrEqual(4096);
    expect(compacted.summary.droppedUltraShortCount).toBe(1200);
    expect(compacted.summary.droppedDenseOnsetCount).toBe(240);
    expect(compacted.summary.droppedBudgetCount).toBeGreaterThan(0);
    const countsByOnset = new Map<number, number>();
    for (const event of compacted.schedule.events) {
      countsByOnset.set(event.start, (countsByOnset.get(event.start) ?? 0) + 1);
      expect(event.ticks).toBeGreaterThanOrEqual(2);
    }
    expect(Math.max(...countsByOnset.values())).toBeLessThanOrEqual(48);
  });

  it("uses compacted schedules before creating oscillators for dense playback", async () => {
    const { context, oscillators } = createInspectableAudioContext();
    mutableWindow.AudioContext = vi.fn(function MockAudioContext() {
      return context as unknown as AudioContext;
    }) as unknown as typeof AudioContext;
    mutableWindow.webkitAudioContext = undefined;
    const engine = createBasicWaveSynthEngine({ ticksPerQuarter: 128 });

    const denseSchedule: SynthSchedule = {
      tempo: 120,
      events: Array.from({ length: 60 }, (_, onset) =>
        Array.from({ length: 50 }, (_, pitch) => ({
          midiNumber: 40 + (pitch % 40),
          start: onset * 8,
          ticks: 48,
          channel: 1,
          trackId: `part-${pitch}`,
        }))
      ).flat(),
    };

    await engine.playSchedule(denseSchedule, "sine");

    expect(oscillators.length).toBe(2880);
  });

  it("keeps small same-onset chords intact even when dense playback compaction applies", () => {
    const denseEvents = Array.from({ length: 90 }, (_, onset) =>
      Array.from({ length: 48 }, (_, pitch) => ({
        midiNumber: 20 + pitch,
        start: onset * 12,
        ticks: 48,
        channel: 1,
        trackId: `dense-${onset}-${pitch}`,
      }))
    ).flat();
    const smallChordStarts = [9999, 10011, 10023];
    const smallChordEvents = smallChordStarts.map((start, index) => ({
      midiNumber: 72 + index,
      start,
      ticks: 48,
      channel: 1,
      trackId: `small-${index}`,
    }));
    const schedule: SynthSchedule = {
      tempo: 120,
      events: [...denseEvents, ...smallChordEvents],
    };

    const compacted = compactSynthScheduleForPlayback(schedule, 128);

    expect(compacted.summary.applied).toBe(true);
    for (const start of smallChordStarts) {
      const keptAtStart = compacted.schedule.events.filter((event) => event.start === start);
      expect(keptAtStart).toHaveLength(1);
    }
  });

  it("prefers keeping outer voices and non-octave duplicates inside a dense onset", () => {
    const wideOctaveCluster = Array.from({ length: 10 }, (_, octave) => ({
      midiNumber: 24 + octave * 12,
      start: 0,
      ticks: 48,
      channel: 1,
      trackId: `oct-${octave}`,
    }));
    const uniqueUpper = Array.from({ length: 40 }, (_, i) => ({
      midiNumber: 61 + i,
      start: 0,
      ticks: 48,
      channel: 1,
      trackId: `uniq-${i}`,
    }));
    const filler = Array.from({ length: 2100 }, (_, i) => ({
      midiNumber: 30 + (i % 24),
      start: 100 + i * 2,
      ticks: 48,
      channel: 1,
      trackId: `fill-${i}`,
    }));
    const schedule: SynthSchedule = {
      tempo: 120,
      events: [...wideOctaveCluster, ...uniqueUpper, ...filler],
    };

    const compacted = compactSynthScheduleForPlayback(schedule, 128);
    const keptAtZero = compacted.schedule.events.filter((event) => event.start === 0);
    const keptMidis = keptAtZero.map((event) => event.midiNumber);

    expect(keptAtZero).toHaveLength(48);
    expect(keptMidis).toContain(24);
    expect(keptMidis).toContain(132);
    expect(keptMidis).toContain(61);
    expect(keptMidis).toContain(100);
    expect(keptMidis).not.toContain(36);
    expect(keptMidis).not.toContain(48);
  });

  it("builds measure timeline with pickup-aware first bar lengths", () => {
    const xml = `
      <score-partwise version="4.0">
        <part-list>
          <score-part id="P1"><part-name>P1</part-name></score-part>
          <score-part id="P2"><part-name>P2</part-name></score-part>
        </part-list>
        <part id="P1">
          <measure number="0">
            <attributes>
              <divisions>4</divisions>
              <time><beats>4</beats><beat-type>4</beat-type></time>
            </attributes>
            <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>
          </measure>
          <measure number="1">
            <note><pitch><step>D</step><octave>4</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type></note>
          </measure>
        </part>
        <part id="P2">
          <measure number="0">
            <attributes>
              <divisions>4</divisions>
              <time><beats>4</beats><beat-type>4</beat-type></time>
            </attributes>
            <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type></note>
          </measure>
          <measure number="1">
            <note><pitch><step>F</step><octave>4</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type></note>
          </measure>
        </part>
      </score-partwise>
    `;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;

    const timeline = buildMeasureTimelineForPart(doc, "P1", 480);

    expect(timeline).toHaveLength(2);
    expect(timeline[0]?.startTick).toBe(0);
    expect(timeline[0]?.endTick).toBe(480);
    expect(timeline[1]?.startTick).toBe(480);
  });

  it("maps playback location to the selected measure when playback starts mid-score", async () => {
    const xml = `
      <score-partwise version="4.0">
        <part-list>
          <score-part id="P1"><part-name>P1</part-name></score-part>
        </part-list>
        <part id="P1">
          <measure number="1">
            <attributes>
              <divisions>4</divisions>
              <time><beats>4</beats><beat-type>4</beat-type></time>
            </attributes>
            <note><pitch><step>C</step><octave>4</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type></note>
          </measure>
          <measure number="2">
            <note><pitch><step>D</step><octave>4</octave></pitch><duration>16</duration><voice>1</voice><type>whole</type></note>
          </measure>
        </part>
      </score-partwise>
    `;
    const setActivePlaybackLocation = vi.fn();
    const engine = {
      stop: vi.fn(),
      playSchedule: vi.fn(async (_schedule, _waveform, onTickUpdate) => {
        onTickUpdate?.(0);
      }),
    } as unknown as ReturnType<typeof createBasicWaveSynthEngine>;
    const options = {
      engine,
      ticksPerQuarter: 480,
      editableVoice: "1",
      getPlaybackWaveform: () => "sine" as OscillatorType,
      getUseMidiLikePlayback: () => false,
      getGraceTimingMode: () => "steal-current" as const,
      getMetricAccentEnabled: () => false,
      getMetricAccentProfile: () => "classic" as const,
      debugLog: false,
      getIsPlaying: () => false,
      setIsPlaying: vi.fn(),
      setPlaybackText: vi.fn(),
      setActivePlaybackLocation,
      renderControlState: vi.fn(),
      renderAll: vi.fn(),
      logDiagnostics: vi.fn(),
      dumpOverfullContext: vi.fn(),
      onFullSaveResult: vi.fn(),
      onMeasureSaveDiagnostics: vi.fn(),
    };
    const core = {
      save: () => ({ ok: true, xml, diagnostics: [], warnings: [], dirtyChanged: false, changedNodeIds: [], affectedMeasureNumbers: [] }),
      debugSerializeCurrentXml: () => xml,
    };

    await startPlayback(options, {
      isLoaded: true,
      core,
      startFromMeasure: { partId: "P1", measureNumber: "2" },
    });

    expect(setActivePlaybackLocation).toHaveBeenCalledWith({ partId: "P1", measureNumber: "2" });
    expect(setActivePlaybackLocation.mock.calls.at(-1)?.[0]).toEqual({ partId: "P1", measureNumber: "2" });
  });
});