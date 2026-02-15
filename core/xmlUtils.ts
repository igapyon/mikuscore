import type { NodeId, Pitch } from "./interfaces";

const SCORE_PARTWISE = "score-partwise";

export const parseXml = (xmlText: string): XMLDocument => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) {
    throw new Error("Invalid XML input.");
  }
  const root = doc.documentElement;
  if (!root || root.tagName !== SCORE_PARTWISE) {
    throw new Error("MusicXML root must be <score-partwise>.");
  }
  return doc;
};

export const serializeXml = (doc: XMLDocument): string =>
  new XMLSerializer().serializeToString(doc);

/**
 * Assigns stable-in-session node IDs without mutating XML.
 */
export const reindexNodeIds = (
  doc: XMLDocument,
  nodeToId: WeakMap<Node, NodeId>,
  idToNode: Map<NodeId, Element>,
  nextId: () => NodeId
): void => {
  idToNode.clear();
  const notes = doc.querySelectorAll("note");
  for (const note of notes) {
    const existing = nodeToId.get(note);
    const id = existing ?? nextId();
    nodeToId.set(note, id);
    idToNode.set(id, note);
  }
};

export const getVoiceText = (note: Element): string | null => {
  const voice = getDirectChild(note, "voice");
  return voice?.textContent?.trim() ?? null;
};

export const getDurationValue = (note: Element): number | null => {
  const duration = getDirectChild(note, "duration");
  if (!duration?.textContent) return null;
  const n = Number(duration.textContent.trim());
  return Number.isFinite(n) ? n : null;
};

export const setDurationValue = (note: Element, duration: number): void => {
  let durationNode = getDirectChild(note, "duration");
  if (!durationNode) {
    durationNode = note.ownerDocument.createElement("duration");
    note.appendChild(durationNode);
  }
  durationNode.textContent = String(duration);
  syncSimpleTypeFromDuration(note, duration);
};

export const getDurationNotationHint = (
  note: Element,
  duration: number
): { type: string; dotCount: number; triplet: boolean } | null => {
  if (!Number.isInteger(duration) || duration <= 0) return null;
  const divisions = resolveEffectiveDivisions(note);
  if (divisions === null || !Number.isInteger(divisions) || divisions <= 0) return null;
  return durationToNotation(duration, divisions);
};

export const setPitch = (note: Element, pitch: Pitch): void => {
  const restNode = getDirectChild(note, "rest");
  if (restNode) restNode.remove();

  let pitchNode = getDirectChild(note, "pitch");
  if (!pitchNode) {
    pitchNode = note.ownerDocument.createElement("pitch");
    // Keep patch local by adding pitch near start, but do not reorder siblings.
    note.insertBefore(pitchNode, note.firstChild);
  }

  upsertSimpleChild(pitchNode, "step", pitch.step);
  if (typeof pitch.alter === "number") {
    upsertSimpleChild(pitchNode, "alter", String(pitch.alter));
    upsertSimpleChild(note, "accidental", accidentalFromAlter(pitch.alter));
  } else {
    const alter = getDirectChild(pitchNode, "alter");
    if (alter) alter.remove();
    const accidental = getDirectChild(note, "accidental");
    if (accidental) accidental.remove();
  }
  upsertSimpleChild(pitchNode, "octave", String(pitch.octave));
};

export const isUnsupportedNoteKind = (note: Element): boolean =>
  hasDirectChild(note, "grace") ||
  hasDirectChild(note, "cue") ||
  hasDirectChild(note, "chord") ||
  hasDirectChild(note, "rest");

export const createNoteElement = (
  doc: XMLDocument,
  voice: string,
  duration: number,
  pitch: Pitch
): Element => {
  const note = doc.createElement("note");

  const pitchNode = doc.createElement("pitch");
  upsertSimpleChild(pitchNode, "step", pitch.step);
  if (typeof pitch.alter === "number") {
    upsertSimpleChild(pitchNode, "alter", String(pitch.alter));
  }
  upsertSimpleChild(pitchNode, "octave", String(pitch.octave));
  note.appendChild(pitchNode);
  if (typeof pitch.alter === "number") {
    upsertSimpleChild(note, "accidental", accidentalFromAlter(pitch.alter));
  }

  const durationNode = doc.createElement("duration");
  durationNode.textContent = String(duration);
  note.appendChild(durationNode);

  const voiceNode = doc.createElement("voice");
  voiceNode.textContent = voice;
  note.appendChild(voiceNode);

  return note;
};

export const createRestElement = (
  doc: XMLDocument,
  voice: string,
  duration: number
): Element => {
  const note = doc.createElement("note");
  const restNode = doc.createElement("rest");
  note.appendChild(restNode);

  const durationNode = doc.createElement("duration");
  durationNode.textContent = String(duration);
  note.appendChild(durationNode);

  const voiceNode = doc.createElement("voice");
  voiceNode.textContent = voice;
  note.appendChild(voiceNode);
  return note;
};

export const replaceWithRestNote = (
  note: Element,
  fallbackVoice: string = "1",
  forcedDuration?: number
): void => {
  const doc = note.ownerDocument;
  const pitchNode = getDirectChild(note, "pitch");
  if (pitchNode) pitchNode.remove();

  const accidentalNode = getDirectChild(note, "accidental");
  if (accidentalNode) accidentalNode.remove();

  const chordNode = getDirectChild(note, "chord");
  if (chordNode) chordNode.remove();

  // Remove tie markers that no longer make sense after replacing with rest.
  Array.from(note.children)
    .filter((child) => child.tagName === "tie")
    .forEach((child) => child.remove());
  const notations = getDirectChild(note, "notations");
  if (notations) {
    Array.from(notations.children)
      .filter((child) => child.tagName === "tied")
      .forEach((child) => child.remove());
    if (notations.children.length === 0) {
      notations.remove();
    }
  }

  let restNode = getDirectChild(note, "rest");
  if (!restNode) {
    restNode = doc.createElement("rest");
    const durationNode = getDirectChild(note, "duration");
    if (durationNode) {
      note.insertBefore(restNode, durationNode);
    } else {
      note.insertBefore(restNode, note.firstChild);
    }
  }

  let durationNode = getDirectChild(note, "duration");
  if (!durationNode) {
    durationNode = doc.createElement("duration");
    note.appendChild(durationNode);
  }
  const duration = Number.isInteger(forcedDuration) && (forcedDuration ?? 0) > 0
    ? (forcedDuration as number)
    : (getDurationValue(note) ?? 1);
  durationNode.textContent = String(duration);

  let voiceNode = getDirectChild(note, "voice");
  if (!voiceNode) {
    voiceNode = doc.createElement("voice");
    voiceNode.textContent = fallbackVoice;
    note.appendChild(voiceNode);
  }
};

export const findAncestorMeasure = (node: Element): Element | null => {
  let cursor: Element | null = node;
  while (cursor) {
    if (cursor.tagName === "measure") return cursor;
    cursor = cursor.parentElement;
  }
  return null;
};

export const measureHasBackupOrForward = (measure: Element): boolean =>
  Array.from(measure.children).some(
    (child) => child.tagName === "backup" || child.tagName === "forward"
  );

const upsertSimpleChild = (
  parent: Element,
  tagName: string,
  value: string
): void => {
  let node = getDirectChild(parent, tagName);
  if (!node) {
    node = parent.ownerDocument.createElement(tagName);
    parent.appendChild(node);
  }
  node.textContent = value;
};

const hasDirectChild = (parent: Element, tagName: string): boolean =>
  Array.from(parent.children).some((child) => child.tagName === tagName);

const getDirectChild = (parent: Element, tagName: string): Element | null =>
  Array.from(parent.children).find((child) => child.tagName === tagName) ?? null;

const accidentalFromAlter = (alter: number): string => {
  if (alter <= -2) return "flat-flat";
  if (alter === -1) return "flat";
  if (alter === 0) return "natural";
  if (alter === 1) return "sharp";
  return "double-sharp";
};

const syncSimpleTypeFromDuration = (note: Element, duration: number): void => {
  if (!Number.isInteger(duration) || duration <= 0) return;
  const divisions = resolveEffectiveDivisions(note);
  if (divisions === null || !Number.isInteger(divisions) || divisions <= 0) return;

  const notation = durationToNotation(duration, divisions);
  if (!notation) return;

  upsertSimpleChild(note, "type", notation.type);
  Array.from(note.children)
    .filter((child) => child.tagName === "dot" || child.tagName === "time-modification")
    .forEach((child) => child.remove());

  for (let i = 0; i < notation.dotCount; i += 1) {
    const dot = note.ownerDocument.createElement("dot");
    note.appendChild(dot);
  }

  if (notation.triplet) {
    const tm = note.ownerDocument.createElement("time-modification");
    const actual = note.ownerDocument.createElement("actual-notes");
    actual.textContent = "3";
    const normal = note.ownerDocument.createElement("normal-notes");
    normal.textContent = "2";
    tm.appendChild(actual);
    tm.appendChild(normal);
    note.appendChild(tm);
  }
};

const resolveEffectiveDivisions = (note: Element): number | null => {
  const measure = findAncestorMeasure(note);
  if (!measure) return null;
  const part = measure.parentElement;
  if (!part || part.tagName !== "part") return null;

  const measures = Array.from(part.children).filter((child) => child.tagName === "measure");
  const measureIndex = measures.indexOf(measure);
  if (measureIndex < 0) return null;

  let divisions: number | null = null;
  for (let i = measureIndex; i >= 0; i -= 1) {
    const candidate = measures[i];
    const text = candidate.querySelector("attributes > divisions")?.textContent?.trim() ?? "";
    const n = Number(text);
    if (Number.isInteger(n) && n > 0) {
      divisions = n;
      break;
    }
  }
  return divisions;
};

const durationToNotation = (
  duration: number,
  divisions: number
): { type: string; dotCount: number; triplet: boolean } | null => {
  const defs: Array<{ num: number; den: number; type: string; dotCount: number; triplet: boolean }> = [
    { num: 4, den: 1, type: "whole", dotCount: 0, triplet: false },
    { num: 3, den: 1, type: "half", dotCount: 1, triplet: false },
    { num: 2, den: 1, type: "half", dotCount: 0, triplet: false },
    { num: 4, den: 3, type: "half", dotCount: 0, triplet: true },
    { num: 3, den: 2, type: "quarter", dotCount: 1, triplet: false },
    { num: 1, den: 1, type: "quarter", dotCount: 0, triplet: false },
    { num: 2, den: 3, type: "quarter", dotCount: 0, triplet: true },
    { num: 3, den: 4, type: "eighth", dotCount: 1, triplet: false },
    { num: 1, den: 2, type: "eighth", dotCount: 0, triplet: false },
    { num: 1, den: 3, type: "eighth", dotCount: 0, triplet: true },
    { num: 3, den: 8, type: "16th", dotCount: 1, triplet: false },
    { num: 1, den: 4, type: "16th", dotCount: 0, triplet: false },
    { num: 1, den: 6, type: "16th", dotCount: 0, triplet: true },
    { num: 1, den: 8, type: "32nd", dotCount: 0, triplet: false },
    { num: 1, den: 16, type: "64th", dotCount: 0, triplet: false },
  ];
  for (const def of defs) {
    const value = (divisions * def.num) / def.den;
    if (!Number.isInteger(value) || value <= 0) continue;
    if (duration === value) {
      return { type: def.type, dotCount: def.dotCount, triplet: def.triplet };
    }
  }
  return null;
};
