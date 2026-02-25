// @vitest-environment jsdom
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { convertMuseScoreToMusicXml } from "../../src/ts/musescore-io";
import { parseMusicXmlDocument } from "../../src/ts/musicxml-io";

type NoteEvent = {
  measure: string;
  onset: number;
  duration: number;
  staff: string;
  step: string;
  alter: string;
  octave: string;
  accidental: string;
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
        accidental: child.querySelector(":scope > accidental")?.textContent?.trim() ?? "",
      });
      if (!isChord) cursor += roundedDuration;
    }
  }
  return out;
};

const toMultiset = (events: NoteEvent[], withAccidental: boolean): Map<string, number> => {
  const map = new Map<string, number>();
  for (const e of events) {
    const key = withAccidental
      ? `${e.measure}|${e.onset}|${e.duration}|${e.staff}|${e.step}|${e.alter}|${e.octave}|acc=${e.accidental}`
      : `${e.measure}|${e.onset}|${e.duration}|${e.staff}|${e.step}|${e.alter}|${e.octave}`;
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

describe("Local parity (moonlight): mscx vs reference musicxml", () => {
  it("converts local mscx fixture and reports current semantic diffs", () => {
    const root = resolve(process.cwd(), "tests", "fixtures-local", "roundtrip", "musescore", "moonlight");
    const mscxPath = resolve(root, "pianosonata-di14fanyue-guang-di1le-zhang.mscx");
    const referencePath = resolve(root, "pianosonata-di14fanyue-guang-di1le-zhang.musicxml");

    const mscx = readFileSync(mscxPath, "utf-8");
    const referenceXml = readFileSync(referencePath, "utf-8");
    const candidateXml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });

    const artifactsDir = resolve(process.cwd(), "tests", "artifacts", "roundtrip", "musescore", "moonlight");
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(resolve(artifactsDir, "candidate.musicxml"), candidateXml, "utf-8");

    const refDoc = parseDoc(referenceXml);
    const candDoc = parseDoc(candidateXml);

    const refEvents = collectNoteEvents(refDoc);
    const candEvents = collectNoteEvents(candDoc);
    const diffPitch = diffMultiset(toMultiset(refEvents, false), toMultiset(candEvents, false));
    const diffPitchAcc = diffMultiset(toMultiset(refEvents, true), toMultiset(candEvents, true));

    // eslint-disable-next-line no-console
    console.log(`moonlight ref notes=${refEvents.length} cand notes=${candEvents.length}`);
    // eslint-disable-next-line no-console
    console.log(`moonlight diff pitch-only=${diffPitch.length} diff pitch+acc=${diffPitchAcc.length}`);
    if (diffPitch.length > 0) {
      // eslint-disable-next-line no-console
      console.log("moonlight pitch-only sample:\n" + diffPitch.slice(0, 40).join("\n"));
    }
    if (diffPitchAcc.length > 0) {
      // eslint-disable-next-line no-console
      console.log("moonlight pitch+acc sample:\n" + diffPitchAcc.slice(0, 40).join("\n"));
    }

    expect(refEvents.length).toBeGreaterThan(0);
    expect(candEvents.length).toBeGreaterThan(0);
    // Current moonlight fixture is diagnostic-only; keep a loose ceiling to catch catastrophic regressions.
    expect(diffPitch.length).toBeLessThanOrEqual(5000);
    expect(diffPitchAcc.length).toBeLessThanOrEqual(5000);
  });
});
