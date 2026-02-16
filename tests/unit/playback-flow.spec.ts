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
