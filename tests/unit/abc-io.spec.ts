// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { convertAbcToMusicXml, exportMusicXmlDomToAbc } from "../../src/ts/abc-io";
import { parseMusicXmlDocument } from "../../src/ts/musicxml-io";
import { ScoreCore } from "../../core/ScoreCore";
import { loadFixture } from "./fixtureLoader";

const BASE_XML = loadFixture("base.musicxml");

describe("ABC I/O compatibility", () => {
  it("roundtrip: exported ABC can be converted back to MusicXML", () => {
    const srcDoc = parseMusicXmlDocument(BASE_XML);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc.trim().length).toBeGreaterThan(0);

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
  });

  it("ABC->MusicXML conversion must not emit voice/layer 0", () => {
    const srcDoc = parseMusicXmlDocument(BASE_XML);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const voices = Array.from(outDoc.querySelectorAll("note > voice")).map((v) =>
      (v.textContent || "").trim()
    );
    expect(voices.length).toBeGreaterThan(0);
    expect(voices.every((v) => /^[1-9]\d*$/.test(v))).toBe(true);
  });

  it("roundtrip of grand staff score should not trigger MEASURE_OVERFULL", () => {
    const grandStaffXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><rest measure="yes"/><duration>3840</duration><voice>1</voice><staff>1</staff><type>whole</type></note>
      <backup><duration>3840</duration></backup>
      <note><rest measure="yes"/><duration>3840</duration><voice>1</voice><staff>2</staff><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;

    const srcDoc = parseMusicXmlDocument(grandStaffXml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    const xml = convertAbcToMusicXml(abc);
    const core = new ScoreCore();
    core.load(xml);
    const save = core.save();
    expect(save.ok).toBe(true);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelectorAll("part").length).toBeGreaterThanOrEqual(2);
  });

  it("roundtrip preserves tempo via ABC Q header", () => {
    const xmlWithTempo = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Part 1</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction>
        <direction-type>
          <metronome>
            <beat-unit>quarter</beat-unit>
            <per-minute>220</per-minute>
          </metronome>
        </direction-type>
        <sound tempo="220"/>
      </direction>
      <note><rest/><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithTempo);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("Q:1/4=220");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const soundTempo = outDoc.querySelector("part > measure > direction > sound")?.getAttribute("tempo");
    expect(Number(soundTempo)).toBe(220);
  });
});
