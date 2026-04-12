/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { convertMuseScoreToMusicXml, exportMusicXmlDomToMuseScore } from "../../src/ts/musescore-io";
import { parseMusicXmlDocument } from "../../src/ts/musicxml-io";

type MeasureNoteEvent = {
  measure: number;
  onset: number;
  duration: number;
  staff: string;
  step: string;
  alter: string;
  octave: string;
  accidental: string;
};

const collectMeasurePitchEvents = (doc: Document, from: number, to: number): MeasureNoteEvent[] => {
  const out: MeasureNoteEvent[] = [];
  for (const measure of Array.from(doc.querySelectorAll("score-partwise > part > measure"))) {
    const measureNo = Number(measure.getAttribute("number") ?? "");
    if (!Number.isFinite(measureNo) || measureNo < from || measureNo > to) continue;
    let cursor = 0;
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

describe("musescore-io", () => {
  it("converts basic mscx chord/rest content into MusicXML", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.0">
  <Score>
    <Division>480</Division>
    <metaTag name="workTitle">MS Test</metaTag>
    <Staff id="1">
      <Measure>
        <voice>
          <Chord>
            <durationType>quarter</durationType>
            <Note><pitch>60</pitch></Note>
          </Chord>
          <Rest>
            <durationType>quarter</durationType>
          </Rest>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: true, debugMetadata: true });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelector("work > work-title")?.textContent?.trim()).toBe("MS Test");
    expect(doc.querySelector("part-list > score-part[id=\"P1\"]")).not.toBeNull();
    expect(doc.querySelector("part > measure > note > pitch > step")?.textContent?.trim()).toBe("C");
    expect(doc.querySelector("miscellaneous-field[name=\"mks:src:musescore:raw-encoding\"]")).not.toBeNull();
  });

  it("prefers VBox title/composer when MuseScore meta tags are placeholders", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.60">
  <Score>
    <Division>480</Division>
    <metaTag name="workTitle">無題のスコア</metaTag>
    <metaTag name="composer">作曲者 / 編曲者</metaTag>
    <Staff id="1">
      <VBox>
        <Text><style>title</style><text>String Quartet No.15 K.421</text></Text>
        <Text><style>composer</style><text>W.A.Mozart</text></Text>
      </VBox>
      <Measure>
        <voice>
          <Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelector("work > work-title")?.textContent?.trim()).toBe("String Quartet No.15 K.421");
    expect(doc.querySelector("identification > creator[type=\"composer\"]")?.textContent?.trim()).toBe("W.A.Mozart");
  });

  it("maps MuseScore project metadata to standard MusicXML fields", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.60">
  <Score>
    <Division>480</Division>
    <metaTag name="workTitle">String Quartet No.15</metaTag>
    <metaTag name="subtitle">K.421 Mvt 1</metaTag>
    <metaTag name="composer">Wolfgang Amadeus Mozart</metaTag>
    <metaTag name="arranger">Arranger Name</metaTag>
    <metaTag name="lyricist">Lyricist Name</metaTag>
    <metaTag name="translator">Translator Name</metaTag>
    <metaTag name="copyright">Public Domain</metaTag>
    <metaTag name="workNumber">K.421</metaTag>
    <metaTag name="movementTitle">Andante</metaTag>
    <metaTag name="movementNumber">1</metaTag>
    <metaTag name="creationDate">2026-03-02</metaTag>
    <Staff id="1">
      <Measure>
        <voice>
          <Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelector("work > work-title")?.textContent?.trim()).toBe("String Quartet No.15");
    expect(doc.querySelector("work > work-number")?.textContent?.trim()).toBe("K.421");
    expect(doc.querySelector("movement-title")?.textContent?.trim()).toBe("Andante");
    expect(doc.querySelector("movement-number")?.textContent?.trim()).toBe("1");
    expect(doc.querySelector("credit > credit-type")?.textContent?.trim()).toBe("subtitle");
    expect(doc.querySelector("credit > credit-words")?.textContent?.trim()).toBe("K.421 Mvt 1");
    expect(doc.querySelector("identification > creator[type=\"composer\"]")?.textContent?.trim()).toBe(
      "Wolfgang Amadeus Mozart"
    );
    expect(doc.querySelector("identification > creator[type=\"arranger\"]")?.textContent?.trim()).toBe(
      "Arranger Name"
    );
    expect(doc.querySelector("identification > creator[type=\"lyricist\"]")?.textContent?.trim()).toBe(
      "Lyricist Name"
    );
    expect(doc.querySelector("identification > creator[type=\"translator\"]")?.textContent?.trim()).toBe(
      "Translator Name"
    );
    expect(doc.querySelector("identification > rights")?.textContent?.trim()).toBe("Public Domain");
    expect(doc.querySelector("identification > encoding > encoding-date")?.textContent?.trim()).toBe("2026-03-02");
  });

  it("imports tempo/time/key changes, repeats, and dynamics", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.0">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure startRepeat="1">
        <TimeSig><sigN>3</sigN><sigD>4</sigD></TimeSig>
        <KeySig><accidental>-1</accidental><mode>minor</mode></KeySig>
        <voice>
          <Tempo><tempo>2.0</tempo></Tempo>
          <Dynamic><subtype>mf</subtype><velocity>90</velocity></Dynamic>
          <Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>
        </voice>
      </Measure>
      <Measure endRepeat="1">
        <TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>
        <voice>
          <Dynamic><subtype>p</subtype><velocity>49</velocity></Dynamic>
          <Rest><durationType>quarter</durationType></Rest>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: true, debugMetadata: true });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;

    expect(doc.querySelector("measure:nth-of-type(1) time > beats")?.textContent?.trim()).toBe("3");
    expect(doc.querySelector("measure:nth-of-type(1) key > fifths")?.textContent?.trim()).toBe("-1");
    expect(doc.querySelector("measure:nth-of-type(1) key > mode")?.textContent?.trim()).toBe("minor");
    expect(doc.querySelector("measure:nth-of-type(1) direction sound")?.getAttribute("tempo")).toBe("120");
    expect(doc.querySelector("measure:nth-of-type(1) barline[location=\"left\"] repeat[direction=\"forward\"]")).not.toBeNull();
    expect(doc.querySelector("measure:nth-of-type(2) time > beats")?.textContent?.trim()).toBe("4");
    expect(doc.querySelector("measure:nth-of-type(2) barline[location=\"right\"] repeat[direction=\"backward\"]")).not.toBeNull();
    expect(doc.querySelector("measure:nth-of-type(1) dynamics > mf")).not.toBeNull();
    expect(doc.querySelector("measure:nth-of-type(2) dynamics > p")).not.toBeNull();
    expect(doc.querySelector("measure:nth-of-type(1) direction > sound[dynamics=\"100.00\"]")).not.toBeNull();
    expect(doc.querySelector("measure:nth-of-type(2) direction > sound[dynamics=\"54.44\"]")).not.toBeNull();
    expect(doc.querySelector("miscellaneous-field[name=\"mks:src:musescore:version\"]")?.textContent?.trim()).toBe("4.0");
  });

  it("imports repeats from MuseScore BarLine subtype variants", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.0">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <BarLine><subtype>start-repeat</subtype></BarLine>
          <Chord><durationType>whole</durationType><Note><pitch>60</pitch></Note></Chord>
        </voice>
      </Measure>
      <Measure>
        <voice>
          <Chord><durationType>whole</durationType><Note><pitch>62</pitch></Note></Chord>
          <BarLine><subtype>end-repeat</subtype></BarLine>
        </voice>
      </Measure>
      <Measure>
        <voice>
          <Chord><durationType>half</durationType><Note><pitch>64</pitch></Note></Chord>
          <BarLine><subtype>end-start-repeat</subtype></BarLine>
          <Chord><durationType>half</durationType><Note><pitch>65</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;

    expect(doc.querySelector("measure:nth-of-type(1) barline[location=\"left\"] repeat[direction=\"forward\"]")).not.toBeNull();
    expect(doc.querySelector("measure:nth-of-type(2) barline[location=\"right\"] repeat[direction=\"backward\"]")).not.toBeNull();
    expect(doc.querySelector("measure:nth-of-type(3) barline[location=\"middle\"] repeat[direction=\"backward\"]")).not.toBeNull();
    expect(doc.querySelector("measure:nth-of-type(3) barline[location=\"middle\"] repeat[direction=\"forward\"]")).not.toBeNull();
    expect(doc.querySelectorAll("measure:nth-of-type(3) barline[location=\"middle\"]").length).toBe(1);
    expect(doc.querySelector("measure:nth-of-type(3) barline[location=\"left\"] repeat[direction=\"forward\"]")).toBeNull();
  });

  it("roundtrips sample4 mid-measure end-start-repeat barlines", () => {
    const fixturePath = resolve(process.cwd(), "src", "samples", "musescore", "sample4.mscz");
    const mscx = execSync(`unzip -p "${fixturePath}" "*.mscx"`, { encoding: "utf-8" });
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const roundtripMscx = exportMusicXmlDomToMuseScore(doc);
    const count = (roundtripMscx.match(/<subtype>end-start-repeat<\/subtype>/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it("imports MuseScore cut-time symbol as MusicXML time symbol", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="2.06">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <TimeSig><subtype>2</subtype><sigN>4</sigN><sigD>4</sigD></TimeSig>
        <voice>
          <Chord><durationType>whole</durationType><Note><pitch>60</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const time = doc.querySelector("part > measure > attributes > time");
    expect(time?.getAttribute("symbol")).toBe("cut");
    expect(time?.querySelector(":scope > beats")?.textContent?.trim()).toBe("4");
    expect(time?.querySelector(":scope > beat-type")?.textContent?.trim()).toBe("4");
  });

  it("imports MuseScore Instrument transpose into MusicXML attributes transpose", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.0">
  <Score>
    <Division>480</Division>
    <Part>
      <trackName>Clarinet in A</trackName>
      <Instrument>
        <transposeDiatonic>-2</transposeDiatonic>
        <transposeChromatic>-3</transposeChromatic>
      </Instrument>
      <Staff id="1"/>
    </Part>
    <Staff id="1">
      <Measure>
        <voice>
          <Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelector("part > measure > attributes > transpose > diatonic")?.textContent?.trim()).toBe("-2");
    expect(doc.querySelector("part > measure > attributes > transpose > chromatic")?.textContent?.trim()).toBe("-3");
  });

  it("optionally normalizes MuseScore cut-time to 2/2 in MusicXML", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="2.06">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <TimeSig><subtype>2</subtype><sigN>4</sigN><sigD>4</sigD></TimeSig>
        <voice>
          <Chord><durationType>whole</durationType><Note><pitch>60</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, {
      sourceMetadata: false,
      debugMetadata: false,
      normalizeCutTimeToTwoTwo: true,
    });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const time = doc.querySelector("part > measure > attributes > time");
    expect(time?.getAttribute("symbol")).toBe("cut");
    expect(time?.querySelector(":scope > beats")?.textContent?.trim()).toBe("2");
    expect(time?.querySelector(":scope > beat-type")?.textContent?.trim()).toBe("2");
  });

  it("keeps cut-time symbol on following measures without explicit TimeSig", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="2.06">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <TimeSig><subtype>2</subtype><sigN>4</sigN><sigD>4</sigD></TimeSig>
        <voice><Chord><durationType>whole</durationType><Note><pitch>60</pitch></Note></Chord></voice>
      </Measure>
      <Measure>
        <voice><Chord><durationType>whole</durationType><Note><pitch>62</pitch></Note></Chord></voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelector("part > measure:nth-of-type(1) > attributes > time")?.getAttribute("symbol")).toBe("cut");
    expect(doc.querySelector("part > measure:nth-of-type(2) > attributes > time")).toBeNull();
  });

  it("imports only measure-anchored tempo text as words direction", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.0">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <VBox>
        <Text><text>Tema</text></Text>
      </VBox>
      <Measure>
        <voice>
          <Tempo><tempo>2.1666667</tempo><text>Quasi Presto</text></Tempo>
          <Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const words = Array.from(doc.querySelectorAll("part > measure:nth-of-type(1) > direction > direction-type > words"))
      .map((node) => node.textContent?.trim() ?? "");
    expect(words).toContain("Quasi Presto");
    expect(words).not.toContain("Tema");
    expect(doc.querySelector("part > measure:nth-of-type(1) > direction[placement=\"above\"] > direction-type > words")?.textContent?.trim()).toBe("Quasi Presto");
    expect(doc.querySelector("part > measure:nth-of-type(1) > direction > direction-type > metronome")).toBeNull();
    expect(doc.querySelector("part > measure:nth-of-type(1) > direction > sound")?.getAttribute("tempo")).toBe("130");
  });

  it("imports multiple Tempo events in one measure (e.g. Tema) as words directions", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.0">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <Tempo><tempo>2.1666667</tempo><text>Quasi Presto</text></Tempo>
          <Tempo><tempo>2.1666667</tempo><text>Tema</text></Tempo>
          <Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const words = Array.from(doc.querySelectorAll("part > measure:nth-of-type(1) > direction > direction-type > words"))
      .map((node) => node.textContent?.trim() ?? "");
    expect(words).toContain("Quasi Presto");
    expect(words).toContain("Tema");
  });

  it("does not emit words for hidden MuseScore Tempo text (visible=0)", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.0">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <Tempo>
            <tempo>1.0</tempo>
            <followText>1</followText>
            <visible>0</visible>
            <text><sym>metNoteQuarterUp</sym><sym>noSym</sym><sym>metAugmentationDot</sym> = 60</text>
          </Tempo>
          <Rest><durationType>quarter</durationType></Rest>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelector("part > measure > direction > direction-type > words")).toBeNull();
    expect(doc.querySelector("part > measure > direction > sound")?.getAttribute("tempo")).toBe("60");
  });

  it("skips hidden MuseScore Dynamic (visible=0)", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.0">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <Dynamic><subtype>f</subtype><velocity>96</velocity><visible>0</visible></Dynamic>
          <Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelector("part > measure > direction > direction-type > dynamics")).toBeNull();
    expect(doc.querySelector("part > measure > direction > sound[dynamics]")).toBeNull();
  });

  it("infers key mode from title when MuseScore key mode is not present", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <metaTag name="workTitle">Für Elise in A Minor</metaTag>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>3</sigN><sigD>8</sigD></TimeSig>
          <Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelector("part > measure > attributes > key > mode")?.textContent?.trim()).toBe("minor");
  });

  it("emits natural accidental when note cancels key-signature sharp", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="2.06">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <KeySig><accidental>4</accidental></KeySig>
        <TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>
        <voice>
          <Chord><durationType>quarter</durationType><Note><pitch>62</pitch></Note></Chord>
          <Chord><durationType>quarter</durationType><Note><pitch>63</pitch></Note></Chord>
          <Chord><durationType>quarter</durationType><Note><pitch>62</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const notes = Array.from(doc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > accidental")?.textContent?.trim()).toBe("natural");
    expect(notes[1]?.querySelector(":scope > accidental")?.textContent?.trim()).toBe("sharp");
    expect(notes[2]?.querySelector(":scope > accidental")?.textContent?.trim()).toBe("natural");
  });

  it("imports note-level accidentals from MuseScore Accidental subtype", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <Chord>
            <durationType>quarter</durationType>
            <Note>
              <Accidental><subtype>accidentalSharp</subtype></Accidental>
              <pitch>75</pitch>
            </Note>
          </Chord>
          <Chord>
            <durationType>quarter</durationType>
            <Note>
              <Accidental><subtype>accidentalNatural</subtype></Accidental>
              <pitch>74</pitch>
            </Note>
          </Chord>
          <Chord>
            <durationType>quarter</durationType>
            <Note>
              <Accidental><subtype>accidentalFlat</subtype></Accidental>
              <pitch>63</pitch>
            </Note>
          </Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const accidentalValues = Array.from(doc.querySelectorAll("part > measure > note > accidental"))
      .map((node) => node.textContent?.trim());
    expect(accidentalValues).toContain("sharp");
    expect(accidentalValues).toContain("natural");
    expect(accidentalValues).toContain("flat");
    const flatNote = doc.querySelector("part > measure > note:nth-of-type(3)");
    expect(flatNote?.querySelector(":scope > pitch > step")?.textContent?.trim()).toBe("E");
    expect(flatNote?.querySelector(":scope > pitch > alter")?.textContent?.trim()).toBe("-1");
  });

  it("prefers MuseScore tpc spelling for enharmonic notes when Accidental subtype is absent", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <Chord>
            <durationType>quarter</durationType>
            <Note><pitch>70</pitch><tpc>12</tpc></Note>
          </Chord>
          <Chord>
            <durationType>quarter</durationType>
            <Note><pitch>70</pitch><tpc>24</tpc></Note>
          </Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;

    const n1 = doc.querySelector("part > measure > note:nth-of-type(1)");
    const n2 = doc.querySelector("part > measure > note:nth-of-type(2)");
    expect(n1?.querySelector(":scope > pitch > step")?.textContent?.trim()).toBe("B");
    expect(n1?.querySelector(":scope > pitch > alter")?.textContent?.trim()).toBe("-1");
    expect(n1?.querySelector(":scope > accidental")?.textContent?.trim()).toBe("flat");
    expect(n2?.querySelector(":scope > pitch > step")?.textContent?.trim()).toBe("A");
    expect(n2?.querySelector(":scope > pitch > alter")?.textContent?.trim()).toBe("1");
    expect(n2?.querySelector(":scope > accidental")?.textContent?.trim()).toBe("sharp");
  });

  it("prefers MuseScore accidental subtype for pitch spelling even in flat key context", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <KeySig><accidental>-3</accidental></KeySig>
          <Chord>
            <durationType>quarter</durationType>
            <Note>
              <Accidental><subtype>accidentalSharp</subtype></Accidental>
              <pitch>63</pitch>
            </Note>
          </Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const note = doc.querySelector("part > measure > note");
    expect(note?.querySelector(":scope > pitch > step")?.textContent?.trim()).toBe("D");
    expect(note?.querySelector(":scope > pitch > alter")?.textContent?.trim()).toBe("1");
    expect(note?.querySelector(":scope > accidental")?.textContent?.trim()).toBe("sharp");
  });

  it("imports marker/jump as MusicXML directions and emits diag when playback mapping is incomplete", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.0">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <Marker><subtype>segno</subtype><label>segno</label></Marker>
          <Jump><text>D.S.</text><jumpTo>segno</jumpTo><playUntil>fine</playUntil></Jump>
          <Jump><text>Custom Jump</text></Jump>
          <Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: true, debugMetadata: true });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;

    expect(doc.querySelector("measure direction direction-type segno")).not.toBeNull();
    expect(doc.querySelector("measure direction sound[dalsegno=\"segno\"][fine=\"fine\"]")).not.toBeNull();
    const diagText = Array.from(doc.querySelectorAll("miscellaneous-field"))
      .map((n) => n.textContent ?? "")
      .join("\n");
    expect(diagText).toContain("jump mapped as text only; playback semantics may be incomplete");
  });

  it("imports MuseScore Expression as MusicXML words direction", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.0">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <Expression><text><i></i>sempre legato</text></Expression>
          <Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const words = doc.querySelector("part > measure > direction > direction-type > words");
    expect(words?.textContent?.trim()).toBe("sempre legato");
    expect(words?.getAttribute("font-style")).toBe("italic");
  });

  it("exports basic MusicXML content into mscx", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>1</fifths><mode>major</mode></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
      </attributes>
      <direction><direction-type><dynamics><mf/></dynamics></direction-type><sound tempo="120"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <barline location="right"><repeat direction="backward"/></barline>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);
    expect(mscx).toContain("<museScore");
    expect(mscx).toContain("<Staff id=\"1\">");
    expect(mscx).toContain("<TimeSig><sigN>3</sigN><sigD>4</sigD></TimeSig>");
    expect(mscx).toContain("<KeySig><accidental>1</accidental></KeySig>");
    expect(mscx).toContain("<Tempo><tempo>2.000000</tempo></Tempo>");
    expect(mscx).toContain("<Dynamic><subtype>mf</subtype></Dynamic>");
    expect(mscx).toContain("<endRepeat/>");
  });

  it("exports MusicXML header metadata into MuseScore metaTag fields", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work>
    <work-title>String Quartet No.15</work-title>
    <work-number>K.421</work-number>
  </work>
  <movement-title>Andante</movement-title>
  <movement-number>1</movement-number>
  <identification>
    <creator type="composer">Wolfgang Amadeus Mozart</creator>
    <creator type="arranger">Arranger Name</creator>
    <creator type="lyricist">Lyricist Name</creator>
    <creator type="translator">Translator Name</creator>
    <rights>Public Domain</rights>
    <encoding><encoding-date>2026-03-02</encoding-date></encoding>
  </identification>
  <credit page="1">
    <credit-type>subtitle</credit-type>
    <credit-words>K.421 Mvt 1</credit-words>
  </credit>
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);
    expect(mscx).toContain("<metaTag name=\"workTitle\">String Quartet No.15</metaTag>");
    expect(mscx).toContain("<metaTag name=\"workNumber\">K.421</metaTag>");
    expect(mscx).toContain("<metaTag name=\"movementTitle\">Andante</metaTag>");
    expect(mscx).toContain("<metaTag name=\"movementNumber\">1</metaTag>");
    expect(mscx).toContain("<metaTag name=\"subtitle\">K.421 Mvt 1</metaTag>");
    expect(mscx).toContain("<metaTag name=\"composer\">Wolfgang Amadeus Mozart</metaTag>");
    expect(mscx).toContain("<metaTag name=\"arranger\">Arranger Name</metaTag>");
    expect(mscx).toContain("<metaTag name=\"lyricist\">Lyricist Name</metaTag>");
    expect(mscx).toContain("<metaTag name=\"translator\">Translator Name</metaTag>");
    expect(mscx).toContain("<metaTag name=\"copyright\">Public Domain</metaTag>");
    expect(mscx).toContain("<metaTag name=\"creationDate\">2026-03-02</metaTag>");
  });

  it("preserves MusicXML tuplet markers through MuseScore roundtrip", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>320</duration><voice>1</voice><type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="start" number="1"/></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>320</duration><voice>1</voice><type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>320</duration><voice>1</voice><type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="stop" number="1"/></notations>
      </note>
      <note><rest/><duration>960</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(musicXml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mscx = exportMusicXmlDomToMuseScore(srcDoc);
    expect(mscx).toContain("<Tuplet id=\"T1\"><normalNotes>2</normalNotes><actualNotes>3</actualNotes></Tuplet>");
    const roundtripXml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const roundtripDoc = parseMusicXmlDocument(roundtripXml);
    expect(roundtripDoc).not.toBeNull();
    if (!roundtripDoc) return;
    const start = roundtripDoc.querySelector("part > measure > note:nth-of-type(1) > notations > tuplet[type=\"start\"]");
    const stop = roundtripDoc.querySelector("part > measure > note:nth-of-type(3) > notations > tuplet[type=\"stop\"]");
    expect(start).not.toBeNull();
    expect(stop).not.toBeNull();
  });

  it("roundtrip keeps octave-shift (8va/8vb) exported as chord-local Ottava spanner", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <direction><direction-type><octave-shift type="down" size="8" number="1"/></direction-type></direction>
      <note><pitch><step>A</step><octave>6</octave></pitch><duration>960</duration><voice>1</voice><type>half</type></note>
    </measure>
    <measure number="2">
      <direction><direction-type><octave-shift type="stop" size="8" number="1"/></direction-type></direction>
      <note><pitch><step>A</step><octave>5</octave></pitch><duration>960</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(musicXml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mscx = exportMusicXmlDomToMuseScore(srcDoc);
    const dstXml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const dstDoc = parseMusicXmlDocument(dstXml);
    expect(dstDoc).not.toBeNull();
    if (!dstDoc) return;
    const start = dstDoc.querySelector('part > measure:nth-of-type(1) > direction > direction-type > octave-shift[type="start"]');
    const stop = dstDoc.querySelector('part > measure:nth-of-type(2) > direction > direction-type > octave-shift[type="stop"]');
    expect(start).not.toBeNull();
    expect(stop).not.toBeNull();
  });

  it("roundtrip keeps trill ornaments exported as chord-local Trill spanner", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>A</step><octave>3</octave></pitch>
        <duration>960</duration><voice>1</voice><type>half</type>
        <notations><ornaments><trill-mark/><wavy-line type="start" number="1"/></ornaments></notations>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>A</step><octave>3</octave></pitch>
        <duration>960</duration><voice>1</voice><type>half</type>
        <notations><ornaments><wavy-line type="stop" number="1"/></ornaments></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(musicXml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mscx = exportMusicXmlDomToMuseScore(srcDoc);
    const dstXml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const dstDoc = parseMusicXmlDocument(dstXml);
    expect(dstDoc).not.toBeNull();
    if (!dstDoc) return;
    const start = dstDoc.querySelector('part > measure:nth-of-type(1) note > notations > ornaments > wavy-line[type="start"]');
    const stop = dstDoc.querySelector('part > measure:nth-of-type(2) note > notations > ornaments > wavy-line[type="stop"]');
    const trillMark = dstDoc.querySelector("part > measure:nth-of-type(1) note > notations > ornaments > trill-mark");
    expect(start).not.toBeNull();
    expect(stop).not.toBeNull();
    expect(trillMark).not.toBeNull();
  });

  it("roundtrip keeps staccato articulation on a single-measure note", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        <notations><articulations><staccato/></articulations></notations>
      </note>
      <note><rest/><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(musicXml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mscx = exportMusicXmlDomToMuseScore(srcDoc);
    const dstXml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const dstDoc = parseMusicXmlDocument(dstXml);
    expect(dstDoc).not.toBeNull();
    if (!dstDoc) return;
    const first = dstDoc.querySelector("part > measure > note:nth-of-type(1)");
    expect(first?.querySelector(":scope > notations > articulations > staccato")).not.toBeNull();
  });

  it("roundtrip keeps accent articulation on a single-measure note", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>B</step><octave>3</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        <notations><articulations><accent/></articulations></notations>
      </note>
      <note><rest/><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(musicXml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mscx = exportMusicXmlDomToMuseScore(srcDoc);
    const dstXml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const dstDoc = parseMusicXmlDocument(dstXml);
    expect(dstDoc).not.toBeNull();
    if (!dstDoc) return;
    const first = dstDoc.querySelector("part > measure > note:nth-of-type(1)");
    expect(first?.querySelector(":scope > notations > articulations > accent")).not.toBeNull();
  });

  it("roundtrip keeps implicit short pickup measure length", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="X1" implicit="yes">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
    <measure number="1">
      <note><rest/><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(musicXml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mscx = exportMusicXmlDomToMuseScore(srcDoc);
    const dstXml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const dstDoc = parseMusicXmlDocument(dstXml);
    expect(dstDoc).not.toBeNull();
    if (!dstDoc) return;
    const pickup = dstDoc.querySelector("part > measure:nth-of-type(1)");
    expect(pickup?.getAttribute("implicit")).toBe("yes");
    const pickupDur = Array.from(pickup?.querySelectorAll(":scope > note > duration") ?? [])
      .reduce((sum, node) => sum + Math.round(Number(node.textContent?.trim() ?? "0")), 0);
    expect(pickupDur).toBe(480);
  });

  it("roundtrip keeps grace note marker and principal duration", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note><grace slash="yes"/><pitch><step>C</step><octave>5</octave></pitch><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(musicXml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mscx = exportMusicXmlDomToMuseScore(srcDoc);
    const dstXml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const dstDoc = parseMusicXmlDocument(dstXml);
    expect(dstDoc).not.toBeNull();
    if (!dstDoc) return;
    const first = dstDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = dstDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(first?.querySelector(":scope > grace")).not.toBeNull();
    expect(second?.querySelector(":scope > duration")?.textContent?.trim()).toBe("480");
  });

  it("roundtrip keeps unpitched notes as timed note events", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1">
      <part-name>Drums</part-name>
      <score-instrument id="P1-I1"><instrument-name>Drum Set</instrument-name></score-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched>
        <duration>480</duration><voice>1</voice><type>quarter</type><instrument id="P1-I1"/>
      </note>
      <note>
        <unpitched><display-step>D</display-step><display-octave>5</display-octave></unpitched>
        <duration>480</duration><voice>1</voice><type>quarter</type><instrument id="P1-I1"/>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(musicXml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mscx = exportMusicXmlDomToMuseScore(srcDoc);
    const dstXml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const dstDoc = parseMusicXmlDocument(dstXml);
    expect(dstDoc).not.toBeNull();
    if (!dstDoc) return;
    const timedNotes = Array.from(dstDoc.querySelectorAll("part > measure > note"))
      .filter((n) => n.querySelector(":scope > rest") === null);
    expect(timedNotes.length).toBe(2);
    const durations = timedNotes.map((n) => n.querySelector(":scope > duration")?.textContent?.trim() ?? "");
    expect(durations).toEqual(["480", "480"]);
  });

  it("roundtrip keeps section-boundary double bar + explicit same-meter time (m24/m25 minimal)", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="24">
      <attributes><divisions>480</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <barline location="right"><bar-style>light-light</bar-style></barline>
    </measure>
    <measure number="25">
      <attributes><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(musicXml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mscx = exportMusicXmlDomToMuseScore(srcDoc);
    const dstXml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const dstDoc = parseMusicXmlDocument(dstXml);
    expect(dstDoc).not.toBeNull();
    if (!dstDoc) return;

    const m25 = dstDoc.querySelector("part > measure:nth-of-type(2)");
    expect(m25).not.toBeNull();
    expect(m25?.querySelector(":scope > attributes > time > beats")?.textContent?.trim()).toBe("2");
    expect(m25?.querySelector(":scope > attributes > time > beat-type")?.textContent?.trim()).toBe("4");

    const m24RightDouble = dstDoc.querySelector('part > measure:nth-of-type(1) > barline[location="right"] > bar-style');
    const m25LeftDouble = dstDoc.querySelector('part > measure:nth-of-type(2) > barline[location="left"] > bar-style');
    const hasBoundaryDouble =
      m24RightDouble?.textContent?.trim() === "light-light"
      || m25LeftDouble?.textContent?.trim() === "light-light";
    expect(hasBoundaryDouble).toBe(true);
  });

  it("keeps written type for MusicXML triplet eighths on MusicXML->MuseScore->MusicXML", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch>
        <duration>160</duration><voice>1</voice><type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="start" number="1"/></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>5</octave></pitch>
        <duration>160</duration><voice>1</voice><type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
      </note>
      <note>
        <pitch><step>E</step><octave>5</octave></pitch>
        <duration>160</duration><voice>1</voice><type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="stop" number="1"/></notations>
      </note>
      <note><rest/><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(musicXml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    const mscx = exportMusicXmlDomToMuseScore(srcDoc);
    const dstXml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const dstDoc = parseMusicXmlDocument(dstXml);
    expect(dstDoc).not.toBeNull();
    if (!dstDoc) return;
    const first = dstDoc.querySelector("part > measure > note:nth-of-type(1)");
    const third = dstDoc.querySelector("part > measure > note:nth-of-type(3)");
    expect(first?.querySelector(":scope > type")?.textContent?.trim()).toBe("eighth");
    expect(first?.querySelector(":scope > duration")?.textContent?.trim()).toBe("160");
    expect(first?.querySelector(":scope > notations > tuplet[type=\"start\"]")).not.toBeNull();
    expect(third?.querySelector(":scope > notations > tuplet[type=\"stop\"]")).not.toBeNull();
  });

  it("exports MusicXML cut-time symbol into MuseScore TimeSig subtype", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time symbol="cut"><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);
    expect(mscx).toContain("<TimeSig><subtype>2</subtype><sigN>4</sigN><sigD>4</sigD></TimeSig>");
  });

  it("optionally normalizes MusicXML cut-time 4/4 into MuseScore 2/2", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time symbol="cut"><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc, { normalizeCutTimeToTwoTwo: true });
    expect(mscx).toContain("<TimeSig><subtype>2</subtype><sigN>2</sigN><sigD>2</sigD></TimeSig>");
  });

  it("keeps cut-time subtype on following MuseScore measures without explicit time change", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time symbol="cut"><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);
    const timeSigCount = (mscx.match(/<TimeSig>/g) ?? []).length;
    const cutTimeSigCount = (mscx.match(/<TimeSig><subtype>2<\/subtype><sigN>4<\/sigN><sigD>4<\/sigD><\/TimeSig>/g) ?? []).length;
    expect(timeSigCount).toBe(1);
    expect(cutTimeSigCount).toBe(1);
  });

  it("exports MusicXML words+sound tempo as MuseScore Tempo text and words-only as Expression", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <direction placement="above">
        <direction-type><words>Tema</words></direction-type>
        <sound tempo="130"/>
      </direction>
      <direction>
        <direction-type><words font-style="italic">sempre legato</words></direction-type>
      </direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>1440</duration><voice>1</voice><type>half</type><dot/></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);
    expect(mscx).toContain("<Tempo><tempo>2.166667</tempo><text>Tema</text></Tempo>");
    expect(mscx).toContain("<Expression><text><i></i>sempre legato</text></Expression>");
  });

  it("exports metronome-only tempo direction as MuseScore Tempo", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <direction>
        <direction-type>
          <metronome>
            <beat-unit>quarter</beat-unit>
            <per-minute>90</per-minute>
          </metronome>
        </direction-type>
      </direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);
    expect(mscx).toContain("<Tempo><tempo>1.500000</tempo></Tempo>");
  });

  it("exports MusicXML segno/coda/fine and sound jump attrs into MuseScore Marker/Jump", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <direction><direction-type><segno/></direction-type></direction>
      <direction><direction-type><coda/></direction-type></direction>
      <direction><direction-type><words>Fine</words></direction-type></direction>
      <direction><direction-type><words>D.S.</words></direction-type><sound dalsegno="segno" fine="fine"/></direction>
      <direction><direction-type><words>D.C.</words></direction-type><sound dacapo="yes" tocoda="coda"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);
    expect(mscx).toContain("<Marker><subtype>segno</subtype><label>segno</label></Marker>");
    expect(mscx).toContain("<Marker><subtype>coda</subtype><label>coda</label></Marker>");
    expect(mscx).toContain("<Marker><subtype>fine</subtype><label>Fine</label></Marker>");
    expect(mscx).toContain("<Jump><text>D.S.</text><jumpTo>segno</jumpTo><playUntil>fine</playUntil></Jump>");
    expect(mscx).toContain("<Jump><text>D.C.</text><jumpTo>start</jumpTo><playUntil>coda</playUntil><continueAt>coda</continueAt></Jump>");
  });

  it("exports MusicXML sound dynamics into MuseScore Dynamic velocity", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <direction>
        <direction-type><dynamics><f/></dynamics></direction-type>
        <sound dynamics="106.67"/>
      </direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);
    expect(mscx).toContain("<Dynamic><subtype>f</subtype><velocity>96</velocity></Dynamic>");
  });

  it("exports MusicXML octave-shift direction into MuseScore Ottava spanner", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <direction><direction-type><octave-shift type="up" size="8"/></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
    <measure number="2">
      <direction><direction-type><octave-shift type="stop" size="8"/></direction-type></direction>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);
    expect(mscx).toContain("<Spanner type=\"Ottava\"><Ottava><subtype>8va</subtype></Ottava><next>");
    expect(mscx).toContain("<Spanner type=\"Ottava\"><prev>");
  });

  it("exports MusicXML trill ornaments into MuseScore Trill spanner", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>whole</type>
        <notations><ornaments><trill-mark/><wavy-line type="start" number="1"/></ornaments></notations>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>whole</type>
        <notations><ornaments><wavy-line type="stop" number="1"/></ornaments></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);
    expect(mscx).toContain("<Spanner type=\"Trill\"><Trill><subtype>trill</subtype></Trill><next>");
    expect(mscx).toContain("<Spanner type=\"Trill\"><prev>");
  });

  it("exports MusicXML trill-mark without wavy-line as MuseScore chord Ornament trill", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        <notations><ornaments><trill-mark/></ornaments></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);
    expect(mscx).toContain("<Ornament><subtype>ornamentTrill</subtype></Ornament>");
    expect(mscx).not.toContain("<Spanner type=\"Trill\"><Trill><subtype>trill</subtype></Trill><next>");
  });

  it("exports MusicXML tie/slur into MuseScore note/chord markers", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        <tie type="start"/>
        <notations>
          <tied type="start"/>
          <slur type="start" number="3"/>
        </notations>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        <tie type="stop"/>
        <notations>
          <tied type="stop"/>
          <slur type="stop" number="3"/>
        </notations>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;

    const mscx = exportMusicXmlDomToMuseScore(doc);
    expect(mscx).toContain("<Spanner type=\"Slur\"><Slur/><next><location><fractions>1/4</fractions></location></next></Spanner>");
    expect(mscx).toContain("<Spanner type=\"Slur\"><prev><location><fractions>-1/4</fractions></location></prev></Spanner>");
    expect(mscx).toContain("<Tie/>");
    expect(mscx).toContain("<endSpanner/>");
  });

  it("assigns independent slur ids per part to avoid cross-part slur linking", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Violin 1</part-name></score-part>
    <score-part id="P2"><part-name>Violin 2</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type><notations><slur type="start" number="1"/></notations></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type><notations><slur type="stop" number="1"/></notations></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type><notations><slur type="start" number="1"/></notations></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type><notations><slur type="stop" number="1"/></notations></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);
    const startCount = (mscx.match(/<Spanner type="Slur"><Slur\/><next><location><fractions>\d+\/\d+<\/fractions><\/location><\/next><\/Spanner>/g) ?? []).length;
    const stopCount = (mscx.match(/<Spanner type="Slur"><prev><location><fractions>-\d+\/\d+<\/fractions><\/location><\/prev><\/Spanner>/g) ?? []).length;
    expect(startCount).toBe(2);
    expect(stopCount).toBe(2);
  });

  it("emits slur stop before slur start when both occur on the same note", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type><notations><slur type="start" number="1"/></notations></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type><notations><slur type="stop" number="1"/><slur type="start" number="1"/></notations></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type><notations><slur type="stop" number="1"/></notations></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);
    const secondChord = (mscx.match(/<Chord>[\s\S]*?<\/Chord>/g) ?? [])[1] ?? "";
    const prevPos = secondChord.indexOf("<Spanner type=\"Slur\"><prev><location><fractions>-1/4</fractions></location></prev></Spanner>");
    const nextPos = secondChord.indexOf("<Spanner type=\"Slur\"><Slur/><next><location><fractions>1/4</fractions></location></next></Spanner>");
    expect(prevPos).toBeGreaterThanOrEqual(0);
    expect(nextPos).toBeGreaterThanOrEqual(0);
    expect(prevPos).toBeLessThan(nextPos);
  });

  it("reuses slur start span for slur stop when start/stop note durations differ", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>32</divisions><time><beats>3</beats><beat-type>8</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>32</duration><voice>1</voice><type>quarter</type><notations><slur type="start" number="1"/></notations></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>8</duration><voice>1</voice><type>16th</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><type>32nd</type><notations><slur type="stop" number="1"/></notations></note>
      <note><rest/><duration>4</duration><voice>1</voice><type>32nd</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);
    expect(mscx).toContain("<Spanner type=\"Slur\"><Slur/><next><location><fractions>1/4</fractions></location></next></Spanner>");
    expect(mscx).toContain("<Spanner type=\"Slur\"><prev><location><fractions>-1/4</fractions></location></prev></Spanner>");
    expect(mscx).not.toContain("<Spanner type=\"Slur\"><prev><location><fractions>-1/32</fractions></location></prev></Spanner>");
  });

  it("exports MusicXML alto clef as MuseScore concertClefType C", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Viola</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>C</sign><line>3</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);
    expect(mscx).not.toContain("<Clef><concertClefType>C3</concertClefType></Clef>");
    expect(mscx).toContain("<defaultClef>C3</defaultClef>");
  });

  it("exports MusicXML articulations into MuseScore Articulation subtypes", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        <notations><articulations><staccato/></articulations></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        <notations><articulations><accent/></articulations></notations>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        <notations><articulations><tenuto/></articulations></notations>
      </note>
      <note><rest/><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);
    expect(mscx).toContain("<Articulation><subtype>articStaccatoAbove</subtype></Articulation>");
    expect(mscx).toContain("<Articulation><subtype>articAccentAbove</subtype></Articulation>");
    expect(mscx).toContain("<Articulation><subtype>articTenutoAbove</subtype></Articulation>");
  });

  it("exports MusicXML technical stopped into MuseScore left-hand pizzicato articulation", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        <notations><technical><stopped/></technical></notations>
      </note>
      <note><rest/><duration>1440</duration><voice>1</voice><type>half</type><dot/></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);
    expect(mscx).toContain("<Articulation><subtype>articLhPizzicatoAbove</subtype></Articulation>");
  });

  it("exports MusicXML technical bow/open/harmonic and fingering/string into MuseScore", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        <notations>
          <technical>
            <up-bow/>
            <open-string/>
            <harmonic/>
            <fingering>2</fingering>
            <string>4</string>
          </technical>
        </notations>
      </note>
      <note><rest/><duration>1440</duration><voice>1</voice><type>half</type><dot/></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);
    expect(mscx).toContain("<Articulation><subtype>articUpBowAbove</subtype></Articulation>");
    expect(mscx).toContain("<Articulation><subtype>articOpenStringAbove</subtype></Articulation>");
    expect(mscx).toContain("<Articulation><subtype>articHarmonicAbove</subtype></Articulation>");
    expect(mscx).toContain("<Fingering>2</Fingering>");
    expect(mscx).toContain("<String>4</String>");
  });

  it("exports multi-staff MusicXML part into MuseScore Part with multiple Staff refs", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type><staff>1</staff></note>
      <backup><duration>480</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>480</duration><voice>2</voice><type>quarter</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;

    const mscx = exportMusicXmlDomToMuseScore(doc);
    expect(mscx).toContain("<Part id=\"1\"><Staff><defaultClef>G</defaultClef></Staff><Staff><defaultClef>F</defaultClef></Staff><trackName>Piano</trackName><Instrument><trackName>Piano</trackName><longName>Piano</longName><clef>G</clef><clef staff=\"2\">F</clef></Instrument></Part>");
    expect(mscx).toContain("<Staff id=\"1\">");
    expect(mscx).toContain("<Staff id=\"2\">");
  });

  it("exports MusicXML part-abbreviation into MuseScore Instrument shortName", () => {
    const musicXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1">
      <part-name>Violin 1</part-name>
      <part-abbreviation>Vln. 1</part-abbreviation>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(musicXml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);
    expect(mscx).toContain("<shortName>Vln. 1</shortName>");
  });

  it("exports sample2.mxl with viola/cello clef defaults (C3/F4)", () => {
    const mxlPath = resolve(process.cwd(), "src", "samples", "musicxml", "sample2.mxl");
    const xml = execSync(`unzip -p "${mxlPath}" score.xml`, { encoding: "utf-8" });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);
    expect(mscx).toContain("<trackName>Viola</trackName>");
    expect(mscx).toContain("<trackName>Violoncello</trackName>");
    expect(mscx).toContain("<defaultClef>C3</defaultClef>");
    expect(mscx).toContain("<defaultClef>F</defaultClef>");
    expect(mscx).toContain("<Instrument><trackName>Viola</trackName><longName>Viola</longName><shortName>Vla.</shortName><clef>C3</clef></Instrument>");
    expect(mscx).toContain("<Instrument><trackName>Violoncello</trackName><longName>Violoncello</longName><shortName>Vc.</shortName><clef>F</clef></Instrument>");
  });

  it("exports sample2.mxl Violin1 m2 slur stop span consistent with its start span", () => {
    const mxlPath = resolve(process.cwd(), "src", "samples", "musicxml", "sample2.mxl");
    const xml = execSync(`unzip -p "${mxlPath}" score.xml`, { encoding: "utf-8" });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);

    const mfPos = mscx.indexOf("<subtype>mf</subtype>");
    expect(mfPos).toBeGreaterThanOrEqual(0);
    const measureEnd = mscx.indexOf("</Measure>", mfPos);
    expect(measureEnd).toBeGreaterThan(mfPos);
    const excerpt = mscx.slice(mfPos, measureEnd);

    expect(excerpt).toContain("<Chord><durationType>quarter</durationType><Spanner type=\"Slur\"><Slur/><next><location><fractions>1/4</fractions></location></next></Spanner><Note><pitch>65</pitch></Note></Chord>");
    expect(excerpt).toContain("<Chord><durationType>32nd</durationType><Spanner type=\"Slur\"><prev><location><fractions>-1/4</fractions></location></prev></Spanner><Note><pitch>67</pitch></Note></Chord>");
    expect(excerpt).not.toContain("<Chord><durationType>32nd</durationType><Spanner type=\"Slur\"><prev><location><fractions>-1/32</fractions></location></prev></Spanner><Note><pitch>67</pitch></Note></Chord>");
  });

  it("keeps viola/cello clefs on sample2.mscz -> MusicXML -> MuseScore path", () => {
    const msczPath = resolve(process.cwd(), "src", "samples", "musescore", "sample2.mscz");
    const sourceMscx = execSync(`unzip -p "${msczPath}" '*.mscx'`, { encoding: "utf-8" });
    const xml = convertMuseScoreToMusicXml(sourceMscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const mscx = exportMusicXmlDomToMuseScore(doc);
    expect(mscx).toContain("<trackName>Viola</trackName>");
    expect(mscx).toContain("<trackName>Violoncello</trackName>");
    expect(mscx).toContain("<defaultClef>C3</defaultClef>");
    expect(mscx).toContain("<defaultClef>F</defaultClef>");
    expect(mscx).toContain("<Instrument><trackName>Viola</trackName><longName>Viola</longName><clef>C3</clef></Instrument>");
    expect(mscx).toContain("<Instrument><trackName>Violoncello</trackName><longName>Violoncello</longName><clef>F</clef></Instrument>");
  });

  it("imports multi-staff MuseScore part into a single MusicXML part with staves", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.0">
  <Score>
    <Division>480</Division>
    <Part>
      <trackName>Piano</trackName>
      <Staff id="1"/>
      <Staff id="2"/>
    </Part>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>
          <Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
    <Staff id="2">
      <Measure>
        <voice>
          <Clef><concertClefType>F</concertClefType></Clef>
          <Chord><durationType>quarter</durationType><Note><pitch>48</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;

    expect(doc.querySelectorAll("part-list > score-part").length).toBe(1);
    expect(doc.querySelector("part-list > score-part > part-name")?.textContent?.trim()).toBe("Piano");
    expect(doc.querySelector("part > measure > attributes > staves")?.textContent?.trim()).toBe("2");
    expect(doc.querySelector("part > measure > attributes > clef[number=\"2\"] > sign")?.textContent?.trim()).toBe("F");
    expect(doc.querySelector("part > measure > note > staff")?.textContent?.trim()).toBe("1");
    expect(doc.querySelector("part > measure > backup > duration")?.textContent?.trim()).toBe("1920");
    expect(doc.querySelector("part > measure > note:last-of-type > staff")?.textContent?.trim()).toBe("2");
    const staff1FirstNote = Array.from(doc.querySelectorAll("part > measure > note")).find(
      (note) => note.querySelector("staff")?.textContent?.trim() === "1"
    );
    const staff1Voice = staff1FirstNote?.querySelector("voice")?.textContent?.trim() ?? null;
    const staff2FirstNote = Array.from(doc.querySelectorAll("part > measure > note")).find(
      (note) => note.querySelector("staff")?.textContent?.trim() === "2"
    );
    expect(staff1FirstNote).not.toBeNull();
    expect(staff2FirstNote).not.toBeNull();
    expect(staff2FirstNote?.querySelector("voice")?.textContent?.trim()).not.toBe(staff1Voice);
  });

  it("keeps voice numbers per staff when MuseScore measure has multiple voice lanes", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.0">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>
        </voice>
        <voice>
          <Chord><durationType>quarter</durationType><Note><pitch>64</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;

    const notes = Array.from(doc.querySelectorAll("part > measure > note"));
    expect(notes.length).toBeGreaterThanOrEqual(4);
    expect(notes[0]?.querySelector("voice")?.textContent?.trim()).toBe("1");
    expect(notes[0]?.querySelector("staff")?.textContent?.trim()).toBe("1");
    expect(doc.querySelector("part > measure > backup > duration")?.textContent?.trim()).toBe("1920");
    const hasVoice2 = notes.some((note) => note.querySelector("voice")?.textContent?.trim() === "2");
    expect(hasVoice2).toBe(true);
  });

  it("places direction per voice lane with explicit voice/staff tags", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.0">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>
        </voice>
        <voice>
          <Rest><durationType>quarter</durationType></Rest>
          <Dynamic><subtype>mf</subtype></Dynamic>
          <Chord><durationType>quarter</durationType><Note><pitch>64</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;

    const dynamicDirection = Array.from(doc.querySelectorAll("part > measure > direction")).find(
      (direction) => direction.querySelector("dynamics > mf") !== null
    );
    expect(dynamicDirection).not.toBeNull();
    expect(dynamicDirection?.querySelector("voice")?.textContent?.trim()).toBe("2");
    expect(dynamicDirection?.querySelector("staff")?.textContent?.trim()).toBe("1");
  });

  it("emits detailed diag fields for dropped events", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.0">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <Rest/>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: true });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;

    const diag = doc.querySelector("miscellaneous-field[name=\"mks:diag:0001\"]")?.textContent ?? "";
    expect(diag).toContain("reason=unknown-duration");
    expect(diag).toContain("action=dropped");
    expect(diag).toContain("measure=1");
    expect(diag).toContain("staff=1");
    expect(diag).toContain("voice=1");
  });

  it("uses Part staff defaultClef when measure-level clef is absent", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Part>
      <Staff id="1"></Staff>
      <Staff id="2"><defaultClef>F</defaultClef></Staff>
    </Part>
    <Staff id="1"><Measure><voice><Rest><durationType>quarter</durationType></Rest></voice></Measure></Staff>
    <Staff id="2"><Measure><voice><Rest><durationType>quarter</durationType></Rest></voice></Measure></Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelector("part > measure > attributes > clef[number=\"2\"] > sign")?.textContent?.trim()).toBe("F");
  });

  it("imports MuseScore C clef (C3) from measure clef", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.0">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <Clef><concertClefType>C3</concertClefType></Clef>
          <Rest><durationType>quarter</durationType></Rest>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelector("part > measure > attributes > clef > sign")?.textContent?.trim()).toBe("C");
    expect(doc.querySelector("part > measure > attributes > clef > line")?.textContent?.trim()).toBe("3");
  });

  it("uses Part staff defaultClef C3 when measure-level clef is absent", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Part>
      <Staff id="1"><defaultClef>C3</defaultClef></Staff>
    </Part>
    <Staff id="1"><Measure><voice><Rest><durationType>quarter</durationType></Rest></voice></Measure></Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelector("part > measure > attributes > clef > sign")?.textContent?.trim()).toBe("C");
    expect(doc.querySelector("part > measure > attributes > clef > line")?.textContent?.trim()).toBe("3");
  });

  it("imports local Mozart SQ fixture clefs from mscz (P1/P2=G2, P3=C3, P4=F4)", async () => {
    const localFixturePath = resolve(process.cwd(), "tests", "local-data", "Mozart_SQ_No15_K421_Mvt4.mscz");
    const bundledFixturePath = resolve(process.cwd(), "src", "samples", "musescore", "sample4.mscz");
    const fixturePath = existsSync(localFixturePath) ? localFixturePath : bundledFixturePath;
    const mscxEntryName = "Mozart_SQ_No15_K421_Mvt4.mscx";
    const mscx = execSync(`unzip -p "${fixturePath}" "${mscxEntryName}"`, { encoding: "utf-8" });
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;

    const clef = (part: number): string => (
      doc.querySelector(`part:nth-of-type(${part}) > measure:nth-of-type(1) > attributes > clef > sign`)?.textContent?.trim() ?? ""
    );
    const line = (part: number): string => (
      doc.querySelector(`part:nth-of-type(${part}) > measure:nth-of-type(1) > attributes > clef > line`)?.textContent?.trim() ?? ""
    );

    expect(clef(1)).toBe("G");
    expect(line(1)).toBe("2");
    expect(clef(2)).toBe("G");
    expect(line(2)).toBe("2");
    expect(clef(3)).toBe("C");
    expect(line(3)).toBe("3");
    expect(clef(4)).toBe("F");
    expect(line(4)).toBe("4");
  });

  it("handles tuplet and measure-rest duration without unknown-duration diag", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>2</sigN><sigD>4</sigD></TimeSig>
          <Tuplet><normalNotes>2</normalNotes><actualNotes>3</actualNotes></Tuplet>
          <Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>
          <Chord><durationType>quarter</durationType><Note><pitch>62</pitch></Note></Chord>
          <Chord><durationType>quarter</durationType><Note><pitch>64</pitch></Note></Chord>
          <endTuplet/>
        </voice>
      </Measure>
      <Measure>
        <voice>
          <Rest><durationType>measure</durationType></Rest>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: true });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const allDiag = Array.from(doc.querySelectorAll("miscellaneous-field[name^=\"diag:\"]"))
      .map((n) => n.textContent ?? "")
      .join("\n");
    expect(allDiag).not.toContain("unknown-duration");
    expect(allDiag).not.toContain("tag=Tuplet");
    const firstNote = doc.querySelector("part > measure:nth-of-type(1) > note:nth-of-type(1)");
    const thirdNote = doc.querySelector("part > measure:nth-of-type(1) > note:nth-of-type(3)");
    expect(firstNote?.querySelector(":scope > time-modification > actual-notes")?.textContent?.trim()).toBe("3");
    expect(firstNote?.querySelector(":scope > time-modification > normal-notes")?.textContent?.trim()).toBe("2");
    const tupletStart = firstNote?.querySelector(":scope > notations > tuplet[type=\"start\"]");
    expect(tupletStart).not.toBeNull();
    expect(tupletStart?.getAttribute("bracket")).toBe("yes");
    expect(thirdNote?.querySelector(":scope > notations > tuplet[type=\"stop\"]")).not.toBeNull();
  });

  it("handles MuseScore tuplet id references without nesting durations", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="2.06">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>2</sigN><sigD>4</sigD></TimeSig>
          <Tuplet id="1"><normalNotes>2</normalNotes><actualNotes>3</actualNotes></Tuplet>
          <Chord><Tuplet>1</Tuplet><durationType>eighth</durationType><Note><pitch>60</pitch></Note></Chord>
          <Chord><Tuplet>1</Tuplet><durationType>eighth</durationType><Note><pitch>62</pitch></Note></Chord>
          <Chord><Tuplet>1</Tuplet><durationType>eighth</durationType><Note><pitch>64</pitch></Note></Chord>
          <Tuplet id="2"><normalNotes>2</normalNotes><actualNotes>3</actualNotes></Tuplet>
          <Chord><Tuplet>2</Tuplet><durationType>eighth</durationType><Note><pitch>65</pitch></Note></Chord>
          <Chord><Tuplet>2</Tuplet><durationType>eighth</durationType><Note><pitch>67</pitch></Note></Chord>
          <Chord><Tuplet>2</Tuplet><durationType>eighth</durationType><Note><pitch>69</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const notes = Array.from(doc.querySelectorAll("part > measure > note"));
    const pitched = notes.filter((n) => n.querySelector(":scope > rest") === null);
    expect(pitched).toHaveLength(6);
    const durations = notes.map((n) => n.querySelector(":scope > duration")?.textContent?.trim());
    expect(durations.slice(0, 6)).toEqual(["160", "160", "160", "160", "160", "160"]);
    const start1 = pitched[0]?.querySelector(":scope > notations > tuplet[type=\"start\"]");
    const stop1 = pitched[2]?.querySelector(":scope > notations > tuplet[type=\"stop\"]");
    const start2 = pitched[3]?.querySelector(":scope > notations > tuplet[type=\"start\"]");
    const stop2 = pitched[5]?.querySelector(":scope > notations > tuplet[type=\"stop\"]");
    expect(start1).not.toBeNull();
    expect(stop1).not.toBeNull();
    expect(start2).not.toBeNull();
    expect(stop2).not.toBeNull();
    expect(start1?.getAttribute("number")).not.toBe(start2?.getAttribute("number"));
  });

  it("imports pickup measure len as implicit short measure", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure len="1/8">
        <irregular>1</irregular>
        <voice>
          <TimeSig><sigN>3</sigN><sigD>8</sigD></TimeSig>
          <Chord><durationType>16th</durationType><Note><pitch>76</pitch></Note></Chord>
          <Chord><durationType>16th</durationType><Note><pitch>75</pitch></Note></Chord>
        </voice>
      </Measure>
      <Measure>
        <voice>
          <Rest><durationType>quarter</durationType><dots>1</dots></Rest>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const firstMeasure = doc.querySelector("part > measure[number=\"0\"]");
    expect(firstMeasure?.getAttribute("implicit")).toBe("yes");
    const secondMeasure = doc.querySelector("part > measure:nth-of-type(2)");
    expect(secondMeasure?.getAttribute("number")).toBe("1");
    const durationTotal = Array.from(firstMeasure?.querySelectorAll(":scope > note > duration") ?? [])
      .reduce((sum, node) => sum + Number(node.textContent?.trim() || 0), 0);
    expect(durationTotal).toBe(240);
  });

  it("adds final light-heavy barline on the last measure even without explicit MuseScore end barline", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>
          <Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>
        </voice>
      </Measure>
      <Measure>
        <voice>
          <Chord><durationType>quarter</durationType><Note><pitch>62</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const lastMeasure = doc.querySelector("part > measure:last-of-type");
    expect(lastMeasure?.querySelector(":scope > barline[location=\"right\"] > bar-style")?.textContent?.trim()).toBe("light-heavy");
  });

  it("keeps written note type for tuplet notes (e.g. 16th triplet stays 16th)", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>
          <Tuplet><normalNotes>2</normalNotes><actualNotes>3</actualNotes></Tuplet>
          <Chord><durationType>16th</durationType><Note><pitch>60</pitch></Note></Chord>
          <Chord><durationType>16th</durationType><Note><pitch>62</pitch></Note></Chord>
          <Chord><durationType>16th</durationType><Note><pitch>64</pitch></Note></Chord>
          <endTuplet/>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const first = doc.querySelector("part > measure > note:nth-of-type(1)");
    expect(first?.querySelector(":scope > type")?.textContent?.trim()).toBe("16th");
    expect(first?.querySelector(":scope > duration")?.textContent?.trim()).toBe("80");
    expect(first?.querySelector(":scope > time-modification > actual-notes")?.textContent?.trim()).toBe("3");
    expect(first?.querySelector(":scope > time-modification > normal-notes")?.textContent?.trim()).toBe("2");
  });

  it("maps MuseScore BeamMode begin chain to MusicXML beam begin/continue/end", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>
          <Chord><BeamMode>begin</BeamMode><durationType>16th</durationType><Note><pitch>60</pitch></Note></Chord>
          <Chord><durationType>16th</durationType><Note><pitch>62</pitch></Note></Chord>
          <Chord><durationType>16th</durationType><Note><pitch>64</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const n1 = doc.querySelector("part > measure > note:nth-of-type(1)");
    const n2 = doc.querySelector("part > measure > note:nth-of-type(2)");
    const n3 = doc.querySelector("part > measure > note:nth-of-type(3)");
    expect(n1?.querySelector(":scope > beam[number=\"1\"]")?.textContent?.trim()).toBe("begin");
    expect(n2?.querySelector(":scope > beam[number=\"1\"]")?.textContent?.trim()).toBe("continue");
    expect(n3?.querySelector(":scope > beam[number=\"1\"]")?.textContent?.trim()).toBe("end");
  });

  it("keeps beaming across a rest when MuseScore BeamMode marks the rest lane", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>2</sigN><sigD>4</sigD></TimeSig>
          <Chord><BeamMode>begin</BeamMode><durationType>16th</durationType><Note><pitch>67</pitch></Note></Chord>
          <Rest><BeamMode>mid</BeamMode><durationType>16th</durationType></Rest>
          <Chord><durationType>16th</durationType><Note><pitch>69</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const n1 = doc.querySelector("part > measure > note:nth-of-type(1)");
    const n2 = doc.querySelector("part > measure > note:nth-of-type(2)");
    const n3 = doc.querySelector("part > measure > note:nth-of-type(3)");
    expect(n1?.querySelector(":scope > beam[number=\"1\"]")?.textContent?.trim()).toBe("begin");
    expect(n2?.querySelector(":scope > beam[number=\"1\"]")).toBeNull();
    expect(n3?.querySelector(":scope > beam[number=\"1\"]")?.textContent?.trim()).toBe("end");
  });

  it("includes the preceding chord when rest starts with BeamMode mid", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>2</sigN><sigD>4</sigD></TimeSig>
          <Chord><durationType>eighth</durationType><Note><pitch>67</pitch></Note></Chord>
          <Rest><BeamMode>mid</BeamMode><durationType>16th</durationType></Rest>
          <Chord><durationType>16th</durationType><Note><pitch>69</pitch></Note></Chord>
          <Chord><durationType>16th</durationType><Note><pitch>71</pitch></Note></Chord>
          <Chord><durationType>16th</durationType><Note><pitch>72</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const n1 = doc.querySelector("part > measure > note:nth-of-type(1)");
    const n2 = doc.querySelector("part > measure > note:nth-of-type(2)");
    const n3 = doc.querySelector("part > measure > note:nth-of-type(3)");
    const n4 = doc.querySelector("part > measure > note:nth-of-type(4)");
    const n5 = doc.querySelector("part > measure > note:nth-of-type(5)");
    expect(n1?.querySelector(":scope > beam[number=\"1\"]")?.textContent?.trim()).toBe("begin");
    expect(n2?.querySelector(":scope > beam[number=\"1\"]")).toBeNull();
    expect(n3?.querySelector(":scope > beam[number=\"1\"]")?.textContent?.trim()).toBe("end");
    expect(n4?.querySelector(":scope > beam[number=\"1\"]")?.textContent?.trim()).toBe("begin");
    expect(n5?.querySelector(":scope > beam[number=\"1\"]")?.textContent?.trim()).toBe("end");
  });

  it("does not infer beams when MuseScore BeamMode is absent and implicit-beam fill is disabled", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>3</sigN><sigD>8</sigD></TimeSig>
          <Chord><durationType>16th</durationType><Note><pitch>60</pitch></Note></Chord>
          <Chord><durationType>16th</durationType><Note><pitch>62</pitch></Note></Chord>
          <Chord><durationType>16th</durationType><Note><pitch>64</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, {
      sourceMetadata: false,
      debugMetadata: false,
      applyImplicitBeams: false,
    });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const n1 = doc.querySelector("part > measure > note:nth-of-type(1)");
    const n2 = doc.querySelector("part > measure > note:nth-of-type(2)");
    const n3 = doc.querySelector("part > measure > note:nth-of-type(3)");
    expect(n1?.querySelector(":scope > beam[number=\"1\"]")).toBeNull();
    expect(n2?.querySelector(":scope > beam[number=\"1\"]")).toBeNull();
    expect(n3?.querySelector(":scope > beam[number=\"1\"]")).toBeNull();
  });

  it("infers beams when MuseScore BeamMode is absent (default behavior)", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>6</sigN><sigD>8</sigD></TimeSig>
          <Chord><durationType>eighth</durationType><Note><pitch>60</pitch></Note></Chord>
          <Chord><durationType>eighth</durationType><Note><pitch>62</pitch></Note></Chord>
          <Chord><durationType>eighth</durationType><Note><pitch>64</pitch></Note></Chord>
          <Chord><durationType>eighth</durationType><Note><pitch>65</pitch></Note></Chord>
          <Chord><durationType>eighth</durationType><Note><pitch>67</pitch></Note></Chord>
          <Chord><durationType>eighth</durationType><Note><pitch>69</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, {
      sourceMetadata: false,
      debugMetadata: false,
    });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const n1 = doc.querySelector("part > measure > note:nth-of-type(1)");
    const n2 = doc.querySelector("part > measure > note:nth-of-type(2)");
    const n3 = doc.querySelector("part > measure > note:nth-of-type(3)");
    const n4 = doc.querySelector("part > measure > note:nth-of-type(4)");
    const n5 = doc.querySelector("part > measure > note:nth-of-type(5)");
    const n6 = doc.querySelector("part > measure > note:nth-of-type(6)");
    expect(n1?.querySelector(":scope > beam[number=\"1\"]")?.textContent?.trim()).toBe("begin");
    expect(n2?.querySelector(":scope > beam[number=\"1\"]")?.textContent?.trim()).toBe("continue");
    expect(n3?.querySelector(":scope > beam[number=\"1\"]")?.textContent?.trim()).toBe("end");
    expect(n4?.querySelector(":scope > beam[number=\"1\"]")?.textContent?.trim()).toBe("begin");
    expect(n5?.querySelector(":scope > beam[number=\"1\"]")?.textContent?.trim()).toBe("continue");
    expect(n6?.querySelector(":scope > beam[number=\"1\"]")?.textContent?.trim()).toBe("end");
  });

  it("imports MuseScore Slur spanner into MusicXML slur start/stop", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>
          <Chord>
            <durationType>16th</durationType>
            <Spanner type="Slur"><Slur/></Spanner>
            <Note><pitch>60</pitch></Note>
          </Chord>
          <Chord>
            <durationType>16th</durationType>
            <Spanner type="Slur"><prev/></Spanner>
            <Note><pitch>62</pitch></Note>
          </Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const n1 = doc.querySelector("part > measure > note:nth-of-type(1)");
    const n2 = doc.querySelector("part > measure > note:nth-of-type(2)");
    expect(n1?.querySelector(':scope > notations > slur[type="start"]')).not.toBeNull();
    expect(n2?.querySelector(':scope > notations > slur[type="stop"]')).not.toBeNull();
  });

  it("keeps slur matching across measure boundary for MuseScore Spanner Slur", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>
          <Chord>
            <durationType>16th</durationType>
            <Spanner type="Slur"><Slur/><next><location><fractions>5/16</fractions></location></next></Spanner>
            <Note><pitch>60</pitch></Note>
          </Chord>
        </voice>
      </Measure>
      <Measure>
        <voice>
          <Chord>
            <durationType>16th</durationType>
            <Spanner type="Slur"><prev><location><fractions>-5/16</fractions></location></prev></Spanner>
            <Note><pitch>64</pitch></Note>
          </Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const start = doc.querySelector("part > measure:nth-of-type(1) > note:nth-of-type(1) > notations > slur[type=\"start\"]");
    const stop = doc.querySelector("part > measure:nth-of-type(2) > note:nth-of-type(1) > notations > slur[type=\"stop\"]");
    expect(start).not.toBeNull();
    expect(stop).not.toBeNull();
    expect(start?.getAttribute("number")).toBe(stop?.getAttribute("number"));
  });

  it("imports MuseScore legacy chord-level Slur type start/stop with id", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="2.0">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <Slur id="2"><track>0</track></Slur>
        <voice>
          <TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>
          <Chord>
            <durationType>eighth</durationType>
            <Slur type="start" id="2"/>
            <Note><pitch>60</pitch></Note>
          </Chord>
          <Chord>
            <durationType>eighth</durationType>
            <Slur type="stop" id="2"/>
            <Note><pitch>62</pitch></Note>
          </Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const n1 = doc.querySelector("part > measure > note:nth-of-type(1)");
    const n2 = doc.querySelector("part > measure > note:nth-of-type(2)");
    expect(n1?.querySelector(':scope > notations > slur[type="start"][number="2"]')).not.toBeNull();
    expect(n2?.querySelector(':scope > notations > slur[type="stop"][number="2"]')).not.toBeNull();
  });

  it("imports MuseScore note tie markers into MusicXML tie/tied", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>
          <Chord>
            <durationType>quarter</durationType>
            <Note><pitch>60</pitch><Tie/></Note>
          </Chord>
          <Chord>
            <durationType>quarter</durationType>
            <Note><pitch>60</pitch><endSpanner/></Note>
          </Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const n1 = doc.querySelector("part > measure > note:nth-of-type(1)");
    const n2 = doc.querySelector("part > measure > note:nth-of-type(2)");
    expect(n1?.querySelector(':scope > tie[type="start"]')).not.toBeNull();
    expect(n1?.querySelector(':scope > notations > tied[type="start"]')).not.toBeNull();
    expect(n2?.querySelector(':scope > tie[type="stop"]')).not.toBeNull();
    expect(n2?.querySelector(':scope > notations > tied[type="stop"]')).not.toBeNull();
  });

  it("imports MuseScore chord articulation subtype into MusicXML articulations", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>
          <Chord>
            <durationType>eighth</durationType>
            <Articulation><subtype>articStaccatoBelow</subtype></Articulation>
            <Note><pitch>60</pitch></Note>
          </Chord>
          <Chord>
            <durationType>eighth</durationType>
            <Articulation><subtype>articTenutoAbove</subtype></Articulation>
            <Note><pitch>62</pitch></Note>
          </Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const n1 = doc.querySelector("part > measure > note:nth-of-type(1)");
    const n2 = doc.querySelector("part > measure > note:nth-of-type(2)");
    expect(n1?.querySelector(":scope > notations > articulations > staccato")).not.toBeNull();
    expect(n2?.querySelector(":scope > notations > articulations > tenuto")).not.toBeNull();
  });

  it("maps MuseScore left-hand pizzicato articulation into MusicXML technical stopped (+)", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>
          <Chord>
            <durationType>quarter</durationType>
            <Articulation><subtype>articLhPizzicatoAbove</subtype></Articulation>
            <Note><pitch>60</pitch></Note>
          </Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const stopped = doc.querySelector("part > measure > note > notations > technical > stopped");
    expect(stopped).not.toBeNull();
  });

  it("maps MuseScore technical articulations and note fingering/string into MusicXML technical", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>
          <Chord>
            <durationType>quarter</durationType>
            <Articulation><subtype>articUpBowAbove</subtype></Articulation>
            <Articulation><subtype>articDownBowAbove</subtype></Articulation>
            <Articulation><subtype>articOpenStringAbove</subtype></Articulation>
            <Articulation><subtype>articHarmonicAbove</subtype></Articulation>
            <Note><pitch>60</pitch><Fingering>1</Fingering><String>3</String></Note>
          </Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelector("part > measure > note > notations > technical > up-bow")).not.toBeNull();
    expect(doc.querySelector("part > measure > note > notations > technical > down-bow")).not.toBeNull();
    expect(doc.querySelector("part > measure > note > notations > technical > open-string")).not.toBeNull();
    expect(doc.querySelector("part > measure > note > notations > technical > harmonic")).not.toBeNull();
    expect(doc.querySelector("part > measure > note > notations > technical > fingering")?.textContent?.trim()).toBe("1");
    expect(doc.querySelector("part > measure > note > notations > technical > string")?.textContent?.trim()).toBe("3");
  });

  it("maps MuseScore brassMuteClosed ornament into MusicXML technical stopped", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>
          <Chord>
            <durationType>quarter</durationType>
            <Ornament><subtype>brassMuteClosed</subtype></Ornament>
            <Note><pitch>60</pitch></Note>
          </Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelector("part > measure > note > notations > technical > stopped")).not.toBeNull();
  });

  it("imports MuseScore Trill spanner into MusicXML ornaments trill-mark/wavy-line", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>2</sigN><sigD>4</sigD></TimeSig>
          <Spanner type="Trill"><Trill><subtype>trill</subtype></Trill><next><location><measures>1</measures></location></next></Spanner>
          <Chord><durationType>half</durationType><Note><pitch>60</pitch></Note></Chord>
        </voice>
      </Measure>
      <Measure>
        <voice>
          <Spanner type="Trill"><prev><location><measures>-1</measures></location></prev></Spanner>
          <Chord><durationType>quarter</durationType><Note><pitch>62</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const start = doc.querySelector("part > measure:nth-of-type(1) > note > notations > ornaments > wavy-line[type=\"start\"]");
    const stop = doc.querySelector("part > measure:nth-of-type(2) > note > notations > ornaments > wavy-line[type=\"stop\"]");
    expect(doc.querySelector("part > measure:nth-of-type(1) > note > notations > ornaments > trill-mark")).not.toBeNull();
    expect(start).not.toBeNull();
    expect(stop).not.toBeNull();
    expect(start?.getAttribute("number")).toBe(stop?.getAttribute("number"));
  });

  it("imports MuseScore chord Ornament trill into MusicXML trill-mark", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>
          <Chord>
            <durationType>quarter</durationType>
            <Ornament><subtype>ornamentTrill</subtype></Ornament>
            <Note><pitch>60</pitch></Note>
          </Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelector("part > measure > note > notations > ornaments > trill-mark")).not.toBeNull();
  });

  it("maps accidental near MuseScore chord Ornament trill to MusicXML accidental-mark", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>
          <Chord>
            <durationType>quarter</durationType>
            <Ornament><subtype>ornamentTrill</subtype></Ornament>
            <Note>
              <Accidental><subtype>accidentalFlat</subtype></Accidental>
              <pitch>59</pitch>
            </Note>
          </Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelector("part > measure > note > notations > ornaments > trill-mark")).not.toBeNull();
    expect(
      doc.querySelector("part > measure > note > notations > ornaments > accidental-mark")?.textContent?.trim()
    ).toBe("flat");
  });

  it("imports MuseScore Ottava spanner into MusicXML octave-shift direction", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>2</sigN><sigD>4</sigD></TimeSig>
          <Spanner type="Ottava"><Ottava><subtype>8va</subtype></Ottava><next><location><measures>1</measures></location></next></Spanner>
          <Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>
        </voice>
      </Measure>
      <Measure>
        <voice>
          <Spanner type="Ottava"><prev><location><measures>-1</measures></location></prev></Spanner>
          <Chord><durationType>quarter</durationType><Note><pitch>62</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const start = doc.querySelector("part > measure:nth-of-type(1) > direction > direction-type > octave-shift[type=\"start\"]");
    const stop = doc.querySelector("part > measure:nth-of-type(2) > direction > direction-type > octave-shift[type=\"stop\"]");
    expect(start).not.toBeNull();
    expect(stop).not.toBeNull();
    expect(start?.getAttribute("size")).toBe("8");
    expect(start?.getAttribute("number")).toBe(stop?.getAttribute("number"));
  });

  it("raises displayed pitch under Ottava while exporting octave-shift", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>2</sigN><sigD>4</sigD></TimeSig>
          <Spanner type="Ottava"><Ottava><subtype>8va</subtype></Ottava><next><location><measures>1</measures></location></next></Spanner>
          <Chord><durationType>quarter</durationType><Note><pitch>81</pitch></Note></Chord>
        </voice>
      </Measure>
      <Measure>
        <voice>
          <Spanner type="Ottava"><prev><location><measures>-1</measures></location></prev></Spanner>
          <Chord><durationType>quarter</durationType><Note><pitch>62</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const firstStep = doc.querySelector("part > measure:nth-of-type(1) > note > pitch > step")?.textContent?.trim();
    const firstOctave = doc.querySelector("part > measure:nth-of-type(1) > note > pitch > octave")?.textContent?.trim();
    expect(firstStep).toBe("A");
    expect(firstOctave).toBe("6");
    expect(doc.querySelector("part > measure:nth-of-type(1) > direction > direction-type > octave-shift[type=\"start\"]")).not.toBeNull();
  });

  it("keeps Ottava display shift active across measure boundaries including repeat barlines", () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="3.02">
  <Score>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <TimeSig><sigN>2</sigN><sigD>4</sigD></TimeSig>
          <Spanner type="Ottava"><Ottava><subtype>8va</subtype></Ottava><next><location><measures>2</measures></location></next></Spanner>
          <Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>
        </voice>
      </Measure>
      <Measure endRepeat="1">
        <voice>
          <Chord><durationType>quarter</durationType><Note><pitch>62</pitch></Note></Chord>
        </voice>
      </Measure>
      <Measure>
        <voice>
          <Spanner type="Ottava"><prev><location><measures>-2</measures></location></prev></Spanner>
          <Chord><durationType>quarter</durationType><Note><pitch>64</pitch></Note></Chord>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
    const xml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const m1Oct = doc.querySelector("part > measure:nth-of-type(1) > note > pitch > octave")?.textContent?.trim();
    const m2Oct = doc.querySelector("part > measure:nth-of-type(2) > note > pitch > octave")?.textContent?.trim();
    expect(m1Oct).toBe("5");
    expect(m2Oct).toBe("5");
    expect(doc.querySelector("part > measure:nth-of-type(1) > direction > direction-type > octave-shift[type=\"start\"]")).not.toBeNull();
    expect(doc.querySelector("part > measure:nth-of-type(3) > direction > direction-type > octave-shift[type=\"stop\"]")).not.toBeNull();
  });

  it("keeps sample7 measure 3-4 pitch spelling and accidentals on roundtrip", () => {
    const srcXml = readFileSync(resolve(process.cwd(), "src", "samples", "musicxml", "sample7.musicxml"), "utf-8");
    const srcDoc = parseMusicXmlDocument(srcXml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const mscx = exportMusicXmlDomToMuseScore(srcDoc);
    const dstXml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const dstDoc = parseMusicXmlDocument(dstXml);
    expect(dstDoc).not.toBeNull();
    if (!dstDoc) return;

    const srcEvents = collectMeasurePitchEvents(srcDoc, 3, 4);
    const dstEvents = collectMeasurePitchEvents(dstDoc, 3, 4);
    expect(dstEvents).toEqual(srcEvents);
  }, 10000);

  it("roundtrips MusicXML transpose through MuseScore Instrument transpose", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Clarinet in A</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
        <transpose><diatonic>-2</diatonic><chromatic>-3</chromatic></transpose>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const sourceDoc = parseMusicXmlDocument(xml);
    expect(sourceDoc).not.toBeNull();
    if (!sourceDoc) return;
    const mscx = exportMusicXmlDomToMuseScore(sourceDoc);
    expect(mscx).toContain("<transposeDiatonic>-2</transposeDiatonic>");
    expect(mscx).toContain("<transposeChromatic>-3</transposeChromatic>");

    const roundtrip = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const outDoc = parseMusicXmlDocument(roundtrip);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > attributes > transpose > diatonic")?.textContent?.trim()).toBe("-2");
    expect(outDoc.querySelector("part > measure > attributes > transpose > chromatic")?.textContent?.trim()).toBe("-3");
  });

  it("keeps sample7 measure 7 staff 4 natural accidental on roundtrip", () => {
    const srcXml = readFileSync(resolve(process.cwd(), "src", "samples", "musicxml", "sample7.musicxml"), "utf-8");
    const srcDoc = parseMusicXmlDocument(srcXml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const mscx = exportMusicXmlDomToMuseScore(srcDoc);
    const dstXml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const dstDoc = parseMusicXmlDocument(dstXml);
    expect(dstDoc).not.toBeNull();
    if (!dstDoc) return;

    const srcEvents = collectMeasurePitchEvents(srcDoc, 7, 7).filter((e) => e.staff === "4");
    const dstEvents = collectMeasurePitchEvents(dstDoc, 7, 7).filter((e) => e.staff === "4");
    const srcNatural = srcEvents.find((e) => e.step === "B" && e.octave === "3" && e.accidental === "natural");
    const dstNatural = dstEvents.find((e) => e.step === "B" && e.octave === "3" && e.accidental === "natural");
    expect(srcNatural).toBeDefined();
    expect(dstNatural).toBeDefined();
  }, 15000);
});