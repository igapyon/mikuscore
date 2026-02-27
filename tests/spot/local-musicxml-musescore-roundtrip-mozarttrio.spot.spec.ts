// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMusicXmlDocument } from "../../src/ts/musicxml-io";
import { convertMuseScoreToMusicXml, exportMusicXmlDomToMuseScore } from "../../src/ts/musescore-io";

type NoteEvent = {
  measure: string;
  onset: number;
  duration: number;
  staff: string;
  step: string;
  alter: string;
  octave: string;
};

const parseDoc = (xml: string): Document => {
  const doc = parseMusicXmlDocument(xml);
  expect(doc).not.toBeNull();
  if (!doc) throw new Error("failed to parse MusicXML");
  return doc;
};

const collectNoteEvents = (doc: Document): NoteEvent[] => {
  const out: NoteEvent[] = [];
  for (const measure of Array.from(doc.querySelectorAll("score-partwise > part > measure"))) {
    let cursor = 0;
    const measureNo = measure.getAttribute("number") ?? "";
    for (const child of Array.from(measure.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === "backup") {
        const d = Number(child.querySelector(":scope > duration")?.textContent?.trim() ?? "0");
        if (Number.isFinite(d) && d > 0) cursor = Math.max(0, cursor - Math.round(d));
        continue;
      }
      if (tag === "forward") {
        const d = Number(child.querySelector(":scope > duration")?.textContent?.trim() ?? "0");
        if (Number.isFinite(d) && d > 0) cursor += Math.round(d);
        continue;
      }
      if (tag !== "note") continue;
      if (child.querySelector(":scope > rest")) {
        const d = Number(child.querySelector(":scope > duration")?.textContent?.trim() ?? "0");
        if (child.querySelector(":scope > chord") === null && Number.isFinite(d) && d > 0) cursor += Math.round(d);
        continue;
      }
      const step = child.querySelector(":scope > pitch > step")?.textContent?.trim() ?? "";
      const octave = child.querySelector(":scope > pitch > octave")?.textContent?.trim() ?? "";
      if (!step || !octave) continue;
      const duration = Number(child.querySelector(":scope > duration")?.textContent?.trim() ?? "0");
      const roundedDuration = Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 0;
      const isChord = child.querySelector(":scope > chord") !== null;
      const onset = isChord ? Math.max(0, cursor - roundedDuration) : cursor;
      out.push({
        measure: measureNo,
        onset,
        duration: roundedDuration,
        staff: child.querySelector(":scope > staff")?.textContent?.trim() ?? "1",
        step,
        alter: child.querySelector(":scope > pitch > alter")?.textContent?.trim() ?? "",
        octave,
      });
      if (!isChord) cursor += roundedDuration;
    }
  }
  return out;
};

const collectMeasureVoiceSummary = (
  doc: Document,
  measureNo: string
): { noteDurationSum: number; restDurationSum: number; noteCount: number; restCount: number; divisions: number; noteBeats: number; restBeats: number } => {
  const part = doc.querySelector("score-partwise > part");
  const measure = part?.querySelector(`:scope > measure[number="${measureNo}"]`) ?? null;
  if (!measure) {
    return { noteDurationSum: 0, restDurationSum: 0, noteCount: 0, restCount: 0, divisions: 1, noteBeats: 0, restBeats: 0 };
  }
  let divisions = 1;
  for (const m of Array.from(part?.querySelectorAll(":scope > measure") ?? [])) {
    const maybe = Number(m.querySelector(":scope > attributes > divisions")?.textContent?.trim() ?? "");
    if (Number.isFinite(maybe) && maybe > 0) divisions = Math.round(maybe);
    if (m === measure) break;
  }
  let noteDurationSum = 0;
  let restDurationSum = 0;
  let noteCount = 0;
  let restCount = 0;
  for (const note of Array.from(measure.querySelectorAll(":scope > note"))) {
    const duration = Number(note.querySelector(":scope > duration")?.textContent?.trim() ?? "0");
    const dur = Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : 0;
    if (note.querySelector(":scope > rest")) {
      restDurationSum += dur;
      restCount += 1;
    } else {
      noteDurationSum += dur;
      noteCount += 1;
    }
  }
  const base = Math.max(1, divisions);
  return {
    noteDurationSum,
    restDurationSum,
    noteCount,
    restCount,
    divisions: base,
    noteBeats: noteDurationSum / base,
    restBeats: restDurationSum / base,
  };
};

const toMultiset = (events: NoteEvent[]): Map<string, number> => {
  const map = new Map<string, number>();
  for (const e of events) {
    const key = `${e.measure}|${e.onset}|${e.duration}|${e.staff}|${e.step}|${e.alter}|${e.octave}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
};

const diffMultiset = (a: Map<string, number>, b: Map<string, number>): string[] => {
  const out: string[] = [];
  const keys = new Set<string>([...a.keys(), ...b.keys()]);
  for (const key of Array.from(keys).sort()) {
    const av = a.get(key) ?? 0;
    const bv = b.get(key) ?? 0;
    if (av !== bv) out.push(`${key} :: ref=${av} cand=${bv}`);
  }
  return out;
};

describe("Local roundtrip: MozartTrio musicxml <-> mscx", () => {
  it("keeps pickup (measure 0) duration/rest semantics", () => {
    const sourcePath = resolve(process.cwd(), "tests", "fixtures-local", "MozartTrio.musicxml");
    if (!existsSync(sourcePath)) {
      expect(true).toBe(true);
      return;
    }

    const sourceXml = readFileSync(sourcePath, "utf-8");
    const sourceDoc = parseDoc(sourceXml);

    const mscx = exportMusicXmlDomToMuseScore(sourceDoc);
    const roundtripXml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const roundtripDoc = parseDoc(roundtripXml);

    const srcPickup = collectMeasureVoiceSummary(sourceDoc, "0");
    const dstPickup = collectMeasureVoiceSummary(roundtripDoc, "0");
    const srcPickupImplicit = sourceDoc.querySelector('score-partwise > part > measure[number="0"]')?.getAttribute("implicit") ?? "";
    const dstPickupImplicit = roundtripDoc.querySelector('score-partwise > part > measure[number="0"]')?.getAttribute("implicit") ?? "";

    expect(dstPickup.noteCount).toBe(srcPickup.noteCount);
    expect(dstPickup.restCount).toBe(srcPickup.restCount);
    expect(dstPickup.noteBeats).toBe(srcPickup.noteBeats);
    expect(dstPickup.restBeats).toBe(srcPickup.restBeats);
    expect(dstPickupImplicit).toBe(srcPickupImplicit);
  });
});
