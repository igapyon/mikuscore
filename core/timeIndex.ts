import { findAncestorMeasure, getDurationValue, getVoiceText } from "./xmlUtils";

export type MeasureTiming = {
  capacity: number;
  occupied: number;
};

export const getMeasureTimingForVoice = (
  noteInMeasure: Element,
  voice: string
): MeasureTiming | null => {
  const measure = findAncestorMeasure(noteInMeasure);
  if (!measure) return null;

  const capacity = getMeasureCapacity(measure);
  if (capacity === null) return null;
  const occupied = getOccupiedTime(measure, voice);

  return { capacity, occupied };
};

export const getMeasureCapacity = (measure: Element): number | null => {
  const context = resolveTimingContext(measure);
  if (!context) return null;
  const { beats, beatType, divisions } = context;

  if (
    !Number.isFinite(beats) ||
    !Number.isFinite(beatType) ||
    !Number.isFinite(divisions) ||
    beatType <= 0
  ) {
    return null;
  }

  const beatUnit = (4 / beatType) * divisions;
  return Math.round(beats * beatUnit);
};

export const getOccupiedTime = (measure: Element, voice: string): number => {
  const directChildren = Array.from(measure.children);
  let total = 0;
  for (const child of directChildren) {
    if (child.tagName !== "note") continue;
    const noteVoice = getVoiceText(child);
    if (noteVoice !== voice) continue;
    const duration = getDurationValue(child);
    if (duration !== null) total += duration;
  }
  return total;
};

type TimingContext = {
  beats: number;
  beatType: number;
  divisions: number;
};

const resolveTimingContext = (measure: Element): TimingContext | null => {
  const part = measure.parentElement;
  if (!part || part.tagName !== "part") return null;

  let beats: number | null = null;
  let beatType: number | null = null;
  let divisions: number | null = null;

  const measures = Array.from(part.children).filter(
    (child) => child.tagName === "measure"
  );
  const measureIndex = measures.indexOf(measure);
  if (measureIndex < 0) return null;

  for (let i = measureIndex; i >= 0; i -= 1) {
    const candidate = measures[i];
    const attributes = candidate.querySelector("attributes");
    if (!attributes) continue;

    if (divisions === null) {
      const divisionsText = attributes.querySelector("divisions")?.textContent?.trim();
      if (divisionsText) divisions = Number(divisionsText);
    }
    if (beats === null) {
      const beatsText = attributes.querySelector("time > beats")?.textContent?.trim();
      if (beatsText) beats = Number(beatsText);
    }
    if (beatType === null) {
      const beatTypeText = attributes
        .querySelector("time > beat-type")
        ?.textContent?.trim();
      if (beatTypeText) beatType = Number(beatTypeText);
    }

    if (beats !== null && beatType !== null && divisions !== null) {
      return { beats, beatType, divisions };
    }
  }

  return null;
};
