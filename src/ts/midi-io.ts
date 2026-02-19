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
export type MidiTimeSignatureEvent = {
  startTicks: number;
  beats: number;
  beatType: number;
};
export type MidiKeySignatureEvent = {
  startTicks: number;
  fifths: number;
  mode: "major" | "minor";
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
export type GraceTimingMode = "before_beat" | "on_beat" | "classical_equal";
export type MetricAccentProfile = "subtle" | "balanced" | "strong";
export type MidiImportQuantizeGrid = "1/8" | "1/16" | "1/32";
export type MidiImportDiagnosticCode =
  | "MIDI_UNSUPPORTED_DIVISION"
  | "MIDI_NOTE_PAIR_BROKEN"
  | "MIDI_QUANTIZE_CLAMPED"
  | "MIDI_EVENT_DROPPED"
  | "MIDI_POLYPHONY_VOICE_ASSIGNED"
  | "MIDI_POLYPHONY_VOICE_OVERFLOW"
  | "MIDI_DRUM_CHANNEL_SEPARATED"
  | "MIDI_DRUM_NOTE_UNMAPPED"
  | "MIDI_INVALID_FILE"
  | "MIDI_UNSUPPORTED_FORMAT";
export type MidiImportDiagnostic = {
  code: MidiImportDiagnosticCode;
  message: string;
};
export type MidiImportOptions = {
  quantizeGrid?: MidiImportQuantizeGrid;
  title?: string;
  debugMetadata?: boolean;
  debugPrettyPrint?: boolean;
};
export type MidiImportResult = {
  ok: boolean;
  xml: string;
  diagnostics: MidiImportDiagnostic[];
  warnings: MidiImportDiagnostic[];
};

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

const DEFAULT_DETACHE_DURATION_RATIO = 0.93;
const DEFAULT_GRACE_TIMING_MODE: GraceTimingMode = "before_beat";
const DEFAULT_METRIC_ACCENT_PROFILE: MetricAccentProfile = "subtle";
const DEFAULT_MIDI_IMPORT_QUANTIZE_GRID: MidiImportQuantizeGrid = "1/16";
const METRIC_ACCENT_PROFILE_DELTAS: Record<MetricAccentProfile, { strong: number; medium: number }> = {
  subtle: { strong: 2, medium: 1 },
  balanced: { strong: 4, medium: 2 },
  strong: { strong: 6, medium: 3 },
};

type ParsedSmfHeader = {
  format: number;
  trackCount: number;
  ticksPerQuarter: number;
  nextOffset: number;
};

type SmfImportedNote = {
  trackIndex: number;
  channel: number;
  midi: number;
  startTick: number;
  endTick: number;
  velocity: number;
};

type TrackChannelKey = `${number}:${number}`;

type SmfParseSummary = {
  notes: SmfImportedNote[];
  channels: Set<number>;
  programByTrackChannel: Map<TrackChannelKey, number>;
  controllerEvents: Array<{ tick: number; channel: number; controllerNumber: number; controllerValue: number }>;
  timeSignatureEvents: Array<{ tick: number; beats: number; beatType: number }>;
  keySignatureEvents: Array<{ tick: number; fifths: number; mode: "major" | "minor" }>;
  tempoEvents: Array<{ tick: number; bpm: number }>;
  parseWarnings: MidiImportDiagnostic[];
};

const normalizeMetricAccentProfile = (value: unknown): MetricAccentProfile => {
  if (value === "balanced" || value === "strong") return value;
  return DEFAULT_METRIC_ACCENT_PROFILE;
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

const buildMetricAccentPattern = (
  beats: number,
  beatType: number,
  profile: MetricAccentProfile
): number[] => {
  const deltas = METRIC_ACCENT_PROFILE_DELTAS[normalizeMetricAccentProfile(profile)];
  const strong = deltas.strong;
  const medium = deltas.medium;
  if (beats === 4 && beatType === 4) {
    return [strong, 0, medium, 0];
  }
  if (beats === 6 && beatType === 8) {
    return [strong, 0, 0, medium, 0, 0];
  }
  if (beats === 3) {
    return [strong, 0, 0];
  }
  if (beats === 5) {
    return [strong, 0, medium, 0, 0];
  }
  return [strong, ...Array.from({ length: Math.max(0, beats - 1) }, () => 0)];
};

const getMetricAccentVelocityDelta = (
  startDiv: number,
  divisions: number,
  beats: number,
  beatType: number,
  profile: MetricAccentProfile
): number => {
  if (!Number.isFinite(startDiv) || !Number.isFinite(divisions) || !Number.isFinite(beats) || !Number.isFinite(beatType)) {
    return 0;
  }
  if (divisions <= 0 || beats <= 0 || beatType <= 0) return 0;
  const beatUnitDiv = (divisions * 4) / beatType;
  if (!Number.isFinite(beatUnitDiv) || beatUnitDiv <= 0) return 0;
  const measureDiv = beatUnitDiv * beats;
  if (!Number.isFinite(measureDiv) || measureDiv <= 0) return 0;
  const normalizedStartDiv = ((startDiv % measureDiv) + measureDiv) % measureDiv;
  const beatIndex = Math.max(0, Math.min(beats - 1, Math.floor(normalizedStartDiv / beatUnitDiv)));
  const pattern = buildMetricAccentPattern(
    Math.round(beats),
    Math.round(beatType),
    normalizeMetricAccentProfile(profile)
  );
  if (pattern.length === 0) return 0;
  return pattern[beatIndex % pattern.length] ?? 0;
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

const normalizeMidiImportQuantizeGrid = (value: unknown): MidiImportQuantizeGrid => {
  if (value === "1/8" || value === "1/32") return value;
  return DEFAULT_MIDI_IMPORT_QUANTIZE_GRID;
};

const quantizeGridToDivisions = (grid: MidiImportQuantizeGrid): number => {
  if (grid === "1/8") return 2;
  if (grid === "1/32") return 8;
  return 4;
};

const readAscii = (bytes: Uint8Array, start: number, length: number): string => {
  if (start < 0 || length < 0 || start + length > bytes.length) return "";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += String.fromCharCode(bytes[start + i]);
  }
  return out;
};

const readUint32Be = (bytes: Uint8Array, start: number): number | null => {
  if (start < 0 || start + 4 > bytes.length) return null;
  return (
    (bytes[start] << 24) |
    (bytes[start + 1] << 16) |
    (bytes[start + 2] << 8) |
    bytes[start + 3]
  ) >>> 0;
};

const readUint16Be = (bytes: Uint8Array, start: number): number | null => {
  if (start < 0 || start + 2 > bytes.length) return null;
  return (bytes[start] << 8) | bytes[start + 1];
};

const readVariableLengthAt = (
  bytes: Uint8Array,
  start: number
): { value: number; next: number } | null => {
  let value = 0;
  let cursor = start;
  for (let i = 0; i < 4; i += 1) {
    if (cursor >= bytes.length) return null;
    const current = bytes[cursor];
    value = (value << 7) | (current & 0x7f);
    cursor += 1;
    if ((current & 0x80) === 0) return { value, next: cursor };
  }
  return null;
};

const parseSmfHeader = (midiBytes: Uint8Array): {
  header: ParsedSmfHeader | null;
  diagnostics: MidiImportDiagnostic[];
} => {
  const diagnostics: MidiImportDiagnostic[] = [];
  if (midiBytes.length < 14) {
    diagnostics.push({
      code: "MIDI_INVALID_FILE",
      message: "SMF header is too short.",
    });
    return { header: null, diagnostics };
  }
  if (readAscii(midiBytes, 0, 4) !== "MThd") {
    diagnostics.push({
      code: "MIDI_INVALID_FILE",
      message: "Missing MThd header chunk.",
    });
    return { header: null, diagnostics };
  }
  const headerLength = readUint32Be(midiBytes, 4);
  const format = readUint16Be(midiBytes, 8);
  const trackCount = readUint16Be(midiBytes, 10);
  const division = readUint16Be(midiBytes, 12);
  if (
    headerLength === null ||
    format === null ||
    trackCount === null ||
    division === null ||
    headerLength < 6
  ) {
    diagnostics.push({
      code: "MIDI_INVALID_FILE",
      message: "Invalid SMF header fields.",
    });
    return { header: null, diagnostics };
  }
  const nextOffset = 8 + headerLength;
  if (nextOffset > midiBytes.length) {
    diagnostics.push({
      code: "MIDI_INVALID_FILE",
      message: "Header chunk length exceeds file size.",
    });
    return { header: null, diagnostics };
  }
  if (format !== 0 && format !== 1) {
    diagnostics.push({
      code: "MIDI_UNSUPPORTED_FORMAT",
      message: `Unsupported SMF format ${format}. Supported formats are 0 and 1.`,
    });
    return { header: null, diagnostics };
  }
  if ((division & 0x8000) !== 0) {
    diagnostics.push({
      code: "MIDI_UNSUPPORTED_DIVISION",
      message: "SMPTE time division is unsupported. Use PPQ-based MIDI files.",
    });
    return { header: null, diagnostics };
  }
  const ticksPerQuarter = division & 0x7fff;
  if (ticksPerQuarter <= 0) {
    diagnostics.push({
      code: "MIDI_INVALID_FILE",
      message: "PPQ must be a positive integer.",
    });
    return { header: null, diagnostics };
  }
  return {
    header: {
      format,
      trackCount,
      ticksPerQuarter,
      nextOffset,
    },
    diagnostics,
  };
};

const parseTrackSummary = (trackData: Uint8Array, trackIndex: number): SmfParseSummary => {
  const notes: SmfImportedNote[] = [];
  const channels = new Set<number>();
  const programByTrackChannel = new Map<TrackChannelKey, number>();
  const controllerEvents: Array<{
    tick: number;
    channel: number;
    controllerNumber: number;
    controllerValue: number;
  }> = [];
  const timeSignatureEvents: Array<{ tick: number; beats: number; beatType: number }> = [];
  const keySignatureEvents: Array<{ tick: number; fifths: number; mode: "major" | "minor" }> = [];
  const tempoEvents: Array<{ tick: number; bpm: number }> = [];
  const parseWarnings: MidiImportDiagnostic[] = [];
  const activeNoteStartTicks = new Map<string, Array<{ startTick: number; velocity: number }>>();
  let cursor = 0;
  let absTick = 0;
  let runningStatus: number | null = null;

  while (cursor < trackData.length) {
    const delta = readVariableLengthAt(trackData, cursor);
    if (!delta) {
      parseWarnings.push({
        code: "MIDI_EVENT_DROPPED",
        message: "Invalid variable-length delta time in track; remaining events were dropped.",
      });
      break;
    }
    cursor = delta.next;
    absTick += Math.max(0, delta.value);
    if (cursor >= trackData.length) break;

    let statusByte = trackData[cursor];
    if (statusByte < 0x80) {
      if (runningStatus === null) {
        parseWarnings.push({
          code: "MIDI_EVENT_DROPPED",
          message: "Running status without previous status; event dropped.",
        });
        break;
      }
      statusByte = runningStatus;
    } else {
      cursor += 1;
      runningStatus = statusByte < 0xf0 ? statusByte : null;
    }

    if (statusByte === 0xff) {
      if (cursor >= trackData.length) break;
      const metaType = trackData[cursor];
      cursor += 1;
      const metaLen = readVariableLengthAt(trackData, cursor);
      if (!metaLen) break;
      const payloadStart = metaLen.next;
      const payloadEnd = payloadStart + metaLen.value;
      if (payloadEnd > trackData.length) {
        parseWarnings.push({
          code: "MIDI_EVENT_DROPPED",
          message: "Meta event length overflow; remaining events were dropped.",
        });
        break;
      }
      if (metaType === 0x58 && metaLen.value >= 2) {
        const beats = trackData[payloadStart];
        const beatTypePow = trackData[payloadStart + 1];
        const beatType = Math.pow(2, beatTypePow);
        if (beats > 0 && Number.isFinite(beatType) && beatType > 0) {
          timeSignatureEvents.push({ tick: absTick, beats, beatType });
        }
      } else if (metaType === 0x59 && metaLen.value >= 2) {
        const sfRaw = trackData[payloadStart];
        const sf = sfRaw >= 0x80 ? sfRaw - 0x100 : sfRaw;
        const mi = trackData[payloadStart + 1];
        const fifths = Math.max(-7, Math.min(7, sf));
        const mode: "major" | "minor" = mi === 1 ? "minor" : "major";
        keySignatureEvents.push({ tick: absTick, fifths, mode });
      } else if (metaType === 0x51 && metaLen.value >= 3) {
        const microsPerQuarter =
          (trackData[payloadStart] << 16) |
          (trackData[payloadStart + 1] << 8) |
          trackData[payloadStart + 2];
        if (microsPerQuarter > 0) {
          const bpm = clampTempo(60000000 / microsPerQuarter);
          tempoEvents.push({ tick: absTick, bpm });
        }
      }
      cursor = payloadEnd;
      continue;
    }
    if (statusByte === 0xf0 || statusByte === 0xf7) {
      const sysExLen = readVariableLengthAt(trackData, cursor);
      if (!sysExLen) break;
      cursor = sysExLen.next + sysExLen.value;
      if (cursor > trackData.length) {
        parseWarnings.push({
          code: "MIDI_EVENT_DROPPED",
          message: "SysEx event length overflow; remaining events were dropped.",
        });
        break;
      }
      continue;
    }

    const messageType = statusByte & 0xf0;
    const channel = (statusByte & 0x0f) + 1;
    channels.add(channel);
    const dataLen = messageType === 0xc0 || messageType === 0xd0 ? 1 : 2;
    if (cursor + dataLen > trackData.length) {
      parseWarnings.push({
        code: "MIDI_EVENT_DROPPED",
        message: "Channel event data is truncated; remaining events were dropped.",
      });
      break;
    }
    const data1 = trackData[cursor];
    const data2 = dataLen === 2 ? trackData[cursor + 1] : 0;
    cursor += dataLen;

    if (messageType === 0xc0) {
      programByTrackChannel.set(`${trackIndex}:${channel}`, data1 + 1);
      continue;
    }

    if (messageType === 0xb0 && (data1 === 7 || data1 === 11)) {
      controllerEvents.push({
        tick: absTick,
        channel,
        controllerNumber: data1,
        controllerValue: Math.max(0, Math.min(127, Math.round(data2))),
      });
      continue;
    }

    if (messageType !== 0x80 && messageType !== 0x90) continue;
    const key = `${channel}:${data1}`;
    if (messageType === 0x90 && data2 > 0) {
      const bucket = activeNoteStartTicks.get(key) ?? [];
      bucket.push({ startTick: absTick, velocity: clampVelocity(data2) });
      activeNoteStartTicks.set(key, bucket);
      continue;
    }
    const bucket = activeNoteStartTicks.get(key) ?? [];
    const started = bucket.pop();
    if (bucket.length > 0) {
      activeNoteStartTicks.set(key, bucket);
    } else {
      activeNoteStartTicks.delete(key);
    }
    if (!started) {
      parseWarnings.push({
        code: "MIDI_NOTE_PAIR_BROKEN",
        message: `Note off without matching note on (ch ${channel}, note ${data1}).`,
      });
      continue;
    }
    const startTick = started.startTick;
    const endTick = Math.max(startTick + 1, absTick);
    notes.push({
      trackIndex,
      channel,
      midi: data1,
      startTick,
      endTick,
      velocity: started.velocity,
    });
  }

  for (const [key, starts] of activeNoteStartTicks.entries()) {
    const [channelText, noteText] = key.split(":");
    const channel = Number(channelText);
    const note = Number(noteText);
    for (const started of starts) {
      parseWarnings.push({
        code: "MIDI_NOTE_PAIR_BROKEN",
        message: `Note on without matching note off (ch ${channel}, note ${note}, start ${started.startTick}).`,
      });
    }
  }

  return {
    notes,
    channels,
    programByTrackChannel,
    controllerEvents,
    timeSignatureEvents,
    keySignatureEvents,
    tempoEvents,
    parseWarnings,
  };
};

const xmlEscape = (raw: string): string => {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

type ImportedQuantizedNote = {
  trackIndex: number;
  channel: number;
  midi: number;
  startTick: number;
  endTick: number;
  velocity: number;
};

type ImportedVoiceCluster = {
  voice: number;
  startTick: number;
  endTick: number;
  notes: ImportedQuantizedNote[];
};

type ImportedVoiceNoteSegment = {
  measureIndex: number;
  voice: number;
  staff: 1 | 2;
  startDiv: number;
  durDiv: number;
  midi: number;
  velocity: number;
  trackIndex: number;
  channel: number;
  startTick: number;
  endTick: number;
};

type DynamicMark = "ppp" | "pp" | "p" | "mp" | "mf" | "f" | "ff" | "fff";

const velocityToDynamicMark = (velocity: number): DynamicMark => {
  const v = clampVelocity(velocity);
  if (v <= 15) return "ppp";
  if (v <= 31) return "pp";
  if (v <= 47) return "p";
  if (v <= 63) return "mp";
  if (v <= 79) return "mf";
  if (v <= 95) return "f";
  if (v <= 111) return "ff";
  return "fff";
};

const buildDynamicsDirectionXml = (dynamicMark: DynamicMark, offsetDiv: number, staff: number): string => {
  let xml = "<direction>";
  xml += `<direction-type><dynamics><${dynamicMark}/></dynamics></direction-type>`;
  if (offsetDiv > 0) {
    xml += `<offset>${offsetDiv}</offset>`;
  }
  xml += `<staff>${Math.max(1, Math.round(staff))}</staff>`;
  xml += "</direction>";
  return xml;
};

const midiToPitchComponents = (midiNumber: number): { step: string; alter: number; octave: number } => {
  const n = Math.max(0, Math.min(127, Math.round(midiNumber)));
  const octave = Math.floor(n / 12) - 1;
  const semitone = n % 12;
  const table: Array<{ step: string; alter: number }> = [
    { step: "C", alter: 0 },
    { step: "C", alter: 1 },
    { step: "D", alter: 0 },
    { step: "D", alter: 1 },
    { step: "E", alter: 0 },
    { step: "F", alter: 0 },
    { step: "F", alter: 1 },
    { step: "G", alter: 0 },
    { step: "G", alter: 1 },
    { step: "A", alter: 0 },
    { step: "A", alter: 1 },
    { step: "B", alter: 0 },
  ];
  const mapped = table[semitone] ?? { step: "C", alter: 0 };
  return { step: mapped.step, alter: mapped.alter, octave };
};

const midiToPitchComponentsByKey = (
  midiNumber: number,
  keyFifths: number
): { step: string; alter: number; octave: number } => {
  const n = Math.max(0, Math.min(127, Math.round(midiNumber)));
  const octave = Math.floor(n / 12) - 1;
  const semitone = n % 12;
  const useFlatSpelling = keyFifths < 0;
  const sharpTable: Array<{ step: string; alter: number }> = [
    { step: "C", alter: 0 },
    { step: "C", alter: 1 },
    { step: "D", alter: 0 },
    { step: "D", alter: 1 },
    { step: "E", alter: 0 },
    { step: "F", alter: 0 },
    { step: "F", alter: 1 },
    { step: "G", alter: 0 },
    { step: "G", alter: 1 },
    { step: "A", alter: 0 },
    { step: "A", alter: 1 },
    { step: "B", alter: 0 },
  ];
  const flatTable: Array<{ step: string; alter: number }> = [
    { step: "C", alter: 0 },
    { step: "D", alter: -1 },
    { step: "D", alter: 0 },
    { step: "E", alter: -1 },
    { step: "E", alter: 0 },
    { step: "F", alter: 0 },
    { step: "G", alter: -1 },
    { step: "G", alter: 0 },
    { step: "A", alter: -1 },
    { step: "A", alter: 0 },
    { step: "B", alter: -1 },
    { step: "B", alter: 0 },
  ];
  const mapped = (useFlatSpelling ? flatTable : sharpTable)[semitone] ?? { step: "C", alter: 0 };
  return { step: mapped.step, alter: mapped.alter, octave };
};

const accidentalTextFromAlter = (alter: number): string | null => {
  if (alter === -2) return "flat-flat";
  if (alter === -1) return "flat";
  if (alter === 0) return "natural";
  if (alter === 1) return "sharp";
  if (alter === 2) return "double-sharp";
  return null;
};

const midiToDrumDisplay = (midiNumber: number): { step: string; octave: number } => {
  const p = midiToPitchComponents(midiNumber);
  return { step: p.step, octave: p.octave };
};

const quantizeImportedNotes = (
  notes: SmfImportedNote[],
  ticksPerQuarter: number,
  grid: MidiImportQuantizeGrid
): { notes: ImportedQuantizedNote[]; warnings: MidiImportDiagnostic[]; qTick: number } => {
  const warnings: MidiImportDiagnostic[] = [];
  const subdivision = quantizeGridToDivisions(grid);
  const qTick = Math.max(1, Math.round(ticksPerQuarter / subdivision));
  const quantized: ImportedQuantizedNote[] = [];
  for (const note of notes) {
    const startTick = Math.max(0, Math.round(note.startTick / qTick) * qTick);
    let endTick = Math.max(startTick + qTick, Math.round(note.endTick / qTick) * qTick);
    if (endTick <= startTick) {
      endTick = startTick + qTick;
      warnings.push({
        code: "MIDI_QUANTIZE_CLAMPED",
        message: `Quantized note duration was clamped (ch ${note.channel}, note ${note.midi}).`,
      });
    }
    quantized.push({
      trackIndex: note.trackIndex,
      channel: note.channel,
      midi: note.midi,
      startTick,
      endTick,
      velocity: note.velocity,
    });
  }
  return { notes: quantized, warnings, qTick };
};

const applyImportedControllerVelocityScale = (
  notes: ImportedQuantizedNote[],
  controllerEvents: Array<{
    trackIndex: number;
    channel: number;
    tick: number;
    controllerNumber: number;
    controllerValue: number;
  }>
): ImportedQuantizedNote[] => {
  if (!notes.length || !controllerEvents.length) return notes;
  const controlByTrackChannel = new Map<
    TrackChannelKey,
    { cc7: Array<{ tick: number; value: number }>; cc11: Array<{ tick: number; value: number }> }
  >();
  for (const event of controllerEvents) {
    const key: TrackChannelKey = `${event.trackIndex}:${event.channel}`;
    const bucket = controlByTrackChannel.get(key) ?? { cc7: [], cc11: [] };
    const target = event.controllerNumber === 7 ? bucket.cc7 : bucket.cc11;
    target.push({ tick: Math.max(0, Math.round(event.tick)), value: Math.max(0, Math.min(127, event.controllerValue)) });
    controlByTrackChannel.set(key, bucket);
  }
  for (const bucket of controlByTrackChannel.values()) {
    bucket.cc7.sort((a, b) => a.tick - b.tick);
    bucket.cc11.sort((a, b) => a.tick - b.tick);
  }

  const resolveCcValueAtTick = (events: Array<{ tick: number; value: number }>, tick: number): number => {
    let current = 127;
    for (const event of events) {
      if (event.tick > tick) break;
      current = event.value;
    }
    return current;
  };

  return notes.map((note) => {
    const key: TrackChannelKey = `${note.trackIndex}:${note.channel}`;
    const bucket = controlByTrackChannel.get(key);
    if (!bucket) return note;
    const cc7 = resolveCcValueAtTick(bucket.cc7, note.startTick);
    const cc11 = resolveCcValueAtTick(bucket.cc11, note.startTick);
    const scaled = Math.round(note.velocity * (cc7 / 127) * (cc11 / 127));
    return { ...note, velocity: clampVelocity(Math.max(1, scaled)) };
  });
};

const allocateAutoVoices = (
  notes: ImportedQuantizedNote[],
  warnings: MidiImportDiagnostic[]
): ImportedVoiceCluster[] => {
  if (!notes.length) return [];
  const clustersByStart = new Map<number, ImportedQuantizedNote[]>();
  for (const note of notes) {
    const bucket = clustersByStart.get(note.startTick) ?? [];
    bucket.push(note);
    clustersByStart.set(note.startTick, bucket);
  }
  const starts = Array.from(clustersByStart.keys()).sort((a, b) => a - b);
  const voices: Array<{ lastEnd: number; lastPitch: number }> = [];
  const out: ImportedVoiceCluster[] = [];

  for (const start of starts) {
    const clusterNotes = (clustersByStart.get(start) ?? []).slice().sort((a, b) => a.midi - b.midi);
    if (!clusterNotes.length) continue;
    const clusterEnd = Math.max(...clusterNotes.map((note) => note.endTick));
    const representativePitch = clusterNotes[Math.floor(clusterNotes.length / 2)].midi;

    let bestVoice = -1;
    let bestGap = Number.POSITIVE_INFINITY;
    let bestPitchJump = Number.POSITIVE_INFINITY;
    for (let i = 0; i < voices.length; i += 1) {
      if (voices[i].lastEnd > start) continue;
      const gap = start - voices[i].lastEnd;
      const pitchJump = Math.abs(representativePitch - voices[i].lastPitch);
      if (gap < bestGap || (gap === bestGap && pitchJump < bestPitchJump)) {
        bestVoice = i;
        bestGap = gap;
        bestPitchJump = pitchJump;
      }
    }
    if (bestVoice < 0) {
      bestVoice = voices.length;
      voices.push({ lastEnd: clusterEnd, lastPitch: representativePitch });
    } else {
      voices[bestVoice] = { lastEnd: clusterEnd, lastPitch: representativePitch };
    }
    out.push({
      voice: bestVoice + 1,
      startTick: start,
      endTick: clusterEnd,
      notes: clusterNotes,
    });
  }

  if (voices.length > 1) {
    warnings.push({
      code: "MIDI_POLYPHONY_VOICE_ASSIGNED",
      message: `Auto voice split assigned ${voices.length} voices.`,
    });
  }
  if (voices.length > 8) {
    warnings.push({
      code: "MIDI_POLYPHONY_VOICE_OVERFLOW",
      message: `Auto voice split generated ${voices.length} voices (high density).`,
    });
  }
  return out;
};

const splitClustersToMeasureSegments = (params: {
  clusters: ImportedVoiceCluster[];
  ticksPerQuarter: number;
  divisions: number;
  measureTicks: number;
  isDrum: boolean;
}): ImportedVoiceNoteSegment[] => {
  const out: ImportedVoiceNoteSegment[] = [];
  const { clusters, ticksPerQuarter, divisions, measureTicks, isDrum } = params;
  const toDiv = (ticks: number): number => Math.max(0, Math.round((ticks * divisions) / ticksPerQuarter));

  for (const cluster of clusters) {
    for (const note of cluster.notes) {
      let segmentStart = note.startTick;
      while (segmentStart < note.endTick) {
        const measureIndex = Math.floor(segmentStart / measureTicks);
        const measureEndTick = (measureIndex + 1) * measureTicks;
        const segmentEnd = Math.min(note.endTick, measureEndTick);
        const startInMeasureTick = segmentStart - measureIndex * measureTicks;
        const startDiv = toDiv(startInMeasureTick);
        const durDiv = Math.max(1, toDiv(segmentEnd - segmentStart));
        out.push({
          measureIndex,
          voice: cluster.voice,
          staff: isDrum ? 1 : note.midi >= 60 ? 1 : 2,
          startDiv,
          durDiv,
          midi: note.midi,
          velocity: note.velocity,
          trackIndex: note.trackIndex,
          channel: note.channel,
          startTick: segmentStart,
          endTick: segmentEnd,
        });
        segmentStart = segmentEnd;
      }
    }
  }
  return out;
};

type DurationNotation = {
  type: "whole" | "half" | "quarter" | "eighth" | "16th" | "32nd" | "64th";
  dots: 0 | 1 | 2;
  q: number;
  durDiv: number;
};

const durationNotationCandidates = (divisions: number): DurationNotation[] => {
  const base: Array<{
    type: "whole" | "half" | "quarter" | "eighth" | "16th" | "32nd" | "64th";
    q: number;
    dots: 0 | 1 | 2;
  }> = [
    { type: "whole", q: 4, dots: 0 },
    { type: "whole", q: 6, dots: 1 },
    { type: "whole", q: 7, dots: 2 },
    { type: "half", q: 2, dots: 0 },
    { type: "half", q: 3, dots: 1 },
    { type: "half", q: 3.5, dots: 2 },
    { type: "quarter", q: 1, dots: 0 },
    { type: "quarter", q: 1.5, dots: 1 },
    { type: "quarter", q: 1.75, dots: 2 },
    { type: "eighth", q: 0.5, dots: 0 },
    { type: "eighth", q: 0.75, dots: 1 },
    { type: "eighth", q: 0.875, dots: 2 },
    { type: "16th", q: 0.25, dots: 0 },
    { type: "16th", q: 0.375, dots: 1 },
    { type: "16th", q: 0.4375, dots: 2 },
    { type: "32nd", q: 0.125, dots: 0 },
    { type: "32nd", q: 0.1875, dots: 1 },
    { type: "32nd", q: 0.21875, dots: 2 },
    { type: "64th", q: 0.0625, dots: 0 },
    { type: "64th", q: 0.09375, dots: 1 },
    { type: "64th", q: 0.109375, dots: 2 },
  ];
  return base.map((candidate) => ({
    ...candidate,
    durDiv: candidate.q * divisions,
  }));
};

const resolveDurationNotation = (durDiv: number, divisions: number): DurationNotation | null => {
  if (!Number.isFinite(durDiv) || !Number.isFinite(divisions) || durDiv <= 0 || divisions <= 0) return null;
  const tolerance = 1e-6;
  const candidates = durationNotationCandidates(divisions);
  const matched = candidates.find((candidate) => Math.abs(candidate.durDiv - durDiv) <= tolerance);
  if (!matched) return null;
  return matched;
};

const splitDurationNotations = (durDiv: number, divisions: number): DurationNotation[] => {
  const single = resolveDurationNotation(durDiv, divisions);
  if (single) return [single];
  if (!Number.isFinite(durDiv) || !Number.isFinite(divisions) || durDiv <= 0 || divisions <= 0) return [];
  const roundedDur = Math.round(durDiv);
  if (Math.abs(durDiv - roundedDur) > 1e-6) return [];
  const candidates = durationNotationCandidates(divisions)
    .filter((candidate) => Math.abs(candidate.durDiv - Math.round(candidate.durDiv)) <= 1e-6)
    .map((candidate) => ({ ...candidate, durDiv: Math.round(candidate.durDiv) }))
    .filter((candidate) => candidate.durDiv > 0)
    .sort((a, b) => b.durDiv - a.durDiv);
  const best: Array<DurationNotation[] | null> = Array.from({ length: roundedDur + 1 }, () => null);
  best[0] = [];
  for (let target = 1; target <= roundedDur; target += 1) {
    for (const candidate of candidates) {
      if (candidate.durDiv > target) continue;
      const prev = best[target - candidate.durDiv];
      if (!prev) continue;
      const composed = [...prev, candidate];
      if (!best[target] || composed.length < (best[target]?.length ?? Number.POSITIVE_INFINITY)) {
        best[target] = composed;
      }
    }
  }
  return best[roundedDur] ?? [];
};

const buildTypeXmlFromNotation = (notation: DurationNotation): string => {
  let xml = `<type>${notation.type}</type>`;
  for (let i = 0; i < notation.dots; i += 1) {
    xml += "<dot/>";
  }
  return xml;
};

const buildTieXml = (tieStart: boolean, tieStop: boolean): string => {
  if (!tieStart && !tieStop) return "";
  let xml = "";
  if (tieStop) xml += '<tie type="stop"/>';
  if (tieStart) xml += '<tie type="start"/>';
  xml += "<notations>";
  if (tieStop) xml += '<tied type="stop"/>';
  if (tieStart) xml += '<tied type="start"/>';
  xml += "</notations>";
  return xml;
};

const buildRestXml = (durDiv: number, voice: number, outputStaff: number, divisions: number): string => {
  const chunks = splitDurationNotations(durDiv, divisions);
  if (!chunks.length) {
    return `<note><rest/><duration>${durDiv}</duration><voice>${voice}</voice><staff>${outputStaff}</staff></note>`;
  }
  let xml = "";
  for (const chunk of chunks) {
    xml += `<note><rest/><duration>${chunk.durDiv}</duration>${buildTypeXmlFromNotation(chunk)}<voice>${voice}</voice><staff>${outputStaff}</staff></note>`;
  }
  return xml;
};

const prettyPrintXml = (xml: string): string => {
  const compact = xml.replace(/>\s+</g, "><").trim();
  const split = compact.replace(/(>)(<)(\/*)/g, "$1\n$2$3").split("\n");
  let indent = 0;
  const lines: string[] = [];
  for (const rawToken of split) {
    const token = rawToken.trim();
    if (!token) continue;
    if (/^<\//.test(token)) indent = Math.max(0, indent - 1);
    const pad = "  ".repeat(indent);
    lines.push(`${pad}${token}`);
    const isOpening = /^<[^!?/][^>]*>$/.test(token);
    const isSelfClosing = /\/>$/.test(token);
    if (isOpening && !isSelfClosing) indent += 1;
  }
  return lines.join("\n");
};

const toHex = (value: number, width = 2): string => {
  const safe = Math.max(0, Math.round(value));
  return `0x${safe.toString(16).toUpperCase().padStart(width, "0")}`;
};

const buildMeasureMidiDebugMiscXml = (measureSegments: ImportedVoiceNoteSegment[]): string => {
  if (!measureSegments.length) return "";
  const sorted = measureSegments
    .slice()
    .sort((a, b) =>
      a.startDiv === b.startDiv
        ? a.midi === b.midi
          ? a.voice - b.voice
          : a.midi - b.midi
        : a.startDiv - b.startDiv
    );
  let xml = "<attributes><miscellaneous>";
  xml += `<miscellaneous-field name="mks:midi-debug-count">${toHex(sorted.length, 4)}</miscellaneous-field>`;
  for (let i = 0; i < sorted.length; i += 1) {
    const seg = sorted[i];
    const payload = [
      `idx=${toHex(i, 4)}`,
      `tr=${toHex(seg.trackIndex, 2)}`,
      `ch=${toHex(seg.channel, 2)}`,
      `v=${toHex(seg.voice, 2)}`,
      `stf=${toHex(seg.staff, 2)}`,
      `key=${toHex(seg.midi, 2)}`,
      `vel=${toHex(seg.velocity, 2)}`,
      `sd=${toHex(seg.startDiv, 4)}`,
      `dd=${toHex(seg.durDiv, 4)}`,
      `tk0=${toHex(seg.startTick, 6)}`,
      `tk1=${toHex(seg.endTick, 6)}`,
    ].join(";");
    xml += `<miscellaneous-field name="mks:midi-debug-${String(i + 1).padStart(4, "0")}">${payload}</miscellaneous-field>`;
  }
  xml += "</miscellaneous></attributes>";
  return xml;
};

const buildMeasureVoiceXml = (
  segments: ImportedVoiceNoteSegment[],
  voice: number,
  sourceStaff: 1 | 2,
  outputStaff: number,
  measureDiv: number,
  isDrum: boolean,
  divisions: number,
  keyFifths: number
): string => {
  const voiceSegments = segments
    .filter((segment) => segment.voice === voice && segment.staff === sourceStaff)
    .slice()
    .sort((a, b) => (a.startDiv === b.startDiv ? a.midi - b.midi : a.startDiv - b.startDiv));

  if (!voiceSegments.length) {
    return buildRestXml(measureDiv, voice, outputStaff, divisions);
  }

  const groupsByStart = new Map<number, ImportedVoiceNoteSegment[]>();
  for (const segment of voiceSegments) {
    const bucket = groupsByStart.get(segment.startDiv) ?? [];
    bucket.push(segment);
    groupsByStart.set(segment.startDiv, bucket);
  }
  const starts = Array.from(groupsByStart.keys()).sort((a, b) => a - b);
  const keyAlterMap = keySignatureAlterByStep(keyFifths);
  const accidentalByStepOctave = new Map<string, number>();

  let cursor = 0;
  let xml = "";
  for (const start of starts) {
    const group = (groupsByStart.get(start) ?? []).slice().sort((a, b) => a.midi - b.midi);
    if (start > cursor) {
      const restDur = start - cursor;
      xml += buildRestXml(restDur, voice, outputStaff, divisions);
    }
    const groupDur = Math.max(...group.map((segment) => segment.durDiv));
    const notationChunks = splitDurationNotations(groupDur, divisions);
    const fallbackChunk = notationChunks.length
      ? null
      : {
          type: "quarter" as const,
          dots: 0 as const,
          q: groupDur / Math.max(1, divisions),
          durDiv: groupDur,
        };
    const chunks = notationChunks.length ? notationChunks : [fallbackChunk];
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const chunk = chunks[chunkIndex];
      if (!chunk) continue;
      const tieStart = chunks.length > 1 && chunkIndex < chunks.length - 1;
      const tieStop = chunks.length > 1 && chunkIndex > 0;
      const typeXml = buildTypeXmlFromNotation(chunk);
      for (let i = 0; i < group.length; i += 1) {
        const segment = group[i];
        if (isDrum) {
          const display = midiToDrumDisplay(segment.midi);
          xml += "<note>";
          if (i > 0) xml += "<chord/>";
          xml += `<unpitched><display-step>${display.step}</display-step><display-octave>${display.octave}</display-octave></unpitched>`;
          xml += `<duration>${chunk.durDiv}</duration>${typeXml}<voice>${voice}</voice><staff>${outputStaff}</staff><notehead>x</notehead>`;
          xml += buildTieXml(tieStart, tieStop);
          xml += "</note>";
        } else {
          const pitch = midiToPitchComponentsByKey(segment.midi, keyFifths);
          const stepOctaveKey = `${pitch.step}${pitch.octave}`;
          const defaultAlter = accidentalByStepOctave.has(stepOctaveKey)
            ? accidentalByStepOctave.get(stepOctaveKey) ?? 0
            : keyAlterMap[pitch.step] ?? 0;
          const requiresAccidental = pitch.alter !== defaultAlter;
          const accidentalText = requiresAccidental ? accidentalTextFromAlter(pitch.alter) : null;
          xml += "<note>";
          if (i > 0) xml += "<chord/>";
          xml += `<pitch><step>${pitch.step}</step>${pitch.alter !== 0 ? `<alter>${pitch.alter}</alter>` : ""}<octave>${pitch.octave}</octave></pitch>`;
          if (accidentalText) {
            xml += `<accidental>${accidentalText}</accidental>`;
          }
          xml += `<duration>${chunk.durDiv}</duration>${typeXml}<voice>${voice}</voice><staff>${outputStaff}</staff>`;
          xml += buildTieXml(tieStart, tieStop);
          xml += "</note>";
          accidentalByStepOctave.set(stepOctaveKey, pitch.alter);
        }
      }
    }
    cursor = Math.max(cursor, start + groupDur);
  }
  if (cursor < measureDiv) {
    const restDur = measureDiv - cursor;
    xml += buildRestXml(restDur, voice, outputStaff, divisions);
  }
  return xml;
};

const buildPartMusicXml = (params: {
  partId: string;
  divisions: number;
  beats: number;
  beatType: number;
  keyFifths: number;
  keyMode: "major" | "minor";
  isDrum: boolean;
  notes: ImportedQuantizedNote[];
  tempoEventsByMeasure: Map<number, Array<{ offsetDiv: number; bpm: number }>>;
  includeTempoEvents: boolean;
  ticksPerQuarter: number;
  warnings: MidiImportDiagnostic[];
  debugImportMetadata: boolean;
}): string => {
  const {
    partId,
    divisions,
    beats,
    beatType,
    keyFifths,
    keyMode,
    isDrum,
    notes,
    tempoEventsByMeasure,
    includeTempoEvents,
    ticksPerQuarter,
    warnings,
    debugImportMetadata,
  } = params;
  const measureTicks = Math.max(1, Math.round((ticksPerQuarter * 4 * beats) / Math.max(1, beatType)));
  const measureDiv = Math.max(1, Math.round((divisions * 4 * beats) / Math.max(1, beatType)));
  const maxEndTick = notes.length ? Math.max(...notes.map((note) => note.endTick)) : measureTicks;
  const measureCount = Math.max(1, Math.ceil(maxEndTick / measureTicks));

  const clusters = allocateAutoVoices(notes, warnings);
  const voiceSegmentsByMeasure = new Map<number, ImportedVoiceNoteSegment[]>();
  const splitSegments = splitClustersToMeasureSegments({
    clusters,
    ticksPerQuarter,
    divisions,
    measureTicks,
    isDrum,
  });
  for (const segment of splitSegments) {
    const bucket = voiceSegmentsByMeasure.get(segment.measureIndex) ?? [];
    bucket.push(segment);
    voiceSegmentsByMeasure.set(segment.measureIndex, bucket);
  }

  const laneDefs: Array<{ sourceStaff: 1 | 2; voice: number; outputStaff: number }> = [];
  if (isDrum) {
    const voices = Array.from(new Set(splitSegments.map((segment) => segment.voice))).sort((a, b) => a - b);
    const resolvedVoices = voices.length ? voices : [1];
    for (let i = 0; i < resolvedVoices.length; i += 1) {
      laneDefs.push({ sourceStaff: 1, voice: resolvedVoices[i], outputStaff: i + 1 });
    }
  } else {
    const trebleVoices = Array.from(
      new Set(splitSegments.filter((segment) => segment.staff === 1).map((segment) => segment.voice))
    ).sort((a, b) => a - b);
    const bassVoices = Array.from(
      new Set(splitSegments.filter((segment) => segment.staff === 2).map((segment) => segment.voice))
    ).sort((a, b) => a - b);
    const resolvedTrebleVoices = trebleVoices.length ? trebleVoices : [1];
    const resolvedBassVoices = bassVoices.length ? bassVoices : [1];
    let outputStaff = 1;
    for (const voice of resolvedTrebleVoices) {
      laneDefs.push({ sourceStaff: 1, voice, outputStaff });
      outputStaff += 1;
    }
    for (const voice of resolvedBassVoices) {
      laneDefs.push({ sourceStaff: 2, voice, outputStaff });
      outputStaff += 1;
    }
  }
  const laneCount = Math.max(1, laneDefs.length);

  let partXml = `<part id="${partId}">`;
  let previousDynamicMark: DynamicMark | null = null;
  for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
    const measureNumber = measureIndex + 1;
    const measureSegments = voiceSegmentsByMeasure.get(measureIndex) ?? [];
    partXml += `<measure number="${measureNumber}">`;
    if (measureIndex === 0) {
      partXml += "<attributes>";
      partXml += `<divisions>${divisions}</divisions>`;
      partXml += `<key><fifths>${keyFifths}</fifths><mode>${keyMode}</mode></key>`;
      partXml += `<time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>`;
      if (isDrum) {
        partXml += "<clef><sign>percussion</sign><line>2</line></clef>";
      } else {
        partXml += `<staves>${laneCount}</staves>`;
        for (const lane of laneDefs) {
          if (lane.sourceStaff === 1) {
            partXml += `<clef number="${lane.outputStaff}"><sign>G</sign><line>2</line></clef>`;
          } else {
            partXml += `<clef number="${lane.outputStaff}"><sign>F</sign><line>4</line></clef>`;
          }
        }
      }
      partXml += "</attributes>";
    }
    if (includeTempoEvents) {
      const tempoEvents = tempoEventsByMeasure.get(measureIndex) ?? [];
      for (const event of tempoEvents) {
        partXml += "<direction>";
        partXml += "<direction-type><metronome><beat-unit>quarter</beat-unit>";
        partXml += `<per-minute>${event.bpm}</per-minute>`;
        partXml += "</metronome></direction-type>";
        if (event.offsetDiv > 0) {
          partXml += `<offset>${event.offsetDiv}</offset>`;
        }
        partXml += `<sound tempo="${event.bpm}"/>`;
        partXml += "</direction>";
      }
    }
    if (debugImportMetadata) {
      partXml += buildMeasureMidiDebugMiscXml(measureSegments);
    }
    if (measureSegments.length > 0) {
      const dynamicVelocityByOffset = new Map<number, number>();
      for (const segment of measureSegments) {
        const previousVelocity = dynamicVelocityByOffset.get(segment.startDiv);
        if (previousVelocity === undefined || segment.velocity > previousVelocity) {
          dynamicVelocityByOffset.set(segment.startDiv, segment.velocity);
        }
      }
      const offsets = Array.from(dynamicVelocityByOffset.keys()).sort((a, b) => a - b);
      for (const offset of offsets) {
        const velocity = dynamicVelocityByOffset.get(offset) ?? 80;
        const dynamicMark = velocityToDynamicMark(velocity);
        if (dynamicMark === previousDynamicMark) continue;
        partXml += buildDynamicsDirectionXml(dynamicMark, offset, 1);
        previousDynamicMark = dynamicMark;
      }
    }
    for (let laneIndex = 0; laneIndex < laneDefs.length; laneIndex += 1) {
      const lane = laneDefs[laneIndex];
      if (laneIndex > 0) {
        partXml += `<backup><duration>${measureDiv}</duration></backup>`;
      }
      partXml += buildMeasureVoiceXml(
        measureSegments,
        lane.voice,
        lane.sourceStaff,
        lane.outputStaff,
        measureDiv,
        isDrum,
        divisions,
        keyFifths
      );
    }
    partXml += "</measure>";
  }
  partXml += "</part>";
  return partXml;
};

const buildImportSkeletonMusicXml = (params: {
  title: string;
  quantizeGrid: MidiImportQuantizeGrid;
  ticksPerQuarter: number;
  beats: number;
  beatType: number;
  keyFifths: number;
  keyMode: "major" | "minor";
  tempoEvents: Array<{ tick: number; bpm: number }>;
  partGroups: Array<{ trackIndex: number; channel: number }>;
  notesByTrackChannel: Map<TrackChannelKey, ImportedQuantizedNote[]>;
  programByTrackChannel: Map<TrackChannelKey, number>;
  warnings: MidiImportDiagnostic[];
  debugImportMetadata: boolean;
}): string => {
  const {
    title,
    quantizeGrid,
    ticksPerQuarter,
    beats,
    beatType,
    keyFifths,
    keyMode,
    tempoEvents,
    partGroups,
    notesByTrackChannel,
    programByTrackChannel,
    warnings,
    debugImportMetadata,
  } = params;
  const divisions = quantizeGridToDivisions(quantizeGrid);
  const measureTicks = Math.max(1, Math.round((ticksPerQuarter * 4 * beats) / Math.max(1, beatType)));
  const partDefs: Array<{ partId: string; name: string; channel: number; program: number; key: TrackChannelKey }> = [];

  let index = 1;
  for (const group of partGroups) {
    const key: TrackChannelKey = `${group.trackIndex}:${group.channel}`;
    const isDrum = group.channel === 10;
    partDefs.push({
      partId: `P${index}`,
      name: isDrum
        ? `Drums (Track ${group.trackIndex + 1})`
        : `Track ${group.trackIndex + 1} Ch ${group.channel}`,
      channel: group.channel,
      program: normalizeMidiProgramNumber(programByTrackChannel.get(key) ?? NaN) ?? 1,
      key,
    });
    index += 1;
  }
  if (!partDefs.length) {
    partDefs.push({
      partId: "P1",
      name: "Part 1",
      channel: 1,
      program: 1,
      key: "0:1",
    });
  }

  const partList = partDefs
    .map(
      (part) =>
        `<score-part id="${part.partId}"><part-name>${xmlEscape(part.name)}</part-name><midi-instrument id="${part.partId}-I1"><midi-channel>${part.channel}</midi-channel><midi-program>${part.program}</midi-program></midi-instrument></score-part>`
    )
    .join("");

  const tempoEventsByMeasure = new Map<number, Array<{ offsetDiv: number; bpm: number }>>();
  for (const tempoEvent of tempoEvents) {
    const tick = Math.max(0, Math.round(tempoEvent.tick));
    const measureIndex = Math.floor(tick / measureTicks);
    const tickInMeasure = tick - measureIndex * measureTicks;
    const offsetDiv = Math.max(0, Math.round((tickInMeasure * divisions) / ticksPerQuarter));
    const bucket = tempoEventsByMeasure.get(measureIndex) ?? [];
    bucket.push({ offsetDiv, bpm: clampTempo(tempoEvent.bpm) });
    tempoEventsByMeasure.set(measureIndex, bucket);
  }
  for (const [measureIndex, events] of tempoEventsByMeasure.entries()) {
    events.sort((a, b) => (a.offsetDiv === b.offsetDiv ? a.bpm - b.bpm : a.offsetDiv - b.offsetDiv));
    const deduped: Array<{ offsetDiv: number; bpm: number }> = [];
    for (const event of events) {
      const prev = deduped[deduped.length - 1];
      if (prev && prev.offsetDiv === event.offsetDiv) {
        prev.bpm = event.bpm;
      } else {
        deduped.push({ ...event });
      }
    }
    tempoEventsByMeasure.set(measureIndex, deduped);
  }

  const parts = partDefs
    .map((part, partIndex) =>
      buildPartMusicXml({
        partId: part.partId,
        divisions,
        beats,
        beatType,
        keyFifths,
        keyMode,
        isDrum: part.channel === 10,
        notes: notesByTrackChannel.get(part.key) ?? [],
        tempoEventsByMeasure,
        includeTempoEvents: partIndex === 0,
        ticksPerQuarter,
        warnings,
        debugImportMetadata,
      })
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>${xmlEscape(title)}</work-title></work><part-list>${partList}</part-list>${parts}</score-partwise>`;
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

const buildTimeSignatureMetaEventData = (deltaTicks: number, beats: number, beatType: number): number[] => {
  const safeBeats = Math.max(1, Math.min(255, Math.round(beats)));
  const safeBeatType = Math.max(1, Math.round(beatType));
  const dd = Math.max(0, Math.min(7, Math.round(Math.log2(safeBeatType))));
  return [
    ...numberToVariableLength(deltaTicks),
    0xff,
    0x58,
    0x04,
    safeBeats & 0xff,
    dd & 0xff,
    24,
    8,
  ];
};

const buildKeySignatureMetaEventData = (
  deltaTicks: number,
  fifths: number,
  mode: "major" | "minor"
): number[] => {
  const safeFifths = Math.max(-7, Math.min(7, Math.round(fifths)));
  const sf = safeFifths < 0 ? safeFifths + 256 : safeFifths;
  const mi = mode === "minor" ? 1 : 0;
  return [
    ...numberToVariableLength(deltaTicks),
    0xff,
    0x59,
    0x02,
    sf & 0xff,
    mi,
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

export const collectMidiTimeSignatureEventsFromMusicXmlDoc = (
  doc: Document,
  ticksPerQuarter: number
): MidiTimeSignatureEvent[] => {
  const normalizedTicksPerQuarter = normalizeTicksPerQuarter(ticksPerQuarter);
  const firstPart = doc.querySelector("score-partwise > part");
  if (!firstPart) return [{ startTicks: 0, beats: 4, beatType: 4 }];

  let currentDivisions = 1;
  let tickCursor = 0;
  let currentBeats = 4;
  let currentBeatType = 4;
  const events: MidiTimeSignatureEvent[] = [{ startTicks: 0, beats: currentBeats, beatType: currentBeatType }];

  for (const measure of Array.from(firstPart.querySelectorAll(":scope > measure"))) {
    const divisions = getFirstNumber(measure, "attributes > divisions");
    if (divisions && divisions > 0) currentDivisions = divisions;

    const beats = getFirstNumber(measure, "attributes > time > beats");
    const beatType = getFirstNumber(measure, "attributes > time > beat-type");
    if (
      beats !== null &&
      beatType !== null &&
      (Math.round(beats) !== currentBeats || Math.round(beatType) !== currentBeatType)
    ) {
      currentBeats = Math.max(1, Math.round(beats));
      currentBeatType = Math.max(1, Math.round(beatType));
      events.push({ startTicks: tickCursor, beats: currentBeats, beatType: currentBeatType });
    }

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
      if (child.tagName !== "note") continue;
      const durationDiv = getFirstNumber(child, "duration");
      if (!durationDiv || durationDiv <= 0) continue;
      if (!child.querySelector("chord")) {
        cursorDiv += durationDiv;
      }
      measureMaxDiv = Math.max(measureMaxDiv, cursorDiv);
    }
    if (measureMaxDiv <= 0) {
      measureMaxDiv = Math.max(
        1,
        Math.round((currentDivisions * 4 * currentBeats) / Math.max(1, currentBeatType))
      );
    }
    tickCursor += Math.max(
      1,
      Math.round((measureMaxDiv / Math.max(1, currentDivisions)) * normalizedTicksPerQuarter)
    );
  }

  const byTick = new Map<number, { beats: number; beatType: number }>();
  for (const event of events) {
    byTick.set(Math.max(0, Math.round(event.startTicks)), {
      beats: Math.max(1, Math.round(event.beats)),
      beatType: Math.max(1, Math.round(event.beatType)),
    });
  }
  const sortedTicks = Array.from(byTick.keys()).sort((a, b) => a - b);
  return sortedTicks.map((tick) => ({
    startTicks: tick,
    beats: byTick.get(tick)?.beats ?? 4,
    beatType: byTick.get(tick)?.beatType ?? 4,
  }));
};

export const collectMidiKeySignatureEventsFromMusicXmlDoc = (
  doc: Document,
  ticksPerQuarter: number
): MidiKeySignatureEvent[] => {
  const normalizedTicksPerQuarter = normalizeTicksPerQuarter(ticksPerQuarter);
  const firstPart = doc.querySelector("score-partwise > part");
  if (!firstPart) return [{ startTicks: 0, fifths: 0, mode: "major" }];

  let currentDivisions = 1;
  let tickCursor = 0;
  let currentFifths = 0;
  let currentMode: "major" | "minor" = "major";
  const events: MidiKeySignatureEvent[] = [
    { startTicks: 0, fifths: currentFifths, mode: currentMode },
  ];
  let hasInitialKey = false;

  for (const measure of Array.from(firstPart.querySelectorAll(":scope > measure"))) {
    const divisions = getFirstNumber(measure, "attributes > divisions");
    if (divisions && divisions > 0) currentDivisions = divisions;

    const fifths = getFirstNumber(measure, "attributes > key > fifths");
    const modeText = measure.querySelector("attributes > key > mode")?.textContent?.trim().toLowerCase() ?? "";
    const mode: "major" | "minor" = modeText === "minor" ? "minor" : "major";
    if (Number.isFinite(fifths)) {
      const roundedFifths = Math.max(-7, Math.min(7, Math.round(fifths!)));
      if (!hasInitialKey || roundedFifths !== currentFifths || mode !== currentMode) {
        if (!hasInitialKey) {
          events[0] = { startTicks: 0, fifths: roundedFifths, mode };
          hasInitialKey = true;
        } else {
          events.push({ startTicks: tickCursor, fifths: roundedFifths, mode });
        }
        currentFifths = roundedFifths;
        currentMode = mode;
      }
    }

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
      if (child.tagName !== "note") continue;
      const durationDiv = getFirstNumber(child, "duration");
      if (!durationDiv || durationDiv <= 0) continue;
      if (!child.querySelector("chord")) {
        cursorDiv += durationDiv;
      }
      measureMaxDiv = Math.max(measureMaxDiv, cursorDiv);
    }
    if (measureMaxDiv <= 0) {
      const beats = getFirstNumber(measure, "attributes > time > beats") ?? 4;
      const beatType = getFirstNumber(measure, "attributes > time > beat-type") ?? 4;
      measureMaxDiv = Math.max(1, Math.round((currentDivisions * 4 * beats) / Math.max(1, beatType)));
    }
    tickCursor += Math.max(
      1,
      Math.round((measureMaxDiv / Math.max(1, currentDivisions)) * normalizedTicksPerQuarter)
    );
  }

  const byTick = new Map<number, { fifths: number; mode: "major" | "minor" }>();
  for (const event of events) {
    byTick.set(Math.max(0, Math.round(event.startTicks)), {
      fifths: Math.max(-7, Math.min(7, Math.round(event.fifths))),
      mode: event.mode === "minor" ? "minor" : "major",
    });
  }
  const sortedTicks = Array.from(byTick.keys()).sort((a, b) => a - b);
  return sortedTicks.map((tick) => ({
    startTicks: tick,
    fifths: byTick.get(tick)?.fifths ?? 0,
    mode: byTick.get(tick)?.mode ?? "major",
  }));
};

export const buildMidiBytesForPlayback = (
  events: PlaybackEvent[],
  tempo: number,
  programPreset: MidiProgramPreset = "electric_piano_2",
  trackProgramOverrides: MidiProgramOverrideMap = new Map<string, number>(),
  controlEvents: MidiControlEvent[] = [],
  tempoEvents: MidiTempoEvent[] = [],
  timeSignatureEvents: MidiTimeSignatureEvent[] = [],
  keySignatureEvents: MidiKeySignatureEvent[] = []
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
  const dedupedTimeSignatureEvents: MidiTimeSignatureEvent[] = [];
  for (const event of timeSignatureEvents
    .map((e) => ({
      startTicks: Math.max(0, Math.round(e.startTicks)),
      beats: Math.max(1, Math.round(e.beats)),
      beatType: Math.max(1, Math.round(e.beatType)),
    }))
    .sort((a, b) => a.startTicks - b.startTicks)) {
    const prev = dedupedTimeSignatureEvents[dedupedTimeSignatureEvents.length - 1];
    if (prev && prev.startTicks === event.startTicks) {
      prev.beats = event.beats;
      prev.beatType = event.beatType;
      continue;
    }
    dedupedTimeSignatureEvents.push({ ...event });
  }
  if (!dedupedTimeSignatureEvents.length || dedupedTimeSignatureEvents[0].startTicks !== 0) {
    dedupedTimeSignatureEvents.unshift({ startTicks: 0, beats: 4, beatType: 4 });
  }
  const dedupedKeySignatureEvents: MidiKeySignatureEvent[] = [];
  for (const event of keySignatureEvents
    .map((e) => ({
      startTicks: Math.max(0, Math.round(e.startTicks)),
      fifths: Math.max(-7, Math.min(7, Math.round(e.fifths))),
      mode: (e.mode === "minor" ? "minor" : "major") as "major" | "minor",
    }))
    .sort((a, b) => a.startTicks - b.startTicks)) {
    const prev = dedupedKeySignatureEvents[dedupedKeySignatureEvents.length - 1];
    if (prev && prev.startTicks === event.startTicks) {
      prev.fifths = event.fifths;
      prev.mode = event.mode;
      continue;
    }
    dedupedKeySignatureEvents.push({ ...event });
  }
  if (!dedupedKeySignatureEvents.length || dedupedKeySignatureEvents[0].startTicks !== 0) {
    dedupedKeySignatureEvents.unshift({ startTicks: 0, fifths: 0, mode: "major" });
  }
  const tempoTrack = new midiWriter.Track();
  tempoTrack.addTrackName("Tempo Map");
  tempoTrack.addInstrumentName("Tempo Map");
  const metaTimeline: Array<
    | ({ kind: "tempo" } & MidiTempoEvent)
    | ({ kind: "time" } & MidiTimeSignatureEvent)
    | ({ kind: "key" } & MidiKeySignatureEvent)
  > = [];
  metaTimeline.push(...dedupedTempoEvents.map((e) => ({ kind: "tempo" as const, ...e })));
  metaTimeline.push(...dedupedTimeSignatureEvents.map((e) => ({ kind: "time" as const, ...e })));
  metaTimeline.push(...dedupedKeySignatureEvents.map((e) => ({ kind: "key" as const, ...e })));
  const kindPriority: Record<"time" | "key" | "tempo", number> = { time: 0, key: 1, tempo: 2 };
  metaTimeline.sort((a, b) =>
    a.startTicks === b.startTicks ? kindPriority[a.kind] - kindPriority[b.kind] : a.startTicks - b.startTicks
  );
  let prevTempoTick = 0;
  for (const metaEvent of metaTimeline) {
    const currentTick = Math.max(0, Math.round(metaEvent.startTicks));
    const deltaTicks = Math.max(0, currentTick - prevTempoTick);
    if (metaEvent.kind === "tempo") {
      tempoTrack.addEvent({ data: buildTempoMetaEventData(deltaTicks, metaEvent.bpm) });
    } else if (metaEvent.kind === "time") {
      tempoTrack.addEvent({
        data: buildTimeSignatureMetaEventData(deltaTicks, metaEvent.beats, metaEvent.beatType),
      });
    } else {
      tempoTrack.addEvent({
        data: buildKeySignatureMetaEventData(deltaTicks, metaEvent.fifths, metaEvent.mode),
      });
    }
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

export const convertMidiToMusicXml = (
  midiBytes: Uint8Array,
  options: MidiImportOptions = {}
): MidiImportResult => {
  const diagnostics: MidiImportDiagnostic[] = [];
  const warnings: MidiImportDiagnostic[] = [];
  const quantizeGrid = normalizeMidiImportQuantizeGrid(options.quantizeGrid);
  const title = String(options.title ?? "").trim() || "Imported MIDI";
  const debugImportMetadata = options.debugMetadata ?? true;
  const debugPrettyPrint = options.debugPrettyPrint ?? debugImportMetadata;

  if (!(midiBytes instanceof Uint8Array) || midiBytes.length === 0) {
    diagnostics.push({
      code: "MIDI_INVALID_FILE",
      message: "MIDI input is empty.",
    });
    return { ok: false, xml: "", diagnostics, warnings };
  }

  const headerResult = parseSmfHeader(midiBytes);
  diagnostics.push(...headerResult.diagnostics);
  if (!headerResult.header) {
    return { ok: false, xml: "", diagnostics, warnings };
  }
  const header = headerResult.header;

  let offset = header.nextOffset;
  const trackChannelSet = new Set<TrackChannelKey>();
  const programByTrackChannel = new Map<TrackChannelKey, number>();
  const collectedNotes: SmfImportedNote[] = [];
  const controllerEvents: Array<{
    trackIndex: number;
    channel: number;
    tick: number;
    controllerNumber: number;
    controllerValue: number;
  }> = [];
  const timeSignatureEvents: Array<{ tick: number; beats: number; beatType: number }> = [];
  const keySignatureEvents: Array<{ tick: number; fifths: number; mode: "major" | "minor" }> = [];
  const tempoMetaEvents: Array<{ tick: number; bpm: number }> = [];

  for (let i = 0; i < header.trackCount; i += 1) {
    if (offset + 8 > midiBytes.length) {
      diagnostics.push({
        code: "MIDI_INVALID_FILE",
        message: `Track chunk ${i + 1} header is truncated.`,
      });
      return { ok: false, xml: "", diagnostics, warnings };
    }
    if (readAscii(midiBytes, offset, 4) !== "MTrk") {
      diagnostics.push({
        code: "MIDI_INVALID_FILE",
        message: `Track chunk ${i + 1} is missing MTrk signature.`,
      });
      return { ok: false, xml: "", diagnostics, warnings };
    }
    const trackLength = readUint32Be(midiBytes, offset + 4);
    if (trackLength === null || offset + 8 + trackLength > midiBytes.length) {
      diagnostics.push({
        code: "MIDI_INVALID_FILE",
        message: `Track chunk ${i + 1} has invalid length.`,
      });
      return { ok: false, xml: "", diagnostics, warnings };
    }
    const trackData = midiBytes.slice(offset + 8, offset + 8 + trackLength);
    const summary = parseTrackSummary(trackData, i);
    collectedNotes.push(...summary.notes);
    controllerEvents.push(
      ...summary.controllerEvents.map((event) => ({ ...event, trackIndex: i }))
    );
    timeSignatureEvents.push(...summary.timeSignatureEvents);
    keySignatureEvents.push(...summary.keySignatureEvents);
    tempoMetaEvents.push(...summary.tempoEvents);
    for (const note of summary.notes) trackChannelSet.add(`${i}:${note.channel}`);
    for (const [trackChannel, program] of summary.programByTrackChannel.entries()) {
      if (!programByTrackChannel.has(trackChannel)) {
        programByTrackChannel.set(trackChannel, program);
      }
    }
    warnings.push(...summary.parseWarnings);
    offset += 8 + trackLength;
  }

  const quantized = quantizeImportedNotes(collectedNotes, header.ticksPerQuarter, quantizeGrid);
  warnings.push(...quantized.warnings);
  const velocityScaledNotes = applyImportedControllerVelocityScale(quantized.notes, controllerEvents);
  const notesByTrackChannel = new Map<TrackChannelKey, ImportedQuantizedNote[]>();
  for (const note of velocityScaledNotes) {
    const key: TrackChannelKey = `${note.trackIndex}:${note.channel}`;
    const bucket = notesByTrackChannel.get(key) ?? [];
    bucket.push(note);
    notesByTrackChannel.set(key, bucket);
  }

  const firstTimeSignature = timeSignatureEvents
    .slice()
    .sort((a, b) => a.tick - b.tick)[0] ?? { tick: 0, beats: 4, beatType: 4 };
  const firstKeySignature = keySignatureEvents
    .slice()
    .sort((a, b) => a.tick - b.tick)[0] ?? { tick: 0, fifths: 0, mode: "major" as const };
  const beats = Math.max(1, Math.round(firstTimeSignature.beats));
  const beatType = Math.max(1, Math.round(firstTimeSignature.beatType));
  const keyFifths = Math.max(-7, Math.min(7, Math.round(firstKeySignature.fifths)));
  const keyMode: "major" | "minor" = firstKeySignature.mode === "minor" ? "minor" : "major";
  const sortedTempoEvents = tempoMetaEvents.slice().sort((a, b) => a.tick - b.tick);
  const tempoEvents: Array<{ tick: number; bpm: number }> = [];
  for (const event of sortedTempoEvents) {
    const tick = Math.max(0, Math.round(event.tick));
    const bpm = clampTempo(event.bpm);
    const prev = tempoEvents[tempoEvents.length - 1];
    if (prev && prev.tick === tick) {
      prev.bpm = bpm;
    } else {
      tempoEvents.push({ tick, bpm });
    }
  }
  const partGroups = Array.from(trackChannelSet)
    .map((entry) => {
      const [trackText, channelText] = entry.split(":");
      return {
        trackIndex: Math.max(0, Number.parseInt(trackText, 10) || 0),
        channel: Math.max(1, Math.min(16, Number.parseInt(channelText, 10) || 1)),
      };
    })
    .sort((a, b) =>
      a.trackIndex === b.trackIndex ? a.channel - b.channel : a.trackIndex - b.trackIndex
    );
  const hadDrumChannel = partGroups.some((group) => group.channel === 10);
  const xml = buildImportSkeletonMusicXml({
    title,
    quantizeGrid,
    ticksPerQuarter: header.ticksPerQuarter,
    beats,
    beatType,
    keyFifths,
    keyMode,
    tempoEvents,
    partGroups,
    notesByTrackChannel,
    programByTrackChannel,
    warnings,
    debugImportMetadata,
  });

  if (hadDrumChannel) {
    warnings.push({
      code: "MIDI_DRUM_CHANNEL_SEPARATED",
      message: "Channel 10 was mapped to a dedicated drum part.",
    });
  }

  return {
    ok: diagnostics.length === 0,
    xml: debugPrettyPrint ? prettyPrintXml(xml) : xml,
    diagnostics,
    warnings,
  };
};

export const buildPlaybackEventsFromMusicXmlDoc = (
  doc: Document,
  ticksPerQuarter: number,
  options: {
    mode?: "playback" | "midi";
    graceTimingMode?: GraceTimingMode;
    metricAccentEnabled?: boolean;
    metricAccentProfile?: MetricAccentProfile;
  } = {}
): { tempo: number; events: PlaybackEvent[] } => {
  const normalizedTicksPerQuarter = normalizeTicksPerQuarter(ticksPerQuarter);
  const mode = options.mode ?? "playback";
  const applyMidiNuance = mode === "midi";
  const graceTimingMode = options.graceTimingMode ?? DEFAULT_GRACE_TIMING_MODE;
  const metricAccentEnabled = options.metricAccentEnabled === true;
  const metricAccentProfile = normalizeMetricAccentProfile(options.metricAccentProfile);
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
            const metricAccentDelta =
              applyMidiNuance && metricAccentEnabled
                ? getMetricAccentVelocityDelta(
                    startDiv,
                    currentDivisions,
                    currentBeats,
                    currentBeatType,
                    metricAccentProfile
                  )
                : 0;
            const velocity = clampVelocity(currentVelocity + articulation.velocityDelta + metricAccentDelta);
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
            const tieFlags = applyMidiNuance ? getTieFlags(child) : { start: false, stop: false };
            const shouldApplyDefaultDetache =
              applyMidiNuance &&
              !isGrace &&
              !isChord &&
              articulation.durationRatio >= 1 &&
              !articulation.hasTenuto &&
              !tieFlags.start &&
              !tieFlags.stop &&
              !noteUnderSlur;
            const effectiveDurationRatio = shouldApplyDefaultDetache
              ? DEFAULT_DETACHE_DURATION_RATIO
              : articulation.durationRatio;
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
              Math.round(baseDurTicks * effectiveDurationRatio) +
                legatoOverlapTicks +
                temporalAdjustments.durationExtraTicks
            );
            const canExpandOrnament = applyMidiNuance && !isDrumContext && !tieFlags.start && !tieFlags.stop;
            const ornamentMidiSequence = canExpandOrnament
              ? buildOrnamentMidiSequence(child, soundingMidi, durTicks, normalizedTicksPerQuarter, {
                  step: melodicStep,
                  octave: melodicOctave ?? 4,
                  keyAlterMap,
                  measureAccidentalByStepOctave,
                })
              : [soundingMidi];
            const generatedEvents: PlaybackEvent[] = [];
            const pendingGrace = applyMidiNuance ? pendingGraceByVoice.get(voice) ?? [] : [];
            let eventStartTick = startTicks;
            let effectiveDurTicks = durTicks;
            if (applyMidiNuance && pendingGrace.length > 0) {
              const maxLeadByPrincipal = Math.max(pendingGrace.length, Math.round(baseDurTicks * 0.45));
              const maxLeadByTempo = Math.max(pendingGrace.length, Math.round(normalizedTicksPerQuarter / 2));
              const totalGraceTicks = Math.max(
                pendingGrace.length,
                Math.min(maxLeadByPrincipal, maxLeadByTempo)
              );
              const graceDurations =
                graceTimingMode === "classical_equal"
                  ? splitTicks(
                      Math.max(durTicks, pendingGrace.length + 1),
                      pendingGrace.length + 1
                    ).slice(0, pendingGrace.length)
                  : splitTicksWeighted(
                      totalGraceTicks,
                      pendingGrace.map((g) => g.weight)
                    );
              const graceStartTick =
                graceTimingMode === "before_beat" ? Math.max(0, startTicks - totalGraceTicks) : startTicks;
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
              if (graceTimingMode === "before_beat") {
                eventStartTick = Math.max(eventStartTick, graceTick);
              } else if (graceTimingMode === "on_beat") {
                eventStartTick = graceTick;
                effectiveDurTicks = Math.max(1, durTicks - (graceTick - startTicks));
              } else {
                const equalDurations = splitTicks(
                  Math.max(durTicks, pendingGrace.length + 1),
                  pendingGrace.length + 1
                );
                eventStartTick = graceTick;
                effectiveDurTicks = Math.max(1, equalDurations[pendingGrace.length] ?? 1);
              }
              pendingGraceByVoice.delete(voice);
            }
            const ornamentDurations = splitTicks(effectiveDurTicks, ornamentMidiSequence.length);
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
