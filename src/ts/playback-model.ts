/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  buildMidiBytesForPlayback,
  buildPlaybackEventsFromMusicXmlDoc,
  collectMidiControlEventsFromMusicXmlDoc,
  collectMidiKeySignatureEventsFromMusicXmlDoc,
  collectMidiProgramOverridesFromMusicXmlDoc,
  collectMidiTempoEventsFromMusicXmlDoc,
  collectMidiTimeSignatureEventsFromMusicXmlDoc,
  type GraceTimingMode,
  type MetricAccentProfile,
  type MidiControlEvent,
  type MidiTempoEvent,
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

export type PlaybackStartLocation = {
  partId: string;
  measureNumber: string;
};

export type PlaybackMeasureRange = {
  startTick: number;
  endTick: number;
  location: PlaybackStartLocation;
};

export type LightweightPlaybackSummary = {
  applied: boolean;
  originalEventCount: number;
  finalEventCount: number;
  droppedUltraShortCount: number;
  droppedDenseOnsetCount: number;
  droppedBudgetCount: number;
};

export type PlaybackPlanOptions = {
  ticksPerQuarter: number;
  useMidiLikePlayback: boolean;
  graceTimingMode: GraceTimingMode;
  metricAccentEnabled: boolean;
  metricAccentProfile: MetricAccentProfile;
  startFromMeasure?: PlaybackStartLocation | null;
  includeMidiByteLength?: boolean;
};

export type PlaybackPlanSuccess = {
  ok: true;
  mode: "midi" | "playback";
  schedule: SynthSchedule;
  eventCount: number;
  midiByteLength: number | null;
  measureTimeline: PlaybackMeasureRange[];
  initialLocation: PlaybackStartLocation | null;
};

export type PlaybackPlanFailure = {
  ok: false;
  code: "INVALID_MUSICXML" | "NO_PLAYABLE_NOTES" | "MIDI_GENERATION_FAILED";
  message: string;
};

export type PlaybackPlanResult = PlaybackPlanSuccess | PlaybackPlanFailure;

export const PLAYBACK_TICKS_PER_QUARTER = 480;
const DENSE_PLAYBACK_EVENT_THRESHOLD = 2048;
const DENSE_PLAYBACK_MAX_EVENTS = 4096;
const DENSE_PLAYBACK_MAX_EVENTS_PER_ONSET = 48;
const DENSE_PLAYBACK_MIN_EVENT_TICKS_DIVISOR = 64;
const DENSE_PLAYBACK_PROTECTED_ONSET_SIZE = 8;

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
    a.midiNumber === b.midiNumber
      ? compareScheduleEventsForRetention(a, b)
      : a.midiNumber - b.midiNumber
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

  const sortBucket = (bucket: SynthSchedule["events"]): SynthSchedule["events"] => {
    return bucket.slice().sort(compareScheduleEventsForRetention);
  };
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

  const minDenseEventTicks = Math.max(
    1,
    Math.round(ticksPerQuarter / DENSE_PLAYBACK_MIN_EVENT_TICKS_DIVISOR)
  );
  const keptAfterShortFilter: SynthSchedule["events"] = [];
  let droppedUltraShortCount = 0;
  for (const event of schedule.events) {
    if ((event.ticks ?? 0) < minDenseEventTicks) {
      droppedUltraShortCount += 1;
    } else {
      keptAfterShortFilter.push(event);
    }
  }

  const byOnset = new Map<number, SynthSchedule["events"]>();
  for (const event of keptAfterShortFilter) {
    const group = byOnset.get(event.start) ?? [];
    group.push(event);
    byOnset.set(event.start, group);
  }
  const onsetGroups = Array.from(byOnset.keys())
    .sort((a, b) => a - b)
    .map((start) => prioritizeOnsetGroupForRetention(byOnset.get(start) ?? [])
      .slice(0, DENSE_PLAYBACK_MAX_EVENTS_PER_ONSET));
  const denseLimitedEvents: SynthSchedule["events"] = [];
  for (const group of onsetGroups) denseLimitedEvents.push(...group);
  const droppedDenseOnsetCount = keptAfterShortFilter.length - denseLimitedEvents.length;

  let finalEvents = denseLimitedEvents;
  let droppedBudgetCount = 0;
  if (denseLimitedEvents.length > DENSE_PLAYBACK_MAX_EVENTS) {
    const protectedGroups = onsetGroups.filter(
      (group) => group.length <= DENSE_PLAYBACK_PROTECTED_ONSET_SIZE
    );
    const reducibleGroups = onsetGroups
      .filter((group) => group.length > DENSE_PLAYBACK_PROTECTED_ONSET_SIZE)
      .map((group) => group.slice());
    const retained: SynthSchedule["events"] = [];
    for (const group of protectedGroups) retained.push(...group);
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
    schedule: { ...schedule, events: finalEvents },
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

const toSynthSchedule = (
  tempo: number,
  events: Array<{
    midiNumber: number;
    startTicks: number;
    durTicks: number;
    channel: number;
    trackId?: string;
  }>,
  tempoEvents: Array<{ startTicks: number; bpm: number }> = [],
  controlEvents: Array<{
    channel: number;
    startTicks: number;
    controllerNumber: number;
    controllerValue: number;
  }> = []
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
    .sort((a, b) => a.channel === b.channel
      ? a.startTick - b.startTick
      : a.channel - b.channel);
  const pedalRanges: Array<{ channel: number; startTick: number; endTick: number }> = [];
  const rangeStartByChannel = new Map<number, number>();
  for (const event of cc64Events) {
    if (event.value >= 64) {
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
      .sort((a, b) => a.startTicks === b.startTicks
        ? a.midiNumber - b.midiNumber
        : a.startTicks - b.startTicks)
      .map((event) => ({
        midiNumber: event.midiNumber,
        start: event.startTicks,
        ticks: event.durTicks,
        channel: event.channel,
        trackId: event.trackId,
      })),
  };
};

const getFirstNumber = (element: ParentNode, selector: string): number | null => {
  const text = element.querySelector(selector)?.textContent?.trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
};

const measureCapacityDivFromContext = (
  divisions: number,
  beats: number,
  beatType: number
): number => {
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
      const duration = getFirstNumber(child, "duration");
      if (!duration || duration <= 0) continue;
      if (child.tagName === "backup") {
        cursorDiv = Math.max(0, cursorDiv - duration);
      } else {
        cursorDiv += duration;
        measureMaxDiv = Math.max(measureMaxDiv, cursorDiv);
      }
      continue;
    }
    if (child.tagName !== "note") continue;
    const duration = getFirstNumber(child, "duration");
    if (!duration || duration <= 0) continue;
    const voice = child.querySelector("voice")?.textContent?.trim() ?? "1";
    const isChord = Boolean(child.querySelector("chord"));
    const startDiv = isChord ? (lastStartByVoice.get(voice) ?? cursorDiv) : cursorDiv;
    if (!isChord) {
      lastStartByVoice.set(voice, startDiv);
      cursorDiv += duration;
    }
    measureMaxDiv = Math.max(measureMaxDiv, cursorDiv, startDiv + duration);
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
    if (!(contentDiv > 0 && contentDiv < capacityDiv)) return false;
  }
  return true;
};

const isImplicitMeasure = (measure: Element | null | undefined): boolean => {
  if (!measure) return false;
  const implicit = (measure.getAttribute("implicit") || "").trim().toLowerCase();
  return implicit === "yes" || implicit === "true" || implicit === "1";
};

const hasPreviousMeasureSibling = (measure: Element): boolean => {
  for (let previous = measure.previousElementSibling; previous; previous = previous.previousElementSibling) {
    const name = (previous.localName || previous.tagName || "").toLowerCase();
    if (name === "measure") return true;
  }
  return false;
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
  const capacityDiv = measureCapacityDivFromContext(
    currentDivisions,
    currentBeats,
    currentBeatType
  );
  if (isImplicitMeasure(measure)) return measureMaxDiv > 0 ? measureMaxDiv : capacityDiv;
  const isFirstMeasureInPart = !hasPreviousMeasureSibling(measure);
  if (
    firstMeasureUnderfullAsPickup &&
    isFirstMeasureInPart &&
    measureMaxDiv > 0 &&
    measureMaxDiv < capacityDiv
  ) {
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
): PlaybackMeasureRange[] => {
  const part = Array.from(doc.querySelectorAll("score-partwise > part")).find(
    (candidate) => (candidate.getAttribute("id") ?? "").trim() === String(partId || "").trim()
  );
  if (!part) return [];

  const firstUnderfullAsPickup = shouldTreatFirstUnderfullAsPickup(doc);
  let divisions = Math.max(1, Math.round(fallbackDivisions));
  let beats = 4;
  let beatType = 4;
  let tick = 0;
  const ranges: PlaybackMeasureRange[] = [];
  const measures = Array.from(part.querySelectorAll(":scope > measure"));
  for (let index = 0; index < measures.length; index += 1) {
    const measure = measures[index];
    const nextMeasure = measures[index + 1] ?? null;
    const nextDivisions = getFirstNumber(measure, "attributes > divisions");
    if (nextDivisions && nextDivisions > 0) divisions = nextDivisions;
    const nextBeats = getFirstNumber(measure, "attributes > time > beats");
    const nextBeatType = getFirstNumber(measure, "attributes > time > beat-type");
    if (nextBeats && nextBeats > 0 && nextBeatType && nextBeatType > 0) {
      beats = nextBeats;
      beatType = nextBeatType;
    }
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
    const measureTicks = Math.max(
      1,
      Math.round((advanceDiv / Math.max(1, divisions)) * fallbackDivisions)
    );
    ranges.push({
      startTick: tick,
      endTick: tick + measureTicks,
      location: {
        partId,
        measureNumber: (measure.getAttribute("number") ?? "").trim(),
      },
    });
    tick += measureTicks;
  }
  return ranges;
};

export const findPlaybackLocationAtTick = (
  ranges: PlaybackMeasureRange[],
  tick: number
): PlaybackStartLocation | null => {
  if (ranges.length === 0) return null;
  const safeTick = Math.max(0, Math.round(tick));
  for (const range of ranges) {
    if (safeTick >= range.startTick && safeTick < range.endTick) return range.location;
  }
  return ranges[ranges.length - 1]?.location ?? null;
};

const trimMeasureTimelineFromTick = (
  ranges: PlaybackMeasureRange[],
  startTick: number
): PlaybackMeasureRange[] => {
  if (ranges.length === 0 || !Number.isFinite(startTick) || startTick <= 0) return ranges;
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
  const measureNumber = String(startFromMeasure.measureNumber ?? "").trim();
  return ranges.find((range) => range.location.measureNumber === measureNumber)?.startTick ?? null;
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
  const sortedTempo = tempoEvents
    .slice()
    .map((event) => ({
      startTicks: Math.max(0, Math.round(event.startTicks)),
      bpm: Math.max(1, Math.round(event.bpm || parsedPlayback.tempo || 120)),
    }))
    .sort((a, b) => a.startTicks - b.startTicks);
  const tempoAtStart = sortedTempo
    .slice()
    .reverse()
    .find((event) => event.startTicks <= safeStartTick);
  const trimmedTempoEvents = sortedTempo
    .filter((event) => event.startTicks > safeStartTick)
    .map((event) => ({ ...event, startTicks: event.startTicks - safeStartTick }));
  if (tempoAtStart) trimmedTempoEvents.unshift({ startTicks: 0, bpm: tempoAtStart.bpm });
  const trimmedControlEvents = controlEvents
    .filter((event) => event.startTicks >= safeStartTick)
    .map((event) => ({ ...event, startTicks: event.startTicks - safeStartTick }));
  return {
    parsedPlayback: { ...parsedPlayback, events: trimmedEvents },
    tempoEvents: trimmedTempoEvents,
    controlEvents: trimmedControlEvents,
  };
};

export const buildPlaybackPlan = (
  xmlText: string,
  options: PlaybackPlanOptions
): PlaybackPlanResult => {
  const playbackDoc = parseMusicXmlDocument(xmlText);
  if (!playbackDoc) {
    return { ok: false, code: "INVALID_MUSICXML", message: "invalid MusicXML" };
  }

  try {
    const mode = options.useMidiLikePlayback ? "midi" : "playback";
    let parsedPlayback = buildPlaybackEventsFromMusicXmlDoc(
      playbackDoc,
      options.ticksPerQuarter,
      {
        mode,
        graceTimingMode: options.graceTimingMode,
        metricAccentEnabled: options.metricAccentEnabled,
        metricAccentProfile: options.metricAccentProfile,
        includeTieInPlaybackLikeMode: !options.useMidiLikePlayback,
        applyDefaultDetacheInPlaybackLikeMode: !options.useMidiLikePlayback,
      }
    );
    let tempoEvents = options.useMidiLikePlayback
      ? collectMidiTempoEventsFromMusicXmlDoc(playbackDoc, options.ticksPerQuarter)
      : [];
    let controlEvents = options.useMidiLikePlayback
      ? collectMidiControlEventsFromMusicXmlDoc(playbackDoc, options.ticksPerQuarter)
      : [];
    const anchorPartId =
      options.startFromMeasure?.partId ??
      playbackDoc.querySelector("score-partwise > part")?.getAttribute("id")?.trim() ??
      "";
    let playbackStartTick = 0;
    if (options.startFromMeasure) {
      const startTick = resolveMeasureStartTickInPart(
        playbackDoc,
        options.startFromMeasure,
        options.ticksPerQuarter
      );
      if (startTick !== null && startTick > 0) {
        playbackStartTick = startTick;
        const trimmed = trimPlaybackFromTick(
          parsedPlayback,
          tempoEvents,
          controlEvents,
          startTick
        );
        parsedPlayback = trimmed.parsedPlayback;
        tempoEvents = trimmed.tempoEvents;
        controlEvents = trimmed.controlEvents;
      }
    }

    const events = parsedPlayback.events;
    if (events.length === 0) {
      return { ok: false, code: "NO_PLAYABLE_NOTES", message: "no playable notes" };
    }
    const measureTimeline = anchorPartId
      ? trimMeasureTimelineFromTick(
        buildMeasureTimelineForPart(playbackDoc, anchorPartId, options.ticksPerQuarter),
        playbackStartTick
      )
      : [];

    let midiByteLength: number | null = null;
    if (options.includeMidiByteLength === true) {
      const timeSignatureEvents = options.useMidiLikePlayback
        ? collectMidiTimeSignatureEventsFromMusicXmlDoc(playbackDoc, options.ticksPerQuarter)
        : [];
      const keySignatureEvents = options.useMidiLikePlayback
        ? collectMidiKeySignatureEventsFromMusicXmlDoc(playbackDoc, options.ticksPerQuarter)
        : [];
      try {
        const title =
          playbackDoc.querySelector("score-partwise > work > work-title")?.textContent?.trim() ??
          playbackDoc.querySelector("score-partwise > movement-title")?.textContent?.trim() ??
          "";
        const movementTitle =
          playbackDoc.querySelector("score-partwise > movement-title")?.textContent?.trim() ?? "";
        const composer =
          playbackDoc
            .querySelector('score-partwise > identification > creator[type="composer"]')
            ?.textContent?.trim() ??
          playbackDoc.querySelector("score-partwise > identification > creator")?.textContent?.trim() ??
          "";
        midiByteLength = buildMidiBytesForPlayback(
          events,
          parsedPlayback.tempo,
          "electric_piano_2",
          collectMidiProgramOverridesFromMusicXmlDoc(playbackDoc),
          controlEvents,
          tempoEvents,
          timeSignatureEvents,
          keySignatureEvents,
          {
            rawWriter: true,
            ticksPerQuarter: options.ticksPerQuarter,
            metadata: { title, movementTitle, composer },
          }
        ).length;
      } catch (error) {
        return {
          ok: false,
          code: "MIDI_GENERATION_FAILED",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return {
      ok: true,
      mode,
      schedule: toSynthSchedule(parsedPlayback.tempo, events, tempoEvents, controlEvents),
      eventCount: events.length,
      midiByteLength,
      measureTimeline,
      initialLocation: options.startFromMeasure ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      code: "MIDI_GENERATION_FAILED",
      message: error instanceof Error ? error.message : String(error),
    };
  }
};
