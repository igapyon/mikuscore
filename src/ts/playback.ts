export type PlaybackEvent = {
  midiNumber: number;
  startTicks: number;
  durTicks: number;
  channel: number;
};

type MidiWriterTrackApi = {
  setTempo: (tempo: number) => void;
  addEvent: (event: unknown) => void;
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
  Writer: new (tracks: unknown[] | unknown) => {
    buildFile: () => Uint8Array | number[];
  };
};

const clampTempo = (tempo: number): number => {
  if (!Number.isFinite(tempo)) return 120;
  return Math.max(20, Math.min(300, Math.round(tempo)));
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

export const buildMidiBytesForPlayback = (events: PlaybackEvent[], tempo: number): Uint8Array => {
  const midiWriter = getMidiWriterRuntime();
  if (!midiWriter) {
    throw new Error("midi-writer.js が読み込まれていません。");
  }
  const track = new midiWriter.Track();
  track.setTempo(clampTempo(tempo));

  const ordered = events
    .slice()
    .sort((a, b) => (a.startTicks === b.startTicks ? a.midiNumber - b.midiNumber : a.startTicks - b.startTicks));

  const channels = Array.from(
    new Set(ordered.map((event) => Math.max(1, Math.min(16, Math.round(event.channel || 1)))))
  ).sort((a, b) => a - b);
  for (const channel of channels) {
    if (channel === 10) continue;
    track.addEvent(
      new midiWriter.ProgramChangeEvent({
        channel,
        instrument: 5, // GM: Electric Piano 2
        delta: 0,
      })
    );
  }

  for (const event of ordered) {
    const fields: MidiWriterNoteEventFields = {
      pitch: [midiToPitchText(event.midiNumber)],
      duration: `T${event.durTicks}`,
      startTick: Math.max(0, Math.round(event.startTicks)),
      velocity: 80,
      channel: Math.max(1, Math.min(16, Math.round(event.channel || 1))),
    };
    track.addEvent(new midiWriter.NoteEvent(fields));
  }

  const writer = new midiWriter.Writer([track]);
  const built = writer.buildFile();
  return built instanceof Uint8Array ? built : Uint8Array.from(built);
};

export const buildPlaybackEventsFromXml = (
  xml: string,
  ticksPerQuarter: number
): { tempo: number; events: PlaybackEvent[] } => {
  const normalizedTicksPerQuarter = normalizeTicksPerQuarter(ticksPerQuarter);
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return { tempo: 120, events: [] };
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
    let timelineDiv = 0;

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

        if (child.tagName !== "note") continue;
        const durationDiv = getFirstNumber(child, "duration");
        if (!durationDiv || durationDiv <= 0) continue;

        const voice = child.querySelector("voice")?.textContent?.trim() ?? "1";
        const isChord = Boolean(child.querySelector("chord"));
        const isRest = Boolean(child.querySelector("rest"));
        const startDiv = isChord ? (lastStartByVoice.get(voice) ?? cursorDiv) : cursorDiv;
        if (!isChord) {
          lastStartByVoice.set(voice, startDiv);
        }

        if (!isRest) {
          const step = child.querySelector("pitch > step")?.textContent?.trim() ?? "";
          const octave = getFirstNumber(child, "pitch > octave");
          const explicitAlter = getFirstNumber(child, "pitch > alter");
          const accidentalAlter = accidentalTextToAlter(
            child.querySelector("accidental")?.textContent?.trim() ?? ""
          );
          if (octave !== null) {
            const stepOctaveKey = `${step}${octave}`;
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
              effectiveAlter = keyAlterMap[step] ?? 0;
            }
            const midi = pitchToMidi(step, effectiveAlter, octave);
            if (midi !== null) {
              const soundingMidi = midi + currentTransposeSemitones;
              if (soundingMidi < 0 || soundingMidi > 127) {
                continue;
              }
              const startTicks = Math.max(
                0,
                Math.round(((timelineDiv + startDiv) / currentDivisions) * normalizedTicksPerQuarter)
              );
              const durTicks = Math.max(
                1,
                Math.round((durationDiv / currentDivisions) * normalizedTicksPerQuarter)
              );
              events.push({ midiNumber: soundingMidi, startTicks, durTicks, channel });
            }
          }
        }

        if (!isChord) {
          cursorDiv += durationDiv;
        }
        measureMaxDiv = Math.max(measureMaxDiv, cursorDiv, startDiv + durationDiv);
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
