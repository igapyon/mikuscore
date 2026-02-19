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

  it("roundtrip of same-staff multi-voice score should not trigger MEASURE_OVERFULL", () => {
    const multiVoiceXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Piano RH</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <backup><duration>3840</duration></backup>
      <note><pitch><step>G</step><octave>3</octave></pitch><duration>1920</duration><voice>2</voice><type>half</type></note>
      <note><pitch><step>A</step><octave>3</octave></pitch><duration>1920</duration><voice>2</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;

    const srcDoc = parseMusicXmlDocument(multiVoiceXml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    const xml = convertAbcToMusicXml(abc);

    const core = new ScoreCore();
    core.load(xml);
    const save = core.save();
    expect(save.ok).toBe(true);
  });

  it("ABC import reflows overfull measure content to avoid MEASURE_OVERFULL", () => {
    const overfullAbc = `X:1
T:Overfull
M:4/4
L:1/8
K:C
V:1
V:1
C D E F G A B c d |`;

    const xml = convertAbcToMusicXml(overfullAbc);
    const core = new ScoreCore();
    core.load(xml);
    const save = core.save();
    expect(save.ok).toBe(true);

    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const measureCount = outDoc.querySelectorAll("part > measure").length;
    expect(measureCount).toBeGreaterThanOrEqual(2);
  });

  it("ABC->MusicXML parses trill decoration and grace notes", () => {
    const abc = `X:1
T:Ornament test
M:4/4
L:1/8
K:C
V:1
{g}!trill!a2 b2 c2 d2 |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes.length).toBeGreaterThanOrEqual(5);
    expect(notes[0]?.querySelector(":scope > grace")).not.toBeNull();
    const principal = notes.find((n) => n.querySelector(":scope > grace") === null);
    expect(principal?.querySelector(":scope > notations > ornaments > trill-mark")).not.toBeNull();

    const core = new ScoreCore();
    core.load(xml);
    const save = core.save();
    expect(save.ok).toBe(true);
  });

  it("ABC->MusicXML parses staccato decoration", () => {
    const abc = `X:1
T:Staccato test
M:4/4
L:1/8
K:C
V:1
!staccato!c2 d2 e2 f2 |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > articulations > staccato")).not.toBeNull();
  });

  it("ABC->MusicXML parses slur notation", () => {
    const abc = `X:1
T:Slur test
M:4/4
L:1/8
K:C
V:1
(c2 d2) e2 f2 |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    const firstPitched = notes.find((n) => n.querySelector(":scope > rest") === null);
    const secondPitched = notes.filter((n) => n.querySelector(":scope > rest") === null)[1];
    expect(firstPitched?.querySelector(':scope > notations > slur[type="start"]')).not.toBeNull();
    expect(secondPitched?.querySelector(':scope > notations > slur[type="stop"]')).not.toBeNull();
  });

  it("MusicXML->ABC exports trill decoration and grace notes", () => {
    const xmlWithOrnaments = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Part 1</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <grace/>
        <pitch><step>G</step><octave>4</octave></pitch>
        <voice>1</voice><type>eighth</type>
      </note>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>1920</duration>
        <voice>1</voice><type>half</type>
        <notations><ornaments><trill-mark/></ornaments></notations>
      </note>
      <note>
        <rest/><duration>1920</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithOrnaments);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!trill!");
    expect(abc).toMatch(/\{[^}]+\}/);

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > grace")).not.toBeNull();
    expect(outDoc.querySelector("note > notations > ornaments > trill-mark")).not.toBeNull();
  });

  it("MusicXML->ABC exports trill when encoded as ornaments wavy-line start", () => {
    const xmlWithWavyTrill = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Part 1</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>1920</duration>
        <voice>1</voice><type>half</type>
        <notations><ornaments><wavy-line type="start"/></ornaments></notations>
      </note>
      <note>
        <rest/><duration>1920</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithWavyTrill);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!trill!");
  });

  it("MusicXML->ABC exports staccato decoration and roundtrips it", () => {
    const xmlWithStaccato = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Part 1</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1920</duration>
        <voice>1</voice><type>half</type>
        <notations><articulations><staccato/></articulations></notations>
      </note>
      <note>
        <rest/><duration>1920</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithStaccato);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!staccato!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > articulations > staccato")).not.toBeNull();
  });

  it("MusicXML->ABC exports slur notation and roundtrips it", () => {
    const xmlWithSlur = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Part 1</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1920</duration>
        <voice>1</voice><type>half</type>
        <notations><slur type="start"/></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>1920</duration>
        <voice>1</voice><type>half</type>
        <notations><slur type="stop"/></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithSlur);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("(");
    expect(abc).toContain(")");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector('note > notations > slur[type="start"]')).not.toBeNull();
    expect(outDoc.querySelector('note > notations > slur[type="stop"]')).not.toBeNull();
  });

  it("MusicXML->ABC keeps explicit accidental when lane key is unknown", () => {
    const xmlWithoutKeyButWithSharp = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Part 1</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>F</step><alter>1</alter><octave>4</octave></pitch>
        <duration>1920</duration>
        <voice>1</voice><type>half</type>
        <accidental>sharp</accidental>
      </note>
      <note>
        <rest/><duration>1920</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithoutKeyButWithSharp);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("^F");
  });

  it("MusicXML->ABC does not emit redundant natural in C major", () => {
    const xmlWithRedundantNatural = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Part 1</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>960</duration>
        <voice>1</voice><type>quarter</type>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/><duration>2880</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithRedundantNatural);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).not.toContain("=D");
  });

  it("MusicXML->ABC stores trill accidental-mark in mikuscore comment and restores it", () => {
    const xmlWithTrillWidth = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Part 1</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1920</duration>
        <voice>1</voice><type>half</type>
        <notations><ornaments><trill-mark/><accidental-mark>sharp</accidental-mark></ornaments></notations>
      </note>
      <note>
        <rest/><duration>1920</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithTrillWidth);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!trill!");
    expect(abc).toContain("%@mks trill");
    expect(abc).toContain("upper=sharp");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > ornaments > accidental-mark")?.textContent?.trim()).toBe("sharp");
  });

  it("MusicXML->ABC->MusicXML preserves per-part key signatures via mks key hints", () => {
    const xmlWithMixedPartKeys = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Top</part-name></score-part>
    <score-part id="P2"><part-name>Bottom</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>3</fifths></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
    <measure number="2">
      <attributes><key><fifths>0</fifths></key></attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
    <measure number="2">
      <attributes><key><fifths>3</fifths></key></attributes>
      <note><pitch><step>A</step><octave>2</octave></pitch><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithMixedPartKeys);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("%@mks key voice=P1 measure=1 fifths=3");
    expect(abc).toContain("%@mks key voice=P2 measure=1 fifths=0");
    expect(abc).toContain("%@mks key voice=P1 measure=2 fifths=0");
    expect(abc).toContain("%@mks key voice=P2 measure=2 fifths=3");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const parts = Array.from(outDoc.querySelectorAll("part"));
    expect(parts.length).toBeGreaterThanOrEqual(2);
    const part1 = parts[0];
    const part2 = parts[1];
    expect(part1.querySelector('measure[number="1"] > attributes > key > fifths')?.textContent?.trim()).toBe("3");
    expect(part1.querySelector('measure[number="2"] > attributes > key > fifths')?.textContent?.trim()).toBe("0");
    expect(part2.querySelector('measure[number="1"] > attributes > key > fifths')?.textContent?.trim()).toBe("0");
    expect(part2.querySelector('measure[number="2"] > attributes > key > fifths')?.textContent?.trim()).toBe("3");
  });

  it("ABC->MusicXML keeps first %@mks key hint when duplicates exist for same voice and measure", () => {
    const abcWithDuplicateKeyHints = `X:1
T:Duplicate key hint
M:3/4
L:1/8
K:C
V:P1 name="clarinet in A" clef=treble
V:P2 name="violino I" clef=treble
V:P1
c2 d2 e2 |
V:P2
z6 |
%@mks key voice=P1 measure=1 fifths=0
%@mks key voice=P2 measure=1 fifths=3
%@mks key voice=P2 measure=1 fifths=0
`;

    const xml = convertAbcToMusicXml(abcWithDuplicateKeyHints);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const parts = Array.from(outDoc.querySelectorAll("part"));
    expect(parts.length).toBe(2);
    expect(parts[0].querySelector('measure[number="1"] > attributes > key > fifths')?.textContent?.trim()).toBe("0");
    expect(parts[1].querySelector('measure[number="1"] > attributes > key > fifths')?.textContent?.trim()).toBe("3");
  });

  it("MusicXML->ABC emits initial %@mks key hints for each lane with explicit measure key", () => {
    const xmlWithSharedKey = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Upper</part-name></score-part>
    <score-part id="P2"><part-name>Lower</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>1</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>1</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>G</step><octave>2</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithSharedKey);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("%@mks key voice=P1 measure=1 fifths=1");
    expect(abc).toContain("%@mks key voice=P2 measure=1 fifths=1");
    expect(abc).not.toContain("%@mks key voice=P1 measure=2 fifths=0");
    expect(abc).not.toContain("%@mks key voice=P2 measure=2 fifths=0");
  });

  it("MusicXML->ABC emits natural against lane key signature (A major G->=G)", () => {
    const xmlWithNaturalAgainstKey = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Part 1</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>3</fifths></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>2880</duration>
        <voice>1</voice>
        <type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithNaturalAgainstKey);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("=G");
  });

  it("MusicXML->ABC uses per-part initial key for accidental emission", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Part 1</part-name></score-part>
    <score-part id="P2"><part-name>Part 2</part-name></score-part>
    <score-part id="P3"><part-name>Part 3</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>3</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
  <part id="P3">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>3</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type><accidental>natural</accidental></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    const p3Block = abc
      .split("\n")
      .slice(abc.split("\n").findIndex((line) => line.trim() === "V:P3"))
      .slice(0, 2)
      .join("\n");
    expect(p3Block).toContain("=G");
  });

  it("MusicXML->ABC emits mks metadata for measure/repeat/transpose and tuplet syntax", () => {
    const xmlWithMeasureMeta = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Clarinet in A</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="0" implicit="yes">
      <barline location="left"><repeat direction="forward"/></barline>
      <attributes>
        <divisions>960</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
        <transpose><diatonic>-2</diatonic><chromatic>-3</chromatic></transpose>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
    <measure number="1">
      <note>
        <pitch><step>D</step><octave>5</octave></pitch>
        <duration>320</duration><voice>1</voice><type>16th</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="start"/></notations>
      </note>
      <note>
        <pitch><step>E</step><octave>5</octave></pitch>
        <duration>320</duration><voice>1</voice><type>16th</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
      </note>
      <note>
        <pitch><step>F</step><octave>5</octave></pitch>
        <duration>320</duration><voice>1</voice><type>16th</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="stop"/></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
      <barline location="right"><repeat direction="backward" times="2"/></barline>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithMeasureMeta);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("%@mks transpose voice=P1 chromatic=-3 diatonic=-2");
    expect(abc).toContain("%@mks measure voice=P1 measure=1 number=0 implicit=1 repeat=forward");
    expect(abc).toContain("%@mks measure voice=P1 measure=2 number=1 implicit=0 repeat=backward times=2");
    expect(abc).toContain("(3:2:3");
    expect(abc).toContain("(3:2:3d");
    expect(abc).not.toContain("(3:2:3d2/3");
  });

  it("ABC->MusicXML restores measure/repeat/transpose metadata and tuplet tags", () => {
    const abcWithMeta = `X:1
T:Meta restore
M:3/4
L:1/8
K:C
V:P1 name="Clarinet in A" clef=treble
V:P1
c2 z4 | (3:2:3 d/2 e/2 f/2 z4 |
%@mks transpose voice=P1 chromatic=-3 diatonic=-2
%@mks measure voice=P1 measure=1 number=0 implicit=1 repeat=forward
%@mks measure voice=P1 measure=2 number=1 implicit=0 repeat=backward times=2
`;
    const xml = convertAbcToMusicXml(abcWithMeta);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure[number="0"]')?.getAttribute("implicit")).toBe("yes");
    expect(outDoc.querySelector('part > measure[number="0"] > barline[location="left"] > repeat')?.getAttribute("direction")).toBe("forward");
    expect(outDoc.querySelector('part > measure[number="1"] > barline[location="right"] > repeat')?.getAttribute("direction")).toBe("backward");
    expect(outDoc.querySelector('part > measure[number="1"] > barline[location="right"] > repeat')?.getAttribute("times")).toBe("2");
    expect(outDoc.querySelector("part > measure > attributes > transpose > chromatic")?.textContent?.trim()).toBe("-3");
    expect(outDoc.querySelector("part > measure > attributes > transpose > diatonic")?.textContent?.trim()).toBe("-2");
    expect(outDoc.querySelector('part > measure[number="1"] note > time-modification > actual-notes')?.textContent?.trim()).toBe("3");
    expect(outDoc.querySelector('part > measure[number="1"] note > notations > tuplet[type="start"]')).not.toBeNull();
    expect(outDoc.querySelector('part > measure[number="1"] note > notations > tuplet[type="stop"]')).not.toBeNull();
  });

  it("MusicXML->ABC does not split a separate lane for grace notes missing voice", () => {
    const xmlWithGraceNoVoice = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Part 1</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <grace/>
        <pitch><step>D</step><octave>5</octave></pitch>
        <type>eighth</type>
      </note>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch>
        <duration>1920</duration>
        <voice>1</voice><type>half</type>
      </note>
      <note>
        <rest/><duration>1920</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const srcDoc = parseMusicXmlDocument(xmlWithGraceNoVoice);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("{d}");
    expect(abc).not.toContain("V:P1_v2");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelectorAll("part").length).toBe(1);
    expect(outDoc.querySelector("part > measure > note > grace")).not.toBeNull();
  });
});
