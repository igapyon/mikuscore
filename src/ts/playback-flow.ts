/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  buildPlaybackPlan,
  compactSynthScheduleForPlayback,
  findPlaybackLocationAtTick,
  type PlaybackStartLocation,
  type SynthSchedule,
} from "./playback-model";
import type { Diagnostic, SaveResult } from "../../core/interfaces";
import type { GraceTimingMode, MetricAccentProfile } from "./midi-io";

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

const summarizeDiagnostics = (diagnostics: Diagnostic[]): string => {
  if (!diagnostics.length) return "unknown reason";
  const first = diagnostics[0];
  const firstText = `[${first.code}] ${first.message}`;
  if (diagnostics.length === 1) return firstText;
  return `${firstText} (+${diagnostics.length - 1} more)`;
};

const logPlaybackFailureDiagnostics = (label: string, diagnostics: Diagnostic[]): void => {
  if (!diagnostics.length) {
    console.warn(`[miku-score][playback] ${label}: no diagnostics.`);
    return;
  }
  console.error(`[miku-score][playback] ${label}:`);
  for (const d of diagnostics) {
    console.error(`- [${d.code}] ${d.message}`);
  }
};

const midiToHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

const normalizeWaveform = (value: string): OscillatorType => {
  if (value === "square" || value === "triangle") return value;
  return "sine";
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
        console.warn("[miku-score][debug] no in-memory XML to dump.");
      }
    }
    options.renderAll();
    options.setPlaybackText(`Playback: save failed (${summarizeDiagnostics(saveResult.diagnostics)})`);
    return;
  }

  const useMidiLikePlayback = options.getUseMidiLikePlayback();
  const playbackPlan = buildPlaybackPlan(saveResult.xml, {
    ticksPerQuarter: options.ticksPerQuarter,
    useMidiLikePlayback,
    graceTimingMode: options.getGraceTimingMode(),
    metricAccentEnabled: options.getMetricAccentEnabled(),
    metricAccentProfile: options.getMetricAccentProfile(),
    startFromMeasure: params.startFromMeasure,
    includeMidiByteLength: true,
  });
  if (!playbackPlan.ok) {
    if (playbackPlan.code === "INVALID_MUSICXML") {
      options.setPlaybackText("Playback: invalid MusicXML");
    } else if (playbackPlan.code === "NO_PLAYABLE_NOTES") {
      options.setPlaybackText("Playback: no playable notes");
    } else {
      options.setPlaybackText(`Playback: MIDI generation failed (${playbackPlan.message})`);
    }
    options.renderControlState();
    return;
  }

  const waveform = options.getPlaybackWaveform();
  if (playbackPlan.initialLocation) {
    options.setActivePlaybackLocation(playbackPlan.initialLocation);
  }

  try {
    await options.engine.playSchedule(
      playbackPlan.schedule,
      waveform,
      (currentTick) => {
        options.setActivePlaybackLocation(
          findPlaybackLocationAtTick(playbackPlan.measureTimeline, currentTick)
        );
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
    `Playing: ${playbackPlan.eventCount} notes / mode ${playbackPlan.mode}${fromMeasureLabel} / MIDI ${playbackPlan.midiByteLength ?? 0} bytes / waveform ${waveform}`
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

  const useMidiLikePlayback = options.getUseMidiLikePlayback();
  const playbackPlan = buildPlaybackPlan(saveResult.xml, {
    ticksPerQuarter: options.ticksPerQuarter,
    useMidiLikePlayback,
    graceTimingMode: options.getGraceTimingMode(),
    metricAccentEnabled: options.getMetricAccentEnabled(),
    metricAccentProfile: options.getMetricAccentProfile(),
    includeMidiByteLength: false,
  });
  if (!playbackPlan.ok) {
    if (playbackPlan.code === "INVALID_MUSICXML") {
      options.setPlaybackText("Playback: invalid MusicXML");
    } else if (playbackPlan.code === "NO_PLAYABLE_NOTES") {
      options.setPlaybackText("Playback: no playable notes in this measure");
    } else {
      options.setPlaybackText(`Playback: measure playback failed (${playbackPlan.message})`);
    }
    options.renderControlState();
    return;
  }

  const waveform = options.getPlaybackWaveform();

  try {
    await options.engine.playSchedule(
      playbackPlan.schedule,
      waveform,
      (currentTick) => {
        options.setActivePlaybackLocation(
          findPlaybackLocationAtTick(playbackPlan.measureTimeline, currentTick)
        );
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
    `Playing: selected measure / ${playbackPlan.eventCount} notes / mode ${playbackPlan.mode} / waveform ${waveform}`
  );
  options.renderControlState();
};
