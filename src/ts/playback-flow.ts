import type { Diagnostic, SaveResult } from "../../core/interfaces";
import { buildMidiBytesForPlayback, buildPlaybackEventsFromMusicXmlDoc } from "./midi-io";
import { parseMusicXmlDocument } from "./musicxml-io";

export type SynthSchedule = {
  tempo: number;
  events: Array<{
    midiNumber: number;
    start: number;
    ticks: number;
    channel: number;
  }>;
};

export type BasicWaveSynthEngine = {
  playSchedule: (
    schedule: SynthSchedule,
    waveform: OscillatorType,
    onEnded?: () => void
  ) => Promise<void>;
  stop: () => void;
};

export const PLAYBACK_TICKS_PER_QUARTER = 128;
const FIXED_PLAYBACK_WAVEFORM: OscillatorType = "sine";

const midiToHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

const normalizeWaveform = (value: string): OscillatorType => {
  if (value === "square" || value === "triangle") return value;
  return "sine";
};

export const createBasicWaveSynthEngine = (options: { ticksPerQuarter: number }): BasicWaveSynthEngine => {
  const ticksPerQuarter = Number.isFinite(options.ticksPerQuarter)
    ? Math.max(1, Math.round(options.ticksPerQuarter))
    : 128;
  let audioContext: AudioContext | null = null;
  let activeSynthNodes: Array<{ oscillator: OscillatorNode; gainNode: GainNode }> = [];
  let synthStopTimer: number | null = null;

  const scheduleBasicWaveNote = (
    event: SynthSchedule["events"][number],
    startAt: number,
    bodyDuration: number,
    waveform: OscillatorType
  ): number => {
    if (!audioContext) return startAt;
    const attack = 0.005;
    const release = 0.03;
    const endAt = startAt + bodyDuration;
    const oscillator = audioContext.createOscillator();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(midiToHz(event.midiNumber), startAt);

    const gainNode = audioContext.createGain();
    const gainLevel = event.channel === 10 ? 0.06 : 0.1;
    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.linearRampToValueAtTime(gainLevel, startAt + attack);
    gainNode.gain.setValueAtTime(gainLevel, endAt);
    gainNode.gain.linearRampToValueAtTime(0.0001, endAt + release);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(endAt + release + 0.01);
    oscillator.onended = () => {
      try {
        oscillator.disconnect();
        gainNode.disconnect();
      } catch {
        // ignore cleanup failure
      }
    };
    activeSynthNodes.push({ oscillator, gainNode });
    return endAt + release + 0.02;
  };

  const stop = (): void => {
    if (synthStopTimer !== null) {
      window.clearTimeout(synthStopTimer);
      synthStopTimer = null;
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

  const playSchedule = async (
    schedule: SynthSchedule,
    waveform: OscillatorType,
    onEnded?: () => void
  ): Promise<void> => {
    if (!schedule || !Array.isArray(schedule.events) || schedule.events.length === 0) {
      throw new Error("Please convert first.");
    }

    if (!audioContext) {
      audioContext = new AudioContext();
    }
    stop();
    await audioContext.resume();

    const normalizedWaveform = normalizeWaveform(waveform);
    const secPerTick = 60 / (Math.max(1, Number(schedule.tempo) || 120) * ticksPerQuarter);
    const baseTime = audioContext.currentTime + 0.04;
    let latestEndTime = baseTime;

    for (const event of schedule.events) {
      const startAt = baseTime + event.start * secPerTick;
      const bodyDuration = Math.max(0.04, event.ticks * secPerTick);
      latestEndTime = Math.max(
        latestEndTime,
        scheduleBasicWaveNote(event, startAt, bodyDuration, normalizedWaveform)
      );
    }

    const waitMs = Math.max(0, Math.ceil((latestEndTime - audioContext.currentTime) * 1000));
    synthStopTimer = window.setTimeout(() => {
      activeSynthNodes = [];
      if (typeof onEnded === "function") {
        onEnded();
      }
    }, waitMs);
  };

  return { playSchedule, stop };
};

const toSynthSchedule = (tempo: number, events: Array<{ midiNumber: number; startTicks: number; durTicks: number; channel: number }>): SynthSchedule => {
  return {
    tempo,
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
      })),
  };
};

export type PlaybackFlowOptions = {
  engine: BasicWaveSynthEngine;
  ticksPerQuarter: number;
  editableVoice: string;
  debugLog: boolean;
  getIsPlaying: () => boolean;
  setIsPlaying: (isPlaying: boolean) => void;
  setPlaybackText: (text: string) => void;
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
  options.setPlaybackText("Playback: stopped");
  options.renderControlState();
};

export const startPlayback = async (
  options: PlaybackFlowOptions,
  params: { isLoaded: boolean; core: SaveCapableCore }
): Promise<void> => {
  if (!params.isLoaded || options.getIsPlaying()) return;

  const saveResult = params.core.save();
  options.onFullSaveResult(saveResult);
  if (!saveResult.ok) {
    options.logDiagnostics("playback", saveResult.diagnostics);
    if (saveResult.diagnostics.some((d) => d.code === "MEASURE_OVERFULL")) {
      const debugXml = params.core.debugSerializeCurrentXml();
      if (debugXml) {
        options.dumpOverfullContext(debugXml, options.editableVoice);
      } else if (options.debugLog) {
        console.warn("[mikuscore][debug] no in-memory XML to dump.");
      }
    }
    options.renderAll();
    options.setPlaybackText("Playback: save failed");
    return;
  }

  const playbackDoc = parseMusicXmlDocument(saveResult.xml);
  if (!playbackDoc) {
    options.setPlaybackText("Playback: invalid MusicXML");
    options.renderControlState();
    return;
  }

  const parsedPlayback = buildPlaybackEventsFromMusicXmlDoc(playbackDoc, options.ticksPerQuarter);
  const events = parsedPlayback.events;
  if (events.length === 0) {
    options.setPlaybackText("Playback: no playable notes");
    options.renderControlState();
    return;
  }

  let midiBytes: Uint8Array;
  try {
    midiBytes = buildMidiBytesForPlayback(events, parsedPlayback.tempo);
  } catch (error) {
    options.setPlaybackText(
      "Playback: MIDI generation failed (" + (error instanceof Error ? error.message : String(error)) + ")"
    );
    options.renderControlState();
    return;
  }

  try {
    await options.engine.playSchedule(
      toSynthSchedule(parsedPlayback.tempo, events),
      FIXED_PLAYBACK_WAVEFORM,
      () => {
        options.setIsPlaying(false);
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
  options.setPlaybackText(`Playing: ${events.length} notes / MIDI ${midiBytes.length} bytes / waveform sine`);
  options.renderControlState();
  options.renderAll();
};

export const startMeasurePlayback = async (
  options: PlaybackFlowOptions,
  params: { draftCore: SaveCapableCore | null }
): Promise<void> => {
  if (!params.draftCore || options.getIsPlaying()) return;

  const saveResult = params.draftCore.save();
  if (!saveResult.ok) {
    options.onMeasureSaveDiagnostics(saveResult.diagnostics);
    options.logDiagnostics("playback", saveResult.diagnostics);
    options.setPlaybackText("Playback: measure save failed");
    options.renderAll();
    return;
  }

  const playbackDoc = parseMusicXmlDocument(saveResult.xml);
  if (!playbackDoc) {
    options.setPlaybackText("Playback: invalid MusicXML");
    options.renderControlState();
    return;
  }

  const parsedPlayback = buildPlaybackEventsFromMusicXmlDoc(playbackDoc, options.ticksPerQuarter);
  const events = parsedPlayback.events;
  if (events.length === 0) {
    options.setPlaybackText("Playback: no playable notes in this measure");
    options.renderControlState();
    return;
  }

  try {
    await options.engine.playSchedule(
      toSynthSchedule(parsedPlayback.tempo, events),
      FIXED_PLAYBACK_WAVEFORM,
      () => {
        options.setIsPlaying(false);
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
  options.setPlaybackText(`Playing: selected measure / ${events.length} notes / waveform sine`);
  options.renderControlState();
};
