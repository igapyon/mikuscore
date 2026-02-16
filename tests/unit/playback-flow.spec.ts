// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBasicWaveSynthEngine, type SynthSchedule } from "../../src/ts/playback-flow";

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
});
