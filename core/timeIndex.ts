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
  let cursor = 0;
  let occupied = 0;
  for (const child of directChildren) {
    if (child.tagName === "backup" || child.tagName === "forward") {
      const shift = getDurationValue(child);
      if (shift === null) continue;
      cursor = child.tagName === "backup" ? Math.max(0, cursor - shift) : cursor + shift;
      continue;
    }
    if (child.tagName !== "note") continue;
    // Chord notes share onset with the previous note and must not advance time.
    if (Array.from(child.children).some((c) => c.tagName === "chord")) continue;
    const noteVoice = getVoiceText(child);
    if (noteVoice !== voice) continue;
    const duration = getDurationValue(child);
    if (duration === null) continue;
    const end = cursor + duration;
    occupied = Math.max(occupied, end);
    cursor = end;
  }
  return occupied;
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
