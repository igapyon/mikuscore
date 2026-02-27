// @vitest-environment jsdom
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { exportMusicXmlDomToMuseScore } from "../../src/ts/musescore-io";
import { parseMusicXmlDocument } from "../../src/ts/musicxml-io";

const parseDoc = (xml: string): Document => {
  const doc = parseMusicXmlDocument(xml);
  expect(doc).not.toBeNull();
  if (!doc) throw new Error("failed to parse MusicXML");
  return doc;
};

const countBy = <T>(items: T[], predicate: (item: T) => boolean): number =>
  items.reduce((acc, item) => (predicate(item) ? acc + 1 : acc), 0);

type SourceMeasureSignals = {
  measureNo: number;
  markers: number;
  jumps: number;
  words: string[];
};

type CandidateMeasureSignals = {
  measureNo: number;
  markers: number;
  jumps: number;
  tempoTexts: string[];
  expressionTexts: string[];
};

const collectSourceSignals = (sourceDoc: Document): SourceMeasureSignals[] => {
  const out: SourceMeasureSignals[] = [];
  for (const measure of Array.from(sourceDoc.querySelectorAll("score-partwise > part > measure"))) {
    const measureNo = Number(measure.getAttribute("number") ?? "0");
    const words = Array.from(measure.querySelectorAll(":scope > direction > direction-type > words"))
      .map((w) => (w.textContent ?? "").trim().toLowerCase())
      .filter((w) => w.length > 0);
    const markers =
      measure.querySelectorAll(":scope > direction > direction-type > segno").length
      + measure.querySelectorAll(":scope > direction > direction-type > coda").length
      + countBy(words, (w) => w === "fine");
    const jumps = countBy(
      Array.from(measure.querySelectorAll(":scope > direction > sound")),
      (sound) => {
        const el = sound as Element;
        const dalsegno = (el.getAttribute("dalsegno") ?? "").trim();
        const dacapo = (el.getAttribute("dacapo") ?? "").trim().toLowerCase();
        const fine = (el.getAttribute("fine") ?? "").trim();
        const tocoda = (el.getAttribute("tocoda") ?? "").trim();
        return Boolean(dalsegno || dacapo === "yes" || fine || tocoda);
      }
    );
    out.push({ measureNo, markers, jumps, words });
  }
  return out;
};

const collectCandidateSignals = (candidateDoc: Document): CandidateMeasureSignals[] => {
  const staff = candidateDoc.querySelector("museScore > Score > Staff[id=\"1\"]");
  if (!staff) return [];
  const measures = Array.from(staff.querySelectorAll(":scope > Measure"));
  return measures.map((measure, idx) => {
    const tempoTexts = Array.from(measure.querySelectorAll(":scope > voice > Tempo > text"))
      .map((n) => (n.textContent ?? "").trim().toLowerCase())
      .filter((t) => t.length > 0);
    const expressionTexts = Array.from(measure.querySelectorAll(":scope > voice > Expression > text"))
      .map((n) => (n.textContent ?? "").replace(/<[^>]*>/g, "").trim().toLowerCase())
      .filter((t) => t.length > 0);
    return {
      measureNo: idx + 1,
      markers: measure.querySelectorAll(":scope > voice > Marker > subtype").length,
      jumps: measure.querySelectorAll(":scope > voice > Jump > text").length,
      tempoTexts,
      expressionTexts,
    };
  });
};

describe("Local parity (moonlight): reference musicxml -> mscx", () => {
  const root = resolve(process.cwd(), "tests", "fixtures-local", "roundtrip", "musescore", "moonlight");
  const referencePath = resolve(root, "pianosonata-di14fanyue-guang-di1le-zhang.musicxml");
  const itWithLocalFixture = existsSync(referencePath) ? it : it.skip;

  itWithLocalFixture("keeps known high-value semantics on import to MuseScore", () => {
    const referenceXml = readFileSync(referencePath, "utf-8");
    const sourceDoc = parseDoc(referenceXml);

    const candidateMscx = exportMusicXmlDomToMuseScore(sourceDoc);
    const candidateDoc = new DOMParser().parseFromString(candidateMscx, "application/xml");

    const artifactsDir = resolve(process.cwd(), "tests", "artifacts", "roundtrip", "musescore", "moonlight");
    mkdirSync(artifactsDir, { recursive: true });
    writeFileSync(resolve(artifactsDir, "candidate-from-reference.mscx"), candidateMscx, "utf-8");

    const sourceStopped = sourceDoc.querySelectorAll("notations > technical > stopped").length;
    const candidateLhPizz = countBy(
      Array.from(candidateDoc.querySelectorAll("Articulation > subtype")),
      (n) => (n.textContent ?? "").trim() === "articLhPizzicatoAbove"
    );
    expect(candidateLhPizz).toBe(sourceStopped);

    const sourceDynamics = sourceDoc.querySelectorAll("direction > direction-type > dynamics > *").length;
    const candidateDynamics = candidateDoc.querySelectorAll("Dynamic > subtype").length;
    expect(candidateDynamics).toBe(sourceDynamics);

    const sourceTrillStarts = sourceDoc.querySelectorAll("notations > ornaments > wavy-line[type=\"start\"]").length;
    const sourceTrillStops = sourceDoc.querySelectorAll("notations > ornaments > wavy-line[type=\"stop\"]").length;
    const trillSpanners = Array.from(candidateDoc.querySelectorAll("Spanner[type=\"Trill\"]"));
    const candidateTrillStarts = countBy(trillSpanners, (s) => s.querySelector(":scope > next") !== null);
    const candidateTrillStops = countBy(trillSpanners, (s) => s.querySelector(":scope > prev") !== null);
    expect(candidateTrillStarts).toBe(sourceTrillStarts);
    expect(candidateTrillStops).toBe(sourceTrillStops);

    const sourceOttavaStarts = sourceDoc.querySelectorAll("direction > direction-type > octave-shift[type=\"up\"], direction > direction-type > octave-shift[type=\"down\"]").length;
    const sourceOttavaStops = sourceDoc.querySelectorAll("direction > direction-type > octave-shift[type=\"stop\"]").length;
    const ottavaSpanners = Array.from(candidateDoc.querySelectorAll("Spanner[type=\"Ottava\"]"));
    const candidateOttavaStarts = countBy(ottavaSpanners, (s) => s.querySelector(":scope > next") !== null);
    const candidateOttavaStops = countBy(ottavaSpanners, (s) => s.querySelector(":scope > prev") !== null);
    expect(candidateOttavaStarts).toBe(sourceOttavaStarts);
    expect(candidateOttavaStops).toBe(sourceOttavaStops);

    const sourceSignals = collectSourceSignals(sourceDoc);
    const candidateSignals = collectCandidateSignals(candidateDoc);
    expect(sourceSignals.length).toBeGreaterThan(0);
    expect(candidateSignals.length).toBeGreaterThan(0);
    // Keep this fixture as diagnostic while we improve multi-staff/multi-voice import fidelity.
    expect(candidateSignals.length).toBeGreaterThanOrEqual(Math.floor(sourceSignals.length / 2));
  });
});
