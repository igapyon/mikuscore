export type PlaybackEvent = {
  midiNumber: number;
  startTicks: number;
  durTicks: number;
  channel: number;
  velocity: number;
  trackId: string;
  trackName: string;
};

export type MidiControlEvent = {
  trackId: string;
  trackName: string;
  startTicks: number;
  channel: number;
  controllerNumber: number;
  controllerValue: number;
};

export type MidiTempoEvent = {
  startTicks: number;
  bpm: number;
};

export type MidiProgramPreset =
  | "electric_piano_2"
  | "acoustic_grand_piano"
  | "electric_piano_1"
  | "honky_tonk_piano"
  | "harpsichord"
  | "clavinet"
  | "drawbar_organ"
  | "acoustic_guitar_nylon"
  | "acoustic_bass"
  | "violin"
  | "string_ensemble_1"
  | "synth_brass_1";
export type MidiProgramOverrideMap = ReadonlyMap<string, number>;

const instrumentByPreset: Record<MidiProgramPreset, number> = {
  electric_piano_2: 5, // Existing default in this app.
  acoustic_grand_piano: 1,
  electric_piano_1: 4,
  honky_tonk_piano: 3,
  harpsichord: 6,
  clavinet: 7,
  drawbar_organ: 16,
  acoustic_guitar_nylon: 24,
  acoustic_bass: 32,
  violin: 40,
  string_ensemble_1: 48,
  synth_brass_1: 62,
};

type MidiWriterTrackApi = {
  setTempo: (tempo: number) => void;
  addEvent: (event: unknown) => void;
  addTrackName: (text: string) => unknown;
  addInstrumentName: (text: string) => unknown;
};

type MidiWriterNoteEventFields = {
  pitch: string[];
  duration: string;
  wait?: string;
  startTick?: number | null;
  velocity?: number;
  channel?: number;
};

type MidiWriterRuntime = {
  Track: new () => MidiWriterTrackApi;
  NoteEvent: new (fields: MidiWriterNoteEventFields) => unknown;
  ProgramChangeEvent: new (fields: { instrument: number; channel?: number; delta?: number }) => unknown;
  ControllerChangeEvent: new (fields: {
    controllerNumber: number;
    controllerValue: number;
    delta?: number;
  }) => { data?: number[] };
  Writer: new (tracks: unknown[] | unknown) => {
    buildFile: () => Uint8Array | number[];
  };
};

const clampTempo = (tempo: number): number => {
  if (!Number.isFinite(tempo)) return 120;
  return Math.max(20, Math.min(300, Math.round(tempo)));
};

const clampVelocity = (velocity: number): number => {
  if (!Number.isFinite(velocity)) return 80;
  return Math.max(1, Math.min(127, Math.round(velocity)));
};

const DRUM_NAME_HINT_TO_GM_NOTE: Array<{ pattern: RegExp; midi: number }> = [
  { pattern: /kick|bass drum|bd/i, midi: 36 },
  { pattern: /snare|sd/i, midi: 38 },
  { pattern: /rim/i, midi: 37 },
  { pattern: /clap/i, midi: 39 },
  { pattern: /closed hihat|closed hi-hat|chh|hh closed/i, midi: 42 },
  { pattern: /pedal hihat|pedal hi-hat/i, midi: 44 },
  { pattern: /open hihat|open hi-hat|ohh|hh open/i, midi: 46 },
  { pattern: /low tom|floor tom/i, midi: 45 },
  { pattern: /mid tom|middle tom/i, midi: 47 },
  { pattern: /high tom/i, midi: 50 },
  { pattern: /crash/i, midi: 49 },
  { pattern: /ride/i, midi: 51 },
  { pattern: /cowbell/i, midi: 56 },
  { pattern: /tambourine/i, midi: 54 },
  { pattern: /shaker|maracas/i, midi: 70 },
  { pattern: /conga/i, midi: 64 },
  { pattern: /bongo/i, midi: 60 },
  { pattern: /timbale/i, midi: 65 },
  { pattern: /agogo/i, midi: 67 },
  { pattern: /triangle/i, midi: 81 },
];

const DYNAMICS_TO_VELOCITY: Record<string, number> = {
  pppp: 20,
  ppp: 28,
  pp: 38,
  p: 50,
  mp: 64,
  mf: 80,
  f: 96,
  ff: 112,
  fff: 120,
  ffff: 126,
  sfz: 110,
  sf: 108,
  rfz: 106,
};

const readDirectionVelocity = (directionNode: Element, fallback: number): number => {
  const soundDynamicsText = directionNode.querySelector(":scope > sound")?.getAttribute("dynamics")?.trim() ?? "";
  if (soundDynamicsText) {
    const parsed = Number(soundDynamicsText);
    if (Number.isFinite(parsed) && parsed > 0) return clampVelocity((parsed / 100) * 127);
  }

  const dynamicsNode = directionNode.querySelector("direction-type > dynamics");
  if (!dynamicsNode) return fallback;
  for (const child of Array.from(dynamicsNode.children)) {
    const tag = child.tagName.toLowerCase();
    if (DYNAMICS_TO_VELOCITY[tag] !== undefined) {
      return DYNAMICS_TO_VELOCITY[tag];
    }
  }
  return fallback;
};

const getNoteArticulationAdjustments = (noteNode: Element): {
  velocityDelta: number;
  durationRatio: number;
  hasTenuto: boolean;
} => {
  let velocityDelta = 0;
  let durationRatio = 1;
  let hasTenuto = false;
  const articulations = Array.from(noteNode.querySelectorAll("notations > articulations > *"));
  for (const articulation of articulations) {
    const tag = articulation.tagName.toLowerCase();
    if (tag === "strong-accent") velocityDelta += 24;
    if (tag === "accent") velocityDelta += 14;
    if (tag === "staccatissimo") durationRatio = Math.min(durationRatio, 0.35);
    if (tag === "staccato") durationRatio = Math.min(durationRatio, 0.55);
    if (tag === "tenuto") {
      hasTenuto = true;
      durationRatio = Math.max(durationRatio, 1);
    }
  }
  return { velocityDelta, durationRatio, hasTenuto };
};

const getTieFlags = (noteNode: Element): { start: boolean; stop: boolean } => {
  const directTieNodes = Array.from(noteNode.children).filter((child) => child.tagName === "tie");
  const notationTieNodes = Array.from(noteNode.querySelectorAll("notations > tied"));
  const allTieNodes = [...directTieNodes, ...notationTieNodes];
  let start = false;
  let stop = false;
  for (const tieNode of allTieNodes) {
    const tieType = tieNode.getAttribute("type")?.trim().toLowerCase();
    if (tieType === "start") start = true;
    if (tieType === "stop") stop = true;
  }
  return { start, stop };
};

const getSlurNumbers = (noteNode: Element): { starts: string[]; stops: string[] } => {
  const starts: string[] = [];
  const stops: string[] = [];
  const slurNodes = Array.from(noteNode.querySelectorAll("notations > slur"));
  for (const slurNode of slurNodes) {
    const slurType = slurNode.getAttribute("type")?.trim().toLowerCase() ?? "";
    const slurNumber = slurNode.getAttribute("number")?.trim() || "1";
    if (slurType === "start") starts.push(slurNumber);
    if (slurType === "stop") stops.push(slurNumber);
  }
  return { starts, stops };
};

const getTemporalExpressionAdjustments = (
  noteNode: Element,
  baseDurTicks: number,
  ticksPerQuarter: number
): { durationExtraTicks: number; postPauseTicks: number } => {
  const hasFermata = Boolean(noteNode.querySelector("notations > fermata"));
  const hasCaesura =
    Boolean(noteNode.querySelector("notations > articulations > caesura")) ||
    Boolean(noteNode.querySelector("notations > caesura"));
  if (!hasFermata && !hasCaesura) {
    return { durationExtraTicks: 0, postPauseTicks: 0 };
  }

  let durationExtraTicks = 0;
  let postPauseTicks = 0;
  if (hasFermata) {
    durationExtraTicks += Math.max(
      Math.round(baseDurTicks * 0.35),
      Math.max(1, Math.round(ticksPerQuarter / 8))
    );
    postPauseTicks += Math.max(1, Math.round(ticksPerQuarter / 6));
  }
  if (hasCaesura) {
    durationExtraTicks += Math.max(0, Math.round(baseDurTicks * 0.12));
    postPauseTicks += Math.max(1, Math.round(ticksPerQuarter / 4));
  }
  return { durationExtraTicks, postPauseTicks };
};

type WedgeKind = "crescendo" | "diminuendo";
type WedgeDirective = {
  starts: Array<{ number: string; kind: WedgeKind }>;
  stops: Set<string>;
};

const readDirectionWedgeDirective = (directionNode: Element): WedgeDirective => {
  const starts: Array<{ number: string; kind: WedgeKind }> = [];
  const stops = new Set<string>();
  const wedgeNodes = Array.from(directionNode.querySelectorAll("direction-type > wedge"));
  for (const wedgeNode of wedgeNodes) {
    const wedgeType = wedgeNode.getAttribute("type")?.trim().toLowerCase() ?? "";
    const wedgeNumber = wedgeNode.getAttribute("number")?.trim() || "1";
    if (wedgeType === "crescendo" || wedgeType === "diminuendo") {
      starts.push({ number: wedgeNumber, kind: wedgeType });
    }
    if (wedgeType === "stop") {
      stops.add(wedgeNumber);
    }
  }
  return { starts, stops };
};

const splitTicks = (totalTicks: number, parts: number): number[] => {
  const safeParts = Math.max(1, Math.round(parts));
  const base = Math.floor(totalTicks / safeParts);
  const rest = totalTicks - base * safeParts;
  return Array.from({ length: safeParts }, (_, i) => base + (i < rest ? 1 : 0));
};

const splitTicksWeighted = (totalTicks: number, rawWeights: number[]): number[] => {
  const weights = rawWeights.map((w) => (Number.isFinite(w) && w > 0 ? w : 1));
  const count = weights.length;
  if (count === 0) return [];
  const safeTotal = Math.max(count, Math.round(totalTicks));
  const weightSum = weights.reduce((sum, w) => sum + w, 0) || count;
  const provisional = weights.map((w) => (safeTotal * w) / weightSum);
  const floors = provisional.map((v) => Math.max(1, Math.floor(v)));
  let assigned = floors.reduce((sum, n) => sum + n, 0);
  if (assigned > safeTotal) {
    let overflow = assigned - safeTotal;
    for (let i = count - 1; i >= 0 && overflow > 0; i -= 1) {
      const canRemove = Math.max(0, floors[i] - 1);
      const take = Math.min(canRemove, overflow);
      floors[i] -= take;
      overflow -= take;
    }
    return floors;
  }
  let remaining = safeTotal - assigned;
  const order = provisional
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => (b.frac === a.frac ? a.i - b.i : b.frac - a.frac));
  let index = 0;
  while (remaining > 0) {
    floors[order[index % order.length].i] += 1;
    remaining -= 1;
    index += 1;
  }
  return floors;
};

const stepOrder = ["C", "D", "E", "F", "G", "A", "B"] as const;
type StepName = (typeof stepOrder)[number];

const resolveNeighborPitch = (
  direction: "up" | "down",
  step: string,
  octave: number,
  keyAlterMap: Record<string, number>,
  measureAccidentalByStepOctave: Map<string, number>
): { step: StepName; octave: number; alter: number } | null => {
  const currentIndex = stepOrder.indexOf(step as StepName);
  if (currentIndex < 0) return null;
  const delta = direction === "up" ? 1 : -1;
  const rawIndex = currentIndex + delta;
  const wrappedIndex = (rawIndex + stepOrder.length) % stepOrder.length;
  const neighborStep = stepOrder[wrappedIndex];
  let neighborOctave = octave;
  if (direction === "up" && step === "B") neighborOctave += 1;
  if (direction === "down" && step === "C") neighborOctave -= 1;
  const stepOctaveKey = `${neighborStep}${neighborOctave}`;
  const alter = measureAccidentalByStepOctave.has(stepOctaveKey)
    ? measureAccidentalByStepOctave.get(stepOctaveKey) ?? 0
    : keyAlterMap[neighborStep] ?? 0;
  return { step: neighborStep, octave: neighborOctave, alter };
};

const buildOrnamentMidiSequence = (
  noteNode: Element,
  baseMidi: number,
  durTicks: number,
  ticksPerQuarter: number,
  context: {
    step: string;
    octave: number;
    keyAlterMap: Record<string, number>;
    measureAccidentalByStepOctave: Map<string, number>;
  }
): number[] => {
  if (durTicks < 2) return [baseMidi];
  const ornamentTags = new Set(
    Array.from(noteNode.querySelectorAll("notations > ornaments > *")).map((node) => node.tagName.toLowerCase())
  );
  if (ornamentTags.size === 0) return [baseMidi];

  const upperNeighbor = resolveNeighborPitch(
    "up",
    context.step,
    context.octave,
    context.keyAlterMap,
    context.measureAccidentalByStepOctave
  );
  const lowerNeighbor = resolveNeighborPitch(
    "down",
    context.step,
    context.octave,
    context.keyAlterMap,
    context.measureAccidentalByStepOctave
  );
  const upperMidi = upperNeighbor
    ? pitchToMidi(upperNeighbor.step, upperNeighbor.alter, upperNeighbor.octave) ?? Math.min(127, baseMidi + 2)
    : Math.min(127, baseMidi + 2);
  const lowerMidi = lowerNeighbor
    ? pitchToMidi(lowerNeighbor.step, lowerNeighbor.alter, lowerNeighbor.octave) ?? Math.max(0, baseMidi - 2)
    : Math.max(0, baseMidi - 2);

  if (ornamentTags.has("trill-mark") || ornamentTags.has("shake")) {
    const segmentTicks = Math.max(1, Math.round(ticksPerQuarter / 8));
    const count = Math.max(2, Math.min(16, Math.floor(durTicks / segmentTicks)));
    return Array.from({ length: count }, (_, i) => (i % 2 === 0 ? baseMidi : upperMidi));
  }

  if (ornamentTags.has("turn")) {
    return [upperMidi, baseMidi, lowerMidi, baseMidi];
  }
  if (ornamentTags.has("inverted-turn")) {
    return [lowerMidi, baseMidi, upperMidi, baseMidi];
  }
  if (ornamentTags.has("mordent")) {
    return [baseMidi, lowerMidi, baseMidi];
  }
  if (ornamentTags.has("inverted-mordent")) {
    return [baseMidi, upperMidi, baseMidi];
  }

  return [baseMidi];
};

const pitchToMidi = (step: string, alter: number, octave: number): number | null => {
  const semitoneMap: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  const base = semitoneMap[step];
  if (base === undefined) return null;
  return (octave + 1) * 12 + base + alter;
};

const keySignatureAlterByStep = (fifths: number): Record<string, number> => {
  const map: Record<string, number> = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  const sharpOrder = ["F", "C", "G", "D", "A", "E", "B"] as const;
  const flatOrder = ["B", "E", "A", "D", "G", "C", "F"] as const;
  const safeFifths = Math.max(-7, Math.min(7, Math.round(fifths)));
  if (safeFifths > 0) {
    for (let i = 0; i < safeFifths; i += 1) map[sharpOrder[i]] = 1;
  } else if (safeFifths < 0) {
    for (let i = 0; i < Math.abs(safeFifths); i += 1) map[flatOrder[i]] = -1;
  }
  return map;
};

const accidentalTextToAlter = (text: string): number | null => {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "sharp") return 1;
  if (normalized === "flat") return -1;
  if (normalized === "natural") return 0;
  if (normalized === "double-sharp") return 2;
  if (normalized === "flat-flat") return -2;
  return null;
};

const getFirstNumber = (el: ParentNode, selector: string): number | null => {
  const text = el.querySelector(selector)?.textContent?.trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

const midiToPitchText = (midiNumber: number): string => {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const n = Math.max(0, Math.min(127, Math.round(midiNumber)));
  const octave = Math.floor(n / 12) - 1;
  return `${names[n % 12]}${octave}`;
};

const getMidiWriterRuntime = (): MidiWriterRuntime | null => {
  return (window as unknown as { MidiWriter?: MidiWriterRuntime }).MidiWriter ?? null;
};

const normalizeTicksPerQuarter = (ticksPerQuarter: number): number => {
  if (!Number.isFinite(ticksPerQuarter)) return 128;
  return Math.max(1, Math.round(ticksPerQuarter));
};

const normalizeMidiProgramNumber = (value: number): number | null => {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 128) return null;
  return rounded;
};

const numberToVariableLength = (value: number): number[] => {
  let buffer = Math.max(0, Math.round(value)) & 0x0fffffff;
  const bytes = [buffer & 0x7f];
  buffer >>= 7;
  while (buffer > 0) {
    bytes.unshift((buffer & 0x7f) | 0x80);
    buffer >>= 7;
  }
  return bytes;
};

const buildTempoMetaEventData = (deltaTicks: number, bpm: number): number[] => {
  const safeBpm = clampTempo(bpm);
  const microsPerQuarter = Math.max(1, Math.round(60000000 / safeBpm));
  return [
    ...numberToVariableLength(deltaTicks),
    0xff,
    0x51,
    0x03,
    (microsPerQuarter >> 16) & 0xff,
    (microsPerQuarter >> 8) & 0xff,
    microsPerQuarter & 0xff,
  ];
};

const normalizeMidiChannel = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(16, Math.round(value)));
};

type DrumPartMap = {
  midiUnpitchedByInstrumentId: Map<string, number>;
  instrumentNameById: Map<string, string>;
  defaultMidiUnpitched: number | null;
};

const parseMidiNoteNumber = (value: string): number | null => {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 127) return null;
  return parsed;
};

const resolveDrumMidiFromInstrumentName = (name: string): number | null => {
  const trimmed = name.trim();
  if (!trimmed) return null;
  for (const entry of DRUM_NAME_HINT_TO_GM_NOTE) {
    if (entry.pattern.test(trimmed)) return entry.midi;
  }
  return null;
};

const buildDrumPartMapByPartId = (doc: Document): Map<string, DrumPartMap> => {
  const byPartId = new Map<string, DrumPartMap>();
  for (const scorePart of Array.from(doc.querySelectorAll("part-list > score-part"))) {
    const partId = scorePart.getAttribute("id")?.trim() ?? "";
    if (!partId) continue;

    const instrumentNameById = new Map<string, string>();
    for (const scoreInstrument of Array.from(scorePart.querySelectorAll(":scope > score-instrument"))) {
      const instrumentId = scoreInstrument.getAttribute("id")?.trim() ?? "";
      if (!instrumentId) continue;
      const name = scoreInstrument.querySelector("instrument-name")?.textContent?.trim() ?? "";
      if (name) instrumentNameById.set(instrumentId, name);
    }

    const midiUnpitchedByInstrumentId = new Map<string, number>();
    let defaultMidiUnpitched: number | null = null;
    for (const midiInstrument of Array.from(scorePart.querySelectorAll(":scope > midi-instrument"))) {
      const midiUnpitchedText = midiInstrument.querySelector("midi-unpitched")?.textContent?.trim() ?? "";
      const midiUnpitched = parseMidiNoteNumber(midiUnpitchedText);
      if (midiUnpitched === null) continue;
      const midiInstrumentId = midiInstrument.getAttribute("id")?.trim() ?? "";
      if (midiInstrumentId) {
        midiUnpitchedByInstrumentId.set(midiInstrumentId, midiUnpitched);
      }
      if (defaultMidiUnpitched === null) {
        defaultMidiUnpitched = midiUnpitched;
      }
    }

    byPartId.set(partId, {
      midiUnpitchedByInstrumentId,
      instrumentNameById,
      defaultMidiUnpitched,
    });
  }
  return byPartId;
};

const createControllerChangeEventForChannel = (
  midiWriter: MidiWriterRuntime,
  channel: number,
  controllerNumber: number,
  controllerValue: number,
  deltaTicks: number
): { data?: number[] } => {
  const event = new midiWriter.ControllerChangeEvent({
    controllerNumber: Math.max(0, Math.min(127, Math.round(controllerNumber))),
    controllerValue: Math.max(0, Math.min(127, Math.round(controllerValue))),
    delta: Math.max(0, Math.round(deltaTicks)),
  });
  if (Array.isArray(event.data) && event.data.length >= 3) {
    const statusIndex = event.data.length - 3;
    event.data[statusIndex] = 0xb0 + normalizeMidiChannel(channel) - 1;
  }
  return event;
};

export const collectMidiProgramOverridesFromMusicXmlDoc = (doc: Document): Map<string, number> => {
  const byPartId = new Map<string, number>();
  for (const scorePart of Array.from(doc.querySelectorAll("part-list > score-part"))) {
    const partId = scorePart.getAttribute("id")?.trim() ?? "";
    if (!partId) continue;
    const midiProgramNodes = Array.from(scorePart.querySelectorAll("midi-instrument > midi-program"));
    for (const midiProgramNode of midiProgramNodes) {
      const midiProgramText = midiProgramNode.textContent?.trim() ?? "";
      if (!midiProgramText) continue;
      const parsed = Number.parseInt(midiProgramText, 10);
      const normalized = normalizeMidiProgramNumber(parsed);
      if (normalized === null) continue;
      byPartId.set(partId, normalized);
      break;
    }
  }
  return byPartId;
};

export const collectMidiControlEventsFromMusicXmlDoc = (
  doc: Document,
  ticksPerQuarter: number
): MidiControlEvent[] => {
  const normalizedTicksPerQuarter = normalizeTicksPerQuarter(ticksPerQuarter);
  const partNodes = Array.from(doc.querySelectorAll("score-partwise > part"));
  if (partNodes.length === 0) return [];

  const channelMap = new Map<string, number>();
  for (const scorePart of Array.from(doc.querySelectorAll("part-list > score-part"))) {
    const partId = scorePart.getAttribute("id") ?? "";
    if (!partId) continue;
    const midiChannelText = scorePart.querySelector("midi-instrument > midi-channel")?.textContent?.trim();
    const midiChannel = midiChannelText ? Number.parseInt(midiChannelText, 10) : NaN;
    if (Number.isFinite(midiChannel) && midiChannel >= 1 && midiChannel <= 16) {
      channelMap.set(partId, midiChannel);
    }
  }

  const partNameById = new Map<string, string>();
  for (const scorePart of Array.from(doc.querySelectorAll("part-list > score-part"))) {
    const partId = scorePart.getAttribute("id") ?? "";
    if (!partId) continue;
    const rawName = scorePart.querySelector("part-name")?.textContent?.trim() ?? "";
    partNameById.set(partId, rawName || partId);
  }
  const controlEvents: MidiControlEvent[] = [];
  partNodes.forEach((part, partIndex) => {
    const partId = part.getAttribute("id") ?? "";
    const fallbackChannel = (partIndex % 16) + 1 === 10 ? 11 : (partIndex % 16) + 1;
    const channel = channelMap.get(partId) ?? fallbackChannel;
    const trackId = partId || `part-${partIndex + 1}`;
    const trackName = partNameById.get(partId) ?? trackId;

    let currentDivisions = 1;
    let timelineDiv = 0;
    let lastPedalValue: number | null = null;
    for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
      const divisions = getFirstNumber(measure, "attributes > divisions");
      if (divisions && divisions > 0) currentDivisions = divisions;

      let cursorDiv = 0;
      let measureMaxDiv = 0;
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

        if (child.tagName !== "direction") continue;
        const pedalNodes = Array.from(child.querySelectorAll("direction-type > pedal"));
        if (!pedalNodes.length) continue;

        const startTicks = Math.max(
          0,
          Math.round(((timelineDiv + cursorDiv) / currentDivisions) * normalizedTicksPerQuarter)
        );
        for (const pedalNode of pedalNodes) {
          const pedalType = pedalNode.getAttribute("type")?.trim().toLowerCase() ?? "start";
          if (pedalType === "stop") {
            if (lastPedalValue !== 0) {
              controlEvents.push({
                trackId,
                trackName,
                startTicks,
                channel,
                controllerNumber: 64,
                controllerValue: 0,
              });
              lastPedalValue = 0;
            }
            continue;
          }
          if (pedalType === "change") {
            if (lastPedalValue !== 0) {
              controlEvents.push({
                trackId,
                trackName,
                startTicks,
                channel,
                controllerNumber: 64,
                controllerValue: 0,
              });
            }
            controlEvents.push({
              trackId,
              trackName,
              startTicks,
              channel,
              controllerNumber: 64,
              controllerValue: 127,
            });
            lastPedalValue = 127;
            continue;
          }
          if (pedalType === "start" || pedalType === "continue" || pedalType === "resume") {
            if (lastPedalValue !== 127) {
              controlEvents.push({
                trackId,
                trackName,
                startTicks,
                channel,
                controllerNumber: 64,
                controllerValue: 127,
              });
              lastPedalValue = 127;
            }
          }
        }
      }

      if (measureMaxDiv <= 0) {
        const beats = getFirstNumber(measure, "attributes > time > beats") ?? 4;
        const beatType = getFirstNumber(measure, "attributes > time > beat-type") ?? 4;
        measureMaxDiv = Math.max(1, Math.round((currentDivisions * 4 * beats) / Math.max(1, beatType)));
      }
      timelineDiv += measureMaxDiv;
    }
  });

  return controlEvents;
};

export const collectMidiTempoEventsFromMusicXmlDoc = (
  doc: Document,
  ticksPerQuarter: number
): MidiTempoEvent[] => {
  const normalizedTicksPerQuarter = normalizeTicksPerQuarter(ticksPerQuarter);
  const firstPart = doc.querySelector("score-partwise > part");
  if (!firstPart) return [{ startTicks: 0, bpm: 120 }];

  let currentDivisions = 1;
  let timelineDiv = 0;
  let currentTempo = clampTempo(getFirstNumber(doc, "sound[tempo]") ?? 120);
  const events: MidiTempoEvent[] = [{ startTicks: 0, bpm: currentTempo }];

  for (const measure of Array.from(firstPart.querySelectorAll(":scope > measure"))) {
    const divisions = getFirstNumber(measure, "attributes > divisions");
    if (divisions && divisions > 0) currentDivisions = divisions;

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

      if (child.tagName === "direction") {
        const soundTempo = Number(child.querySelector(":scope > sound")?.getAttribute("tempo") ?? "");
        const metronomeTempo = Number(
          child.querySelector("direction-type > metronome > per-minute")?.textContent?.trim() ?? ""
        );
        const rawTempo = Number.isFinite(soundTempo) && soundTempo > 0 ? soundTempo : metronomeTempo;
        if (Number.isFinite(rawTempo) && rawTempo > 0) {
          const offsetDiv = getFirstNumber(child, ":scope > offset") ?? 0;
          const eventDiv = Math.max(0, timelineDiv + cursorDiv + offsetDiv);
          const eventTick = Math.max(
            0,
            Math.round((eventDiv / Math.max(1, currentDivisions)) * normalizedTicksPerQuarter)
          );
          const normalizedTempo = clampTempo(rawTempo);
          if (normalizedTempo !== currentTempo) {
            events.push({ startTicks: eventTick, bpm: normalizedTempo });
            currentTempo = normalizedTempo;
          }
        }
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

    if (measureMaxDiv <= 0) {
      const beats = getFirstNumber(measure, "attributes > time > beats") ?? 4;
      const beatType = getFirstNumber(measure, "attributes > time > beat-type") ?? 4;
      measureMaxDiv = Math.max(1, Math.round((currentDivisions * 4 * beats) / Math.max(1, beatType)));
    }
    timelineDiv += measureMaxDiv;
  }

  const byTick = new Map<number, number>();
  for (const event of events) {
    byTick.set(Math.max(0, Math.round(event.startTicks)), clampTempo(event.bpm));
  }
  const sortedTicks = Array.from(byTick.keys()).sort((a, b) => a - b);
  if (!sortedTicks.length || sortedTicks[0] !== 0) {
    sortedTicks.unshift(0);
    byTick.set(0, clampTempo(getFirstNumber(doc, "sound[tempo]") ?? 120));
  }
  return sortedTicks.map((tick) => ({ startTicks: tick, bpm: byTick.get(tick) ?? 120 }));
};

export const buildMidiBytesForPlayback = (
  events: PlaybackEvent[],
  tempo: number,
  programPreset: MidiProgramPreset = "electric_piano_2",
  trackProgramOverrides: MidiProgramOverrideMap = new Map<string, number>(),
  controlEvents: MidiControlEvent[] = [],
  tempoEvents: MidiTempoEvent[] = []
): Uint8Array => {
  const midiWriter = getMidiWriterRuntime();
  if (!midiWriter) {
    throw new Error("midi-writer.js is not loaded.");
  }
  const tracksById = new Map<string, PlaybackEvent[]>();
  for (const event of events) {
    const key = event.trackId || "__default__";
    const bucket = tracksById.get(key) ?? [];
    bucket.push(event);
    tracksById.set(key, bucket);
  }

  const midiTracks: unknown[] = [];
  const normalizedTempoEvents = (tempoEvents.length ? tempoEvents : [{ startTicks: 0, bpm: tempo }])
    .map((event) => ({
      startTicks: Math.max(0, Math.round(event.startTicks)),
      bpm: clampTempo(event.bpm),
    }))
    .sort((a, b) => a.startTicks - b.startTicks);
  const dedupedTempoEvents: MidiTempoEvent[] = [];
  for (const event of normalizedTempoEvents) {
    const prev = dedupedTempoEvents[dedupedTempoEvents.length - 1];
    if (prev && prev.startTicks === event.startTicks) {
      prev.bpm = event.bpm;
      continue;
    }
    dedupedTempoEvents.push({ ...event });
  }
  if (!dedupedTempoEvents.length || dedupedTempoEvents[0].startTicks !== 0) {
    dedupedTempoEvents.unshift({ startTicks: 0, bpm: clampTempo(tempo) });
  }
  const tempoTrack = new midiWriter.Track();
  tempoTrack.addTrackName("Tempo Map");
  tempoTrack.addInstrumentName("Tempo Map");
  let prevTempoTick = 0;
  for (const tempoEvent of dedupedTempoEvents) {
    const currentTick = Math.max(0, Math.round(tempoEvent.startTicks));
    const deltaTicks = Math.max(0, currentTick - prevTempoTick);
    tempoTrack.addEvent({ data: buildTempoMetaEventData(deltaTicks, tempoEvent.bpm) });
    prevTempoTick = currentTick;
  }
  midiTracks.push(tempoTrack);
  const normalizedProgramPreset: MidiProgramPreset =
    instrumentByPreset[programPreset] !== undefined ? programPreset : "electric_piano_2";
  const sortedTrackIds = Array.from(tracksById.keys()).sort((a, b) => a.localeCompare(b));
  sortedTrackIds.forEach((trackId, index) => {
    const trackEvents = (tracksById.get(trackId) ?? [])
      .slice()
      .sort((a, b) => (a.startTicks === b.startTicks ? a.midiNumber - b.midiNumber : a.startTicks - b.startTicks));
    if (!trackEvents.length) return;

    const track = new midiWriter.Track();
    const first = trackEvents[0];
    const trackName = first.trackName?.trim() || trackId || `Track ${index + 1}`;
    track.addTrackName(trackName);
    track.addInstrumentName(trackName);

    const channels = Array.from(
      new Set(trackEvents.map((event) => Math.max(1, Math.min(16, Math.round(event.channel || 1)))))
    ).sort((a, b) => a - b);
    const overrideProgram = normalizeMidiProgramNumber(trackProgramOverrides.get(trackId) ?? NaN);
    const selectedInstrumentProgram = overrideProgram ?? instrumentByPreset[normalizedProgramPreset];
    for (const channel of channels) {
      if (channel === 10) continue;
      track.addEvent(
        new midiWriter.ProgramChangeEvent({
          channel,
          instrument: selectedInstrumentProgram,
          delta: 0,
        })
      );
    }

    for (const event of trackEvents) {
      const fields: MidiWriterNoteEventFields = {
        pitch: [midiToPitchText(event.midiNumber)],
        duration: `T${event.durTicks}`,
        startTick: Math.max(0, Math.round(event.startTicks)),
        velocity: clampVelocity(event.velocity),
        channel: Math.max(1, Math.min(16, Math.round(event.channel || 1))),
      };
      track.addEvent(new midiWriter.NoteEvent(fields));
    }

    midiTracks.push(track);
  });

  const groupedControlEvents = new Map<string, MidiControlEvent[]>();
  for (const controlEvent of controlEvents) {
    const key = `${controlEvent.trackId}::${normalizeMidiChannel(controlEvent.channel)}`;
    const bucket = groupedControlEvents.get(key) ?? [];
    bucket.push(controlEvent);
    groupedControlEvents.set(key, bucket);
  }
  const sortedControlKeys = Array.from(groupedControlEvents.keys()).sort((a, b) => a.localeCompare(b));
  for (const controlKey of sortedControlKeys) {
    const channelEvents = (groupedControlEvents.get(controlKey) ?? [])
      .slice()
      .sort((a, b) =>
        a.startTicks === b.startTicks
          ? a.controllerNumber === b.controllerNumber
            ? a.controllerValue - b.controllerValue
            : a.controllerNumber - b.controllerNumber
          : a.startTicks - b.startTicks
      );
    if (!channelEvents.length) continue;
    const first = channelEvents[0];
    const ccTrack = new midiWriter.Track();
    ccTrack.addTrackName(`${first.trackName} Pedal`);
    ccTrack.addInstrumentName(`${first.trackName} Pedal`);
    let prevTick = 0;
    for (const controlEvent of channelEvents) {
      const currentTick = Math.max(0, Math.round(controlEvent.startTicks));
      const deltaTicks = Math.max(0, currentTick - prevTick);
      ccTrack.addEvent(
        createControllerChangeEventForChannel(
          midiWriter,
          controlEvent.channel,
          controlEvent.controllerNumber,
          controlEvent.controllerValue,
          deltaTicks
        )
      );
      prevTick = currentTick;
    }
    midiTracks.push(ccTrack);
  }

  if (!midiTracks.length) {
    throw new Error("No notes available for MIDI conversion.");
  }

  const writer = new midiWriter.Writer(midiTracks);
  const built = writer.buildFile();
  return built instanceof Uint8Array ? built : Uint8Array.from(built);
};

export const buildPlaybackEventsFromMusicXmlDoc = (
  doc: Document,
  ticksPerQuarter: number,
  options: { mode?: "playback" | "midi" } = {}
): { tempo: number; events: PlaybackEvent[] } => {
  const normalizedTicksPerQuarter = normalizeTicksPerQuarter(ticksPerQuarter);
  const mode = options.mode ?? "playback";
  const applyMidiNuance = mode === "midi";
  const partNodes = Array.from(doc.querySelectorAll("score-partwise > part"));
  if (partNodes.length === 0) return { tempo: 120, events: [] };

  const channelMap = new Map<string, number>();
  for (const scorePart of Array.from(doc.querySelectorAll("part-list > score-part"))) {
    const partId = scorePart.getAttribute("id") ?? "";
    if (!partId) continue;
    const midiChannelText = scorePart.querySelector("midi-instrument > midi-channel")?.textContent?.trim();
    const midiChannel = midiChannelText ? Number.parseInt(midiChannelText, 10) : NaN;
    if (Number.isFinite(midiChannel) && midiChannel >= 1 && midiChannel <= 16) {
      channelMap.set(partId, midiChannel);
    }
  }
  const partNameById = new Map<string, string>();
  for (const scorePart of Array.from(doc.querySelectorAll("part-list > score-part"))) {
    const partId = scorePart.getAttribute("id") ?? "";
    if (!partId) continue;
    const rawName = scorePart.querySelector("part-name")?.textContent?.trim() ?? "";
    partNameById.set(partId, rawName || partId);
  }
  const drumPartMapByPartId = buildDrumPartMapByPartId(doc);

  const defaultTempo = 120;
  const tempo = clampTempo(getFirstNumber(doc, "sound[tempo]") ?? defaultTempo);
  const events: PlaybackEvent[] = [];

  partNodes.forEach((part, partIndex) => {
    const partId = part.getAttribute("id") ?? "";
    const fallbackChannel = (partIndex % 16) + 1 === 10 ? 11 : (partIndex % 16) + 1;
    const channel = channelMap.get(partId) ?? fallbackChannel;

    let currentDivisions = 1;
    let currentBeats = 4;
    let currentBeatType = 4;
    let currentFifths = 0;
    let currentTransposeSemitones = 0;
    let currentVelocity = 80;
    let timelineDiv = 0;
    const tieChainByKey = new Map<string, PlaybackEvent>();
    const activeWedgeByNumber = new Map<string, WedgeKind>();
    const pendingGraceByVoice = new Map<string, Array<{ midiNumber: number; velocity: number; weight: number }>>();
    const activeSlurByVoice = new Map<string, Set<string>>();
    const voiceTimeShiftTicks = new Map<string, number>();

    for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
      const divisions = getFirstNumber(measure, "attributes > divisions");
      if (divisions && divisions > 0) {
        currentDivisions = divisions;
      }
      const beats = getFirstNumber(measure, "attributes > time > beats");
      const beatType = getFirstNumber(measure, "attributes > time > beat-type");
      if (beats && beats > 0 && beatType && beatType > 0) {
        currentBeats = beats;
        currentBeatType = beatType;
      }
      const fifths = getFirstNumber(measure, "attributes > key > fifths");
      if (fifths !== null) {
        currentFifths = Math.max(-7, Math.min(7, Math.round(fifths)));
      }
      const hasTranspose =
        Boolean(measure.querySelector("attributes > transpose > chromatic")) ||
        Boolean(measure.querySelector("attributes > transpose > octave-change"));
      if (hasTranspose) {
        const chromatic = getFirstNumber(measure, "attributes > transpose > chromatic") ?? 0;
        const octaveChange = getFirstNumber(measure, "attributes > transpose > octave-change") ?? 0;
        currentTransposeSemitones = Math.round(chromatic + octaveChange * 12);
      }

      let cursorDiv = 0;
      let measureMaxDiv = 0;
      const lastStartByVoice = new Map<string, number>();
      const measureAccidentalByStepOctave = new Map<string, number>();
      const keyAlterMap = keySignatureAlterByStep(currentFifths);

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

        if (applyMidiNuance && child.tagName === "direction") {
          currentVelocity = readDirectionVelocity(child, currentVelocity);
          const wedgeDirective = readDirectionWedgeDirective(child);
          for (const wedgeNumber of wedgeDirective.stops) {
            activeWedgeByNumber.delete(wedgeNumber);
          }
          for (const start of wedgeDirective.starts) {
            activeWedgeByNumber.set(start.number, start.kind);
          }
          continue;
        }

        if (child.tagName !== "note") continue;
        const voice = child.querySelector("voice")?.textContent?.trim() ?? "1";
        const isChord = Boolean(child.querySelector("chord"));
        const isRest = Boolean(child.querySelector("rest"));
        const isGrace = Boolean(child.querySelector("grace"));
        const durationDiv = getFirstNumber(child, "duration");
        if (!isGrace && (!durationDiv || durationDiv <= 0)) continue;
        const startDiv = isChord ? (lastStartByVoice.get(voice) ?? cursorDiv) : cursorDiv;
        if (!isChord) {
          lastStartByVoice.set(voice, startDiv);
        }

        if (!isRest) {
          const partDrumMap = drumPartMapByPartId.get(partId);
          const noteInstrumentId = child.querySelector(":scope > instrument")?.getAttribute("id")?.trim() ?? "";
          const hasUnpitched = Boolean(child.querySelector("unpitched"));
          const pitchStep = child.querySelector("pitch > step")?.textContent?.trim() ?? "";
          const pitchOctave = getFirstNumber(child, "pitch > octave");
          const explicitAlter = getFirstNumber(child, "pitch > alter");
          const accidentalAlter = accidentalTextToAlter(child.querySelector("accidental")?.textContent?.trim() ?? "");
          const drumByInstrumentId =
            noteInstrumentId && partDrumMap
              ? partDrumMap.midiUnpitchedByInstrumentId.get(noteInstrumentId)
              : undefined;
          const isDrumContext = channel === 10 || hasUnpitched || drumByInstrumentId !== undefined;
          let melodicStep = pitchStep;
          let melodicOctave = pitchOctave;
          let soundingMidi: number | null = null;

          if (isDrumContext) {
            if (drumByInstrumentId !== undefined) {
              soundingMidi = drumByInstrumentId;
            }
            if (soundingMidi === null && hasUnpitched) {
              const displayStep =
                child.querySelector("unpitched > display-step")?.textContent?.trim() ??
                child.querySelector("unpitched > step")?.textContent?.trim() ??
                "";
              const displayOctave =
                getFirstNumber(child, "unpitched > display-octave") ??
                getFirstNumber(child, "unpitched > octave");
              const displayAlter =
                getFirstNumber(child, "unpitched > display-alter") ??
                getFirstNumber(child, "unpitched > alter") ??
                0;
              if (displayOctave !== null) {
                melodicStep = displayStep || melodicStep;
                melodicOctave = displayOctave;
                soundingMidi = pitchToMidi(displayStep, Math.round(displayAlter), displayOctave);
              }
            }
            if (soundingMidi === null && noteInstrumentId && partDrumMap) {
              const instrumentName = partDrumMap.instrumentNameById.get(noteInstrumentId) ?? "";
              soundingMidi = resolveDrumMidiFromInstrumentName(instrumentName);
            }
            if (soundingMidi === null && partDrumMap && partDrumMap.defaultMidiUnpitched !== null) {
              soundingMidi = partDrumMap.defaultMidiUnpitched;
            }
            if (soundingMidi === null && pitchOctave !== null) {
              const stepOctaveKey = `${pitchStep}${pitchOctave}`;
              let drumAlter = 0;
              if (explicitAlter !== null) {
                drumAlter = Math.round(explicitAlter);
                measureAccidentalByStepOctave.set(stepOctaveKey, drumAlter);
              } else if (accidentalAlter !== null) {
                drumAlter = accidentalAlter;
                measureAccidentalByStepOctave.set(stepOctaveKey, drumAlter);
              } else if (measureAccidentalByStepOctave.has(stepOctaveKey)) {
                drumAlter = measureAccidentalByStepOctave.get(stepOctaveKey) ?? 0;
              }
              soundingMidi = pitchToMidi(pitchStep, drumAlter, pitchOctave);
            }
          } else if (pitchOctave !== null) {
            const stepOctaveKey = `${pitchStep}${pitchOctave}`;
            let effectiveAlter = 0;
            if (explicitAlter !== null) {
              effectiveAlter = Math.round(explicitAlter);
              measureAccidentalByStepOctave.set(stepOctaveKey, effectiveAlter);
            } else if (accidentalAlter !== null) {
              effectiveAlter = accidentalAlter;
              measureAccidentalByStepOctave.set(stepOctaveKey, effectiveAlter);
            } else if (measureAccidentalByStepOctave.has(stepOctaveKey)) {
              effectiveAlter = measureAccidentalByStepOctave.get(stepOctaveKey) ?? 0;
            } else {
              effectiveAlter = keyAlterMap[pitchStep] ?? 0;
            }
            const midi = pitchToMidi(pitchStep, effectiveAlter, pitchOctave);
            if (midi !== null) {
              soundingMidi = midi + currentTransposeSemitones;
            }
          }

          if (soundingMidi !== null) {
            if (soundingMidi < 0 || soundingMidi > 127) {
              continue;
            }
            const articulation = applyMidiNuance
              ? getNoteArticulationAdjustments(child)
              : { velocityDelta: 0, durationRatio: 1, hasTenuto: false };
            const velocity = clampVelocity(currentVelocity + articulation.velocityDelta);
            const voiceShiftTicks = applyMidiNuance ? voiceTimeShiftTicks.get(voice) ?? 0 : 0;
            const startTicks = Math.max(
              0,
              Math.round(((timelineDiv + startDiv) / currentDivisions) * normalizedTicksPerQuarter) + voiceShiftTicks
            );
            const baseDurTicks = Math.max(
              1,
              Math.round((((durationDiv ?? 1) as number) / currentDivisions) * normalizedTicksPerQuarter)
            );
            const slurNumbers = applyMidiNuance
              ? getSlurNumbers(child)
              : { starts: [] as string[], stops: [] as string[] };
            const activeSlurSet = activeSlurByVoice.get(voice) ?? new Set<string>();
            const noteUnderSlur =
              applyMidiNuance &&
              (activeSlurSet.size > 0 || slurNumbers.starts.length > 0 || slurNumbers.stops.length > 0);
            if (applyMidiNuance && isGrace) {
              const graceNode = child.querySelector("grace");
              const hasSlash =
                (graceNode?.getAttribute("slash")?.trim().toLowerCase() ?? "") === "yes" ||
                Boolean(graceNode?.querySelector("slash"));
              const weight = hasSlash ? 1 : 2;
              const pending = pendingGraceByVoice.get(voice) ?? [];
              pending.push({
                midiNumber: soundingMidi,
                velocity,
                weight,
              });
              pendingGraceByVoice.set(voice, pending);
              continue;
            }
            const legatoOverlapTicks =
              applyMidiNuance && !isChord && (noteUnderSlur || articulation.hasTenuto)
                ? Math.max(1, Math.round(normalizedTicksPerQuarter / 32))
                : 0;
            const temporalAdjustments =
              applyMidiNuance && !isGrace
                ? getTemporalExpressionAdjustments(child, baseDurTicks, normalizedTicksPerQuarter)
                : { durationExtraTicks: 0, postPauseTicks: 0 };
            const durTicks = Math.max(
              1,
              Math.round(baseDurTicks * articulation.durationRatio) +
                legatoOverlapTicks +
                temporalAdjustments.durationExtraTicks
            );
            const tieFlags = applyMidiNuance ? getTieFlags(child) : { start: false, stop: false };
            const canExpandOrnament = applyMidiNuance && !isDrumContext && !tieFlags.start && !tieFlags.stop;
            const ornamentMidiSequence = canExpandOrnament
              ? buildOrnamentMidiSequence(child, soundingMidi, durTicks, normalizedTicksPerQuarter, {
                  step: melodicStep,
                  octave: melodicOctave ?? 4,
                  keyAlterMap,
                  measureAccidentalByStepOctave,
                })
              : [soundingMidi];
            const ornamentDurations = splitTicks(durTicks, ornamentMidiSequence.length);
            const generatedEvents: PlaybackEvent[] = [];
            let eventStartTick = startTicks;
            const pendingGrace = applyMidiNuance ? pendingGraceByVoice.get(voice) ?? [] : [];
            if (applyMidiNuance && pendingGrace.length > 0) {
              const maxLeadByPrincipal = Math.max(pendingGrace.length, Math.round(baseDurTicks * 0.45));
              const maxLeadByTempo = Math.max(pendingGrace.length, Math.round(normalizedTicksPerQuarter / 2));
              const totalGraceTicks = Math.max(
                pendingGrace.length,
                Math.min(maxLeadByPrincipal, maxLeadByTempo)
              );
              const graceDurations = splitTicksWeighted(
                totalGraceTicks,
                pendingGrace.map((g) => g.weight)
              );
              const graceStartTick = Math.max(0, startTicks - totalGraceTicks);
              let graceTick = graceStartTick;
              for (let i = 0; i < pendingGrace.length; i += 1) {
                const grace = pendingGrace[i];
                const graceDur = Math.max(1, graceDurations[i] ?? 1);
                generatedEvents.push({
                  midiNumber: grace.midiNumber,
                  startTicks: graceTick,
                  durTicks: graceDur,
                  channel,
                  velocity: grace.velocity,
                  trackId: partId || `part-${partIndex + 1}`,
                  trackName:
                    partNameById.get(partId) ??
                    (partId || `part-${partIndex + 1}`),
                });
                graceTick += graceDur;
              }
              eventStartTick = Math.max(eventStartTick, graceTick);
              pendingGraceByVoice.delete(voice);
            }
            for (let i = 0; i < ornamentMidiSequence.length; i += 1) {
              const ornamentMidi = ornamentMidiSequence[i];
              const ornamentDurTicks = Math.max(1, ornamentDurations[i] ?? 1);
              generatedEvents.push({
                midiNumber: ornamentMidi,
                startTicks: eventStartTick,
                durTicks: ornamentDurTicks,
                channel,
                velocity,
                trackId: partId || `part-${partIndex + 1}`,
                trackName:
                  partNameById.get(partId) ??
                  (partId || `part-${partIndex + 1}`),
              });
              eventStartTick += ornamentDurTicks;
            }
            const primaryEvent = generatedEvents[0];
            if (!primaryEvent) continue;

            for (const wedgeKind of activeWedgeByNumber.values()) {
              currentVelocity = clampVelocity(currentVelocity + (wedgeKind === "crescendo" ? 4 : -4));
            }
            if (applyMidiNuance) {
              const tieKey = `${voice}|${channel}|${soundingMidi}`;
              if (tieFlags.stop) {
                const chained = tieChainByKey.get(tieKey);
                if (chained) {
                  chained.durTicks += primaryEvent.durTicks;
                  chained.velocity = Math.max(chained.velocity, velocity);
                } else {
                  events.push(primaryEvent);
                }
                if (!tieFlags.start) {
                  tieChainByKey.delete(tieKey);
                } else {
                  tieChainByKey.set(tieKey, chained ?? primaryEvent);
                }
              } else {
                events.push(...generatedEvents);
                if (tieFlags.start) {
                  tieChainByKey.set(tieKey, primaryEvent);
                } else {
                  tieChainByKey.delete(tieKey);
                }
              }
            } else {
              events.push(...generatedEvents);
            }
            if (applyMidiNuance) {
              const nextSlurSet = new Set(activeSlurSet);
              for (const slurStart of slurNumbers.starts) nextSlurSet.add(slurStart);
              for (const slurStop of slurNumbers.stops) nextSlurSet.delete(slurStop);
              if (nextSlurSet.size > 0) {
                activeSlurByVoice.set(voice, nextSlurSet);
              } else {
                activeSlurByVoice.delete(voice);
              }
              if (!isChord && temporalAdjustments.postPauseTicks > 0) {
                const shiftedTicks = (voiceTimeShiftTicks.get(voice) ?? 0) + temporalAdjustments.postPauseTicks;
                voiceTimeShiftTicks.set(voice, shiftedTicks);
              }
            }
          }
        }

        if (!isChord && !isGrace && durationDiv) {
          cursorDiv += durationDiv;
        }
        if (!isGrace && durationDiv) {
          measureMaxDiv = Math.max(measureMaxDiv, cursorDiv, startDiv + durationDiv);
        }
      }

      if (measureMaxDiv <= 0) {
        measureMaxDiv = Math.max(
          1,
          Math.round((currentDivisions * 4 * currentBeats) / Math.max(1, currentBeatType))
        );
      }
      timelineDiv += measureMaxDiv;
    }
  });

  return { tempo, events };
};

export const buildPlaybackEventsFromXml = (
  xml: string,
  ticksPerQuarter: number
): { tempo: number; events: PlaybackEvent[] } => {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return { tempo: 120, events: [] };
  return buildPlaybackEventsFromMusicXmlDoc(doc, ticksPerQuarter);
};
