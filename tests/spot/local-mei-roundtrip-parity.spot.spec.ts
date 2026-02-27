// @vitest-environment jsdom
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { exportMusicXmlDomToMei, convertMeiToMusicXml } from "../../src/ts/mei-io";
import { parseMusicXmlDocument } from "../../src/ts/musicxml-io";

type NoteKey = {
  measure: string;
  step: string;
  alter: string;
  octave: string;
  duration: string;
};

const parseDoc = (xml: string): Document => {
  const doc = parseMusicXmlDocument(xml);
  expect(doc).not.toBeNull();
  if (!doc) throw new Error("failed to parse MusicXML");
  return doc;
};

const collectNoteKeys = (doc: Document): NoteKey[] => {
  const out: NoteKey[] = [];
  for (const measure of Array.from(doc.querySelectorAll("score-partwise > part > measure"))) {
    const measureNo = measure.getAttribute("number")?.trim() ?? "";
    for (const note of Array.from(measure.querySelectorAll(":scope > note"))) {
      if (note.querySelector(":scope > rest")) continue;
      const step = note.querySelector(":scope > pitch > step")?.textContent?.trim() ?? "";
      const octave = note.querySelector(":scope > pitch > octave")?.textContent?.trim() ?? "";
      if (!step || !octave) continue;
      const alter = note.querySelector(":scope > pitch > alter")?.textContent?.trim() ?? "";
      const duration = note.querySelector(":scope > duration")?.textContent?.trim() ?? "";
      out.push({ measure: measureNo, step, alter, octave, duration });
    }
  }
  return out;
};

const countByKey = (notes: NoteKey[], key: NoteKey): number =>
  notes.filter(
    (n) =>
      n.measure === key.measure
      && n.step === key.step
      && n.alter === key.alter
      && n.octave === key.octave
      && n.duration === key.duration
  ).length;

describe("Local parity: MusicXML -> MEI -> MusicXML (paganini)", () => {
  it("keeps known previously-missing pitch+timing notes in measures 138/140/153", { timeout: 20000 }, () => {
    const root = resolve(process.cwd(), "tests", "fixtures-local", "roundtrip", "musescore", "paganini");
    const referencePath = resolve(root, "24no-qi-xiang-qu-di24fan-i-duan-diao-paganini.musicxml");
    const referenceXml = readFileSync(referencePath, "utf-8");

    const sourceDoc = parseDoc(referenceXml);
    const mei = exportMusicXmlDomToMei(sourceDoc);
    const candidateXml = convertMeiToMusicXml(mei);
    const candidateDoc = parseDoc(candidateXml);

    const artifactsDir = resolve(process.cwd(), "tests", "artifacts", "roundtrip", "mei", "paganini");
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(resolve(artifactsDir, "candidate.musicxml"), candidateXml, "utf-8");
    writeFileSync(resolve(artifactsDir, "candidate.mei"), mei, "utf-8");

    const refNotes = collectNoteKeys(sourceDoc);
    const candNotes = collectNoteKeys(candidateDoc);

    const checkpoints: NoteKey[] = [
      { measure: "138", step: "D", alter: "", octave: "7", duration: "120" },
      { measure: "140", step: "C", alter: "", octave: "7", duration: "120" },
      { measure: "153", step: "C", alter: "1", octave: "4", duration: "69" },
    ];

    for (const cp of checkpoints) {
      const refCount = countByKey(refNotes, cp);
      const candCount = countByKey(candNotes, cp);
      expect(candCount, `missing note ${JSON.stringify(cp)} (ref=${refCount})`).toBe(refCount);
    }
  });
});
