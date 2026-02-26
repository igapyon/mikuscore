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
  }>;
};

export type BasicWaveSynthEngine = {
  unlockFromUserGesture: () => Promise<boolean>;
  playSchedule: (
    schedule: SynthSchedule,
    waveform: OscillatorType,
    onEnded?: () => void
  ) => Promise<void>;
  stop: () => void;
};

export const PLAYBACK_TICKS_PER_QUARTER = 480;

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

export const createBasicWaveSynthEngine = (options: { ticksPerQuarter: number }): BasicWaveSynthEngine => {
  const ticksPerQuarter = Number.isFinite(options.ticksPerQuarter)
    ? Math.max(1, Math.round(options.ticksPerQuarter))
    : 480;
  let audioContext: AudioContext | null = null;
  let activeSynthNodes: Array<{ oscillator: OscillatorNode; gainNode: GainNode }> = [];
  let synthStopTimer: number | null = null;

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
    sustainHoldSeconds = 0
  ): number => {
    if (!audioContext) return startAt;
    const attack = 0.005;
    const release = 0.03;
    const endAt = startAt + bodyDuration;
    const heldEndAt = endAt + Math.max(0, sustainHoldSeconds);
    const oscillator = audioContext.createOscillator();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(midiToHz(event.midiNumber), startAt);

    const gainNode = audioContext.createGain();
    const gainLevel = event.channel === 10 ? 0.06 : 0.1;
    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.linearRampToValueAtTime(gainLevel, startAt + attack);
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
    onEnded?: () => void
  ): Promise<void> => {
    if (!schedule || !Array.isArray(schedule.events) || schedule.events.length === 0) {
      throw new Error("Please convert first.");
    }

    const runningContext = await ensureAudioContextRunning();
    stop();

    const normalizedWaveform = normalizeWaveform(waveform);
    const normalizedTempoEvents = (schedule.tempoEvents?.length
      ? schedule.tempoEvents
      : [{ startTick: 0, bpm: Math.max(1, Number(schedule.tempo) || 120) }]
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
      mergedTempoEvents.unshift({ startTick: 0, bpm: Math.max(1, Number(schedule.tempo) || 120) });
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
    const baseTime = runningContext.currentTime + 0.04;
    let latestEndTime = baseTime;
    const pedalRanges = (schedule.pedalRanges ?? []).map((range) => ({
      channel: Math.max(1, Math.min(16, Math.round(range.channel || 1))),
      startTick: Math.max(0, Math.round(range.startTick)),
      endTick: Math.max(0, Math.round(range.endTick)),
    }));
    const isPedalHeldAt = (channel: number, tick: number): boolean => {
      return pedalRanges.some((range) => range.channel === channel && tick >= range.startTick && tick < range.endTick);
    };

    for (const event of schedule.events) {
      const startAt = baseTime + tickToSeconds(event.start);
      const endAt = baseTime + tickToSeconds(event.start + event.ticks);
      const bodyDuration = Math.max(0.04, endAt - startAt);
      const sustainHoldSeconds = isPedalHeldAt(event.channel, event.start) ? 0.18 : 0;
      latestEndTime = Math.max(
        latestEndTime,
        scheduleBasicWaveNote(event, startAt, bodyDuration, normalizedWaveform, sustainHoldSeconds)
      );
    }

    const waitMs = Math.max(0, Math.ceil((latestEndTime - runningContext.currentTime) * 1000));
    synthStopTimer = window.setTimeout(() => {
      activeSynthNodes = [];
      if (typeof onEnded === "function") {
        onEnded();
      }
    }, waitMs);
  };

  return { unlockFromUserGesture, playSchedule, stop };
};

const toSynthSchedule = (
  tempo: number,
  events: Array<{ midiNumber: number; startTicks: number; durTicks: number; channel: number }>,
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

const resolveMeasureStartTickInPart = (
  doc: Document,
  startFromMeasure: PlaybackStartLocation,
  fallbackDivisions: number
): number | null => {
  const part = Array.from(doc.querySelectorAll("score-partwise > part")).find(
    (p) => (p.getAttribute("id") ?? "").trim() === String(startFromMeasure.partId || "").trim()
  );
  if (!part) return null;
  let divisions = Math.max(1, Math.round(fallbackDivisions));
  let beats = 4;
  let beatType = 4;
  let tick = 0;
  const measures = Array.from(part.querySelectorAll(":scope > measure"));
  for (const measure of measures) {
    const attrs = measure.querySelector(":scope > attributes");
    const nextDivisions = parsePositiveInt(attrs?.querySelector(":scope > divisions")?.textContent);
    if (nextDivisions) divisions = nextDivisions;
    const nextBeats = parsePositiveInt(attrs?.querySelector(":scope > time > beats")?.textContent);
    if (nextBeats) beats = nextBeats;
    const nextBeatType = parsePositiveInt(attrs?.querySelector(":scope > time > beat-type")?.textContent);
    if (nextBeatType) beatType = nextBeatType;
    const measureNo = (measure.getAttribute("number") ?? "").trim();
    if (measureNo === String(startFromMeasure.measureNumber ?? "").trim()) {
      return tick;
    }
    const measureTicks = Math.max(1, Math.round((divisions * beats * 4) / Math.max(1, beatType)));
    tick += measureTicks;
  }
  return null;
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
  options.setPlaybackText("Playback: stopped");
  options.renderControlState();
};

export const startPlayback = async (
  options: PlaybackFlowOptions,
  params: { isLoaded: boolean; core: SaveCapableCore; startFromMeasure?: PlaybackStartLocation | null }
): Promise<void> => {
  if (!params.isLoaded || options.getIsPlaying()) return;

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
  });
  let effectiveParsedPlayback = parsedPlayback;
  let effectiveTempoEvents = useMidiLikePlayback
    ? collectMidiTempoEventsFromMusicXmlDoc(playbackDoc, options.ticksPerQuarter)
    : [];
  let effectiveControlEvents = useMidiLikePlayback
    ? collectMidiControlEventsFromMusicXmlDoc(playbackDoc, options.ticksPerQuarter)
    : [];
  if (params.startFromMeasure) {
    const startTick = resolveMeasureStartTickInPart(playbackDoc, params.startFromMeasure, options.ticksPerQuarter);
    if (startTick !== null && startTick > 0) {
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

  let midiBytes: Uint8Array;
  try {
    midiBytes = buildMidiBytesForPlayback(
      events,
      effectiveParsedPlayback.tempo,
      "electric_piano_2",
      collectMidiProgramOverridesFromMusicXmlDoc(playbackDoc),
      effectiveControlEvents,
      effectiveTempoEvents,
      timeSignatureEvents,
      keySignatureEvents
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

  try {
    await options.engine.playSchedule(
      toSynthSchedule(parsedPlayback.tempo, events, tempoEvents, controlEvents),
      waveform,
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
  options.setPlaybackText(
    `Playing: selected measure / ${events.length} notes / mode ${playbackMode} / waveform ${waveform}`
  );
  options.renderControlState();
};
