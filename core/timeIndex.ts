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
  // Simplified MVP rule: local measure attributes are used when present.
  const beatsText = measure.querySelector("attributes > time > beats")?.textContent;
  const beatTypeText = measure.querySelector(
    "attributes > time > beat-type"
  )?.textContent;
  const divisionsText = measure.querySelector("attributes > divisions")?.textContent;

  if (!beatsText || !beatTypeText || !divisionsText) return null;

  const beats = Number(beatsText.trim());
  const beatType = Number(beatTypeText.trim());
  const divisions = Number(divisionsText.trim());

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
