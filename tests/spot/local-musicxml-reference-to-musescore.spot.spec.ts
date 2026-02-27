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
  temaWords: number;
  sempreLegatoWords: number;
};

type CandidateMeasureSignals = {
  measureNo: number;
  markers: number;
  jumps: number;
  temaTempoText: number;
  sempreLegatoExpression: number;
};

const collectSourceSignals = (sourceDoc: Document): SourceMeasureSignals[] => {
  const out: SourceMeasureSignals[] = [];
  for (const measure of Array.from(sourceDoc.querySelectorAll("score-partwise > part > measure"))) {
    const measureNo = Number(measure.getAttribute("number") ?? "0");
    const words = Array.from(measure.querySelectorAll(":scope > direction > direction-type > words"))
      .map((w) => (w.textContent ?? "").trim().toLowerCase());
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
    out.push({
      measureNo,
      markers,
      jumps,
      temaWords: countBy(words, (w) => w === "tema"),
      sempreLegatoWords: countBy(words, (w) => w === "sempre legato"),
    });
  }
  return out;
};

const collectCandidateSignals = (candidateDoc: Document): CandidateMeasureSignals[] => {
  const staff = candidateDoc.querySelector("museScore > Score > Staff[id=\"1\"]");
  if (!staff) return [];
  const measures = Array.from(staff.querySelectorAll(":scope > Measure"));
  return measures.map((measure, idx) => {
    const tempoTexts = Array.from(measure.querySelectorAll(":scope > voice > Tempo > text"))
      .map((n) => (n.textContent ?? "").trim().toLowerCase());
    const expressionTexts = Array.from(measure.querySelectorAll(":scope > voice > Expression > text"))
      .map((n) => (n.textContent ?? "").replace(/<[^>]*>/g, "").trim().toLowerCase());
    return {
      measureNo: idx + 1,
      markers: measure.querySelectorAll(":scope > voice > Marker > subtype").length,
      jumps: measure.querySelectorAll(":scope > voice > Jump > text").length,
      temaTempoText: countBy(tempoTexts, (t) => t === "tema"),
      sempreLegatoExpression: countBy(expressionTexts, (t) => t === "sempre legato"),
    };
  });
};

describe("Local parity: reference musicxml -> mscx", () => {
  const root = resolve(process.cwd(), "tests", "fixtures-local", "roundtrip", "musescore", "paganini");
  const referencePath = resolve(root, "24no-qi-xiang-qu-di24fan-i-duan-diao-paganini.musicxml");
  const itWithLocalFixture = existsSync(referencePath) ? it : it.skip;

  itWithLocalFixture("keeps known high-value semantics on import to MuseScore", () => {
    const referenceXml = readFileSync(referencePath, "utf-8");
    const sourceDoc = parseDoc(referenceXml);

    const candidateMscx = exportMusicXmlDomToMuseScore(sourceDoc);
    const candidateDoc = new DOMParser().parseFromString(candidateMscx, "application/xml");

    const artifactsDir = resolve(process.cwd(), "tests", "artifacts", "roundtrip", "musescore", "paganini");
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

    const sourceMarkers =
      sourceDoc.querySelectorAll("direction > direction-type > segno").length
      + sourceDoc.querySelectorAll("direction > direction-type > coda").length
      + Array.from(sourceDoc.querySelectorAll("direction > direction-type > words"))
        .filter((n) => (n.textContent ?? "").trim().toLowerCase() === "fine")
        .length;
    const candidateMarkers = candidateDoc.querySelectorAll("Marker > subtype").length;
    expect(candidateMarkers).toBe(sourceMarkers);

    const sourceJumps = countBy(
      Array.from(sourceDoc.querySelectorAll("direction > sound")),
      (sound) => {
        const el = sound as Element;
        const dalsegno = (el.getAttribute("dalsegno") ?? "").trim();
        const dacapo = (el.getAttribute("dacapo") ?? "").trim().toLowerCase();
        const fine = (el.getAttribute("fine") ?? "").trim();
        const tocoda = (el.getAttribute("tocoda") ?? "").trim();
        return Boolean(dalsegno || dacapo === "yes" || fine || tocoda);
      }
    );
    const candidateJumps = candidateDoc.querySelectorAll("Jump > text").length;
    expect(candidateJumps).toBe(sourceJumps);

    const sourceSignals = collectSourceSignals(sourceDoc);
    const candidateSignals = collectCandidateSignals(candidateDoc);
    expect(candidateSignals.length).toBeGreaterThanOrEqual(sourceSignals.length);
    for (const src of sourceSignals) {
      const cand = candidateSignals[src.measureNo - 1];
      expect(cand).toBeDefined();
      if (!cand) continue;
      if (src.markers > 0) expect(cand.markers).toBe(src.markers);
      if (src.jumps > 0) expect(cand.jumps).toBe(src.jumps);
      if (src.temaWords > 0) expect(cand.temaTempoText).toBe(src.temaWords);
      if (src.sempreLegatoWords > 0) expect(cand.sempreLegatoExpression).toBe(src.sempreLegatoWords);
    }

    expect(candidateMscx).toContain("<text>Tema</text>");
    expect(candidateMscx).toContain("<text><i></i>sempre legato</text>");
  });
});
