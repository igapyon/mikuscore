/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Diagnostic, SaveResult } from "../../core/interfaces";
import {
  buildMidiBytesForPlayback,
  buildPlaybackEventsFromMusicXmlDoc,
  collectMidiControlEventsFromMusicXmlDoc,
  collectMidiKeySignatureEventsFromMusicXmlDoc,
  type MidiControlEvent,
  type MidiTempoEvent,
  collectMidiProgramOverridesFromMusicXmlDoc,
  collectMidiTimeSignatureEventsFromMusicXmlDoc,
  collectMidiTempoEventsFromMusicXmlDoc,
  type GraceTimingMode,
  type MetricAccentProfile,
} from "./midi-io";
import { parseMusicXmlDocument } from "./musicxml-io";

export type SynthSchedule = {
  tempo: number;
  tempoEvents?: Array<{ startTick: number; bpm: number }>;
  pedalRanges?: Array<{ channel: number; startTick: number; endTick: number }>;
  events: Array<{
    midiNumber: number;
    start: number;
    ticks: number;
    channel: number;
    trackId?: string;
  }>;
};

export type BasicWaveSynthEngine = {
  unlockFromUserGesture: () => Promise<boolean>;
  playSchedule: (
    schedule: SynthSchedule,
    waveform: OscillatorType,
    onTickUpdate?: (currentTick: number) => void,
    onEnded?: () => void
  ) => Promise<void>;
  stop: () => void;
};

export const PLAYBACK_TICKS_PER_QUARTER = 480;
const DENSE_PLAYBACK_EVENT_THRESHOLD = 2048;
const DENSE_PLAYBACK_MAX_EVENTS = 4096;
const DENSE_PLAYBACK_MAX_EVENTS_PER_ONSET = 48;
const DENSE_PLAYBACK_MIN_EVENT_TICKS_DIVISOR = 64;
const DENSE_PLAYBACK_PROTECTED_ONSET_SIZE = 8;

const summarizeDiagnostics = (diagnostics: Diagnostic[]): string => {
  if (!diagnostics.length) return "unknown reason";
  const first = diagnostics[0];
  const firstText = `[${first.code}] ${first.message}`;
  if (diagnostics.length === 1) return firstText;
  return `${firstText} (+${diagnostics.length - 1} more)`;
};

const logPlaybackFailureDiagnostics = (label: string, diagnostics: Diagnostic[]): void => {
  if (!diagnostics.length) {
    console.warn(`[mikuscore][playback] ${label}: no diagnostics.`);
    return;
  }
  console.error(`[mikuscore][playback] ${label}:`);
  for (const d of diagnostics) {
    console.error(`- [${d.code}] ${d.message}`);
  }
};

const midiToHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

const normalizeWaveform = (value: string): OscillatorType => {
  if (value === "square" || value === "triangle") return value;
  return "sine";
};

type LightweightPlaybackSummary = {
  applied: boolean;
  originalEventCount: number;
  finalEventCount: number;
  droppedUltraShortCount: number;
  droppedDenseOnsetCount: number;
  droppedBudgetCount: number;
};

const compareScheduleEventsForRetention = (
  a: SynthSchedule["events"][number],
  b: SynthSchedule["events"][number]
): number => {
  if (b.ticks !== a.ticks) return b.ticks - a.ticks;
  if (a.channel === 10 && b.channel !== 10) return -1;
  if (b.channel === 10 && a.channel !== 10) return 1;
  if (a.start !== b.start) return a.start - b.start;
  if (a.midiNumber !== b.midiNumber) return b.midiNumber - a.midiNumber;
  return (a.trackId ?? "").localeCompare(b.trackId ?? "");
};

const prioritizeOnsetGroupForRetention = (
  group: SynthSchedule["events"]
): SynthSchedule["events"] => {
  const sortedByMidi = group.slice().sort((a, b) =>
    a.midiNumber === b.midiNumber ? compareScheduleEventsForRetention(a, b) : a.midiNumber - b.midiNumber
  );
  const lowestMidi = sortedByMidi[0]?.midiNumber ?? 0;
  const highestMidi = sortedByMidi[sortedByMidi.length - 1]?.midiNumber ?? 0;
  const byPitchClass = new Map<number, SynthSchedule["events"]>();
  for (const event of sortedByMidi) {
    const pitchClass = ((event.midiNumber % 12) + 12) % 12;
    const bucket = byPitchClass.get(pitchClass) ?? [];
    bucket.push(event);
    byPitchClass.set(pitchClass, bucket);
  }

  const anchors: SynthSchedule["events"] = [];
  const uniquePitchClasses: SynthSchedule["events"] = [];
  const octaveOuter: SynthSchedule["events"] = [];
  const octaveInner: SynthSchedule["events"] = [];

  for (const event of sortedByMidi) {
    if (event.midiNumber === lowestMidi || event.midiNumber === highestMidi) {
      anchors.push(event);
      continue;
    }
    const pitchClass = ((event.midiNumber % 12) + 12) % 12;
    const bucket = byPitchClass.get(pitchClass) ?? [];
    if (bucket.length <= 1) {
      uniquePitchClasses.push(event);
      continue;
    }
    const bucketLowest = bucket[0]?.midiNumber ?? event.midiNumber;
    const bucketHighest = bucket[bucket.length - 1]?.midiNumber ?? event.midiNumber;
    if (event.midiNumber === bucketLowest || event.midiNumber === bucketHighest) {
      octaveOuter.push(event);
    } else {
      octaveInner.push(event);
    }
  }

  const sortBucket = (bucket: SynthSchedule["events"]): SynthSchedule["events"] =>
    bucket.slice().sort(compareScheduleEventsForRetention);

  return [
    ...sortBucket(anchors),
    ...sortBucket(uniquePitchClasses),
    ...sortBucket(octaveOuter),
    ...sortBucket(octaveInner),
  ];
};

export const compactSynthScheduleForPlayback = (
  schedule: SynthSchedule,
  ticksPerQuarter: number
): { schedule: SynthSchedule; summary: LightweightPlaybackSummary } => {
  const originalEventCount = Array.isArray(schedule.events) ? schedule.events.length : 0;
  if (originalEventCount <= DENSE_PLAYBACK_EVENT_THRESHOLD) {
    return {
      schedule,
      summary: {
        applied: false,
        originalEventCount,
        finalEventCount: originalEventCount,
        droppedUltraShortCount: 0,
        droppedDenseOnsetCount: 0,
        droppedBudgetCount: 0,
      },
    };
  }

  const minDenseEventTicks = Math.max(1, Math.round(ticksPerQuarter / DENSE_PLAYBACK_MIN_EVENT_TICKS_DIVISOR));
  const keptAfterShortFilter: SynthSchedule["events"] = [];
  let droppedUltraShortCount = 0;
  for (const event of schedule.events) {
    if ((event.ticks ?? 0) < minDenseEventTicks) {
      droppedUltraShortCount += 1;
      continue;
    }
    keptAfterShortFilter.push(event);
  }

  const byOnset = new Map<number, SynthSchedule["events"]>();
  for (const event of keptAfterShortFilter) {
    const group = byOnset.get(event.start) ?? [];
    group.push(event);
    byOnset.set(event.start, group);
  }

  const orderedOnsets = Array.from(byOnset.keys()).sort((a, b) => a - b);
  const onsetGroups = orderedOnsets.map((start) => {
    const retained = prioritizeOnsetGroupForRetention(byOnset.get(start) ?? []);
    return retained.slice(0, DENSE_PLAYBACK_MAX_EVENTS_PER_ONSET);
  });
  const denseLimitedEvents: SynthSchedule["events"] = [];
  for (const group of onsetGroups) {
    denseLimitedEvents.push(...group);
  }
  const droppedDenseOnsetCount = keptAfterShortFilter.length - denseLimitedEvents.length;

  let finalEvents = denseLimitedEvents;
  let droppedBudgetCount = 0;
  if (denseLimitedEvents.length > DENSE_PLAYBACK_MAX_EVENTS) {
    const protectedGroups = onsetGroups.filter((group) => group.length <= DENSE_PLAYBACK_PROTECTED_ONSET_SIZE);
    const reducibleGroups = onsetGroups
      .filter((group) => group.length > DENSE_PLAYBACK_PROTECTED_ONSET_SIZE)
      .map((group) => group.slice());
    const retained: SynthSchedule["events"] = [];
    for (const group of protectedGroups) {
      retained.push(...group);
    }
    if (retained.length < DENSE_PLAYBACK_MAX_EVENTS) {
      const rounds = reducibleGroups.reduce((max, group) => Math.max(max, group.length), 0);
      for (let round = 0; round < rounds && retained.length < DENSE_PLAYBACK_MAX_EVENTS; round += 1) {
        for (const group of reducibleGroups) {
          const event = group[round];
          if (!event) continue;
          retained.push(event);
          if (retained.length >= DENSE_PLAYBACK_MAX_EVENTS) break;
        }
      }
    }
    if (retained.length > DENSE_PLAYBACK_MAX_EVENTS) {
      retained.length = DENSE_PLAYBACK_MAX_EVENTS;
    }
    finalEvents = retained.sort((a, b) =>
      a.start === b.start ? a.midiNumber - b.midiNumber : a.start - b.start
    );
    droppedBudgetCount = denseLimitedEvents.length - finalEvents.length;
  }

  return {
    schedule: {
      ...schedule,
      events: finalEvents,
    },
    summary: {
      applied: true,
      originalEventCount,
      finalEventCount: finalEvents.length,
      droppedUltraShortCount,
      droppedDenseOnsetCount,
      droppedBudgetCount,
    },
  };
};

export const createBasicWaveSynthEngine = (options: { ticksPerQuarter: number }): BasicWaveSynthEngine => {
  const ticksPerQuarter = Number.isFinite(options.ticksPerQuarter)
    ? Math.max(1, Math.round(options.ticksPerQuarter))
    : 480;
  let audioContext: AudioContext | null = null;
  let activeSynthNodes: Array<{ oscillator: OscillatorNode; gainNode: GainNode }> = [];
  let synthStopTimer: number | null = null;
  let playbackProgressTimer: number | null = null;

  const hasActiveUserGesture = (): boolean => {
    const nav = navigator as Navigator & {
      userActivation?: { isActive?: boolean; hasBeenActive?: boolean };
    };
    const ua = nav.userActivation;
    if (!ua) return true;
    return ua.isActive === true || ua.hasBeenActive === true;
  };

  const ensureAudioContext = (): AudioContext => {
    if (audioContext) return audioContext;
    const ctor =
      window.AudioContext ||
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!ctor) {
      throw new Error("Web Audio API is not available in this browser.");
    }
    audioContext = new ctor();
    return audioContext;
  };

  const ensureAudioContextRunning = async (): Promise<AudioContext> => {
    const context = ensureAudioContext();
    if (context.state !== "running") {
      // Avoid autoplay-policy warnings by not calling resume() outside user activation.
      if (!hasActiveUserGesture()) {
        throw new Error("AudioContext resume requires an active user gesture.");
      }
      await context.resume();
    }
    if (context.state !== "running") {
      throw new Error("AudioContext is not running.");
    }
    return context;
  };

  const scheduleBasicWaveNote = (
    event: SynthSchedule["events"][number],
    startAt: number,
    bodyDuration: number,
    waveform: OscillatorType,
    sustainHoldSeconds = 0,
    legatoFromOverlap = false
  ): number => {
    if (!audioContext) return startAt;
    const isSine = waveform === "sine";
    const attack = legatoFromOverlap && !isSine ? 0.0015 : 0.005;
    const release = legatoFromOverlap || isSine ? 0.03 : 0.01;
    const endAt = startAt + bodyDuration;
    const heldEndAt = endAt + Math.max(0, sustainHoldSeconds);
    const oscillator = audioContext.createOscillator();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(midiToHz(event.midiNumber), startAt);

    const gainNode = audioContext.createGain();
    const gainLevel = event.channel === 10 ? 0.06 : 0.1;
    if (legatoFromOverlap && !isSine) {
      gainNode.gain.setValueAtTime(gainLevel * 0.75, startAt);
      gainNode.gain.linearRampToValueAtTime(gainLevel, startAt + attack);
    } else {
      gainNode.gain.setValueAtTime(0.0001, startAt);
      gainNode.gain.linearRampToValueAtTime(gainLevel, startAt + attack);
    }
    gainNode.gain.setValueAtTime(gainLevel, heldEndAt);
    gainNode.gain.linearRampToValueAtTime(0.0001, heldEndAt + release);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(heldEndAt + release + 0.01);
    oscillator.onended = () => {
      try {
        oscillator.disconnect();
        gainNode.disconnect();
      } catch {
        // ignore cleanup failure
      }
    };
    activeSynthNodes.push({ oscillator, gainNode });
    return heldEndAt + release + 0.02;
  };

  const stop = (): void => {
    if (synthStopTimer !== null) {
      window.clearTimeout(synthStopTimer);
      synthStopTimer = null;
    }
    if (playbackProgressTimer !== null) {
      window.clearInterval(playbackProgressTimer);
      playbackProgressTimer = null;
    }
    for (const node of activeSynthNodes) {
      try {
        node.oscillator.stop();
      } catch {
        // ignore already-stopped nodes
      }
      try {
        node.oscillator.disconnect();
        node.gainNode.disconnect();
      } catch {
        // ignore disconnect error
      }
    }
    activeSynthNodes = [];
  };

  const unlockFromUserGesture = async (): Promise<boolean> => {
    let context: AudioContext;
    try {
      context = await ensureAudioContextRunning();
    } catch {
      return false;
    }

    try {
      const src = context.createBufferSource();
      src.buffer = context.createBuffer(1, 1, 22050);
      const gainNode = context.createGain();
      gainNode.gain.setValueAtTime(0.000001, context.currentTime);
      src.connect(gainNode);
      gainNode.connect(context.destination);
      src.start(context.currentTime);
      src.stop(context.currentTime + 0.005);
      src.onended = () => {
        try {
          src.disconnect();
          gainNode.disconnect();
        } catch {
          // ignore cleanup failure
        }
      };
      return true;
    } catch {
      return false;
    }
  };

  const playSchedule = async (
    schedule: SynthSchedule,
    waveform: OscillatorType,
    onTickUpdate?: (currentTick: number) => void,
    onEnded?: () => void
  ): Promise<void> => {
    if (!schedule || !Array.isArray(schedule.events) || schedule.events.length === 0) {
      throw new Error("Please convert first.");
    }

    const runningContext = await ensureAudioContextRunning();
    stop();
    const compacted = compactSynthScheduleForPlayback(schedule, ticksPerQuarter);
    const effectiveSchedule = compacted.schedule;

    const normalizedWaveform = normalizeWaveform(waveform);
    const normalizedTempoEvents = (effectiveSchedule.tempoEvents?.length
      ? effectiveSchedule.tempoEvents
      : [{ startTick: 0, bpm: Math.max(1, Number(effectiveSchedule.tempo) || 120) }]
    )
      .map((event) => ({
        startTick: Math.max(0, Math.round(event.startTick)),
        bpm: Math.max(1, Math.round(event.bpm || 120)),
      }))
      .sort((a, b) => a.startTick - b.startTick);
    const mergedTempoEvents: Array<{ startTick: number; bpm: number }> = [];
    for (const event of normalizedTempoEvents) {
      const prev = mergedTempoEvents[mergedTempoEvents.length - 1];
      if (prev && prev.startTick === event.startTick) {
        prev.bpm = event.bpm;
      } else {
        mergedTempoEvents.push({ ...event });
      }
    }
    if (!mergedTempoEvents.length || mergedTempoEvents[0].startTick !== 0) {
      mergedTempoEvents.unshift({ startTick: 0, bpm: Math.max(1, Number(effectiveSchedule.tempo) || 120) });
    }
    const tickToSeconds = (targetTick: number): number => {
      let seconds = 0;
      let cursorTick = 0;
      for (let i = 0; i < mergedTempoEvents.length; i += 1) {
        const current = mergedTempoEvents[i];
        const nextStart = mergedTempoEvents[i + 1]?.startTick ?? Number.POSITIVE_INFINITY;
        const segStart = Math.max(cursorTick, current.startTick);
        if (targetTick <= segStart) break;
        const segEnd = Math.min(targetTick, nextStart);
        if (segEnd <= segStart) continue;
        const secPerTick = 60 / (current.bpm * ticksPerQuarter);
        seconds += (segEnd - segStart) * secPerTick;
        cursorTick = segEnd;
        if (segEnd >= targetTick) break;
      }
      return seconds;
    };
    const secondsToTick = (elapsedSeconds: number): number => {
      if (!(elapsedSeconds > 0)) return 0;
      let remainingSeconds = elapsedSeconds;
      let resolvedTick = 0;
      for (let i = 0; i < mergedTempoEvents.length; i += 1) {
        const current = mergedTempoEvents[i];
        const nextStart = mergedTempoEvents[i + 1]?.startTick ?? Number.POSITIVE_INFINITY;
        const currentStart = current.startTick;
        const spanTicks = Number.isFinite(nextStart) ? Math.max(0, nextStart - currentStart) : Number.POSITIVE_INFINITY;
        const secPerTick = 60 / (current.bpm * ticksPerQuarter);
        const spanSeconds = Number.isFinite(spanTicks) ? spanTicks * secPerTick : Number.POSITIVE_INFINITY;
        if (remainingSeconds <= spanSeconds) {
          return Math.max(resolvedTick, currentStart + Math.round(remainingSeconds / secPerTick));
        }
        remainingSeconds -= spanSeconds;
        resolvedTick = Number.isFinite(spanTicks) ? nextStart : resolvedTick;
      }
      return Math.max(0, resolvedTick);
    };
    const baseTime = runningContext.currentTime + 0.04;
    let latestEndTime = baseTime;
    const pedalRanges = (effectiveSchedule.pedalRanges ?? []).map((range) => ({
      channel: Math.max(1, Math.min(16, Math.round(range.channel || 1))),
      startTick: Math.max(0, Math.round(range.startTick)),
      endTick: Math.max(0, Math.round(range.endTick)),
    }));
    const isPedalHeldAt = (channel: number, tick: number): boolean => {
      return pedalRanges.some((range) => range.channel === channel && tick >= range.startTick && tick < range.endTick);
    };
    const laneStarts = new Map<string, number[]>();
    for (const event of effectiveSchedule.events) {
      const laneKey = `${event.channel}|${event.trackId ?? ""}`;
      const starts = laneStarts.get(laneKey) ?? [];
      starts.push(event.start);
      laneStarts.set(laneKey, starts);
    }
    for (const [laneKey, starts] of laneStarts.entries()) {
      const uniqSorted = Array.from(new Set(starts)).sort((a, b) => a - b);
      laneStarts.set(laneKey, uniqSorted);
    }
    const findNextStartTickOnLane = (laneKey: string, startTick: number): number | null => {
      const starts = laneStarts.get(laneKey);
      if (!starts || starts.length === 0) return null;
      let lo = 0;
      let hi = starts.length - 1;
      let ans = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if ((starts[mid] ?? 0) > startTick) {
          ans = starts[mid] ?? -1;
          hi = mid - 1;
        } else {
          lo = mid + 1;
        }
      }
      return ans >= 0 ? ans : null;
    };
    const lastNoteByLane = new Map<string, { startTick: number; endTick: number }>();

    for (const event of effectiveSchedule.events) {
      const laneKey = `${event.channel}|${event.trackId ?? ""}`;
      const prevInLane = lastNoteByLane.get(laneKey);
      const legatoFromOverlap =
        (prevInLane?.startTick ?? -1) < event.start && (prevInLane?.endTick ?? -1) > event.start;
      const startAt = baseTime + tickToSeconds(event.start);
      const endAt = baseTime + tickToSeconds(event.start + event.ticks);
      let bodyDuration = Math.max(0.04, endAt - startAt);
      const nextStartTick = findNextStartTickOnLane(laneKey, event.start);
      if (
        normalizedWaveform !== "sine"
        && !legatoFromOverlap
        && nextStartTick !== null
        && nextStartTick > event.start
      ) {
        const hasForwardOverlapIntent = event.start + event.ticks > nextStartTick;
        if (!hasForwardOverlapIntent) {
          const nextStartAt = baseTime + tickToSeconds(nextStartTick);
          const separatedEndAt = Math.max(startAt + 0.02, nextStartAt - 0.006);
          bodyDuration = Math.max(0.02, Math.min(bodyDuration, separatedEndAt - startAt));
        }
      }
      const sustainHoldSeconds = isPedalHeldAt(event.channel, event.start) ? 0.18 : 0;
      latestEndTime = Math.max(
        latestEndTime,
        scheduleBasicWaveNote(
          event,
          startAt,
          bodyDuration,
          normalizedWaveform,
          sustainHoldSeconds,
          legatoFromOverlap
        )
      );
      lastNoteByLane.set(laneKey, { startTick: event.start, endTick: event.start + event.ticks });
    }

    if (typeof onTickUpdate === "function") {
      onTickUpdate(0);
      playbackProgressTimer = window.setInterval(() => {
        const elapsed = Math.max(0, runningContext.currentTime - baseTime);
        onTickUpdate(secondsToTick(elapsed));
      }, 90);
    }
    const waitMs = Math.max(0, Math.ceil((latestEndTime - runningContext.currentTime) * 1000));
    synthStopTimer = window.setTimeout(() => {
      activeSynthNodes = [];
      if (playbackProgressTimer !== null) {
        window.clearInterval(playbackProgressTimer);
        playbackProgressTimer = null;
      }
      if (typeof onEnded === "function") {
        onEnded();
      }
    }, waitMs);
  };

  return { unlockFromUserGesture, playSchedule, stop };
};

const toSynthSchedule = (
  tempo: number,
  events: Array<{ midiNumber: number; startTicks: number; durTicks: number; channel: number; trackId?: string }>,
  tempoEvents: Array<{ startTicks: number; bpm: number }> = [],
  controlEvents: Array<{ channel: number; startTicks: number; controllerNumber: number; controllerValue: number }> = []
): SynthSchedule => {
  const normalizedTempoEvents = tempoEvents
    .map((event) => ({
      startTick: Math.max(0, Math.round(event.startTicks)),
      bpm: Math.max(1, Math.round(event.bpm || 120)),
    }))
    .sort((a, b) => a.startTick - b.startTick);
  const cc64Events = controlEvents
    .filter((event) => event.controllerNumber === 64)
    .map((event) => ({
      channel: Math.max(1, Math.min(16, Math.round(event.channel || 1))),
      startTick: Math.max(0, Math.round(event.startTicks)),
      value: Math.max(0, Math.min(127, Math.round(event.controllerValue))),
    }))
    .sort((a, b) => (a.channel === b.channel ? a.startTick - b.startTick : a.channel - b.channel));
  const pedalRanges: Array<{ channel: number; startTick: number; endTick: number }> = [];
  const rangeStartByChannel = new Map<number, number>();
  for (const event of cc64Events) {
    const pedalOn = event.value >= 64;
    if (pedalOn) {
      if (!rangeStartByChannel.has(event.channel)) {
        rangeStartByChannel.set(event.channel, event.startTick);
      }
      continue;
    }
    const start = rangeStartByChannel.get(event.channel);
    if (start !== undefined) {
      pedalRanges.push({ channel: event.channel, startTick: start, endTick: event.startTick });
      rangeStartByChannel.delete(event.channel);
    }
  }
  const latestNoteTick = events.reduce(
    (max, event) => Math.max(max, Math.max(0, Math.round(event.startTicks + event.durTicks))),
    0
  );
  for (const [channel, startTick] of rangeStartByChannel.entries()) {
    pedalRanges.push({
      channel,
      startTick,
      endTick: Math.max(startTick + 1, latestNoteTick + 1),
    });
  }
  return {
    tempo,
    tempoEvents: normalizedTempoEvents,
    pedalRanges,
    events: events
      .slice()
      .sort((a, b) =>
        a.startTicks === b.startTicks ? a.midiNumber - b.midiNumber : a.startTicks - b.startTicks
      )
      .map((event) => ({
        midiNumber: event.midiNumber,
        start: event.startTicks,
        ticks: event.durTicks,
        channel: event.channel,
        trackId: event.trackId,
      })),
  };
};

export type PlaybackFlowOptions = {
  engine: BasicWaveSynthEngine;
  ticksPerQuarter: number;
  editableVoice: string;
  getPlaybackWaveform: () => OscillatorType;
  getUseMidiLikePlayback: () => boolean;
  getGraceTimingMode: () => GraceTimingMode;
  getMetricAccentEnabled: () => boolean;
  getMetricAccentProfile: () => MetricAccentProfile;
  debugLog: boolean;
  getIsPlaying: () => boolean;
  setIsPlaying: (isPlaying: boolean) => void;
  setPlaybackText: (text: string) => void;
  setActivePlaybackLocation: (location: PlaybackStartLocation | null) => void;
  renderControlState: () => void;
  renderAll: () => void;
  logDiagnostics: (
    scope: "load" | "dispatch" | "save" | "playback",
    diagnostics: Diagnostic[]
  ) => void;
  dumpOverfullContext: (xml: string, voice: string) => void;
  onFullSaveResult: (saveResult: SaveResult) => void;
  onMeasureSaveDiagnostics: (diagnostics: Diagnostic[]) => void;
};

type SaveCapableCore = {
  save: () => SaveResult;
  debugSerializeCurrentXml: () => string | null;
};

type PlaybackStartLocation = {
  partId: string;
  measureNumber: string;
};

const parsePositiveInt = (text: string | null | undefined): number | null => {
  const value = Number.parseInt(String(text ?? "").trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const getFirstNumber = (el: ParentNode, selector: string): number | null => {
  const text = el.querySelector(selector)?.textContent?.trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

const measureCapacityDivFromContext = (divisions: number, beats: number, beatType: number): number => {
  const safeDivisions = Math.max(1, Math.round(divisions));
  const safeBeats = Math.max(1, Math.round(beats));
  const safeBeatType = Math.max(1, Math.round(beatType));
  return Math.max(1, Math.round((safeDivisions * 4 * safeBeats) / safeBeatType));
};

const estimateMeasureContentSpanDiv = (measure: Element): number => {
  let cursorDiv = 0;
  let measureMaxDiv = 0;
  const lastStartByVoice = new Map<string, number>();
  for (const child of Array.from(measure.children)) {
    if (child.tagName === "backup" || child.tagName === "forward") {
      const dur = getFirstNumber(child, "duration");
      if (!dur || dur <= 0) continue;
      if (child.tagName === "backup") {
        cursorDiv = Math.max(0, cursorDiv - dur);
      } else {
        cursorDiv += dur;
        measureMaxDiv = Math.max(measureMaxDiv, cursorDiv);
      }
      continue;
    }
    if (child.tagName !== "note") continue;
    const durationDiv = getFirstNumber(child, "duration");
    if (!durationDiv || durationDiv <= 0) continue;
    const voice = child.querySelector("voice")?.textContent?.trim() ?? "1";
    const isChord = Boolean(child.querySelector("chord"));
    const startDiv = isChord ? (lastStartByVoice.get(voice) ?? cursorDiv) : cursorDiv;
    if (!isChord) {
      lastStartByVoice.set(voice, startDiv);
      cursorDiv += durationDiv;
    }
    measureMaxDiv = Math.max(measureMaxDiv, cursorDiv, startDiv + durationDiv);
  }
  return measureMaxDiv;
};

const shouldTreatFirstUnderfullAsPickup = (doc: Document): boolean => {
  const parts = Array.from(doc.querySelectorAll("score-partwise > part"));
  if (parts.length < 2) return false;
  for (const part of parts) {
    const firstMeasure = part.querySelector(":scope > measure");
    if (!firstMeasure) return false;
    const divisions = getFirstNumber(firstMeasure, "attributes > divisions") ?? 1;
    const beats = getFirstNumber(firstMeasure, "attributes > time > beats") ?? 4;
    const beatType = getFirstNumber(firstMeasure, "attributes > time > beat-type") ?? 4;
    const capacityDiv = measureCapacityDivFromContext(divisions, beats, beatType);
    const contentDiv = estimateMeasureContentSpanDiv(firstMeasure);
    if (!(contentDiv > 0 && contentDiv < capacityDiv)) {
      return false;
    }
  }
  return true;
};

const isImplicitMeasure = (measure: Element | null | undefined): boolean => {
  if (!measure) return false;
  const implicitAttr = (measure.getAttribute("implicit") || "").trim().toLowerCase();
  return implicitAttr === "yes" || implicitAttr === "true" || implicitAttr === "1";
};

const resolveMeasureAdvanceDiv = (
  measure: Element,
  measureMaxDiv: number,
  currentDivisions: number,
  currentBeats: number,
  currentBeatType: number,
  nextMeasureIsImplicit = false,
  firstMeasureUnderfullAsPickup = false
): number => {
  const safeDivisions = Math.max(1, Math.round(currentDivisions));
  const safeBeats = Math.max(1, Math.round(currentBeats));
  const safeBeatType = Math.max(1, Math.round(currentBeatType));
  const capacityDiv = Math.max(1, Math.round((safeDivisions * 4 * safeBeats) / safeBeatType));
  const implicitAttr = (measure.getAttribute("implicit") || "").trim().toLowerCase();
  const isImplicit = implicitAttr === "yes" || implicitAttr === "true" || implicitAttr === "1";
  if (isImplicit) {
    return measureMaxDiv > 0 ? measureMaxDiv : capacityDiv;
  }
  let hasPreviousMeasure = false;
  for (let prev = measure.previousElementSibling; prev; prev = prev.previousElementSibling) {
    const prevName = (prev.localName || prev.tagName || "").toLowerCase();
    if (prevName === "measure") {
      hasPreviousMeasure = true;
      break;
    }
  }
  const isFirstMeasureInPart = !hasPreviousMeasure;
  if (firstMeasureUnderfullAsPickup && isFirstMeasureInPart && measureMaxDiv > 0 && measureMaxDiv < capacityDiv) {
    return measureMaxDiv;
  }
  if (nextMeasureIsImplicit && measureMaxDiv > 0 && measureMaxDiv < capacityDiv) {
    return measureMaxDiv;
  }
  return Math.max(capacityDiv, measureMaxDiv);
};

export const buildMeasureTimelineForPart = (
  doc: Document,
  partId: string,
  fallbackDivisions: number
): Array<{ startTick: number; endTick: number; location: PlaybackStartLocation }> => {
  const part = Array.from(doc.querySelectorAll("score-partwise > part")).find(
    (p) => (p.getAttribute("id") ?? "").trim() === String(partId || "").trim()
  );
  if (!part) return [];
  const firstUnderfullAsPickup = shouldTreatFirstUnderfullAsPickup(doc);
  let divisions = Math.max(1, Math.round(fallbackDivisions));
  let beats = 4;
  let beatType = 4;
  let tick = 0;
  const ranges: Array<{ startTick: number; endTick: number; location: PlaybackStartLocation }> = [];
  const measures = Array.from(part.querySelectorAll(":scope > measure"));
  for (let measureIndex = 0; measureIndex < measures.length; measureIndex += 1) {
    const measure = measures[measureIndex];
    const nextMeasure = measures[measureIndex + 1] ?? null;
    const nextDivisions = getFirstNumber(measure, "attributes > divisions");
    if (nextDivisions && nextDivisions > 0) divisions = nextDivisions;
    const nextBeats = getFirstNumber(measure, "attributes > time > beats");
    const nextBeatType = getFirstNumber(measure, "attributes > time > beat-type");
    if (nextBeats && nextBeats > 0 && nextBeatType && nextBeatType > 0) {
      beats = nextBeats;
      beatType = nextBeatType;
    }
    const measureNumber = (measure.getAttribute("number") ?? "").trim();
    const measureContentDiv = estimateMeasureContentSpanDiv(measure);
    const advanceDiv = resolveMeasureAdvanceDiv(
      measure,
      measureContentDiv,
      divisions,
      beats,
      beatType,
      isImplicitMeasure(nextMeasure),
      firstUnderfullAsPickup
    );
    const measureTicks = Math.max(1, Math.round((advanceDiv / Math.max(1, divisions)) * fallbackDivisions));
    ranges.push({
      startTick: tick,
      endTick: tick + measureTicks,
      location: { partId, measureNumber },
    });
    tick += measureTicks;
  }
  return ranges;
};

const findPlaybackLocationAtTick = (
  ranges: Array<{ startTick: number; endTick: number; location: PlaybackStartLocation }>,
  tick: number
): PlaybackStartLocation | null => {
  if (!ranges.length) return null;
  const safeTick = Math.max(0, Math.round(tick));
  for (const range of ranges) {
    if (safeTick >= range.startTick && safeTick < range.endTick) {
      return range.location;
    }
  }
  return ranges[ranges.length - 1]?.location ?? null;
};

const trimMeasureTimelineFromTick = (
  ranges: Array<{ startTick: number; endTick: number; location: PlaybackStartLocation }>,
  startTick: number
): Array<{ startTick: number; endTick: number; location: PlaybackStartLocation }> => {
  if (!ranges.length || !Number.isFinite(startTick) || startTick <= 0) {
    return ranges;
  }
  const safeStartTick = Math.max(0, Math.round(startTick));
  return ranges
    .filter((range) => range.endTick > safeStartTick)
    .map((range) => ({
      startTick: Math.max(0, range.startTick - safeStartTick),
      endTick: Math.max(0, range.endTick - safeStartTick),
      location: range.location,
    }));
};

const resolveMeasureStartTickInPart = (
  doc: Document,
  startFromMeasure: PlaybackStartLocation,
  fallbackDivisions: number
): number | null => {
  const ranges = buildMeasureTimelineForPart(doc, startFromMeasure.partId, fallbackDivisions);
  const hit = ranges.find((range) => range.location.measureNumber === String(startFromMeasure.measureNumber ?? "").trim());
  return hit ? hit.startTick : null;
};

const trimPlaybackFromTick = (
  parsedPlayback: ReturnType<typeof buildPlaybackEventsFromMusicXmlDoc>,
  tempoEvents: MidiTempoEvent[],
  controlEvents: MidiControlEvent[],
  startTick: number
): {
  parsedPlayback: ReturnType<typeof buildPlaybackEventsFromMusicXmlDoc>;
  tempoEvents: MidiTempoEvent[];
  controlEvents: MidiControlEvent[];
} => {
  if (!Number.isFinite(startTick) || startTick <= 0) {
    return { parsedPlayback, tempoEvents, controlEvents };
  }
  const safeStartTick = Math.max(0, Math.round(startTick));
  const trimmedEvents = parsedPlayback.events
    .filter((event) => event.startTicks >= safeStartTick)
    .map((event) => ({ ...event, startTicks: event.startTicks - safeStartTick }));

  const sortedTempo = (tempoEvents ?? [])
    .slice()
    .map((event) => ({
      startTicks: Math.max(0, Math.round(event.startTicks)),
      bpm: Math.max(1, Math.round(event.bpm || parsedPlayback.tempo || 120)),
    }))
    .sort((a, b) => a.startTicks - b.startTicks);
  const lastTempoBeforeOrAtStart = sortedTempo
    .slice()
    .reverse()
    .find((event) => event.startTicks <= safeStartTick);
  const trimmedTempoEvents = sortedTempo
    .filter((event) => event.startTicks > safeStartTick)
    .map((event) => ({ ...event, startTicks: event.startTicks - safeStartTick }));
  if (lastTempoBeforeOrAtStart) {
    trimmedTempoEvents.unshift({ startTicks: 0, bpm: lastTempoBeforeOrAtStart.bpm });
  }

  const trimmedControlEvents = (controlEvents ?? [])
    .filter((event) => event.startTicks >= safeStartTick)
    .map((event) => ({ ...event, startTicks: event.startTicks - safeStartTick }));

  return {
    parsedPlayback: { ...parsedPlayback, events: trimmedEvents },
    tempoEvents: trimmedTempoEvents,
    controlEvents: trimmedControlEvents,
  };
};

export const stopPlayback = (options: PlaybackFlowOptions): void => {
  options.engine.stop();
  options.setIsPlaying(false);
  options.setActivePlaybackLocation(null);
  options.setPlaybackText("Playback: stopped");
  options.renderControlState();
};

export const startPlayback = async (
  options: PlaybackFlowOptions,
  params: { isLoaded: boolean; core: SaveCapableCore; startFromMeasure?: PlaybackStartLocation | null }
): Promise<void> => {
  if (!params.isLoaded || options.getIsPlaying()) return;
  options.setActivePlaybackLocation(null);

  const saveResult = params.core.save();
  options.onFullSaveResult(saveResult);
  if (!saveResult.ok) {
    options.logDiagnostics("playback", saveResult.diagnostics);
    logPlaybackFailureDiagnostics("save failed", saveResult.diagnostics);
    if (saveResult.diagnostics.some((d) => d.code === "MEASURE_OVERFULL")) {
      const debugXml = params.core.debugSerializeCurrentXml();
      if (debugXml) {
        options.dumpOverfullContext(debugXml, options.editableVoice);
      } else if (options.debugLog) {
        console.warn("[mikuscore][debug] no in-memory XML to dump.");
      }
    }
    options.renderAll();
    options.setPlaybackText(`Playback: save failed (${summarizeDiagnostics(saveResult.diagnostics)})`);
    return;
  }

  const playbackDoc = parseMusicXmlDocument(saveResult.xml);
  if (!playbackDoc) {
    options.setPlaybackText("Playback: invalid MusicXML");
    options.renderControlState();
    return;
  }

  const useMidiLikePlayback = options.getUseMidiLikePlayback();
  const playbackMode = useMidiLikePlayback ? "midi" : "playback";
  const parsedPlayback = buildPlaybackEventsFromMusicXmlDoc(playbackDoc, options.ticksPerQuarter, {
    mode: playbackMode,
    graceTimingMode: options.getGraceTimingMode(),
    metricAccentEnabled: options.getMetricAccentEnabled(),
    metricAccentProfile: options.getMetricAccentProfile(),
    includeTieInPlaybackLikeMode: !useMidiLikePlayback,
    applyDefaultDetacheInPlaybackLikeMode: !useMidiLikePlayback,
  });
  let effectiveParsedPlayback = parsedPlayback;
  let effectiveTempoEvents = useMidiLikePlayback
    ? collectMidiTempoEventsFromMusicXmlDoc(playbackDoc, options.ticksPerQuarter)
    : [];
  let effectiveControlEvents = useMidiLikePlayback
    ? collectMidiControlEventsFromMusicXmlDoc(playbackDoc, options.ticksPerQuarter)
    : [];
  const playbackAnchorPartId =
    params.startFromMeasure?.partId ??
    playbackDoc.querySelector("score-partwise > part")?.getAttribute("id")?.trim() ??
    "";
  let playbackStartTick = 0;
  if (params.startFromMeasure) {
    const startTick = resolveMeasureStartTickInPart(playbackDoc, params.startFromMeasure, options.ticksPerQuarter);
    if (startTick !== null && startTick > 0) {
      playbackStartTick = startTick;
      const trimmed = trimPlaybackFromTick(
        effectiveParsedPlayback,
        effectiveTempoEvents,
        effectiveControlEvents,
        startTick
      );
      effectiveParsedPlayback = trimmed.parsedPlayback;
      effectiveTempoEvents = trimmed.tempoEvents;
      effectiveControlEvents = trimmed.controlEvents;
    }
  }
  const events = effectiveParsedPlayback.events;
  if (events.length === 0) {
    options.setPlaybackText("Playback: no playable notes");
    options.renderControlState();
    return;
  }
  const timeSignatureEvents = useMidiLikePlayback
    ? collectMidiTimeSignatureEventsFromMusicXmlDoc(playbackDoc, options.ticksPerQuarter)
    : [];
  const keySignatureEvents = useMidiLikePlayback
    ? collectMidiKeySignatureEventsFromMusicXmlDoc(playbackDoc, options.ticksPerQuarter)
    : [];

  const waveform = options.getPlaybackWaveform();
  const measureTimeline = playbackAnchorPartId
    ? trimMeasureTimelineFromTick(
      buildMeasureTimelineForPart(playbackDoc, playbackAnchorPartId, options.ticksPerQuarter),
      playbackStartTick
    )
    : [];
  if (params.startFromMeasure) {
    options.setActivePlaybackLocation(params.startFromMeasure);
  }

  let midiBytes: Uint8Array;
  try {
    const scoreTitle =
      playbackDoc.querySelector("score-partwise > work > work-title")?.textContent?.trim() ??
      playbackDoc.querySelector("score-partwise > movement-title")?.textContent?.trim() ??
      "";
    const movementTitle =
      playbackDoc.querySelector("score-partwise > movement-title")?.textContent?.trim() ?? "";
    const scoreComposer =
      playbackDoc
        .querySelector('score-partwise > identification > creator[type="composer"]')
        ?.textContent?.trim() ??
      playbackDoc.querySelector("score-partwise > identification > creator")?.textContent?.trim() ??
      "";
    midiBytes = buildMidiBytesForPlayback(
      events,
      effectiveParsedPlayback.tempo,
      "electric_piano_2",
      collectMidiProgramOverridesFromMusicXmlDoc(playbackDoc),
      effectiveControlEvents,
      effectiveTempoEvents,
      timeSignatureEvents,
      keySignatureEvents,
      {
        metadata: {
          title: scoreTitle,
          movementTitle,
          composer: scoreComposer,
        },
      }
    );
  } catch (error) {
    options.setPlaybackText(
      "Playback: MIDI generation failed (" + (error instanceof Error ? error.message : String(error)) + ")"
    );
    options.renderControlState();
    return;
  }

  try {
    await options.engine.playSchedule(
      toSynthSchedule(effectiveParsedPlayback.tempo, events, effectiveTempoEvents, effectiveControlEvents),
      waveform,
      (currentTick) => {
        options.setActivePlaybackLocation(findPlaybackLocationAtTick(measureTimeline, currentTick));
      },
      () => {
        options.setIsPlaying(false);
        options.setActivePlaybackLocation(null);
        options.setPlaybackText("Playback: stopped");
        options.renderControlState();
      }
    );
  } catch (error) {
    options.setPlaybackText(
      "Playback: synth playback failed (" + (error instanceof Error ? error.message : String(error)) + ")"
    );
    options.renderControlState();
    return;
  }

  options.setIsPlaying(true);
  const fromMeasureLabel = params.startFromMeasure
    ? ` / from measure ${params.startFromMeasure.measureNumber}`
    : "";
  options.setPlaybackText(
    `Playing: ${events.length} notes / mode ${playbackMode}${fromMeasureLabel} / MIDI ${midiBytes.length} bytes / waveform ${waveform}`
  );
  options.renderControlState();
  options.renderAll();
};

export const startMeasurePlayback = async (
  options: PlaybackFlowOptions,
  params: { draftCore: SaveCapableCore | null }
): Promise<void> => {
  if (!params.draftCore || options.getIsPlaying()) return;
  options.setActivePlaybackLocation(null);

  const saveResult = params.draftCore.save();
  if (!saveResult.ok) {
    options.onMeasureSaveDiagnostics(saveResult.diagnostics);
    options.logDiagnostics("playback", saveResult.diagnostics);
    logPlaybackFailureDiagnostics("measure save failed", saveResult.diagnostics);
    options.setPlaybackText(
      `Playback: measure save failed (${summarizeDiagnostics(saveResult.diagnostics)})`
    );
    options.renderAll();
    return;
  }

  const playbackDoc = parseMusicXmlDocument(saveResult.xml);
  if (!playbackDoc) {
    options.setPlaybackText("Playback: invalid MusicXML");
    options.renderControlState();
    return;
  }

  const useMidiLikePlayback = options.getUseMidiLikePlayback();
  const playbackMode = useMidiLikePlayback ? "midi" : "playback";
  const parsedPlayback = buildPlaybackEventsFromMusicXmlDoc(playbackDoc, options.ticksPerQuarter, {
    mode: playbackMode,
    graceTimingMode: options.getGraceTimingMode(),
    metricAccentEnabled: options.getMetricAccentEnabled(),
    metricAccentProfile: options.getMetricAccentProfile(),
    includeTieInPlaybackLikeMode: !useMidiLikePlayback,
    applyDefaultDetacheInPlaybackLikeMode: !useMidiLikePlayback,
  });
  const events = parsedPlayback.events;
  if (events.length === 0) {
    options.setPlaybackText("Playback: no playable notes in this measure");
    options.renderControlState();
    return;
  }
  const tempoEvents = useMidiLikePlayback
    ? collectMidiTempoEventsFromMusicXmlDoc(playbackDoc, options.ticksPerQuarter)
    : [];
  const controlEvents = useMidiLikePlayback
    ? collectMidiControlEventsFromMusicXmlDoc(playbackDoc, options.ticksPerQuarter)
    : [];

  const waveform = options.getPlaybackWaveform();
  const playbackAnchorPartId =
    playbackDoc.querySelector("score-partwise > part")?.getAttribute("id")?.trim() ?? "";
  const measureTimeline = playbackAnchorPartId
    ? buildMeasureTimelineForPart(playbackDoc, playbackAnchorPartId, options.ticksPerQuarter)
    : [];

  try {
    await options.engine.playSchedule(
      toSynthSchedule(parsedPlayback.tempo, events, tempoEvents, controlEvents),
      waveform,
      (currentTick) => {
        options.setActivePlaybackLocation(findPlaybackLocationAtTick(measureTimeline, currentTick));
      },
      () => {
        options.setIsPlaying(false);
        options.setActivePlaybackLocation(null);
        options.setPlaybackText("Playback: stopped");
        options.renderControlState();
      }
    );
  } catch (error) {
    options.setPlaybackText(
      "Playback: measure playback failed (" + (error instanceof Error ? error.message : String(error)) + ")"
    );
    options.renderControlState();
    return;
  }

  options.setIsPlaying(true);
  options.setPlaybackText(
    `Playing: selected measure / ${events.length} notes / mode ${playbackMode} / waveform ${waveform}`
  );
  options.renderControlState();
};