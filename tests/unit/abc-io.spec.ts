/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

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

  it("ABC->MusicXML writes mks:dbg:abc:meta miscellaneous fields by default", () => {
    const abc = `X:1
T:Debug test
M:4/4
L:1/4
K:C
C D E F |`;
    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const fields = Array.from(
      outDoc.querySelectorAll('part > measure > attributes > miscellaneous > miscellaneous-field[name^="mks:dbg:abc:meta"]')
    );
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.some((field) => (field.textContent || "").includes("st=C"))).toBe(true);
    expect(
      outDoc.querySelector('part > measure > attributes > miscellaneous > miscellaneous-field[name="mks:src:abc:raw-truncated"]')
        ?.textContent
    ).toBe("0");
    expect(
      outDoc.querySelector('part > measure > attributes > miscellaneous > miscellaneous-field[name="mks:src:abc:raw-0001"]')
        ?.textContent
    ).toContain("X:1");
  });

  it("ABC->MusicXML can disable mks:dbg:abc:meta miscellaneous fields", () => {
    const abc = `X:1
T:Debug test
M:4/4
L:1/4
K:C
C D E F |`;
    const xml = convertAbcToMusicXml(abc, { debugMetadata: false });
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(
      outDoc.querySelector('part > measure > attributes > miscellaneous > miscellaneous-field[name^="mks:dbg:abc:meta"]')
    ).toBeNull();
  });

  it("ABC->MusicXML pretty-prints output in debug mode like MIDI import", () => {
    const abc = `X:1
T:Pretty test
M:4/4
L:1/4
K:C
C D E F |`;
    const xmlPretty = convertAbcToMusicXml(abc, { debugMetadata: true });
    const xmlCompact = convertAbcToMusicXml(abc, { debugMetadata: true, debugPrettyPrint: false });
    expect(xmlPretty.includes("\n")).toBe(true);
    expect(xmlCompact.includes("\n")).toBe(false);
  });

  it("ABC->MusicXML parses slash length shorthand including //", () => {
    const abc = `X:1
T:Slash shorthand
M:4/4
L:1/8
K:C
C/D/E/F/ G/F/E/D/ C//D//E//F// G//F//E//D// C2 |`;
    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes.length).toBe(17);
    expect(notes[0]?.querySelector(":scope > duration")?.textContent?.trim()).toBe("240");
    expect(notes[8]?.querySelector(":scope > duration")?.textContent?.trim()).toBe("120");
    expect(notes[16]?.querySelector(":scope > duration")?.textContent?.trim()).toBe("960");
  });

  it("ABC->MusicXML parses numerator-slash shorthand in notes, chords, and grace groups", () => {
    const abc = `X:1
T:Numerator slash shorthand
M:4/4
L:1/8
K:C
V:1
C3/ D | [CE]3/ G | {/g3/}a2 z2 |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > duration")?.textContent?.trim()).toBe("720");
    expect(notes[2]?.querySelector(":scope > duration")?.textContent?.trim()).toBe("720");
    expect(outDoc.querySelector("part > measure:nth-of-type(3) > note > grace")).not.toBeNull();
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

  it("MusicXML->ABC exports metronome beat unit into Q header", () => {
    const xmlWithHalfTempo = `<?xml version="1.0" encoding="UTF-8"?>
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
            <beat-unit>half</beat-unit>
            <per-minute>72</per-minute>
          </metronome>
        </direction-type>
        <sound tempo="144"/>
      </direction>
      <note><rest/><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithHalfTempo);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("Q:1/2=72");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const soundTempo = outDoc.querySelector("part > measure > direction > sound")?.getAttribute("tempo");
    expect(Number(soundTempo)).toBe(144);
  });

  it("MusicXML->ABC prefers the last leading tempo in measure 1 when multiple tempo directions exist", () => {
    const xmlWithCompetingTempo = `<?xml version="1.0" encoding="UTF-8"?>
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
        <direction-type><words>Allegretto moderato</words></direction-type>
        <sound tempo="116"/>
      </direction>
      <direction>
        <sound tempo="90"/>
      </direction>
      <note><rest/><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithCompetingTempo);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("Q:1/4=90");
    expect(abc).not.toContain("Q:1/4=116");
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

  it("ABC import infers bass clef from low notes when clef is omitted", () => {
    const abc = `X:1
T:Clef inference
M:4/4
L:1/4
K:C
V:1
C,, D,, E,, F,, |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const sign = outDoc.querySelector("part > measure > attributes > clef > sign")?.textContent?.trim();
    const line = outDoc.querySelector("part > measure > attributes > clef > line")?.textContent?.trim();
    expect(sign).toBe("F");
    expect(line).toBe("4");
  });

  it("ABC import accepts bare clef names in V: directives", () => {
    const abc = `X:1
T:Voice clef shorthand
M:4/4
L:1/4
K:C
V:1 treble
C D E F |
V:2 bass
C,, D,, E,, F,, |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const parts = Array.from(outDoc.querySelectorAll("part"));
    expect(parts.length).toBe(2);
    expect(parts[0]?.querySelector("measure > attributes > clef > sign")?.textContent?.trim()).toBe("G");
    expect(parts[0]?.querySelector("measure > attributes > clef > line")?.textContent?.trim()).toBe("2");
    expect(parts[1]?.querySelector("measure > attributes > clef > sign")?.textContent?.trim()).toBe("F");
    expect(parts[1]?.querySelector("measure > attributes > clef > line")?.textContent?.trim()).toBe("4");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')).toBeNull();
  });

  it("ABC import keeps same-line body text after a bare V: clef shorthand", () => {
    const abc = `X:1
T:Voice clef shorthand inline body
M:2/4
L:1/4
K:C
V:1 bass C,, D,, |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector("part > measure > attributes > clef > sign")?.textContent?.trim()).toBe("F");
    expect(outDoc.querySelectorAll("part > measure note").length).toBe(2);
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')).toBeNull();
  });

  it("ABC import accepts bare V: clef aliases c3 and c4", () => {
    const abc = `X:1
T:Voice clef alias shorthand
M:2/4
L:1/4
K:C
V:1 c3
C D |
V:2 c4
E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const parts = Array.from(outDoc.querySelectorAll("part"));
    expect(parts.length).toBe(2);
    expect(parts[0]?.querySelector("measure > attributes > clef > sign")?.textContent?.trim()).toBe("C");
    expect(parts[0]?.querySelector("measure > attributes > clef > line")?.textContent?.trim()).toBe("3");
    expect(parts[1]?.querySelector("measure > attributes > clef > sign")?.textContent?.trim()).toBe("C");
    expect(parts[1]?.querySelector("measure > attributes > clef > line")?.textContent?.trim()).toBe("4");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')).toBeNull();
  });

  it("ABC import warns on unsupported bare V: tail words instead of parsing them as notes", () => {
    const abc = `X:1
T:Voice tail warning
M:4/4
L:1/4
K:C
V:1 bassoon
C D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelectorAll("part > measure note").length).toBe(4);
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped unsupported V: directive tail token: bassoon"
    );
  });

  it("ABC import applies supported V: transpose property as chromatic transpose", () => {
    const abc = `X:1
T:Voice transpose
M:4/4
L:1/4
K:C
V:1 name="Clarinet in A" clef=treble transpose=-3
C D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector("part > measure > attributes > transpose > chromatic")?.textContent?.trim()).toBe("-3");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')).toBeNull();
  });

  it("ABC import warns on unsupported standard V: properties instead of treating them as supported metadata", () => {
    const abc = `X:1
T:Unsupported V property warning
M:4/4
L:1/4
K:C
V:1 name="Upper" staves=2 middle=c
C D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelectorAll("part > measure note").length).toBe(4);
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("2");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped unsupported V: property: staves"
    );
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0002"]')?.textContent).toContain(
      "Skipped unsupported V: property: middle"
    );
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
    expect(
      outDoc.querySelector(
        'part > measure > attributes > miscellaneous > miscellaneous-field[name="mks:diag:count"]'
      )?.textContent
    ).toBe("1");
    expect(
      outDoc.querySelector(
        'part > measure > attributes > miscellaneous > miscellaneous-field[name="mks:diag:0001"]'
      )?.textContent
    ).toContain("code=OVERFULL_REFLOWED");
  });

  it("ABC import can disable overfull compatibility reflow", () => {
    const overfullAbc = `X:1
T:Overfull strict
M:4/4
L:1/8
K:C
V:1
C D E F G A B c d |`;
    const xml = convertAbcToMusicXml(overfullAbc, { overfullCompatibilityMode: false });
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')).toBeNull();

    const core = new ScoreCore();
    core.load(xml);
    const save = core.save();
    expect(save.ok).toBe(false);
    expect(save.diagnostics[0]?.code).toBe("MEASURE_OVERFULL");
  });

  it("records ABC parser fallback warnings into diag:* fields", () => {
    const abc = `X:1
T:Bad header
M:not-a-meter
L:1/8
K:C
V:1
C D E F |`;
    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')).not.toBeNull();
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "code=ABC_IMPORT_WARNING"
    );
  });

  it("ABC->MusicXML supports inline [K:...] field changes", () => {
    const abc = `X:1
T:Inline key change
M:4/4
L:1/8
K:C
C D E F | [K:G] G A B c |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure[number="2"] > attributes > key > fifths')?.textContent?.trim()).toBe("1");
  });

  it("ABC->MusicXML accepts continued body lines with standalone K: field changes", () => {
    const abc = `X:1
T:Keys and modes
M:4/4
L:1/8
K:C
T:C/CMAJOR/Cmajor
CDEF GABc |\\
K:CMAJOR
CDEF GABc |\\
K:Cmajor
CDEF GABc |]`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const measure2Key = outDoc.querySelector('part > measure[number="2"] > attributes > key > fifths')?.textContent?.trim();
    const measure3Key = outDoc.querySelector('part > measure[number="3"] > attributes > key > fifths')?.textContent?.trim();
    expect(measure2Key).toBe("0");
    expect(measure3Key).toBe("0");
  });

  it("ABC->MusicXML warns and skips unsupported continued header-field text instead of parsing it as body", () => {
    const abc = `X:1
T:Continued title\\
still title text
M:4/4
L:1/8
K:C
C D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("2");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Unsupported continued field after T:"
    );
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0002"]')?.textContent).toContain(
      "Skipped unsupported continued field text for T:"
    );
    expect(Array.from(outDoc.querySelectorAll("part > measure > note")).length).toBe(4);
  });

  it("ABC->MusicXML supports inline [M:...] field changes", () => {
    const abc = `X:1
T:Inline meter change
M:4/4
L:1/8
K:C
C D E F | [M:3/4] G A B |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure[number="2"] > attributes > time > beats')?.textContent?.trim()).toBe("3");
    expect(outDoc.querySelector('part > measure[number="2"] > attributes > time > beat-type')?.textContent?.trim()).toBe("4");
  });

  it("ABC->MusicXML applies inline [L:...] field changes to subsequent note durations", () => {
    const abc = `X:1
T:Inline unit length change
M:4/4
L:1/8
K:C
C D | [L:1/4] E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstMeasureFirstNote = outDoc.querySelector('part > measure[number="1"] > note:nth-of-type(1) > duration');
    const secondMeasureFirstNote = outDoc.querySelector('part > measure[number="2"] > note:nth-of-type(1) > duration');
    expect(firstMeasureFirstNote?.textContent?.trim()).toBe("480");
    expect(secondMeasureFirstNote?.textContent?.trim()).toBe("960");
  });

  it("ABC->MusicXML supports inline [Q:...] field changes", () => {
    const abc = `X:1
T:Inline tempo change
M:4/4
L:1/8
K:C
C D E F | [Q:1/4=132] G A B c |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure[number="2"] > direction > direction-type > metronome > per-minute')?.textContent?.trim()).toBe("132");
    expect(outDoc.querySelector('part > measure[number="2"] > direction > sound')?.getAttribute("tempo")).toBe("132");
  });

  it("ABC->MusicXML preserves quoted annotations as direction words", () => {
    const abc = `X:1
T:Quoted annotation
M:4/4
L:1/8
K:C
"Am"C D "rit."E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const words = Array.from(outDoc.querySelectorAll("part > measure > direction > direction-type > words"))
      .map((node) => node.textContent?.trim());
    expect(words).toContain("rit.");
    expect(outDoc.querySelector("part > measure > harmony")).not.toBeNull();
    expect(outDoc.querySelectorAll("part > measure > note").length).toBeGreaterThanOrEqual(4);
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')).toBeNull();
  });

  it("ABC->MusicXML maps simple quoted chord symbols to MusicXML harmony", () => {
    const abc = `X:1
T:Quoted chord symbol
M:4/4
L:1/8
K:C
"Am"C D "rit."E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const harmony = outDoc.querySelector("part > measure > harmony");
    expect(harmony).not.toBeNull();
    expect(harmony?.querySelector(":scope > root > root-step")?.textContent?.trim()).toBe("A");
    expect(harmony?.querySelector(":scope > kind")?.textContent?.trim()).toBe("minor");
    expect(harmony?.querySelector(":scope > kind")?.getAttribute("text")).toBe("Am");

    const words = Array.from(outDoc.querySelectorAll("part > measure > direction > direction-type > words"))
      .map((node) => node.textContent?.trim());
    expect(words).toContain("rit.");
    expect(words).not.toContain("Am");
  });

  it("ABC->MusicXML maps common extended quoted chord symbols to MusicXML harmony", () => {
    const abc = `X:1
T:Extended chord symbols
M:4/4
L:1/8
K:C
"C6"C "Dm6"D "G9"E "Fmaj9"F |`;

    const outDoc = parseMusicXmlDocument(convertAbcToMusicXml(abc));
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const harmonies = Array.from(outDoc.querySelectorAll("part > measure > harmony"));
    expect(harmonies.map((node) => node.querySelector(":scope > kind")?.getAttribute("text"))).toEqual([
      "C6",
      "Dm6",
      "G9",
      "Fmaj9",
    ]);
    expect(harmonies.map((node) => node.querySelector(":scope > kind")?.textContent?.trim())).toEqual([
      "major-sixth",
      "minor-sixth",
      "dominant-ninth",
      "major-ninth",
    ]);
  });

  it("ABC->MusicXML maps richer quoted chord symbols including slash chords to MusicXML harmony", () => {
    const abc = `X:1
T:Richer chord symbols
M:4/4
L:1/8
K:C
"Em9"C "G11/B"D "A13"E "D7sus4/F#"F |`;

    const outDoc = parseMusicXmlDocument(convertAbcToMusicXml(abc));
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const harmonies = Array.from(outDoc.querySelectorAll("part > measure > harmony"));
    expect(harmonies.map((node) => node.querySelector(":scope > kind")?.getAttribute("text"))).toEqual([
      "Em9",
      "G11/B",
      "A13",
      "D7sus4/F#",
    ]);
    expect(harmonies.map((node) => node.querySelector(":scope > kind")?.textContent?.trim())).toEqual([
      "minor-ninth",
      "dominant-11th",
      "dominant-13th",
      "suspended-fourth",
    ]);
    expect(harmonies[1]?.querySelector(":scope > bass > bass-step")?.textContent?.trim()).toBe("B");
    expect(harmonies[3]?.querySelector(":scope > bass > bass-step")?.textContent?.trim()).toBe("F");
    expect(harmonies[3]?.querySelector(":scope > bass > bass-alter")?.textContent?.trim()).toBe("1");
  });

  it("ABC->MusicXML keeps unsupported quoted chord-like text as annotation instead of forcing harmony", () => {
    const abc = `X:1
T:Unsupported chord inventory
M:4/4
L:1/8
K:C
"Cadd9"C "Fmaj13"D |`;

    const outDoc = parseMusicXmlDocument(convertAbcToMusicXml(abc));
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelectorAll("part > measure > harmony").length).toBe(0);
    const words = Array.from(outDoc.querySelectorAll("part > measure > direction > direction-type > words"))
      .map((node) => node.textContent?.trim());
    expect(words).toContain("Cadd9");
    expect(words).toContain("Fmaj13");
  });

  it("ABC->MusicXML parses mikuscore rehearsal decoration as rehearsal direction", () => {
    const abc = `X:1
T:Rehearsal
M:4/4
L:1/4
K:C
!rehearsal:A1!C D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector("part > measure > direction > direction-type > rehearsal")?.textContent?.trim()).toBe("A1");
  });

  it("ABC->MusicXML accepts standard shorthand decoration symbols", () => {
    const abc = `X:1
T:Standard shorthand symbols
M:4/4
L:1/8
K:C
~C H D L E M F O G P A S B T c u d v e |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    const pitched = notes.filter((note) => note.querySelector(":scope > pitch") !== null);
    expect(pitched.length).toBeGreaterThanOrEqual(10);

    expect(pitched[0]?.querySelector(":scope > notations > arpeggiate")).not.toBeNull();
    expect(pitched[1]?.querySelector(":scope > notations > fermata")?.textContent?.trim()).toBe("normal");
    expect(pitched[2]?.querySelector(":scope > notations > articulations > accent")).not.toBeNull();
    expect(pitched[3]?.querySelector(":scope > notations > ornaments > mordent")).not.toBeNull();
    expect(pitched[5]?.querySelector(":scope > notations > ornaments > inverted-mordent")).not.toBeNull();
    expect(pitched[7]?.querySelector(":scope > notations > ornaments > trill-mark")).not.toBeNull();
    expect(pitched[8]?.querySelector(":scope > notations > technical > up-bow")).not.toBeNull();
    expect(pitched[9]?.querySelector(":scope > notations > technical > down-bow")).not.toBeNull();

    expect(outDoc.querySelectorAll("part > measure > direction > direction-type > coda").length).toBeGreaterThanOrEqual(1);
    expect(outDoc.querySelectorAll("part > measure > direction > direction-type > segno").length).toBeGreaterThanOrEqual(1);
  });

  it("MusicXML->ABC exports direction words as quoted annotations", () => {
    const xml = `<score-partwise version="3.1">
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
      <direction><direction-type><words>rit.</words></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type></note>
    </measure>
  </part>
</score-partwise>`;

    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;

    const abc = exportMusicXmlDomToAbc(doc);
    expect(abc).toContain('"rit."C');
  });

  it("MusicXML->ABC->MusicXML keeps unsupported chord-like quoted text as annotation", () => {
    const xml = `<score-partwise version="3.1">
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
      <direction><direction-type><words>Cadd9</words></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type></note>
      <direction><direction-type><words>Fmaj13</words></direction-type></direction>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type></note>
    </measure>
  </part>
</score-partwise>`;

    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;

    const abc = exportMusicXmlDomToAbc(doc);
    expect(abc).toContain('"Cadd9"C');
    expect(abc).toContain('"Fmaj13"D');

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelectorAll("part > measure > harmony").length).toBe(0);
    const words = Array.from(outDoc.querySelectorAll("part > measure > direction > direction-type > words"))
      .map((node) => node.textContent?.trim());
    expect(words).toContain("Cadd9");
    expect(words).toContain("Fmaj13");
  });

  it("MusicXML->ABC exports harmony as quoted chord symbols", () => {
    const xml = `<score-partwise version="3.1">
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
      <harmony><root><root-step>A</root-step></root><kind text="Am">minor</kind></harmony>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type></note>
    </measure>
  </part>
</score-partwise>`;

    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;

    const abc = exportMusicXmlDomToAbc(doc);
    expect(abc).toContain('"Am"C');

    const roundtrip = parseMusicXmlDocument(convertAbcToMusicXml(abc));
    expect(roundtrip).not.toBeNull();
    if (!roundtrip) return;
    expect(roundtrip.querySelector("part > measure > harmony > root > root-step")?.textContent?.trim()).toBe("A");
    expect(roundtrip.querySelector("part > measure > harmony > kind")?.textContent?.trim()).toBe("minor");
  });

  it("MusicXML->ABC exports common extended harmony kinds as quoted chord symbols", () => {
    const xml = `<score-partwise version="3.1">
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
      <harmony><root><root-step>C</root-step></root><kind>major-sixth</kind></harmony>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type></note>
      <harmony><root><root-step>D</root-step></root><kind>minor-sixth</kind></harmony>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type></note>
      <harmony><root><root-step>G</root-step></root><kind>dominant-ninth</kind></harmony>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type></note>
      <harmony><root><root-step>F</root-step></root><kind>major-ninth</kind></harmony>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type></note>
    </measure>
  </part>
</score-partwise>`;

    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;

    const abc = exportMusicXmlDomToAbc(doc);
    expect(abc).toContain('"C6"C');
    expect(abc).toContain('"Dm6"D');
    expect(abc).toContain('"G9"E');
    expect(abc).toContain('"Fmaj9"F');
  });

  it("MusicXML->ABC exports richer harmony kinds and slash chords as quoted chord symbols", () => {
    const xml = `<score-partwise version="3.1">
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
      <harmony><root><root-step>E</root-step></root><kind>minor-ninth</kind></harmony>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type></note>
      <harmony><root><root-step>G</root-step></root><bass><bass-step>B</bass-step></bass><kind>dominant-11th</kind></harmony>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type></note>
      <harmony><root><root-step>A</root-step></root><kind>dominant-13th</kind></harmony>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type></note>
      <harmony><root><root-step>D</root-step></root><bass><bass-step>F</bass-step><bass-alter>1</bass-alter></bass><kind>suspended-fourth</kind></harmony>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type></note>
    </measure>
  </part>
</score-partwise>`;

    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;

    const abc = exportMusicXmlDomToAbc(doc);
    expect(abc).toContain('"Em9"C');
    expect(abc).toContain('"G11/B"D');
    expect(abc).toContain('"A13"E');
    expect(abc).toContain('"Dsus4/F#"F');
  });

  it("MusicXML->ABC exports rehearsal direction as mikuscore rehearsal decoration and roundtrips it", () => {
    const xml = `<score-partwise version="3.1">
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
      <direction><direction-type><rehearsal>A1</rehearsal></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;

    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;

    const abc = exportMusicXmlDomToAbc(doc);
    expect(abc).toContain("!rehearsal:A1!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > rehearsal")?.textContent?.trim()).toBe("A1");
  });

  it("ABC->MusicXML maps w: lyrics onto subsequent notes", () => {
    const abc = `X:1
T:Lyrics
M:4/4
L:1/8
K:C
C D E F |
w: la la la la`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const lyrics = Array.from(outDoc.querySelectorAll("part > measure > note > lyric > text"))
      .map((node) => node.textContent?.trim());
    expect(lyrics).toEqual(["la", "la", "la", "la"]);
    const syllabics = Array.from(outDoc.querySelectorAll("part > measure > note > lyric > syllabic"))
      .map((node) => node.textContent?.trim());
    expect(syllabics).toEqual(["single", "single", "single", "single"]);
  });

  it("MusicXML->ABC exports lyrics as w: lines", () => {
    const xml = `<score-partwise version="3.1">
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
      <note>
        <pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type>
        <lyric><syllabic>begin</syllabic><text>hal</text></lyric>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type>
        <lyric><syllabic>end</syllabic><text>lo</text></lyric>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type>
        <lyric><syllabic>single</syllabic><text>world</text></lyric>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;

    const abc = exportMusicXmlDomToAbc(doc);
    expect(abc).toContain("w: hal- lo world");
  });

  it("ABC->MusicXML supports hyphenated w: lyrics with syllabic markers", () => {
    const abc = `X:1
T:Lyrics hyphen
M:4/4
L:1/8
K:C
C D E |
w: hal-le-lu`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const lyrics = Array.from(outDoc.querySelectorAll("part > measure > note > lyric > text"))
      .map((node) => node.textContent?.trim());
    expect(lyrics).toEqual(["hal", "le", "lu"]);
    const syllabics = Array.from(outDoc.querySelectorAll("part > measure > note > lyric > syllabic"))
      .map((node) => node.textContent?.trim());
    expect(syllabics).toEqual(["begin", "middle", "end"]);
  });

  it("MusicXML->ABC->MusicXML roundtrips common hyphenated lyrics in the bounded subset", () => {
    const xml = `<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Voice</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type>
        <lyric><syllabic>begin</syllabic><text>hal</text></lyric>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type>
        <lyric><syllabic>middle</syllabic><text>le</text></lyric>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type>
        <lyric><syllabic>end</syllabic><text>lu</text></lyric>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("w: hal- le- lu");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const lyrics = Array.from(outDoc.querySelectorAll("part > measure > note > lyric > text"))
      .map((node) => node.textContent?.trim());
    expect(lyrics).toEqual(["hal", "le", "lu"]);
    const syllabics = Array.from(outDoc.querySelectorAll("part > measure > note > lyric > syllabic"))
      .map((node) => node.textContent?.trim());
    expect(syllabics).toEqual(["begin", "middle", "end"]);
  });

  it("ABC->MusicXML supports inline [V:...] voice switches in body text", () => {
    const abc = `X:1
T:Inline voice switch
M:4/4
L:1/8
K:C
V:1 name="Upper"
V:2 name="Lower"
[V:1] C D | [V:2] E F |
[V:1] G A | [V:2] B c |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const upperNotes = Array.from(outDoc.querySelectorAll('part[id="P1"] > measure > note > pitch > step'))
      .map((node) => node.textContent?.trim());
    const lowerNotes = Array.from(outDoc.querySelectorAll('part[id="P2"] > measure > note > pitch > step'))
      .map((node) => node.textContent?.trim());
    expect(upperNotes).toEqual(["C", "D", "G", "A"]);
    expect(lowerNotes).toEqual(["E", "F", "B", "C"]);
    expect(outDoc.querySelector('part-list > score-part[id="P1"] > part-name')?.textContent?.trim()).toBe("Upper");
    expect(outDoc.querySelector('part-list > score-part[id="P2"] > part-name')?.textContent?.trim()).toBe("Lower");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')).toBeNull();
  });

  it("ABC->MusicXML applies !editorial! to the next explicit accidental", () => {
    const abc = `X:1
T:Editorial accidental
M:4/4
L:1/4
K:C
!editorial!^C z |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const accidental = outDoc.querySelector("part > measure > note > accidental");
    expect(accidental?.textContent?.trim()).toBe("sharp");
    expect(accidental?.getAttribute("editorial")).toBe("yes");
    expect(accidental?.getAttribute("cautionary")).toBeNull();
  });

  it("ABC->MusicXML applies !courtesy! to the next explicit accidental", () => {
    const abc = `X:1
T:Courtesy accidental
M:4/4
L:1/4
K:G
!courtesy!=F z |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const accidental = outDoc.querySelector("part > measure > note > accidental");
    expect(accidental?.textContent?.trim()).toBe("natural");
    expect(accidental?.getAttribute("cautionary")).toBe("yes");
    expect(accidental?.getAttribute("editorial")).toBeNull();
  });

  it("ABC->MusicXML supports U: user-defined decoration symbols with punctuation", () => {
    const abc = `X:1
T:User defined decoration
U:~=!trill!
M:4/4
L:1/8
K:C
~C D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > ornaments > trill-mark")).not.toBeNull();
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')).toBeNull();
  });

  it("ABC->MusicXML supports U: user-defined decoration symbols with letters outside note names", () => {
    const abc = `X:1
T:User defined fermata
U:H=!fermata!
M:4/4
L:1/8
K:C
HC D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > fermata")).not.toBeNull();
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')).toBeNull();
  });

  it("ABC->MusicXML supports U: user-defined decoration symbols declared with +...+ wrappers", () => {
    const abc = `X:1
T:User defined accent
U:Z=+accent+
M:4/4
L:1/8
K:C
ZC D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > articulations > accent")).not.toBeNull();
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')).toBeNull();
  });

  it("ABC->MusicXML ignores malformed U: user-defined symbol syntax and continues", () => {
    const abc = `X:1
T:Broken user defined decoration
U:~
M:4/4
L:1/8
K:C
C D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const steps = Array.from(outDoc.querySelectorAll("part > measure > note > pitch > step"))
      .map((node) => node.textContent?.trim());
    expect(steps).toEqual(["C", "D", "E", "F"]);
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')).toBeNull();
  });

  it("ABC->MusicXML skips unsupported inline body fields with warning instead of failing", () => {
    const abc = `X:1
T:Inline unsupported field
M:4/4
L:1/8
K:C
[P:A] C D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')).not.toBeNull();
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped unsupported inline field: [P:A]"
    );
  });

  it("ABC->MusicXML skips abcjs wrapper lines with warning instead of failing", () => {
    const abc = `[abcjs-audio engraver="{responsive:'resize'}"]
X:1
T:Kaeru
M:4/4
L:1/4
Q:1/4=100
K:C
|CDEF | EDCz| EFGA | GFEz |
| CzCz | CzCz | C/2C/2D/2D/2 E/2E/2F/2F/2 | EDCz||
[/abcjs-audio]`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelectorAll("part > measure").length).toBeGreaterThan(0);
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')).not.toBeNull();
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped unsupported abcjs wrapper line"
    );
  });

  it("ABC->MusicXML marks an underfull first bar as implicit pickup", () => {
    const abc = `X:1
K:D
D | G3F E3
w: Hey ho, hey ho!`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure[number="1"]')?.getAttribute("implicit")).toBe("yes");
  });

  it("ABC->MusicXML warns on unsupported standalone body fields instead of treating them as header metadata", () => {
    const abc = `X:1
T:Standalone unsupported body field
M:4/4
L:1/8
K:C
C D E F |
P:A
G A B c |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped unsupported standalone body field: P:A"
    );
    expect(Array.from(outDoc.querySelectorAll("part > measure")).length).toBe(2);
  });

  it("ABC->MusicXML accepts same-line standalone body K: tokens as inline-field compatibility", () => {
    const abc = `X:1
T:Same-line body key token
M:4/4
L:1/8
K:C
C D E F | K:G G A B c |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure[number="2"] > attributes > key > fifths')?.textContent?.trim()).toBe("1");
  });

  it("ABC->MusicXML warns on unsupported same-line standalone body field tokens", () => {
    const abc = `X:1
T:Same-line unsupported body token
M:4/4
L:1/8
K:C
C D E F | P:A G A B c |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped unsupported standalone body field token: P:A"
    );
  });

  it("ABC->MusicXML warns on unsupported ABC directives instead of silently ignoring them", () => {
    const abc = `X:1
T:Unsupported directive
M:4/4
L:1/8
K:C
%%text ignored
C D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped unsupported ABC directive: %%text ignored"
    );
  });

  it("ABC->MusicXML warns on stray body continuation markers instead of failing note parsing", () => {
    const abc = `X:1
T:Stray body continuation
M:4/4
L:1/8
K:C
C D \\ E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped stray body continuation marker"
    );
    expect(Array.from(outDoc.querySelectorAll("part > measure > note")).length).toBe(4);
  });

  it("ABC->MusicXML warns on unsupported body word tokens instead of failing note parsing", () => {
    const abc = `X:1
T:Unsupported body word
M:4/4
L:1/8
K:C
C D ignored E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped unsupported body token: ignored"
    );
    expect(Array.from(outDoc.querySelectorAll("part > measure > note")).length).toBe(4);
  });

  it("ABC->MusicXML warns on lower-case unsupported body word leftovers instead of failing note parsing", () => {
    const abc = `X:1
T:Lower-case unsupported body word
M:4/4
L:1/8
K:C
C D still E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped unsupported body token: still"
    );
    expect(Array.from(outDoc.querySelectorAll("part > measure > note")).length).toBe(4);
  });

  it("ABC->MusicXML warns on unsupported octave range in a single note instead of failing the parse", () => {
    const abc = `X:1
T:Unsupported octave single
M:4/4
L:1/8
K:C
C'''''''''' D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped note with unsupported octave range."
    );
    expect(Array.from(outDoc.querySelectorAll("part > measure > note")).length).toBe(3);
  });

  it("ABC->MusicXML warns on unsupported octave range in a chord instead of failing the parse", () => {
    const abc = `X:1
T:Unsupported octave chord
M:4/4
L:1/8
K:C
[C''''''''''E] D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped chord note with unsupported octave range."
    );
    expect(Array.from(outDoc.querySelectorAll("part > measure > note")).length).toBe(3);
  });

  it("ABC->MusicXML warns on unsupported octave range in grace notes instead of failing the parse", () => {
    const abc = `X:1
T:Unsupported octave grace
M:4/4
L:1/8
K:C
{C''''''''''} D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped grace note with unsupported octave range."
    );
    expect(Array.from(outDoc.querySelectorAll("part > measure > note")).length).toBe(3);
  });

  it("ABC->MusicXML warns on invalid single-note length instead of failing the parse", () => {
    const abc = `X:1
T:Invalid single-note length
M:4/4
L:1/8
K:C
C0 D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped note with invalid length."
    );
    expect(Array.from(outDoc.querySelectorAll("part > measure > note")).length).toBe(3);
  });

  it("ABC->MusicXML warns on invalid chord length instead of failing the parse", () => {
    const abc = `X:1
T:Invalid chord length
M:4/4
L:1/8
K:C
[CE]0 D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped chord with invalid length."
    );
    expect(Array.from(outDoc.querySelectorAll("part > measure > note")).length).toBe(3);
  });

  it("ABC->MusicXML warns on invalid grace-note length instead of failing the parse", () => {
    const abc = `X:1
T:Invalid grace-note length
M:4/4
L:1/8
K:C
{C0} D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped grace note with invalid length."
    );
    expect(Array.from(outDoc.querySelectorAll("part > measure > note")).length).toBe(3);
  });

  it("ABC->MusicXML warns on malformed accidental leftovers instead of failing note parsing", () => {
    const abc = `X:1
T:Malformed accidental leftover
M:4/4
L:1/8
K:C
C ^; D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("2");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped malformed accidental token: ^"
    );
    expect(Array.from(outDoc.querySelectorAll("part > measure > note")).length).toBe(4);
  });

  it("ABC->MusicXML warns on malformed grace accidental leftovers instead of failing note parsing", () => {
    const abc = `X:1
T:Malformed grace accidental leftover
M:4/4
L:1/8
K:C
{^;} D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped malformed grace accidental token: ^"
    );
    expect(Array.from(outDoc.querySelectorAll("part > measure > note")).length).toBe(3);
  });

  it("ABC->MusicXML warns on stray body punctuation instead of failing note parsing", () => {
    const abc = `X:1
T:Stray body punctuation
M:4/4
L:1/8
K:C
C ; D \` E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("2");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped unsupported body punctuation: ;"
    );
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0002"]')?.textContent).toContain(
      "Skipped unsupported body punctuation: `"
    );
    expect(Array.from(outDoc.querySelectorAll("part > measure > note")).length).toBe(4);
  });

  it("ABC->MusicXML warns on additional bounded stray body punctuation instead of failing note parsing", () => {
    const abc = `X:1
T:Additional stray body punctuation
M:4/4
L:1/8
K:C
C ? D @ E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("2");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped unsupported body punctuation: ?"
    );
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0002"]')?.textContent).toContain(
      "Skipped unsupported body punctuation: @"
    );
    expect(Array.from(outDoc.querySelectorAll("part > measure > note")).length).toBe(4);
  });

  it("ABC->MusicXML warns on stray sharp-sign punctuation instead of failing note parsing", () => {
    const abc = `X:1
T:Stray sharp sign
M:4/4
L:1/8
K:C
C # D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped unsupported body punctuation: #"
    );
    expect(Array.from(outDoc.querySelectorAll("part > measure > note")).length).toBe(4);
  });

  it("ABC->MusicXML warns on stray dollar-sign punctuation instead of failing note parsing", () => {
    const abc = `X:1
T:Stray dollar sign
M:4/4
L:1/8
K:C
C $ D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped unsupported body punctuation: $"
    );
    expect(Array.from(outDoc.querySelectorAll("part > measure > note")).length).toBe(4);
  });

  it("ABC->MusicXML warns on stray asterisk punctuation instead of failing note parsing", () => {
    const abc = `X:1
T:Stray asterisk
M:4/4
L:1/8
K:C
C * D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped unsupported body punctuation: *"
    );
    expect(Array.from(outDoc.querySelectorAll("part > measure > note")).length).toBe(4);
  });

  it("ABC->MusicXML warns on stray body number tokens instead of failing note parsing", () => {
    const abc = `X:1
T:Stray body number
M:4/4
L:1/8
K:C
C 123 D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "Skipped unsupported body number token: 123"
    );
    expect(Array.from(outDoc.querySelectorAll("part > measure > note")).length).toBe(4);
  });

  it("ABC->MusicXML maps overlay syntax & into synthetic overlay voices", () => {
    const abc = `X:1
T:Overlay mapped
M:4/4
L:1/8
K:C
C D & E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const partNames = Array.from(outDoc.querySelectorAll("part-list > score-part > part-name")).map((node) => node.textContent?.trim());
    expect(partNames).toEqual(["Voice 1", "Voice 1 overlay 2"]);
    const part1Steps = Array.from(outDoc.querySelectorAll('part[id="P1"] > measure > note > pitch > step')).map((node) => node.textContent?.trim());
    const part2Steps = Array.from(outDoc.querySelectorAll('part[id="P2"] > measure > note > pitch > step')).map((node) => node.textContent?.trim());
    expect(part1Steps).toEqual(["C", "D"]);
    expect(part2Steps).toEqual(["E", "F"]);
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')).toBeNull();
  });

  it("ABC->MusicXML keeps later-measure overlay notes when syntax & appears after earlier plain measures", () => {
    const abc = `X:1
T:Overlay later measure
M:4/4
L:1/8
K:C
C D E F | G A & B c |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const part1Measure1 = Array.from(outDoc.querySelectorAll('part[id="P1"] > measure[number="1"] > note > pitch > step')).map((node) => node.textContent?.trim());
    const part1Measure2 = Array.from(outDoc.querySelectorAll('part[id="P1"] > measure[number="2"] > note > pitch > step')).map((node) => node.textContent?.trim());
    const part2Steps = Array.from(outDoc.querySelectorAll('part[id="P2"] > measure > note > pitch > step')).map((node) => node.textContent?.trim());

    expect(part1Measure1).toEqual(["C", "D", "E", "F"]);
    expect(part1Measure2).toEqual(["G", "A"]);
    expect(part2Steps).toEqual(["B", "C"]);
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')).toBeNull();
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

  it("ABC->MusicXML accepts !tr! as trill alias", () => {
    const abc = `X:1
T:Trill alias
M:4/4
L:1/8
K:C
!tr!C D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > ornaments > trill-mark")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !triller! as trill alias", () => {
    const abc = `X:1
T:Triller alias
M:4/4
L:1/8
K:C
!triller!C D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > ornaments > trill-mark")).not.toBeNull();
  });

  it("ABC->MusicXML restores standard repeat barlines from |: and :|", () => {
    const abc = `X:1
T:Repeat bars
M:4/4
L:1/8
K:C
|: C D E F | G A B c :|`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure[number="1"] > barline[location="left"] > repeat')?.getAttribute("direction")).toBe("forward");
    expect(outDoc.querySelector('part > measure[number="2"] > barline[location="right"] > repeat')?.getAttribute("direction")).toBe("backward");

    const core = new ScoreCore();
    core.load(xml);
    const save = core.save();
    expect(save.ok).toBe(true);
  });

  it("ABC->MusicXML restores alternate endings from standard ABC markers", () => {
    const abc = `X:1
T:Alternate endings
M:4/4
L:1/8
K:C
|: C D E F |
[1 G A B c :|]
[2 c B A G ||`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure[number="1"] > barline[location="left"] > repeat')?.getAttribute("direction")).toBe("forward");
    expect(outDoc.querySelector('part > measure[number="2"] > barline[location="left"] > ending')?.getAttribute("number")).toBe("1");
    expect(outDoc.querySelector('part > measure[number="2"] > barline[location="left"] > ending')?.getAttribute("type")).toBe("start");
    expect(outDoc.querySelector('part > measure[number="2"] > barline[location="right"] > repeat')?.getAttribute("direction")).toBe("backward");
    expect(outDoc.querySelector('part > measure[number="2"] > barline[location="right"] > ending')?.getAttribute("number")).toBe("1");
    expect(outDoc.querySelector('part > measure[number="2"] > barline[location="right"] > ending')?.getAttribute("type")).toBe("stop");
    expect(outDoc.querySelector('part > measure[number="3"] > barline[location="left"] > ending')?.getAttribute("number")).toBe("2");
    expect(outDoc.querySelector('part > measure[number="3"] > barline[location="right"] > ending')?.getAttribute("number")).toBe("2");

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes.length).toBeGreaterThanOrEqual(12);

    const core = new ScoreCore();
    core.load(xml);
    const save = core.save();
    expect(save.ok).toBe(true);
  });

  it("ABC->MusicXML restores alternate endings from |1 and :|2 style markers", () => {
    const abc = `X:1
T:Alternate endings barline style
M:4/4
L:1/8
K:C
|: C D E F |1 G A B c :|2 c B A G ||`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure[number="1"] > barline[location="left"] > repeat')?.getAttribute("direction")).toBe("forward");
    expect(outDoc.querySelector('part > measure[number="2"] > barline[location="left"] > ending')?.getAttribute("number")).toBe("1");
    expect(outDoc.querySelector('part > measure[number="2"] > barline[location="right"] > repeat')?.getAttribute("direction")).toBe("backward");
    expect(outDoc.querySelector('part > measure[number="2"] > barline[location="right"] > ending')?.getAttribute("number")).toBe("1");
    expect(outDoc.querySelector('part > measure[number="3"] > barline[location="left"] > ending')?.getAttribute("number")).toBe("2");
    expect(outDoc.querySelector('part > measure[number="3"] > barline[location="right"] > ending')?.getAttribute("number")).toBe("2");

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes.length).toBeGreaterThanOrEqual(12);

    const core = new ScoreCore();
    core.load(xml);
    const save = core.save();
    expect(save.ok).toBe(true);
  });

  it("ABC->MusicXML parses turn decoration and grace slash variant", () => {
    const abc = `X:1
T:Turn test
M:4/4
L:1/8
K:C
V:1
{/g}!turn!a2 b2 c2 d2 |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(':scope > grace[slash="yes"]')).not.toBeNull();
    const principal = notes.find((n) => n.querySelector(":scope > grace") === null);
    expect(principal?.querySelector(":scope > notations > ornaments > turn")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !lowerturn! as inverted-turn alias", () => {
    const abc = `X:1
T:Lower turn alias
M:4/4
L:1/8
K:C
!lowerturn!C D E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > ornaments > inverted-turn")).not.toBeNull();
  });

  it("ABC->MusicXML parses turnx and invertedturnx as slashed turn variants", () => {
    const abc = `X:1
T:Turn slash variants
M:4/4
L:1/4
K:C
!turnx!C !invertedturnx!D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(':scope > notations > ornaments > turn[slash="yes"]')).not.toBeNull();
    expect(notes[1]?.querySelector(':scope > notations > ornaments > inverted-turn[slash="yes"]')).not.toBeNull();
  });

  it("ABC->MusicXML parses delayed turn variants", () => {
    const abc = `X:1
T:Delayed turn
M:4/4
L:1/4
K:C
!delayedturn!C !delayedinvertedturn!D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > ornaments > turn")).not.toBeNull();
    expect(notes[0]?.querySelector(":scope > notations > ornaments > delayed-turn")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > ornaments > inverted-turn")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > ornaments > delayed-turn")).not.toBeNull();
  });

  it("ABC->MusicXML parses long trill start and stop decorations", () => {
    const abc = `X:1
T:Long trill
M:4/4
L:1/4
K:C
!trill(!C D !trill)!E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > ornaments > trill-mark")).not.toBeNull();
    expect(notes[0]?.querySelector(':scope > notations > ornaments > wavy-line[type="start"]')).not.toBeNull();
    expect(notes[2]?.querySelector(':scope > notations > ornaments > wavy-line[type="stop"]')).not.toBeNull();
  });

  it("ABC->MusicXML parses mikuscore tremolo decorations", () => {
    const abc = `X:1
T:Tremolo
M:4/4
L:1/4
K:C
!tremolo-single-3!C !tremolo-start-2!D !tremolo-stop-2!E |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const tremolos = Array.from(outDoc.querySelectorAll("part > measure > note > notations > ornaments > tremolo"));
    expect(tremolos[0]?.getAttribute("type")).toBe("single");
    expect(tremolos[0]?.textContent?.trim()).toBe("3");
    expect(tremolos[1]?.getAttribute("type")).toBe("start");
    expect(tremolos[1]?.textContent?.trim()).toBe("2");
    expect(tremolos[2]?.getAttribute("type")).toBe("stop");
    expect(tremolos[2]?.textContent?.trim()).toBe("2");
  });

  it("ABC->MusicXML parses mikuscore glissando/slide decorations", () => {
    const abc = `X:1
T:Spanners
M:4/4
L:1/4
K:C
!gliss-start!C !gliss-stop!D !slide-start!E !slide-stop!F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(':scope > notations > glissando[type="start"]')).not.toBeNull();
    expect(notes[1]?.querySelector(':scope > notations > glissando[type="stop"]')).not.toBeNull();
    expect(notes[2]?.querySelector(':scope > notations > slide[type="start"]')).not.toBeNull();
    expect(notes[3]?.querySelector(':scope > notations > slide[type="stop"]')).not.toBeNull();
  });

  it("ABC->MusicXML accepts standard !slide! decoration as slide start", () => {
    const abc = `X:1
T:Standard slide
M:4/4
L:1/4
K:C
!slide!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(':scope > notations > slide[type="start"]')).not.toBeNull();
  });

  it("ABC->MusicXML parses standard phrase-mark decorations", () => {
    const abc = `X:1
T:Phrase marks
M:4/4
L:1/4
K:C
!shortphrase!C !mediumphrase!D !longphrase!E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(':scope > notations > articulations > other-articulation')?.textContent?.trim()).toBe("shortphrase");
    expect(notes[1]?.querySelector(':scope > notations > articulations > other-articulation')?.textContent?.trim()).toBe("mediumphrase");
    expect(notes[2]?.querySelector(':scope > notations > articulations > other-articulation')?.textContent?.trim()).toBe("longphrase");
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

  it("ABC->MusicXML accepts !stacc! and !stac! as staccato aliases", () => {
    const abc = `X:1
T:Staccato aliases
M:4/4
L:1/4
K:C
!stacc!C !stac!D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > articulations > staccato")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > articulations > staccato")).not.toBeNull();
  });

  it("ABC->MusicXML parses accent, tenuto, and fermata decorations", () => {
    const abc = `X:1
T:Decoration expansion
M:4/4
L:1/4
K:C
!accent!C !tenuto!D !fermata!E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > articulations > accent")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > articulations > tenuto")).not.toBeNull();
    expect(notes[2]?.querySelector(":scope > notations > fermata")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !>! and !emphasis! as accent aliases", () => {
    const abc = `X:1
T:Accent aliases
M:4/4
L:1/4
K:C
!>!C !emphasis!D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > articulations > accent")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > articulations > accent")).not.toBeNull();
  });

  it("ABC->MusicXML parses stress and unstress decorations", () => {
    const abc = `X:1
T:Stress
M:4/4
L:1/4
K:C
!stress!C !unstress!D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > articulations > stress")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > articulations > unstress")).not.toBeNull();
  });

  it("ABC->MusicXML parses inverted fermata distinctly", () => {
    const abc = `X:1
T:Inverted fermata
M:4/4
L:1/4
K:C
!invertedfermata!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const fermata = outDoc.querySelector("part > measure > note > notations > fermata");
    expect(fermata?.textContent?.trim()).toBe("inverted");
  });

  it("ABC->MusicXML accepts !inverted fermata! as inverted-fermata alias", () => {
    const abc = `X:1
T:Inverted fermata alias
M:4/4
L:1/4
K:C
!inverted fermata!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const fermata = outDoc.querySelector("part > measure > note > notations > fermata");
    expect(fermata?.textContent?.trim()).toBe("inverted");
  });

  it("ABC->MusicXML parses marcato, breath, and caesura decorations", () => {
    const abc = `X:1
T:Decoration expansion 2
M:4/4
L:1/4
K:C
!marcato!C !breath!D !caesura!E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > articulations > strong-accent")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > articulations > breath-mark")).not.toBeNull();
    expect(notes[2]?.querySelector(":scope > notations > articulations > caesura")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !strong accent! as marcato alias", () => {
    const abc = `X:1
T:Marcato alias
M:4/4
L:1/4
K:C
!strong accent!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > articulations > strong-accent")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !strongaccent! as marcato alias", () => {
    const abc = `X:1
T:Marcato compact alias
M:4/4
L:1/4
K:C
!strongaccent!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > articulations > strong-accent")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !strong-accent! as marcato alias", () => {
    const abc = `X:1
T:Marcato hyphen alias
M:4/4
L:1/4
K:C
!strong-accent!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > articulations > strong-accent")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !breathmark! as breath-mark alias", () => {
    const abc = `X:1
T:Breath alias
M:4/4
L:1/4
K:C
!breathmark!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > articulations > breath-mark")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !breath mark! as breath-mark alias", () => {
    const abc = `X:1
T:Breath spaced alias
M:4/4
L:1/4
K:C
!breath mark!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > articulations > breath-mark")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !breath-mark! as breath-mark alias", () => {
    const abc = `X:1
T:Breath hyphen alias
M:4/4
L:1/4
K:C
!breath-mark!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > articulations > breath-mark")).not.toBeNull();
  });

  it("ABC->MusicXML parses staccatissimo decoration distinctly from staccato", () => {
    const abc = `X:1
T:Staccatissimo
M:4/4
L:1/8
K:C
!wedge!c2 d2 |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > articulations > staccatissimo")).not.toBeNull();
    expect(firstNote?.querySelector(":scope > notations > articulations > staccato")).toBeNull();
  });

  it("ABC->MusicXML accepts !spiccato! as staccatissimo alias", () => {
    const abc = `X:1
T:Spiccato alias
M:4/4
L:1/8
K:C
!spiccato!c2 d2 |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > articulations > staccatissimo")).not.toBeNull();
    expect(firstNote?.querySelector(":scope > notations > articulations > staccato")).toBeNull();
  });

  it("ABC->MusicXML parses up-bow and down-bow decorations", () => {
    const abc = `X:1
T:Bowing
M:4/4
L:1/4
K:C
!upbow!C !downbow!D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > technical > up-bow")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > technical > down-bow")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !up bow! and !down bow! as bowing aliases", () => {
    const abc = `X:1
T:Bowing aliases
M:4/4
L:1/4
K:C
!up bow!C !down bow!D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > technical > up-bow")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > technical > down-bow")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !up-bow! and !down-bow! as bowing aliases", () => {
    const abc = `X:1
T:Bowing hyphen aliases
M:4/4
L:1/4
K:C
!up-bow!C !down-bow!D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > technical > up-bow")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > technical > down-bow")).not.toBeNull();
  });

  it("ABC->MusicXML parses double-tongue, triple-tongue, heel, and toe decorations", () => {
    const abc = `X:1
T:Technical extensions
M:4/4
L:1/4
K:C
!doubletongue!C !tripletongue!D !heel!E !toe!F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > technical > double-tongue")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > technical > triple-tongue")).not.toBeNull();
    expect(notes[2]?.querySelector(":scope > notations > technical > heel")).not.toBeNull();
    expect(notes[3]?.querySelector(":scope > notations > technical > toe")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !heel mark! and !toe mark! as aliases", () => {
    const abc = `X:1
T:Heel toe aliases
M:4/4
L:1/4
K:C
!heel mark!C !toe mark!D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > technical > heel")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > technical > toe")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !double tongue! and !triple tongue! as tongue aliases", () => {
    const abc = `X:1
T:Tongue aliases
M:4/4
L:1/4
K:C
!double tongue!C !triple tongue!D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > technical > double-tongue")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > technical > triple-tongue")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !double-tongue! and !triple-tongue! as tongue aliases", () => {
    const abc = `X:1
T:Tongue hyphen aliases
M:4/4
L:1/4
K:C
!double-tongue!C !triple-tongue!D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > technical > double-tongue")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > technical > triple-tongue")).not.toBeNull();
  });

  it("ABC->MusicXML parses mikuscore fingering and string decorations", () => {
    const abc = `X:1
T:Fingering and string
M:4/4
L:1/2
K:C
!fingering:1!!fingering:4!C !string:1!D !string:4!E |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    const fingerings = Array.from(notes[0]?.querySelectorAll(":scope > notations > technical > fingering") ?? []).map((n) => n.textContent?.trim());
    expect(fingerings).toEqual(["1", "4"]);
    expect(notes[1]?.querySelector(":scope > notations > technical > string")?.textContent?.trim()).toBe("1");
    expect(notes[2]?.querySelector(":scope > notations > technical > string")?.textContent?.trim()).toBe("4");
  });

  it("ABC->MusicXML parses standard fingering decorations !0! to !5!", () => {
    const abc = `X:1
T:Standard fingering decorations
M:4/4
L:1/4
K:C
!0!C !1!D !2!E !3!F !4!G !5!A |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const fingerings = Array.from(outDoc.querySelectorAll("part > measure note > notations > technical > fingering"))
      .map((n) => n.textContent?.trim());
    expect(fingerings).toEqual(["0", "1", "2", "3", "4", "5"]);
  });

  it("ABC->MusicXML parses mikuscore pluck decorations", () => {
    const abc = `X:1
T:Pluck
M:4/4
L:1
K:C
!pluck:p!!pluck:i!!pluck:m!!pluck:a!C |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const plucks = Array.from(outDoc.querySelectorAll("part > measure > note > notations > technical > pluck")).map((n) => n.textContent?.trim());
    expect(plucks).toEqual(["p", "i", "m", "a"]);
  });

  it("ABC->MusicXML parses open-string decoration", () => {
    const abc = `X:1
T:Open string
M:4/4
L:1/4
K:C
!open!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > technical > open-string")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !openstring! as open-string alias", () => {
    const abc = `X:1
T:Open string alias
M:4/4
L:1/4
K:C
!openstring!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > technical > open-string")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !open string! as open-string alias", () => {
    const abc = `X:1
T:Open string spaced alias
M:4/4
L:1/4
K:C
!open string!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > technical > open-string")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !open-string! as open-string alias", () => {
    const abc = `X:1
T:Open string hyphen alias
M:4/4
L:1/4
K:C
!open-string!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > technical > open-string")).not.toBeNull();
  });

  it("ABC->MusicXML parses snap-pizzicato decoration", () => {
    const abc = `X:1
T:Snap pizzicato
M:4/4
L:1/4
K:C
!snap!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > technical > snap-pizzicato")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !snappizzicato! as snap-pizzicato alias", () => {
    const abc = `X:1
T:Snap pizzicato alias
M:4/4
L:1/4
K:C
!snappizzicato!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > technical > snap-pizzicato")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !snap pizzicato! as snap-pizzicato alias", () => {
    const abc = `X:1
T:Snap pizzicato spaced alias
M:4/4
L:1/4
K:C
!snap pizzicato!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > technical > snap-pizzicato")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !snap-pizzicato! as snap-pizzicato alias", () => {
    const abc = `X:1
T:Snap pizzicato hyphen alias
M:4/4
L:1/4
K:C
!snap-pizzicato!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > technical > snap-pizzicato")).not.toBeNull();
  });

  it("ABC->MusicXML parses harmonic decoration", () => {
    const abc = `X:1
T:Harmonic
M:4/4
L:1/4
K:C
!harmonic!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > technical > harmonic")).not.toBeNull();
  });

  it("ABC->MusicXML parses thumb decoration", () => {
    const abc = `X:1
T:Thumb position
M:4/4
L:1/4
K:C
!thumb!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > technical > thumb-position")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !thumbpos! as thumb-position alias", () => {
    const abc = `X:1
T:Thumb alias
M:4/4
L:1/4
K:C
!thumbpos!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > technical > thumb-position")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !thumb pos! as thumb-position alias", () => {
    const abc = `X:1
T:Thumb spaced alias
M:4/4
L:1/4
K:C
!thumb pos!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > technical > thumb-position")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !thumb position! as thumb-position alias", () => {
    const abc = `X:1
T:Thumb position alias
M:4/4
L:1/4
K:C
!thumb position!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > technical > thumb-position")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !thumbposition! as thumb-position alias", () => {
    const abc = `X:1
T:Thumbposition alias
M:4/4
L:1/4
K:C
!thumbposition!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > technical > thumb-position")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !thumb-position! as thumb-position alias", () => {
    const abc = `X:1
T:Thumb-position alias
M:4/4
L:1/4
K:C
!thumb-position!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > technical > thumb-position")).not.toBeNull();
  });

  it("ABC->MusicXML parses mordent and pralltriller decorations", () => {
    const abc = `X:1
T:Mordent
M:4/4
L:1/4
K:C
!mordent!C !pralltriller!D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > ornaments > mordent")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > ornaments > inverted-mordent")).not.toBeNull();
  });

  it("ABC->MusicXML parses roll decoration as arpeggiate", () => {
    const abc = `X:1
T:Arpeggiate
M:4/4
L:1/4
K:C
!roll![CEG]2 z2 |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > arpeggiate")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !arpeggio! and !arpeggiate! as roll aliases", () => {
    const abc = `X:1
T:Arpeggiate aliases
M:4/4
L:1/4
K:C
!arpeggio![CEG]2 !arpeggiate![DFA]2 |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > arpeggiate")).not.toBeNull();
    expect(notes[3]?.querySelector(":scope > notations > arpeggiate")).not.toBeNull();
  });

  it("ABC->MusicXML parses schleifer and shake decorations", () => {
    const abc = `X:1
T:More ornaments
M:4/4
L:1/4
K:C
!schleifer!C !shake!D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > ornaments > schleifer")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > ornaments > shake")).not.toBeNull();
  });

  it("ABC->MusicXML parses segno and coda decorations as directions", () => {
    const abc = `X:1
T:Direction decorations
M:4/4
L:1/4
K:C
!segno!C !coda!D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const directions = Array.from(outDoc.querySelectorAll("part > measure > direction > direction-type"));
    expect(directions[0]?.querySelector(":scope > segno")).not.toBeNull();
    expect(directions[1]?.querySelector(":scope > coda")).not.toBeNull();
  });

  it("ABC->MusicXML parses fine decoration as sound direction", () => {
    const abc = `X:1
T:Fine
M:4/4
L:1/4
K:C
!fine!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure > direction > sound[fine="yes"]')).not.toBeNull();
  });

  it("ABC->MusicXML parses dacapo decoration as sound direction", () => {
    const abc = `X:1
T:Da Capo
M:4/4
L:1/4
K:C
!dacapo!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure > direction > sound[dacapo="yes"]')).not.toBeNull();
  });

  it("ABC->MusicXML accepts !da capo! as dacapo alias", () => {
    const abc = `X:1
T:Da Capo alias
M:4/4
L:1/4
K:C
!da capo!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure > direction > sound[dacapo="yes"]')).not.toBeNull();
  });

  it("ABC->MusicXML accepts !da-capo! as dacapo alias", () => {
    const abc = `X:1
T:Da Capo hyphen alias
M:4/4
L:1/4
K:C
!da-capo!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure > direction > sound[dacapo="yes"]')).not.toBeNull();
  });

  it("ABC->MusicXML accepts !D.C.! as dacapo alias", () => {
    const abc = `X:1
T:D.C. alias
M:4/4
L:1/4
K:C
!D.C.!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure > direction > sound[dacapo="yes"]')).not.toBeNull();
  });

  it("ABC->MusicXML parses dalsegno decoration as sound direction", () => {
    const abc = `X:1
T:Dal Segno
M:4/4
L:1/4
K:C
!dalsegno!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure > direction > sound[dalsegno="segno"]')).not.toBeNull();
  });

  it("ABC->MusicXML accepts !dal segno! as dalsegno alias", () => {
    const abc = `X:1
T:Dal Segno alias
M:4/4
L:1/4
K:C
!dal segno!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure > direction > sound[dalsegno="segno"]')).not.toBeNull();
  });

  it("ABC->MusicXML accepts !dal-segno! as dalsegno alias", () => {
    const abc = `X:1
T:Dal Segno hyphen alias
M:4/4
L:1/4
K:C
!dal-segno!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure > direction > sound[dalsegno="segno"]')).not.toBeNull();
  });

  it("ABC->MusicXML accepts !D.S.! as dalsegno alias", () => {
    const abc = `X:1
T:D.S. alias
M:4/4
L:1/4
K:C
!D.S.!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure > direction > sound[dalsegno="segno"]')).not.toBeNull();
  });

  it("ABC->MusicXML parses tocoda decoration as sound direction", () => {
    const abc = `X:1
T:To Coda
M:4/4
L:1/4
K:C
!tocoda!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure > direction > sound[tocoda="coda"]')).not.toBeNull();
  });

  it("ABC->MusicXML accepts !to coda! as tocoda alias", () => {
    const abc = `X:1
T:To Coda alias
M:4/4
L:1/4
K:C
!to coda!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure > direction > sound[tocoda="coda"]')).not.toBeNull();
  });

  it("ABC->MusicXML accepts !to-coda! as tocoda alias", () => {
    const abc = `X:1
T:To Coda hyphen alias
M:4/4
L:1/4
K:C
!to-coda!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure > direction > sound[tocoda="coda"]')).not.toBeNull();
  });

  it("ABC->MusicXML parses dacoda decoration as dacapo plus tocoda", () => {
    const abc = `X:1
T:Da Coda
M:4/4
L:1/4
K:C
!dacoda!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure > direction > sound[dacapo="yes"]')).not.toBeNull();
    expect(outDoc.querySelector('part > measure > direction > sound[tocoda="coda"]')).not.toBeNull();
  });

  it("ABC->MusicXML parses crescendo and diminuendo wedge decorations as directions", () => {
    const abc = `X:1
T:Wedges
M:4/4
L:1/4
K:C
!crescendo(!C D !crescendo)!E !diminuendo(!F | !diminuendo)!G A B c |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const wedgeTypes = Array.from(outDoc.querySelectorAll("part > measure > direction > direction-type > wedge"))
      .map((node) => node.getAttribute("type"));
    expect(wedgeTypes).toEqual(["crescendo", "stop", "diminuendo", "stop"]);
  });

  it("ABC->MusicXML accepts wedge decoration aliases cresc/dim/decresc", () => {
    const abc = `X:1
T:Wedge aliases
M:4/4
L:1/4
K:C
!cresc(!C !cresc)!D !dim(!E !decresc)!F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const wedgeTypes = Array.from(outDoc.querySelectorAll("part > measure > direction > direction-type > wedge"))
      .map((node) => node.getAttribute("type"));
    expect(wedgeTypes).toEqual(["crescendo", "stop", "diminuendo", "stop"]);
  });

  it("ABC->MusicXML accepts symbolic wedge decoration aliases <( <) >( >)", () => {
    const abc = `X:1
T:Symbolic wedge aliases
M:4/4
L:1/4
K:C
!<(!C !<)!D !>(!E !>)!F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const wedgeTypes = Array.from(outDoc.querySelectorAll("part > measure > direction > direction-type > wedge"))
      .map((node) => node.getAttribute("type"));
    expect(wedgeTypes).toEqual(["crescendo", "stop", "diminuendo", "stop"]);
  });

  it("ABC->MusicXML accepts wedge decoration alias decrescendo", () => {
    const abc = `X:1
T:Decrescendo alias
M:4/4
L:1/4
K:C
!decrescendo(!C D !decrescendo)!E F |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const wedgeTypes = Array.from(outDoc.querySelectorAll("part > measure > direction > direction-type > wedge"))
      .map((node) => node.getAttribute("type"));
    expect(wedgeTypes).toEqual(["diminuendo", "stop"]);
  });

  it("ABC->MusicXML accepts !decresc(! as diminuendo-start alias", () => {
    const abc = `X:1
T:Decresc start alias
M:4/4
L:1/4
K:C
!decresc(!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const wedge = outDoc.querySelector("part > measure > direction > direction-type > wedge");
    expect(wedge?.getAttribute("type")).toBe("diminuendo");
  });

  it("ABC->MusicXML accepts !dim)! as diminuendo-stop alias", () => {
    const abc = `X:1
T:Dim stop alias
M:4/4
L:1/4
K:C
C !dim)!D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const wedge = outDoc.querySelector("part > measure > direction > direction-type > wedge");
    expect(wedge?.getAttribute("type")).toBe("stop");
  });

  it("ABC->MusicXML parses sfz decoration as dynamics direction", () => {
    const abc = `X:1
T:Sforzato
M:4/4
L:1/4
K:C
!sfz!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstDirection = outDoc.querySelector("part > measure > direction > direction-type > dynamics > sfz");
    expect(firstDirection).not.toBeNull();
  });

  it("ABC->MusicXML parses sf decoration as dynamics direction", () => {
    const abc = `X:1
T:Sforzando
M:4/4
L:1/4
K:C
!sf!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstDirection = outDoc.querySelector("part > measure > direction > direction-type > dynamics > sf");
    expect(firstDirection).not.toBeNull();
  });

  it("ABC->MusicXML parses sfp decoration as dynamics direction", () => {
    const abc = `X:1
T:Sforzando piano
M:4/4
L:1/4
K:C
!sfp!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstDirection = outDoc.querySelector("part > measure > direction > direction-type > dynamics > sfp");
    expect(firstDirection).not.toBeNull();
  });

  it("ABC->MusicXML parses rfz decoration as dynamics direction", () => {
    const abc = `X:1
T:Rinforzando
M:4/4
L:1/4
K:C
!rfz!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstDirection = outDoc.querySelector("part > measure > direction > direction-type > dynamics > rfz");
    expect(firstDirection).not.toBeNull();
  });

  it("ABC->MusicXML parses p decoration as dynamics direction", () => {
    const abc = `X:1
T:Piano
M:4/4
L:1/4
K:C
!p!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstDirection = outDoc.querySelector("part > measure > direction > direction-type > dynamics > p");
    expect(firstDirection).not.toBeNull();
  });

  it("ABC->MusicXML parses pp decoration as dynamics direction", () => {
    const abc = `X:1
T:Pianissimo
M:4/4
L:1/4
K:C
!pp!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstDirection = outDoc.querySelector("part > measure > direction > direction-type > dynamics > pp");
    expect(firstDirection).not.toBeNull();
  });

  it("ABC->MusicXML parses ff decoration as dynamics direction", () => {
    const abc = `X:1
T:Fortissimo
M:4/4
L:1/4
K:C
!ff!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstDirection = outDoc.querySelector("part > measure > direction > direction-type > dynamics > ff");
    expect(firstDirection).not.toBeNull();
  });

  it("ABC->MusicXML parses f decoration as dynamics direction", () => {
    const abc = `X:1
T:Forte
M:4/4
L:1/4
K:C
!f!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstDirection = outDoc.querySelector("part > measure > direction > direction-type > dynamics > f");
    expect(firstDirection).not.toBeNull();
  });

  it("ABC->MusicXML parses fff decoration as dynamics direction", () => {
    const abc = `X:1
T:Fortississimo
M:4/4
L:1/4
K:C
!fff!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstDirection = outDoc.querySelector("part > measure > direction > direction-type > dynamics > fff");
    expect(firstDirection).not.toBeNull();
  });

  it("ABC->MusicXML parses fp decoration as dynamics direction", () => {
    const abc = `X:1
T:Fortepiano
M:4/4
L:1/4
K:C
!fp!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstDirection = outDoc.querySelector("part > measure > direction > direction-type > dynamics > fp");
    expect(firstDirection).not.toBeNull();
  });

  it("ABC->MusicXML parses ppp decoration as dynamics direction", () => {
    const abc = `X:1
T:Pianississimo
M:4/4
L:1/4
K:C
!ppp!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstDirection = outDoc.querySelector("part > measure > direction > direction-type > dynamics > ppp");
    expect(firstDirection).not.toBeNull();
  });

  it("ABC->MusicXML parses mp decoration as dynamics direction", () => {
    const abc = `X:1
T:Mezzo piano
M:4/4
L:1/4
K:C
!mp!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstDirection = outDoc.querySelector("part > measure > direction > direction-type > dynamics > mp");
    expect(firstDirection).not.toBeNull();
  });

  it("ABC->MusicXML parses mf decoration as dynamics direction", () => {
    const abc = `X:1
T:Mezzo forte
M:4/4
L:1/4
K:C
!mf!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstDirection = outDoc.querySelector("part > measure > direction > direction-type > dynamics > mf");
    expect(firstDirection).not.toBeNull();
  });

  it("ABC->MusicXML parses fz decoration as dynamics direction", () => {
    const abc = `X:1
T:Forzando
M:4/4
L:1/4
K:C
!fz!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstDirection = outDoc.querySelector("part > measure > direction > direction-type > dynamics > fz");
    expect(firstDirection).not.toBeNull();
  });

  it("ABC->MusicXML parses common dynamic decorations as dynamics directions", () => {
    const abc = `X:1
T:Common dynamics
M:4/4
L:1/4
K:C
!ppp!C !mp!D !mf!E !ff!F | !fp!G !fz!A !rfz!B !sfp!c |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const dynamics = Array.from(outDoc.querySelectorAll("part > measure > direction > direction-type > dynamics"))
      .map((node) => node.firstElementChild?.tagName?.toLowerCase());
    expect(dynamics).toEqual(["ppp", "mp", "mf", "ff", "fp", "fz", "rfz", "sfp"]);
  });

  it("ABC->MusicXML parses pppp and ffff decorations as dynamics directions", () => {
    const abc = `X:1
T:Extreme dynamics
M:4/4
L:1/4
K:C
!pppp!C !ffff!D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const dynamics = Array.from(outDoc.querySelectorAll("part > measure > direction > direction-type > dynamics"))
      .map((node) => node.firstElementChild?.tagName?.toLowerCase());
    expect(dynamics).toEqual(["pppp", "ffff"]);
  });

  it("ABC->MusicXML accepts mordent aliases used in real-world ABC", () => {
    const abc = `X:1
T:Mordent aliases
M:4/4
L:1/4
K:C
!lowermordent!C !prall!D !uppermordent!E |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > ornaments > mordent")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > ornaments > inverted-mordent")).not.toBeNull();
    expect(notes[2]?.querySelector(":scope > notations > ornaments > inverted-mordent")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !lowermordent! as mordent alias", () => {
    const abc = `X:1
T:Lowermordent alias
M:4/4
L:1/4
K:C
!lowermordent!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > ornaments > mordent")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !uppermordent! as inverted-mordent alias", () => {
    const abc = `X:1
T:Uppermordent alias
M:4/4
L:1/4
K:C
!uppermordent!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > ornaments > inverted-mordent")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !pralltrill! as inverted-mordent alias", () => {
    const abc = `X:1
T:Pralltrill alias
M:4/4
L:1/4
K:C
!pralltrill!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > ornaments > inverted-mordent")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !invertedmordent! as inverted-mordent alias", () => {
    const abc = `X:1
T:Inverted mordent alias
M:4/4
L:1/4
K:C
!invertedmordent!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > ornaments > inverted-mordent")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !inverted-mordent! as inverted-mordent alias", () => {
    const abc = `X:1
T:Inverted-mordent alias
M:4/4
L:1/4
K:C
!inverted-mordent!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > ornaments > inverted-mordent")).not.toBeNull();
  });

  it("ABC->MusicXML parses stopped decoration", () => {
    const abc = `X:1
T:Stopped
M:4/4
L:1/4
K:C
!stopped!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > technical > stopped")).not.toBeNull();
  });

  it("ABC->MusicXML treats !plus! as stopped decoration alias", () => {
    const abc = `X:1
T:Stopped alias
M:4/4
L:1/4
K:C
!plus!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > technical > stopped")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !stopped horn! as stopped alias", () => {
    const abc = `X:1
T:Stopped horn alias
M:4/4
L:1/4
K:C
!stopped horn!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > technical > stopped")).not.toBeNull();
  });

  it("ABC->MusicXML accepts !stopped-horn! as stopped alias", () => {
    const abc = `X:1
T:Stopped horn hyphen alias
M:4/4
L:1/4
K:C
!stopped-horn!C D |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const firstNote = outDoc.querySelector("part > measure > note");
    expect(firstNote?.querySelector(":scope > notations > technical > stopped")).not.toBeNull();
  });

  it("ABC->MusicXML applies beams and splits them at beat boundaries", () => {
    const abc = `X:1
T:Beam test
M:2/4
L:1/8
K:C
V:1
CDEF |`;
    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const pitchedNotes = Array.from(outDoc.querySelectorAll("part > measure > note"))
      .filter((note) => note.querySelector(":scope > pitch") !== null);
    expect(pitchedNotes.length).toBeGreaterThanOrEqual(4);
    const beams = pitchedNotes.map((note) => note.querySelector(":scope > beam")?.textContent?.trim() ?? "");
    expect(beams[0]).toBe("begin");
    expect(beams[1]).toBe("end");
    expect(beams[2]).toBe("begin");
    expect(beams[3]).toBe("end");
  });

  it("ABC->MusicXML treats whitespace as an explicit beam break hint", () => {
    const abc = `X:1
T:Whitespace beam test
M:2/4
L:1/16
K:C
V:1
CD EF GA Bc |`;
    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const pitchedNotes = Array.from(outDoc.querySelectorAll("part > measure > note"))
      .filter((note) => note.querySelector(":scope > pitch") !== null);
    expect(pitchedNotes.length).toBe(8);
    const beams = pitchedNotes.map((note) => note.querySelector(":scope > beam")?.textContent?.trim() ?? "");
    expect(beams).toEqual(["begin", "end", "begin", "end", "begin", "end", "begin", "end"]);
  });

  it("MusicXML->ABC does not preserve beam grouping through exact ABC spacing", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Part 1</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>2</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><type>eighth</type>
        <beam number="1">begin</beam>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><type>eighth</type>
        <beam number="1">end</beam>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><type>eighth</type>
        <beam number="1">begin</beam>
      </note>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><type>eighth</type>
        <beam number="1">end</beam>
      </note>
    </measure>
  </part>
</score-partwise>`;

    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("V:P1");
    expect(abc).toContain("C D E F |");
    expect(abc).not.toContain("CD EF");
  });

  it("ABC->MusicXML uses meter-sized empty-measure rests for missing voice measures", () => {
    const abc = `X:1
T:Missing measure fallback
M:2/4
L:1/8
K:C
V:1
C D | E F |
V:2
G A |`;
    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const core = new ScoreCore();
    core.load(xml);
    const save = core.save();
    expect(save.ok).toBe(true);
    const part2Measure2RestDuration = outDoc.querySelector('part[id="P2"] > measure[number="2"] > note > duration')?.textContent?.trim();
    expect(part2Measure2RestDuration).toBe("1920");
  });

  it("ABC import does not treat grace-note durations as measure occupancy", () => {
    const abc = `X:1
T:Grace occupancy
M:2/4
L:1/8
K:C
V:1
{a}c {b}d {c}e {d}f |`;
    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const overfullDiag = Array.from(outDoc.querySelectorAll('miscellaneous-field[name^="mks:diag:"]'))
      .map((node) => node.textContent?.trim() ?? "")
      .find((text) => text.includes("code=OVERFULL_REFLOWED"));
    expect(overfullDiag).toBeUndefined();
    const core = new ScoreCore();
    core.load(xml);
    const save = core.save();
    expect(save.ok).toBe(true);
  });

  it("exports diag:* miscellaneous-field into %@mks diag metadata lines", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Lead</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
        <miscellaneous>
          <miscellaneous-field name="mks:diag:count">1</miscellaneous-field>
          <miscellaneous-field name="mks:diag:0001">level=warn;code=OVERFULL_CLAMPED;fmt=mei;measure=1</miscellaneous-field>
        </miscellaneous>
      </attributes>
      <note><rest/><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const abc = exportMusicXmlDomToAbc(doc);
    expect(abc).toContain("%@mks diag");
    expect(abc).toContain("name=mks:diag:count");
    expect(abc).toContain("name=mks:diag:0001");
    expect(abc).toContain("enc=uri-v1");
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

  it("ABC->MusicXML warns when slur stop has no preceding non-rest note", () => {
    const abc = `X:1
T:Slur stop after rest
M:4/4
L:1/8
K:C
V:1
(c2 z2) e2 f2 |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:count"]')?.textContent?.trim()).toBe("1");
    expect(outDoc.querySelector('miscellaneous-field[name="mks:diag:0001"]')?.textContent).toContain(
      "slur stop()) has no preceding note; skipped."
    );
  });

  it("ABC->MusicXML applies chord ties to all notes in the chord", () => {
    const abc = `X:1
T:Chord tie test
M:4/4
L:1/4
K:C
[CE]-[CE] z2 |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    const firstChord = notes.slice(0, 2);
    const secondChord = notes.slice(2, 4);
    expect(firstChord).toHaveLength(2);
    expect(secondChord).toHaveLength(2);
    expect(firstChord.every((note) => note.querySelector(':scope > tie[type="start"]') !== null)).toBe(true);
    expect(firstChord.every((note) => note.querySelector(':scope > notations > tied[type="start"]') !== null)).toBe(true);
    expect(secondChord.every((note) => note.querySelector(':scope > tie[type="stop"]') !== null)).toBe(true);
    expect(secondChord.every((note) => note.querySelector(':scope > notations > tied[type="stop"]') !== null)).toBe(true);
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
    expect(outDoc.querySelector('note > notations > ornaments > wavy-line[type="start"]')).toBeNull();
  });

  it("MusicXML->ABC preserves grace notes without ornaments", () => {
    const xmlWithGrace = `<?xml version="1.0" encoding="UTF-8"?>
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
      </note>
      <note>
        <rest/><duration>1920</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithGrace);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toMatch(/\{[^}]+\}/);
    expect(abc).not.toContain("!trill!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > grace")).not.toBeNull();
    expect(outDoc.querySelector("note > notations > ornaments > trill-mark")).toBeNull();
  });

  it("MusicXML->ABC exports trill decoration without grace notes and roundtrips it", () => {
    const xmlWithTrill = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><ornaments><trill-mark/></ornaments></notations>
      </note>
      <note>
        <rest/><duration>1920</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithTrill);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!trill!");
    expect(abc).not.toMatch(/\{[^}]+\}/);

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > grace")).toBeNull();
    expect(outDoc.querySelector("note > notations > ornaments > trill-mark")).not.toBeNull();
    expect(outDoc.querySelector('note > notations > ornaments > wavy-line[type="start"]')).toBeNull();
  });

  it("ABC trill alias !tr! roundtrips back to canonical !trill!", () => {
    const abc = `X:1
T:Trill short alias
M:4/4
L:1/4
K:C
!tr!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > ornaments > trill-mark")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!trill!");
    expect(exportedAbc).not.toContain("!tr!");
  });

  it("ABC trill alias !triller! roundtrips back to canonical !trill!", () => {
    const abc = `X:1
T:Trill alias
M:4/4
L:1/4
K:C
!triller!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > ornaments > trill-mark")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!trill!");
    expect(exportedAbc).not.toContain("!triller!");
  });

  it("MusicXML->ABC exports turn and grace slash notes and roundtrips them", () => {
    const xmlWithTurn = `<?xml version="1.0" encoding="UTF-8"?>
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
        <grace slash="yes"/>
        <pitch><step>G</step><octave>4</octave></pitch>
        <voice>1</voice><type>eighth</type>
      </note>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>1920</duration>
        <voice>1</voice><type>half</type>
        <notations><ornaments><turn/></ornaments></notations>
      </note>
      <note>
        <rest/><duration>1920</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithTurn);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!turn!");
    expect(abc).toMatch(/\{\/[^}]+\}/);

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector('note > grace[slash="yes"]')).not.toBeNull();
    expect(outDoc.querySelector("note > notations > ornaments > turn")).not.toBeNull();
  });

  it("MusicXML->ABC preserves slash grace notes without ornaments", () => {
    const xmlWithSlashGrace = `<?xml version="1.0" encoding="UTF-8"?>
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
        <grace slash="yes"/>
        <pitch><step>G</step><octave>4</octave></pitch>
        <voice>1</voice><type>eighth</type>
      </note>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>1920</duration>
        <voice>1</voice><type>half</type>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithSlashGrace);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toMatch(/\{\/[^}]+\}/);

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector('note > grace[slash="yes"]')).not.toBeNull();
    expect(outDoc.querySelector("note > notations > ornaments > turn")).toBeNull();
  });

  it("MusicXML->ABC preserves turn together with slash grace notes", () => {
    const xmlWithTurnAndSlashGrace = `<?xml version="1.0" encoding="UTF-8"?>
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
        <grace slash="yes"/>
        <pitch><step>G</step><octave>4</octave></pitch>
        <voice>1</voice><type>eighth</type>
      </note>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>1920</duration>
        <voice>1</voice><type>half</type>
        <notations><ornaments><turn/></ornaments></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithTurnAndSlashGrace);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!turn!");
    expect(abc).toMatch(/\{\/[^}]+\}/);

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector('note > grace[slash="yes"]')).not.toBeNull();
    expect(outDoc.querySelector("note > notations > ornaments > turn")).not.toBeNull();
  });

  it("MusicXML->ABC exports turn and roundtrips it", () => {
    const xmlWithTurn = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><ornaments><turn/></ornaments></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithTurn);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!turn!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > ornaments > turn")).not.toBeNull();
  });

  it("MusicXML->ABC exports inverted-turn and roundtrips it", () => {
    const xmlWithInvertedTurn = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><ornaments><inverted-turn/></ornaments></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithInvertedTurn);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!invertedturn!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > ornaments > inverted-turn")).not.toBeNull();
  });

  it("ABC inverted-turn alias !lowerturn! roundtrips back to canonical !invertedturn!", () => {
    const abc = `X:1
T:Lower turn alias
M:4/4
L:1/4
K:C
!lowerturn!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > ornaments > inverted-turn")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!invertedturn!");
    expect(exportedAbc).not.toContain("!lowerturn!");
  });

  it("MusicXML->ABC exports turnx and invertedturnx variants and roundtrips them", () => {
    const xmlWithTurnSlashVariants = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><ornaments><turn slash="yes"/></ornaments></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><ornaments><inverted-turn slash="yes"/></ornaments></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithTurnSlashVariants);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!turnx!");
    expect(abc).toContain("!invertedturnx!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(':scope > notations > ornaments > turn[slash="yes"]')).not.toBeNull();
    expect(notes[1]?.querySelector(':scope > notations > ornaments > inverted-turn[slash="yes"]')).not.toBeNull();
  });

  it("MusicXML->ABC exports delayed turn variants and roundtrips them", () => {
    const xmlWithDelayedTurns = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><ornaments><turn/><delayed-turn/></ornaments></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><ornaments><inverted-turn/><delayed-turn/></ornaments></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDelayedTurns);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!delayedturn!");
    expect(abc).toContain("!delayedinvertedturn!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > ornaments > turn")).not.toBeNull();
    expect(notes[0]?.querySelector(":scope > notations > ornaments > delayed-turn")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > ornaments > inverted-turn")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > ornaments > delayed-turn")).not.toBeNull();
  });

  it("MusicXML->ABC exports delayed turn and roundtrips it", () => {
    const xmlWithDelayedTurn = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><ornaments><turn/><delayed-turn/></ornaments></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDelayedTurn);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!delayedturn!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > ornaments > turn")).not.toBeNull();
    expect(outDoc.querySelector("note > notations > ornaments > delayed-turn")).not.toBeNull();
  });

  it("MusicXML->ABC exports delayed inverted-turn and roundtrips it", () => {
    const xmlWithDelayedInvertedTurn = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><ornaments><inverted-turn/><delayed-turn/></ornaments></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDelayedInvertedTurn);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!delayedinvertedturn!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > ornaments > inverted-turn")).not.toBeNull();
    expect(outDoc.querySelector("note > notations > ornaments > delayed-turn")).not.toBeNull();
  });

  it("MusicXML->ABC exports tremolo as mikuscore decorations and roundtrips it", () => {
    const xmlWithTremolo = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><ornaments><tremolo type="single">3</tremolo></ornaments></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><ornaments><tremolo type="start">2</tremolo></ornaments></notations>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><ornaments><tremolo type="stop">2</tremolo></ornaments></notations>
      </note>
      <note><rest/><duration>960</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithTremolo);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!tremolo-single-3!");
    expect(abc).toContain("!tremolo-start-2!");
    expect(abc).toContain("!tremolo-stop-2!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const tremolos = Array.from(outDoc.querySelectorAll("part > measure > note > notations > ornaments > tremolo"));
    expect(tremolos[0]?.getAttribute("type")).toBe("single");
    expect(tremolos[0]?.textContent?.trim()).toBe("3");
    expect(tremolos[1]?.getAttribute("type")).toBe("start");
    expect(tremolos[1]?.textContent?.trim()).toBe("2");
    expect(tremolos[2]?.getAttribute("type")).toBe("stop");
    expect(tremolos[2]?.textContent?.trim()).toBe("2");
  });

  it("MusicXML->ABC exports single tremolo and roundtrips it", () => {
    const xmlWithSingleTremolo = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><ornaments><tremolo type="single">3</tremolo></ornaments></notations>
      </note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type><dot/></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithSingleTremolo);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!tremolo-single-3!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const tremolo = outDoc.querySelector("part > measure > note > notations > ornaments > tremolo");
    expect(tremolo?.getAttribute("type")).toBe("single");
    expect(tremolo?.textContent?.trim()).toBe("3");
  });

  it("MusicXML->ABC exports tremolo start and roundtrips it", () => {
    const xmlWithTremoloStart = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><ornaments><tremolo type="start">2</tremolo></ornaments></notations>
      </note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type><dot/></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithTremoloStart);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!tremolo-start-2!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const tremolo = outDoc.querySelector("part > measure > note > notations > ornaments > tremolo");
    expect(tremolo?.getAttribute("type")).toBe("start");
    expect(tremolo?.textContent?.trim()).toBe("2");
  });

  it("MusicXML->ABC exports tremolo stop and roundtrips it", () => {
    const xmlWithTremoloStop = `<?xml version="1.0" encoding="UTF-8"?>
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
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><ornaments><tremolo type="stop">2</tremolo></ornaments></notations>
      </note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type><dot/></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithTremoloStop);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!tremolo-stop-2!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const tremolo = outDoc.querySelector("part > measure > note > notations > ornaments > tremolo");
    expect(tremolo?.getAttribute("type")).toBe("stop");
    expect(tremolo?.textContent?.trim()).toBe("2");
  });

  it("MusicXML->ABC exports glissando/slide as mikuscore decorations and roundtrips them", () => {
    const xmlWithSpanners = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><glissando type="start" number="1">wavy</glissando></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><glissando type="stop" number="1">wavy</glissando></notations>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><slide type="start" number="1"/></notations>
      </note>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><slide type="stop" number="1"/></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithSpanners);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!gliss-start!");
    expect(abc).toContain("!gliss-stop!");
    expect(abc).toContain("!slide!");
    expect(abc).toContain("!slide-stop!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(':scope > notations > glissando[type="start"]')).not.toBeNull();
    expect(notes[1]?.querySelector(':scope > notations > glissando[type="stop"]')).not.toBeNull();
    expect(notes[2]?.querySelector(':scope > notations > slide[type="start"]')).not.toBeNull();
    expect(notes[3]?.querySelector(':scope > notations > slide[type="stop"]')).not.toBeNull();
  });

  it("MusicXML->ABC exports glissando start and roundtrips it", () => {
    const xmlWithGlissStart = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><glissando type="start" number="1">wavy</glissando></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithGlissStart);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!gliss-start!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector('note > notations > glissando[type="start"]')).not.toBeNull();
  });

  it("MusicXML->ABC exports glissando stop and roundtrips it", () => {
    const xmlWithGlissStop = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><glissando type="stop" number="1">wavy</glissando></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithGlissStop);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!gliss-stop!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector('note > notations > glissando[type="stop"]')).not.toBeNull();
  });

  it("MusicXML->ABC exports slide start and roundtrips it", () => {
    const xmlWithSlideStart = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><slide type="start" number="1"/></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithSlideStart);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!slide!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector('note > notations > slide[type="start"]')).not.toBeNull();
  });

  it("MusicXML->ABC exports slide stop and roundtrips it", () => {
    const xmlWithSlideStop = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><slide type="stop" number="1"/></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithSlideStop);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!slide-stop!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector('note > notations > slide[type="stop"]')).not.toBeNull();
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

  it("MusicXML->ABC exports long trill start and stop decorations", () => {
    const xmlWithLongTrill = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>960</duration>
        <voice>1</voice><type>quarter</type>
        <notations><ornaments><trill-mark/><wavy-line type="start"/></ornaments></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>960</duration>
        <voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>960</duration>
        <voice>1</voice><type>quarter</type>
        <notations><ornaments><wavy-line type="stop"/></ornaments></notations>
      </note>
      <note>
        <rest/><duration>960</duration><voice>1</voice><type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithLongTrill);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!trill(!");
    expect(abc).toContain("!trill)!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > ornaments > trill-mark")).not.toBeNull();
    expect(notes[0]?.querySelector(':scope > notations > ornaments > wavy-line[type="start"]')).not.toBeNull();
    expect(notes[2]?.querySelector(':scope > notations > ornaments > wavy-line[type="stop"]')).not.toBeNull();
  });

  it("MusicXML->ABC exports phrase-mark decorations and roundtrips them", () => {
    const xmlWithPhraseMarks = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>960</duration>
        <voice>1</voice><type>quarter</type>
        <notations><articulations><other-articulation>shortphrase</other-articulation></articulations></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>960</duration>
        <voice>1</voice><type>quarter</type>
        <notations><articulations><other-articulation>mediumphrase</other-articulation></articulations></notations>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>960</duration>
        <voice>1</voice><type>quarter</type>
        <notations><articulations><other-articulation>longphrase</other-articulation></articulations></notations>
      </note>
      <note>
        <rest/><duration>960</duration><voice>1</voice><type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithPhraseMarks);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!shortphrase!");
    expect(abc).toContain("!mediumphrase!");
    expect(abc).toContain("!longphrase!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(':scope > notations > articulations > other-articulation')?.textContent?.trim()).toBe("shortphrase");
    expect(notes[1]?.querySelector(':scope > notations > articulations > other-articulation')?.textContent?.trim()).toBe("mediumphrase");
    expect(notes[2]?.querySelector(':scope > notations > articulations > other-articulation')?.textContent?.trim()).toBe("longphrase");
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

  it("MusicXML->ABC exports accent, tenuto, and fermata decorations and roundtrips them", () => {
    const xmlWithDecorations = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>960</duration>
        <voice>1</voice><type>quarter</type>
        <notations><articulations><accent/></articulations></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>960</duration>
        <voice>1</voice><type>quarter</type>
        <notations><articulations><tenuto/></articulations></notations>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>960</duration>
        <voice>1</voice><type>quarter</type>
        <notations><fermata>normal</fermata></notations>
      </note>
      <note>
        <rest/><duration>960</duration><voice>1</voice><type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDecorations);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!accent!");
    expect(abc).toContain("!tenuto!");
    expect(abc).toContain("!fermata!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > articulations > accent")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > articulations > tenuto")).not.toBeNull();
    expect(notes[2]?.querySelector(":scope > notations > fermata")).not.toBeNull();
  });

  it("MusicXML->ABC exports accent decoration and roundtrips it", () => {
    const xmlWithAccent = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><articulations><accent/></articulations></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithAccent);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!accent!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > articulations > accent")).not.toBeNull();
  });

  it("ABC accent alias !>! roundtrips back to canonical !accent!", () => {
    const abc = `X:1
T:Accent alias symbol
M:4/4
L:1/4
K:C
!>!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > articulations > accent")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!accent!");
    expect(exportedAbc).not.toContain("!>!");
  });

  it("ABC accent alias !emphasis! roundtrips back to canonical !accent!", () => {
    const abc = `X:1
T:Accent alias emphasis
M:4/4
L:1/4
K:C
!emphasis!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > articulations > accent")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!accent!");
    expect(exportedAbc).not.toContain("!emphasis!");
  });

  it("ABC staccato alias !stacc! roundtrips back to canonical !staccato!", () => {
    const abc = `X:1
T:Stacc alias
M:4/4
L:1/4
K:C
!stacc!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > articulations > staccato")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!staccato!");
    expect(exportedAbc).not.toContain("!stacc!");
  });

  it("ABC staccato alias !stac! roundtrips back to canonical !staccato!", () => {
    const abc = `X:1
T:Stac alias
M:4/4
L:1/4
K:C
!stac!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > articulations > staccato")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!staccato!");
    expect(exportedAbc).not.toContain("!stac!");
  });

  it("MusicXML->ABC exports tenuto decoration and roundtrips it", () => {
    const xmlWithTenuto = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><articulations><tenuto/></articulations></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithTenuto);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!tenuto!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > articulations > tenuto")).not.toBeNull();
  });

  it("MusicXML->ABC exports fermata decoration and roundtrips it", () => {
    const xmlWithFermata = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><fermata>normal</fermata></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithFermata);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!fermata!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > fermata")).not.toBeNull();
  });

  it("MusicXML->ABC exports stress and unstress decorations and roundtrips them", () => {
    const xmlWithStress = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>960</duration>
        <voice>1</voice><type>quarter</type>
        <notations><articulations><stress/></articulations></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>960</duration>
        <voice>1</voice><type>quarter</type>
        <notations><articulations><unstress/></articulations></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithStress);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!stress!");
    expect(abc).toContain("!unstress!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > articulations > stress")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > articulations > unstress")).not.toBeNull();
  });

  it("MusicXML->ABC exports stress decoration and roundtrips it", () => {
    const xmlWithStress = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><articulations><stress/></articulations></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithStress);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!stress!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > articulations > stress")).not.toBeNull();
  });

  it("MusicXML->ABC exports unstress decoration and roundtrips it", () => {
    const xmlWithUnstress = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><articulations><unstress/></articulations></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithUnstress);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!unstress!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > articulations > unstress")).not.toBeNull();
  });

  it("MusicXML->ABC exports inverted fermata and roundtrips it", () => {
    const xmlWithInvertedFermata = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><fermata type="inverted">inverted</fermata></notations>
      </note>
      <note>
        <rest/><duration>1920</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithInvertedFermata);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!invertedfermata!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > fermata")?.textContent?.trim()).toBe("inverted");
  });

  it("ABC inverted fermata alias !inverted fermata! roundtrips back to canonical !invertedfermata!", () => {
    const abc = `X:1
T:Inverted fermata alias
M:4/4
L:1/4
K:C
!inverted fermata!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > fermata")?.textContent?.trim()).toBe("inverted");

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!invertedfermata!");
    expect(exportedAbc).not.toContain("!inverted fermata!");
  });

  it("MusicXML->ABC exports marcato, breath, and caesura decorations and roundtrips them", () => {
    const xmlWithDecorations = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>960</duration>
        <voice>1</voice><type>quarter</type>
        <notations><articulations><strong-accent/></articulations></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>960</duration>
        <voice>1</voice><type>quarter</type>
        <notations><articulations><breath-mark/></articulations></notations>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>960</duration>
        <voice>1</voice><type>quarter</type>
        <notations><articulations><caesura/></articulations></notations>
      </note>
      <note>
        <rest/><duration>960</duration><voice>1</voice><type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDecorations);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!marcato!");
    expect(abc).toContain("!breath!");
    expect(abc).toContain("!caesura!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > articulations > strong-accent")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > articulations > breath-mark")).not.toBeNull();
    expect(notes[2]?.querySelector(":scope > notations > articulations > caesura")).not.toBeNull();
  });

  it("MusicXML->ABC exports marcato decoration and roundtrips it", () => {
    const xmlWithMarcato = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><articulations><strong-accent/></articulations></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithMarcato);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!marcato!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > articulations > strong-accent")).not.toBeNull();
  });

  it("ABC marcato alias !strong accent! roundtrips back to canonical !marcato!", () => {
    const abc = `X:1
T:Marcato alias
M:4/4
L:1/4
K:C
!strong accent!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > articulations > strong-accent")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!marcato!");
    expect(exportedAbc).not.toContain("!strong accent!");
  });

  it("ABC marcato alias !strongaccent! roundtrips back to canonical !marcato!", () => {
    const abc = `X:1
T:Marcato compact alias
M:4/4
L:1/4
K:C
!strongaccent!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > articulations > strong-accent")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!marcato!");
    expect(exportedAbc).not.toContain("!strongaccent!");
  });

  it("ABC marcato alias !strong-accent! roundtrips back to canonical !marcato!", () => {
    const abc = `X:1
T:Marcato hyphen alias
M:4/4
L:1/4
K:C
!strong-accent!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > articulations > strong-accent")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!marcato!");
    expect(exportedAbc).not.toContain("!strong-accent!");
  });

  it("MusicXML->ABC exports breath decoration and roundtrips it", () => {
    const xmlWithBreath = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><articulations><breath-mark/></articulations></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithBreath);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!breath!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > articulations > breath-mark")).not.toBeNull();
  });

  it("ABC breath-mark alias !breathmark! roundtrips back to canonical !breath!", () => {
    const abc = `X:1
T:Breath alias
M:4/4
L:1/4
K:C
!breathmark!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > articulations > breath-mark")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!breath!");
    expect(exportedAbc).not.toContain("!breathmark!");
  });

  it("ABC breath-mark alias !breath mark! roundtrips back to canonical !breath!", () => {
    const abc = `X:1
T:Breath spaced alias
M:4/4
L:1/4
K:C
!breath mark!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > articulations > breath-mark")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!breath!");
    expect(exportedAbc).not.toContain("!breath mark!");
  });

  it("ABC breath-mark alias !breath-mark! roundtrips back to canonical !breath!", () => {
    const abc = `X:1
T:Breath hyphen alias
M:4/4
L:1/4
K:C
!breath-mark!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > articulations > breath-mark")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!breath!");
    expect(exportedAbc).not.toContain("!breath-mark!");
  });

  it("MusicXML->ABC exports caesura decoration and roundtrips it", () => {
    const xmlWithCaesura = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><articulations><caesura/></articulations></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithCaesura);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!caesura!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > articulations > caesura")).not.toBeNull();
  });

  it("MusicXML->ABC exports staccatissimo as !wedge! and roundtrips it", () => {
    const xmlWithStaccatissimo = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><articulations><staccatissimo/></articulations></notations>
      </note>
      <note>
        <rest/><duration>1920</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithStaccatissimo);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!wedge!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > articulations > staccatissimo")).not.toBeNull();
    expect(outDoc.querySelector("note > notations > articulations > staccato")).toBeNull();
  });

  it("ABC staccatissimo alias !spiccato! roundtrips back to canonical !wedge!", () => {
    const abc = `X:1
T:Spiccato alias
M:4/4
L:1/4
K:C
!spiccato!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > articulations > staccatissimo")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!wedge!");
    expect(exportedAbc).not.toContain("!spiccato!");
  });

  it("MusicXML->ABC exports wedge directions as ABC wedge decorations and roundtrips them", () => {
    const xml = `<score-partwise version="3.1">
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
      <direction><direction-type><wedge type="crescendo"/></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <direction><direction-type><wedge type="stop"/></direction-type></direction>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <direction><direction-type><wedge type="diminuendo"/></direction-type></direction>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <direction><direction-type><wedge type="stop"/></direction-type></direction>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;

    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!crescendo(!C");
    expect(abc).toContain("!crescendo)!D");
    expect(abc).toContain("!diminuendo(!E");
    expect(abc).toContain("!diminuendo)!F");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const wedgeTypes = Array.from(outDoc.querySelectorAll("part > measure > direction > direction-type > wedge"))
      .map((node) => node.getAttribute("type"));
    expect(wedgeTypes).toEqual(["crescendo", "stop", "diminuendo", "stop"]);
  });

  it("MusicXML->ABC exports pppp and ffff dynamics and roundtrips them", () => {
    const xml = `<score-partwise version="3.1">
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
      <direction><direction-type><dynamics><pppp/></dynamics></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <direction><direction-type><dynamics><ffff/></dynamics></direction-type></direction>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;

    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!pppp!C");
    expect(abc).toContain("!ffff!D");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const dynamics = Array.from(outDoc.querySelectorAll("part > measure > direction > direction-type > dynamics"))
      .map((node) => node.firstElementChild?.tagName?.toLowerCase());
    expect(dynamics).toEqual(["pppp", "ffff"]);
  });

  it("MusicXML->ABC exports crescendo wedge start and roundtrips it", () => {
    const xml = `<score-partwise version="3.1">
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
      <direction><direction-type><wedge type="crescendo"/></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!crescendo(!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > wedge")?.getAttribute("type")).toBe("crescendo");
  });

  it("ABC wedge alias !<(! roundtrips back to canonical !crescendo(!", () => {
    const abc = `X:1
T:Symbolic crescendo alias
M:4/4
L:1/4
K:C
!<(!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("part > measure > direction > direction-type > wedge")?.getAttribute("type")).toBe("crescendo");

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!crescendo(!C");
    expect(exportedAbc).not.toContain("!<(!");
  });

  it("MusicXML->ABC exports wedge stop and roundtrips it", () => {
    const xml = `<score-partwise version="3.1">
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
      <direction><direction-type><wedge type="stop"/></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain(")!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > wedge")?.getAttribute("type")).toBe("stop");
  });

  it("MusicXML->ABC exports diminuendo wedge start and roundtrips it", () => {
    const xml = `<score-partwise version="3.1">
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
      <direction><direction-type><wedge type="diminuendo"/></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!diminuendo(!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > wedge")?.getAttribute("type")).toBe("diminuendo");
  });

  it("ABC wedge alias !>(! roundtrips back to canonical !diminuendo(!", () => {
    const abc = `X:1
T:Symbolic diminuendo alias
M:4/4
L:1/4
K:C
!>(!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("part > measure > direction > direction-type > wedge")?.getAttribute("type")).toBe("diminuendo");

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!diminuendo(!C");
    expect(exportedAbc).not.toContain("!>(!");
  });

  it("ABC wedge alias !<)! roundtrips back to canonical !crescendo)!", () => {
    const abc = `X:1
T:Symbolic crescendo stop alias
M:4/4
L:1/4
K:C
C !<)!D |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("part > measure > direction > direction-type > wedge")?.getAttribute("type")).toBe("stop");

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!crescendo)!D");
    expect(exportedAbc).not.toContain("!<)!");
  });

  it("ABC wedge alias !>)! roundtrips back to canonical !diminuendo)!", () => {
    const abc = `X:1
T:Symbolic diminuendo stop alias
M:4/4
L:1/4
K:C
!>(!C !>)!D |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(
      Array.from(srcDoc.querySelectorAll("part > measure > direction > direction-type > wedge")).some(
        (node) => node.getAttribute("type") === "stop",
      ),
    ).toBe(true);

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!diminuendo)!D");
    expect(exportedAbc).not.toContain("!>)!");
  });

  it("MusicXML->ABC exports up-bow/down-bow and roundtrips them", () => {
    const xmlWithBowing = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>960</duration>
        <voice>1</voice><type>quarter</type>
        <notations><technical><up-bow/></technical></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>960</duration>
        <voice>1</voice><type>quarter</type>
        <notations><technical><down-bow/></technical></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithBowing);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!upbow!");
    expect(abc).toContain("!downbow!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > technical > up-bow")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > technical > down-bow")).not.toBeNull();
  });

  it("MusicXML->ABC exports up-bow and roundtrips it", () => {
    const xmlWithUpBow = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><technical><up-bow/></technical></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithUpBow);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!upbow!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > technical > up-bow")).not.toBeNull();
  });

  it("ABC bowing alias !up bow! roundtrips back to canonical !upbow!", () => {
    const abc = `X:1
T:Bowing alias
M:4/4
L:1/4
K:C
!up bow!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > up-bow")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!upbow!");
    expect(exportedAbc).not.toContain("!up bow!");
  });

  it("ABC bowing alias !up-bow! roundtrips back to canonical !upbow!", () => {
    const abc = `X:1
T:Up-bow hyphen alias
M:4/4
L:1/4
K:C
!up-bow!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > up-bow")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!upbow!");
    expect(exportedAbc).not.toContain("!up-bow!");
  });

  it("ABC bowing alias !down-bow! roundtrips back to canonical !downbow!", () => {
    const abc = `X:1
T:Down-bow hyphen alias
M:4/4
L:1/4
K:C
!down-bow!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > down-bow")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!downbow!");
    expect(exportedAbc).not.toContain("!down-bow!");
  });

  it("ABC bowing alias !down bow! roundtrips back to canonical !downbow!", () => {
    const abc = `X:1
T:Down bow spaced alias
M:4/4
L:1/4
K:C
!down bow!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > down-bow")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!downbow!");
    expect(exportedAbc).not.toContain("!down bow!");
  });

  it("MusicXML->ABC exports down-bow and roundtrips it", () => {
    const xmlWithDownBow = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><technical><down-bow/></technical></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDownBow);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!downbow!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > technical > down-bow")).not.toBeNull();
  });

  it("MusicXML->ABC exports double-tongue, triple-tongue, heel, and toe and roundtrips them", () => {
    const xmlWithTechnicalMarks = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><technical><double-tongue/></technical></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><technical><triple-tongue/></technical></notations>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><technical><heel/></technical></notations>
      </note>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><technical><toe/></technical></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithTechnicalMarks);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!doubletongue!");
    expect(abc).toContain("!tripletongue!");
    expect(abc).toContain("!heel!");
    expect(abc).toContain("!toe!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > technical > double-tongue")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > technical > triple-tongue")).not.toBeNull();
    expect(notes[2]?.querySelector(":scope > notations > technical > heel")).not.toBeNull();
    expect(notes[3]?.querySelector(":scope > notations > technical > toe")).not.toBeNull();
  });

  it("MusicXML->ABC exports double-tongue and roundtrips it", () => {
    const xmlWithDoubleTongue = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><technical><double-tongue/></technical></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDoubleTongue);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!doubletongue!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > technical > double-tongue")).not.toBeNull();
  });

  it("ABC tongue alias !double tongue! roundtrips back to canonical !doubletongue!", () => {
    const abc = `X:1
T:Tongue alias
M:4/4
L:1/4
K:C
!double tongue!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > double-tongue")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!doubletongue!");
    expect(exportedAbc).not.toContain("!double tongue!");
  });

  it("ABC tongue alias !double-tongue! roundtrips back to canonical !doubletongue!", () => {
    const abc = `X:1
T:Double tongue hyphen alias
M:4/4
L:1/4
K:C
!double-tongue!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > double-tongue")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!doubletongue!");
    expect(exportedAbc).not.toContain("!double-tongue!");
  });

  it("ABC tongue alias !triple tongue! roundtrips back to canonical !tripletongue!", () => {
    const abc = `X:1
T:Triple tongue alias
M:4/4
L:1/4
K:C
!triple tongue!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > triple-tongue")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!tripletongue!");
    expect(exportedAbc).not.toContain("!triple tongue!");
  });

  it("ABC tongue alias !triple-tongue! roundtrips back to canonical !tripletongue!", () => {
    const abc = `X:1
T:Triple tongue hyphen alias
M:4/4
L:1/4
K:C
!triple-tongue!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > triple-tongue")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!tripletongue!");
    expect(exportedAbc).not.toContain("!triple-tongue!");
  });

  it("MusicXML->ABC exports triple-tongue and roundtrips it", () => {
    const xmlWithTripleTongue = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><technical><triple-tongue/></technical></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithTripleTongue);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!tripletongue!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > technical > triple-tongue")).not.toBeNull();
  });

  it("MusicXML->ABC exports heel and roundtrips it", () => {
    const xmlWithHeel = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><technical><heel/></technical></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithHeel);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!heel!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > technical > heel")).not.toBeNull();
  });

  it("ABC toe alias !toe mark! roundtrips back to canonical !toe!", () => {
    const abc = `X:1
T:Toe mark alias
M:4/4
L:1/4
K:C
!toe mark!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > toe")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!toe!");
    expect(exportedAbc).not.toContain("!toe mark!");
  });

  it("ABC heel alias !heel mark! roundtrips back to canonical !heel!", () => {
    const abc = `X:1
T:Heel mark alias
M:4/4
L:1/4
K:C
!heel mark!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > heel")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!heel!");
    expect(exportedAbc).not.toContain("!heel mark!");
  });

  it("MusicXML->ABC exports toe and roundtrips it", () => {
    const xmlWithToe = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><technical><toe/></technical></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithToe);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!toe!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > technical > toe")).not.toBeNull();
  });

  it("MusicXML->ABC exports fingering and string as mikuscore decorations and roundtrips them", () => {
    const xmlWithFingeringsAndStrings = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><technical><fingering>1</fingering><fingering substitution="yes">4</fingering></technical></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><technical><string>1</string></technical></notations>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><technical><string>4</string></technical></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithFingeringsAndStrings);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!1!");
    expect(abc).toContain("!4!");
    expect(abc).toContain("!string:1!");
    expect(abc).toContain("!string:4!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    const fingerings = Array.from(notes[0]?.querySelectorAll(":scope > notations > technical > fingering") ?? []).map((n) => n.textContent?.trim());
    expect(fingerings).toEqual(["1", "4"]);
    expect(notes[1]?.querySelector(":scope > notations > technical > string")?.textContent?.trim()).toBe("1");
    expect(notes[2]?.querySelector(":scope > notations > technical > string")?.textContent?.trim()).toBe("4");
  });

  it("MusicXML->ABC exports fingering decorations and roundtrips them", () => {
    const xmlWithFingerings = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><technical><fingering>1</fingering><fingering substitution="yes">4</fingering></technical></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithFingerings);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!1!");
    expect(abc).toContain("!4!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const fingerings = Array.from(outDoc.querySelectorAll("note > notations > technical > fingering")).map((n) => n.textContent?.trim());
    expect(fingerings).toEqual(["1", "4"]);
  });

  it("MusicXML->ABC exports a single fingering decoration and roundtrips it", () => {
    const xmlWithSingleFingering = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><technical><fingering>1</fingering></technical></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithSingleFingering);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!1!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const fingerings = Array.from(outDoc.querySelectorAll("note > notations > technical > fingering")).map((n) => n.textContent?.trim());
    expect(fingerings).toEqual(["1"]);
  });

  it("MusicXML->ABC exports single-digit fingering 0-5 using standard decorations and roundtrips them", () => {
    const xmlWithDigitFingerings = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><technical><fingering>0</fingering></technical></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><technical><fingering>5</fingering></technical></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDigitFingerings);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!0!C");
    expect(abc).toContain("!5!D");
    expect(abc).not.toContain("!fingering:0!");
    expect(abc).not.toContain("!fingering:5!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const fingerings = Array.from(outDoc.querySelectorAll("note > notations > technical > fingering")).map((n) => n.textContent?.trim());
    expect(fingerings).toEqual(["0", "5"]);
  });

  it("MusicXML->ABC exports string decorations and roundtrips them", () => {
    const xmlWithString = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><technical><string>3</string></technical></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithString);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!string:3!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > technical > string")?.textContent?.trim()).toBe("3");
  });

  it("MusicXML->ABC exports a single string decoration and roundtrips it", () => {
    const xmlWithSingleString = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><technical><string>2</string></technical></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithSingleString);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!string:2!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > technical > string")?.textContent?.trim()).toBe("2");
  });

  it("MusicXML->ABC exports pluck as mikuscore decorations and roundtrips it", () => {
    const xmlWithPluck = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>3840</duration><voice>1</voice><type>whole</type>
        <notations><technical><pluck>p</pluck><pluck>i</pluck><pluck>m</pluck><pluck>a</pluck></technical></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithPluck);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!pluck:p!");
    expect(abc).toContain("!pluck:i!");
    expect(abc).toContain("!pluck:m!");
    expect(abc).toContain("!pluck:a!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const plucks = Array.from(outDoc.querySelectorAll("part > measure > note > notations > technical > pluck")).map((n) => n.textContent?.trim());
    expect(plucks).toEqual(["p", "i", "m", "a"]);
  });

  it("MusicXML->ABC exports a single pluck decoration and roundtrips it", () => {
    const xmlWithSinglePluck = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><technical><pluck>p</pluck></technical></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithSinglePluck);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!pluck:p!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const plucks = Array.from(outDoc.querySelectorAll("note > notations > technical > pluck")).map((n) => n.textContent?.trim());
    expect(plucks).toEqual(["p"]);
  });

  it("MusicXML->ABC exports open-string and roundtrips it", () => {
    const xmlWithOpenString = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><technical><open-string/></technical></notations>
      </note>
      <note>
        <rest/><duration>1920</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithOpenString);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!open!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > technical > open-string")).not.toBeNull();
  });

  it("ABC open-string alias !openstring! roundtrips back to canonical !open!", () => {
    const abc = `X:1
T:Open string alias
M:4/4
L:1/4
K:C
!openstring!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > open-string")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!open!");
    expect(exportedAbc).not.toContain("!openstring!");
  });

  it("ABC open-string alias !open-string! roundtrips back to canonical !open!", () => {
    const abc = `X:1
T:Open-string alias
M:4/4
L:1/4
K:C
!open-string!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > open-string")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!open!");
    expect(exportedAbc).not.toContain("!open-string!");
  });

  it("ABC open-string alias !open string! roundtrips back to canonical !open!", () => {
    const abc = `X:1
T:Open string spaced alias
M:4/4
L:1/4
K:C
!open string!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > open-string")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!open!");
    expect(exportedAbc).not.toContain("!open string!");
  });

  it("MusicXML->ABC exports snap-pizzicato and roundtrips it", () => {
    const xmlWithSnapPizzicato = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><technical><snap-pizzicato/></technical></notations>
      </note>
      <note>
        <rest/><duration>1920</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithSnapPizzicato);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!snap!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > technical > snap-pizzicato")).not.toBeNull();
  });

  it("ABC snap-pizzicato alias !snappizzicato! roundtrips back to canonical !snap!", () => {
    const abc = `X:1
T:Snap alias
M:4/4
L:1/4
K:C
!snappizzicato!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > snap-pizzicato")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!snap!");
    expect(exportedAbc).not.toContain("!snappizzicato!");
  });

  it("ABC snap-pizzicato alias !snap-pizzicato! roundtrips back to canonical !snap!", () => {
    const abc = `X:1
T:Snap-pizzicato alias
M:4/4
L:1/4
K:C
!snap-pizzicato!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > snap-pizzicato")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!snap!");
    expect(exportedAbc).not.toContain("!snap-pizzicato!");
  });

  it("ABC snap-pizzicato alias !snap pizzicato! roundtrips back to canonical !snap!", () => {
    const abc = `X:1
T:Snap pizzicato spaced alias
M:4/4
L:1/4
K:C
!snap pizzicato!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > snap-pizzicato")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!snap!");
    expect(exportedAbc).not.toContain("!snap pizzicato!");
  });

  it("MusicXML->ABC exports harmonic and roundtrips it", () => {
    const xmlWithHarmonic = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><technical><harmonic/></technical></notations>
      </note>
      <note>
        <rest/><duration>1920</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithHarmonic);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!harmonic!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > technical > harmonic")).not.toBeNull();
  });

  it("MusicXML->ABC exports thumb-position and roundtrips it", () => {
    const xmlWithThumbPosition = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><technical><thumb-position/></technical></notations>
      </note>
      <note>
        <rest/><duration>1920</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithThumbPosition);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!thumb!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > technical > thumb-position")).not.toBeNull();
  });

  it("ABC thumb-position alias !thumbpos! roundtrips back to canonical !thumb!", () => {
    const abc = `X:1
T:Thumb alias
M:4/4
L:1/4
K:C
!thumbpos!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > thumb-position")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!thumb!");
    expect(exportedAbc).not.toContain("!thumbpos!");
  });

  it("ABC thumb-position alias !thumbposition! roundtrips back to canonical !thumb!", () => {
    const abc = `X:1
T:Thumb position alias
M:4/4
L:1/4
K:C
!thumbposition!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > thumb-position")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!thumb!");
    expect(exportedAbc).not.toContain("!thumbposition!");
  });

  it("ABC thumb-position alias !thumb pos! roundtrips back to canonical !thumb!", () => {
    const abc = `X:1
T:Thumb spaced alias
M:4/4
L:1/4
K:C
!thumb pos!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > thumb-position")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!thumb!");
    expect(exportedAbc).not.toContain("!thumb pos!");
  });

  it("ABC thumb-position alias !thumb position! roundtrips back to canonical !thumb!", () => {
    const abc = `X:1
T:Thumb position alias
M:4/4
L:1/4
K:C
!thumb position!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > thumb-position")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!thumb!");
    expect(exportedAbc).not.toContain("!thumb position!");
  });

  it("ABC thumb-position alias !thumb-position! roundtrips back to canonical !thumb!", () => {
    const abc = `X:1
T:Thumb hyphen alias
M:4/4
L:1/4
K:C
!thumb-position!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > thumb-position")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!thumb!");
    expect(exportedAbc).not.toContain("!thumb-position!");
  });

  it("MusicXML->ABC exports mordent/inverted-mordent and roundtrips them", () => {
    const xmlWithMordents = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>960</duration>
        <voice>1</voice><type>quarter</type>
        <notations><ornaments><mordent/></ornaments></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>960</duration>
        <voice>1</voice><type>quarter</type>
        <notations><ornaments><inverted-mordent/></ornaments></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithMordents);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!mordent!");
    expect(abc).toContain("!pralltriller!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > ornaments > mordent")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > ornaments > inverted-mordent")).not.toBeNull();
  });

  it("MusicXML->ABC exports mordent and roundtrips it", () => {
    const xmlWithMordent = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><ornaments><mordent/></ornaments></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithMordent);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!mordent!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > ornaments > mordent")).not.toBeNull();
  });

  it("MusicXML->ABC exports inverted-mordent and roundtrips it", () => {
    const xmlWithInvertedMordent = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><ornaments><inverted-mordent/></ornaments></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithInvertedMordent);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!pralltriller!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > ornaments > inverted-mordent")).not.toBeNull();
  });

  it("ABC mordent aliases roundtrip back to canonical mordent-family names", () => {
    const abc = `X:1
T:Mordent alias canonicalization
M:4/4
L:1/4
K:C
!lowermordent!C !uppermordent!D |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > ornaments > mordent")).not.toBeNull();
    expect(srcDoc.querySelectorAll("note > notations > ornaments > inverted-mordent").length).toBeGreaterThanOrEqual(1);

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!mordent!");
    expect(exportedAbc).toContain("!pralltriller!");
    expect(exportedAbc).not.toContain("!lowermordent!");
    expect(exportedAbc).not.toContain("!uppermordent!");
  });

  it("ABC mordent alias !prall! roundtrips back to canonical !pralltriller!", () => {
    const abc = `X:1
T:Prall alias canonicalization
M:4/4
L:1/4
K:C
!prall!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > ornaments > inverted-mordent")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!pralltriller!");
    expect(exportedAbc).not.toContain("!prall!");
  });

  it("ABC mordent alias !pralltrill! roundtrips back to canonical !pralltriller!", () => {
    const abc = `X:1
T:Pralltrill alias canonicalization
M:4/4
L:1/4
K:C
!pralltrill!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > ornaments > inverted-mordent")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!pralltriller!");
    expect(exportedAbc).not.toContain("!pralltrill!");
  });

  it("ABC mordent alias !invertedmordent! roundtrips back to canonical !pralltriller!", () => {
    const abc = `X:1
T:Invertedmordent alias canonicalization
M:4/4
L:1/4
K:C
!invertedmordent!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > ornaments > inverted-mordent")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!pralltriller!");
    expect(exportedAbc).not.toContain("!invertedmordent!");
  });

  it("ABC mordent alias !inverted-mordent! roundtrips back to canonical !pralltriller!", () => {
    const abc = `X:1
T:Inverted-mordent alias canonicalization
M:4/4
L:1/4
K:C
!inverted-mordent!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > ornaments > inverted-mordent")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!pralltriller!");
    expect(exportedAbc).not.toContain("!inverted-mordent!");
  });

  it("MusicXML->ABC exports arpeggiate as canonical !arpeggio! and roundtrips it", () => {
    const xmlWithArpeggiate = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><arpeggiate/></notations>
      </note>
      <note>
        <chord/>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1920</duration>
        <voice>1</voice><type>half</type>
      </note>
      <note>
        <rest/><duration>1920</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithArpeggiate);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!arpeggio![");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > arpeggiate")).not.toBeNull();
  });

  it("ABC arpeggiate alias !roll! roundtrips back to canonical !arpeggio!", () => {
    const abc = `X:1
T:Roll alias
M:4/4
L:1/4
K:C
!roll![CEG] z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > arpeggiate")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!arpeggio![");
    expect(exportedAbc).not.toContain("!roll!");
  });

  it("ABC arpeggiate alias !arpeggiate! roundtrips back to canonical !arpeggio!", () => {
    const abc = `X:1
T:Arpeggiate alias canonicalization
M:4/4
L:1/4
K:C
!arpeggiate![CEG] z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > arpeggiate")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!arpeggio![");
    expect(exportedAbc).not.toContain("!arpeggiate!");
  });

  it("MusicXML->ABC exports schleifer/shake and roundtrips them", () => {
    const xmlWithSchleiferAndShake = `<?xml version="1.0" encoding="UTF-8"?>
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
        <duration>960</duration>
        <voice>1</voice><type>quarter</type>
        <notations><ornaments><schleifer/></ornaments></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>960</duration>
        <voice>1</voice><type>quarter</type>
        <notations><ornaments><shake/></ornaments></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithSchleiferAndShake);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!schleifer!");
    expect(abc).toContain("!shake!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > notations > ornaments > schleifer")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > notations > ornaments > shake")).not.toBeNull();
  });

  it("MusicXML->ABC exports schleifer and roundtrips it", () => {
    const xmlWithSchleifer = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><ornaments><schleifer/></ornaments></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithSchleifer);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!schleifer!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > ornaments > schleifer")).not.toBeNull();
  });

  it("MusicXML->ABC exports shake and roundtrips it", () => {
    const xmlWithShake = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><ornaments><shake/></ornaments></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithShake);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!shake!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > ornaments > shake")).not.toBeNull();
  });

  it("MusicXML->ABC exports segno/coda directions and roundtrips them", () => {
    const xmlWithDirections = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><direction-type><segno/></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <direction><direction-type><coda/></direction-type></direction>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDirections);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!segno!C");
    expect(abc).toContain("!coda!D");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const directions = Array.from(outDoc.querySelectorAll("part > measure > direction > direction-type"));
    expect(directions[0]?.querySelector(":scope > segno")).not.toBeNull();
    expect(directions[1]?.querySelector(":scope > coda")).not.toBeNull();
  });

  it("MusicXML->ABC exports segno direction and roundtrips it", () => {
    const xmlWithSegno = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><direction-type><segno/></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithSegno);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!segno!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > segno")).not.toBeNull();
  });

  it("MusicXML->ABC exports coda direction and roundtrips it", () => {
    const xmlWithCoda = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><direction-type><coda/></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithCoda);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!coda!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > coda")).not.toBeNull();
  });

  it("MusicXML->ABC exports fine sound marker and roundtrips it", () => {
    const xmlWithFine = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><sound fine="yes"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithFine);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!fine!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector('part > measure > direction > sound[fine="yes"]')).not.toBeNull();
  });

  it("MusicXML->ABC exports dacapo sound marker and roundtrips it", () => {
    const xmlWithDaCapo = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><sound dacapo="yes"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDaCapo);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!dacapo!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector('part > measure > direction > sound[dacapo="yes"]')).not.toBeNull();
  });

  it("ABC dacapo alias !da capo! roundtrips back to canonical !dacapo!", () => {
    const abc = `X:1
T:Da capo alias
M:4/4
L:1/4
K:C
!da capo!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector('part > measure > direction > sound[dacapo="yes"]')).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!dacapo!");
    expect(exportedAbc).not.toContain("!da capo!");
  });

  it("ABC dacapo alias !da-capo! roundtrips back to canonical !dacapo!", () => {
    const abc = `X:1
T:Da-capo alias
M:4/4
L:1/4
K:C
!da-capo!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector('part > measure > direction > sound[dacapo="yes"]')).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!dacapo!");
    expect(exportedAbc).not.toContain("!da-capo!");
  });

  it("ABC dacapo alias !D.C.! roundtrips back to canonical !dacapo!", () => {
    const abc = `X:1
T:D.C. alias
M:4/4
L:1/4
K:C
!D.C.!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector('part > measure > direction > sound[dacapo="yes"]')).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!dacapo!");
    expect(exportedAbc).not.toContain("!D.C.!");
  });

  it("MusicXML->ABC exports dalsegno sound marker and roundtrips it", () => {
    const xmlWithDalSegno = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><sound dalsegno="segno"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDalSegno);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!dalsegno!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector('part > measure > direction > sound[dalsegno="segno"]')).not.toBeNull();
  });

  it("ABC dalsegno alias !dal segno! roundtrips back to canonical !dalsegno!", () => {
    const abc = `X:1
T:Dal segno alias
M:4/4
L:1/4
K:C
!dal segno!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector('part > measure > direction > sound[dalsegno="segno"]')).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!dalsegno!");
    expect(exportedAbc).not.toContain("!dal segno!");
  });

  it("ABC dalsegno alias !dal-segno! roundtrips back to canonical !dalsegno!", () => {
    const abc = `X:1
T:Dal-segno alias
M:4/4
L:1/4
K:C
!dal-segno!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector('part > measure > direction > sound[dalsegno="segno"]')).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!dalsegno!");
    expect(exportedAbc).not.toContain("!dal-segno!");
  });

  it("ABC dalsegno alias !D.S.! roundtrips back to canonical !dalsegno!", () => {
    const abc = `X:1
T:D.S. alias
M:4/4
L:1/4
K:C
!D.S.!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector('part > measure > direction > sound[dalsegno="segno"]')).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!dalsegno!");
    expect(exportedAbc).not.toContain("!D.S.!");
  });

  it("MusicXML->ABC exports tocoda sound marker and roundtrips it", () => {
    const xmlWithToCoda = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><sound tocoda="coda"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithToCoda);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!tocoda!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector('part > measure > direction > sound[tocoda="coda"]')).not.toBeNull();
  });

  it("ABC tocoda alias !to coda! roundtrips back to canonical !tocoda!", () => {
    const abc = `X:1
T:To coda alias
M:4/4
L:1/4
K:C
!to coda!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector('part > measure > direction > sound[tocoda="coda"]')).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!tocoda!");
    expect(exportedAbc).not.toContain("!to coda!");
  });

  it("ABC tocoda alias !to-coda! roundtrips back to canonical !tocoda!", () => {
    const abc = `X:1
T:To-coda alias
M:4/4
L:1/4
K:C
!to-coda!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector('part > measure > direction > sound[tocoda="coda"]')).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!tocoda!");
    expect(exportedAbc).not.toContain("!to-coda!");
  });

  it("MusicXML->ABC exports combined dacapo+tocoda as !dacoda! and roundtrips it", () => {
    const xmlWithDaCoda = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><sound dacapo="yes" tocoda="coda"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDaCoda);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!dacoda!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector('part > measure > direction > sound[dacapo="yes"]')).not.toBeNull();
    expect(outDoc.querySelector('part > measure > direction > sound[tocoda="coda"]')).not.toBeNull();
  });

  it("MusicXML->ABC exports sfz dynamics and roundtrips it", () => {
    const xmlWithDynamics = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><direction-type><dynamics><sfz/></dynamics></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDynamics);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!sfz!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > dynamics > sfz")).not.toBeNull();
  });

  it("MusicXML->ABC exports common dynamics and roundtrips them", () => {
    const xmlWithDynamics = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><direction-type><dynamics><ppp/></dynamics></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <direction><direction-type><dynamics><mf/></dynamics></direction-type></direction>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <direction><direction-type><dynamics><rfz/></dynamics></direction-type></direction>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>960</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDynamics);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!ppp!C");
    expect(abc).toContain("!mf!D");
    expect(abc).toContain("!rfz!E");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const dynamics = Array.from(outDoc.querySelectorAll("part > measure > direction > direction-type > dynamics"))
      .map((node) => node.firstElementChild?.tagName?.toLowerCase());
    expect(dynamics).toEqual(["ppp", "mf", "rfz"]);
  });

  it("MusicXML->ABC exports p dynamics and roundtrips it", () => {
    const xmlWithDynamics = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><direction-type><dynamics><p/></dynamics></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDynamics);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!p!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > dynamics > p")).not.toBeNull();
  });

  it("MusicXML->ABC exports pp dynamics and roundtrips it", () => {
    const xmlWithDynamics = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><direction-type><dynamics><pp/></dynamics></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDynamics);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!pp!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > dynamics > pp")).not.toBeNull();
  });

  it("MusicXML->ABC exports ff dynamics and roundtrips it", () => {
    const xmlWithDynamics = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><direction-type><dynamics><ff/></dynamics></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDynamics);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!ff!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > dynamics > ff")).not.toBeNull();
  });

  it("MusicXML->ABC exports f dynamics and roundtrips it", () => {
    const xmlWithDynamics = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><direction-type><dynamics><f/></dynamics></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDynamics);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!f!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > dynamics > f")).not.toBeNull();
  });

  it("MusicXML->ABC exports mf dynamics and roundtrips it", () => {
    const xmlWithDynamics = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><direction-type><dynamics><mf/></dynamics></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDynamics);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!mf!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > dynamics > mf")).not.toBeNull();
  });

  it("MusicXML->ABC exports mp dynamics and roundtrips it", () => {
    const xmlWithDynamics = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><direction-type><dynamics><mp/></dynamics></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDynamics);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!mp!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > dynamics > mp")).not.toBeNull();
  });

  it("MusicXML->ABC exports ppp dynamics and roundtrips it", () => {
    const xmlWithDynamics = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><direction-type><dynamics><ppp/></dynamics></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDynamics);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!ppp!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > dynamics > ppp")).not.toBeNull();
  });

  it("MusicXML->ABC exports fff dynamics and roundtrips it", () => {
    const xmlWithDynamics = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><direction-type><dynamics><fff/></dynamics></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDynamics);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!fff!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > dynamics > fff")).not.toBeNull();
  });

  it("MusicXML->ABC exports fp dynamics and roundtrips it", () => {
    const xmlWithDynamics = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><direction-type><dynamics><fp/></dynamics></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDynamics);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!fp!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > dynamics > fp")).not.toBeNull();
  });

  it("MusicXML->ABC exports rfz dynamics and roundtrips it", () => {
    const xmlWithDynamics = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><direction-type><dynamics><rfz/></dynamics></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDynamics);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!rfz!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > dynamics > rfz")).not.toBeNull();
  });

  it("MusicXML->ABC exports sfp dynamics and roundtrips it", () => {
    const xmlWithDynamics = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><direction-type><dynamics><sfp/></dynamics></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDynamics);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!sfp!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > dynamics > sfp")).not.toBeNull();
  });

  it("MusicXML->ABC exports sf dynamics and roundtrips it", () => {
    const xmlWithDynamics = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><direction-type><dynamics><sf/></dynamics></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDynamics);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!sf!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > dynamics > sf")).not.toBeNull();
  });

  it("MusicXML->ABC exports fz dynamics and roundtrips it", () => {
    const xmlWithDynamics = `<?xml version="1.0" encoding="UTF-8"?>
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
      <direction><direction-type><dynamics><fz/></dynamics></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithDynamics);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!fz!C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > direction > direction-type > dynamics > fz")).not.toBeNull();
  });

  it("MusicXML->ABC exports stopped and roundtrips it", () => {
    const xmlWithStopped = `<?xml version="1.0" encoding="UTF-8"?>
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
        <notations><technical><stopped/></technical></notations>
      </note>
      <note>
        <rest/><duration>1920</duration><voice>1</voice><type>half</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithStopped);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!stopped!");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("note > notations > technical > stopped")).not.toBeNull();
  });

  it("ABC stopped alias !plus! roundtrips back to canonical !stopped!", () => {
    const abc = `X:1
T:Stopped alias
M:4/4
L:1/4
K:C
!plus!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > stopped")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!stopped!");
    expect(exportedAbc).not.toContain("!plus!");
  });

  it("ABC stopped alias !+! roundtrips back to canonical !stopped!", () => {
    const abc = `X:1
T:Stopped symbol alias
M:4/4
L:1/4
K:C
!+!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > stopped")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!stopped!");
    expect(exportedAbc).not.toContain("!+!");
  });

  it("ABC stopped alias !stopped horn! roundtrips back to canonical !stopped!", () => {
    const abc = `X:1
T:Stopped horn alias
M:4/4
L:1/4
K:C
!stopped horn!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > stopped")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!stopped!");
    expect(exportedAbc).not.toContain("!stopped horn!");
  });

  it("ABC stopped alias !stopped-horn! roundtrips back to canonical !stopped!", () => {
    const abc = `X:1
T:Stopped horn hyphen alias
M:4/4
L:1/4
K:C
!stopped-horn!C z |`;

    const xml = convertAbcToMusicXml(abc);
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;
    expect(srcDoc.querySelector("note > notations > technical > stopped")).not.toBeNull();

    const exportedAbc = exportMusicXmlDomToAbc(srcDoc);
    expect(exportedAbc).toContain("!stopped!");
    expect(exportedAbc).not.toContain("!stopped-horn!");
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

  it("MusicXML->ABC exports tie notation and roundtrips it", () => {
    const xmlWithTie = `<?xml version="1.0" encoding="UTF-8"?>
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
        <tie type="start"/><notations><tied type="start"/></notations>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1920</duration>
        <voice>1</voice><type>half</type>
        <tie type="stop"/><notations><tied type="stop"/></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithTie);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("-");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector('note > tie[type="start"]')).not.toBeNull();
    expect(outDoc.querySelector('note > tie[type="stop"]')).not.toBeNull();
    expect(outDoc.querySelector('note > notations > tied[type="start"]')).not.toBeNull();
    expect(outDoc.querySelector('note > notations > tied[type="stop"]')).not.toBeNull();
  });

  it("MusicXML->ABC roundtrips chord ties across all notes in the chord", () => {
    const xmlWithChordTie = `<?xml version="1.0" encoding="UTF-8"?>
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
        <tie type="start"/><notations><tied type="start"/></notations>
      </note>
      <note>
        <chord/>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1920</duration>
        <voice>1</voice><type>half</type>
        <tie type="start"/><notations><tied type="start"/></notations>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1920</duration>
        <voice>1</voice><type>half</type>
        <tie type="stop"/><notations><tied type="stop"/></notations>
      </note>
      <note>
        <chord/>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1920</duration>
        <voice>1</voice><type>half</type>
        <tie type="stop"/><notations><tied type="stop"/></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithChordTie);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("[CE]4- [CE]4");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    const firstChord = notes.slice(0, 2);
    const secondChord = notes.slice(2, 4);
    expect(firstChord.every((note) => note.querySelector(':scope > tie[type="start"]') !== null)).toBe(true);
    expect(secondChord.every((note) => note.querySelector(':scope > tie[type="stop"]') !== null)).toBe(true);
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

  it("MusicXML->ABC exports editorial accidentals and roundtrips them", () => {
    const xmlWithEditorialAccidental = `<?xml version="1.0" encoding="UTF-8"?>
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
        <pitch><step>C</step><alter>1</alter><octave>4</octave></pitch>
        <duration>1920</duration>
        <voice>1</voice><type>half</type>
        <accidental editorial="yes">sharp</accidental>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithEditorialAccidental);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!editorial!^C");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const accidental = outDoc.querySelector("note > accidental");
    expect(accidental?.textContent?.trim()).toBe("sharp");
    expect(accidental?.getAttribute("editorial")).toBe("yes");
  });

  it("MusicXML->ABC exports courtesy accidentals and roundtrips them", () => {
    const xmlWithCourtesyAccidental = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Part 1</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>1</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>F</step><alter>0</alter><octave>4</octave></pitch>
        <duration>1920</duration>
        <voice>1</voice><type>half</type>
        <accidental cautionary="yes">natural</accidental>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithCourtesyAccidental);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("!courtesy!=F");

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const accidental = outDoc.querySelector("note > accidental");
    expect(accidental?.textContent?.trim()).toBe("natural");
    expect(accidental?.getAttribute("cautionary")).toBe("yes");
  });

  it("MusicXML->ABC->MusicXML preserves per-part key signatures via standard K fields", () => {
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
    expect(abc).not.toContain("%@mks key");
    expect(abc).toContain("K:A");
    expect(abc).toContain("V:P1");
    expect(abc).toContain("V:P2");
    expect(abc).toContain("[K:C]");
    expect(abc).toContain("[K:A]");

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

  it("MusicXML->ABC uses shared header K when all lanes start with the same key", () => {
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
    expect(abc).toContain("K:G");
    expect(abc).not.toContain("%@mks key");
    expect(abc).not.toContain("[K:G]");
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

  it("MusicXML->ABC exports common C-clef headers and roundtrips them", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Alto staff</part-name></score-part>
    <score-part id="P2"><part-name>Tenor staff</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>C</sign><line>3</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>C</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>D</step><octave>3</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;

    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain('V:P1 name="Alto staff" clef=alto');
    expect(abc).toContain('V:P2 name="Tenor staff" clef=tenor');

    const roundtripXml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const parts = Array.from(outDoc.querySelectorAll("part"));
    expect(parts[0]?.querySelector("measure > attributes > clef > sign")?.textContent?.trim()).toBe("C");
    expect(parts[0]?.querySelector("measure > attributes > clef > line")?.textContent?.trim()).toBe("3");
    expect(parts[1]?.querySelector("measure > attributes > clef > sign")?.textContent?.trim()).toBe("C");
    expect(parts[1]?.querySelector("measure > attributes > clef > line")?.textContent?.trim()).toBe("4");
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
    expect(abc).toContain("%@mks measure voice=P1 measure=1 number=0 implicit=1");
    expect(abc).not.toContain("repeat=forward");
    expect(abc).not.toContain("repeat=backward");
    expect(abc).not.toContain("times=2");
    expect(abc).toContain("|:");
    expect(abc).toContain(":|");
    expect(abc).toContain("(3:2:3");
    expect(abc).toContain("(3:2:3d");
    expect(abc).not.toContain("(3:2:3d2/3");
  });

  it("ABC->MusicXML restores standard repeat barlines plus measure/transpose metadata and tuplet tags", () => {
    const abcWithMeta = `X:1
T:Meta restore
M:3/4
L:1/8
K:C
V:P1 name="Clarinet in A" clef=treble
V:P1
|: c2 z4 | (3:2:3 d/2 e/2 f/2 z4 :|
%@mks transpose voice=P1 chromatic=-3 diatonic=-2
%@mks measure voice=P1 measure=1 number=0 implicit=1
`;
    const xml = convertAbcToMusicXml(abcWithMeta);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure[number="0"]')?.getAttribute("implicit")).toBe("yes");
    expect(outDoc.querySelector('part > measure[number="0"] > barline[location="left"] > repeat')?.getAttribute("direction")).toBe("forward");
    expect(outDoc.querySelector('part > measure[number="2"] > barline[location="right"] > repeat')?.getAttribute("direction")).toBe("backward");
    expect(outDoc.querySelector('part > measure[number="2"] > barline[location="right"] > repeat')?.getAttribute("times")).toBeNull();
    expect(outDoc.querySelector("part > measure > attributes > transpose > chromatic")?.textContent?.trim()).toBe("-3");
    expect(outDoc.querySelector("part > measure > attributes > transpose > diatonic")?.textContent?.trim()).toBe("-2");
    expect(outDoc.querySelector('part > measure[number="2"] note > time-modification > actual-notes')?.textContent?.trim()).toBe("3");
    expect(outDoc.querySelector('part > measure[number="2"] note > notations > tuplet[type="start"]')).not.toBeNull();
    expect(outDoc.querySelector('part > measure[number="2"] note > notations > tuplet[type="stop"]')).not.toBeNull();
  });

  it("ABC->MusicXML supports common tuplet shorthand (3 in the bounded subset", () => {
    const abc = `X:1
T:Tuplet shorthand
M:3/4
L:1/8
K:C
V:1
(3 DEF z2 |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure note"));
    expect(notes.length).toBeGreaterThanOrEqual(4);
    expect(notes[0]?.querySelector("time-modification > actual-notes")?.textContent?.trim()).toBe("3");
    expect(notes[0]?.querySelector("time-modification > normal-notes")?.textContent?.trim()).toBe("2");
    expect(notes[0]?.querySelector('notations > tuplet[type="start"]')).not.toBeNull();
    expect(notes[2]?.querySelector('notations > tuplet[type="stop"]')).not.toBeNull();
  });

  it("ABC->MusicXML parses explicit tuplet ratios through the parser path", () => {
    const abc = `X:1
T:Tuplet explicit ratio
M:4/4
L:1/8
K:C
V:1
(5:4:5 C D E F G z2 |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = Array.from(outDoc.querySelectorAll("part > measure > note")).slice(0, 5);
    expect(notes[0]?.querySelector(":scope > time-modification > actual-notes")?.textContent?.trim()).toBe("5");
    expect(notes[0]?.querySelector(":scope > time-modification > normal-notes")?.textContent?.trim()).toBe("4");
    expect(notes[0]?.querySelector('notations > tuplet[type="start"]')).not.toBeNull();
    expect(notes[4]?.querySelector('notations > tuplet[type="stop"]')).not.toBeNull();
  });

  it("MusicXML->ABC keeps %@mks repeat times only when standard ABC cannot express them", () => {
    const xmlWithThreeTimesRepeat = `<?xml version="1.0" encoding="UTF-8"?>
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
      <barline location="left"><repeat direction="forward"/></barline>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
      <barline location="right"><repeat direction="backward" times="3"/></barline>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xmlWithThreeTimesRepeat);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("|:");
    expect(abc).toContain(":|");
    expect(abc).toContain("%@mks measure voice=P1 measure=2 number=2 implicit=0 times=3");
  });

  it("ABC->MusicXML restores repeat times from %@mks measure metadata when standard ABC surface is insufficient", () => {
    const abc = `X:1
T:Repeat times restore
M:4/4
L:1/4
K:C
V:P1
|: C D E F | G A B c :|
%@mks measure voice=P1 measure=1 number=1 implicit=0
%@mks measure voice=P1 measure=2 number=2 implicit=0 times=3
`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure[number="2"] > barline[location="right"] > repeat')?.getAttribute("direction")).toBe("backward");
    expect(outDoc.querySelector('part > measure[number="2"] > barline[location="right"] > repeat')?.getAttribute("times")).toBe("3");
  });

  it("MusicXML->ABC keeps discontinue ending metadata only when standard ABC surface is insufficient", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
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
      <barline location="left"><ending number="1" type="start"/></barline>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
      <barline location="right"><ending number="1" type="discontinue"/></barline>
    </measure>
  </part>
</score-partwise>`;

    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc).toContain("[1");
    expect(abc).toContain("%@mks measure voice=P1 measure=1 number=1 implicit=0 ending-stop=1 ending-type=discontinue");
  });

  it("ABC->MusicXML restores discontinue ending type from %@mks measure metadata", () => {
    const abc = `X:1
T:Ending discontinue restore
M:4/4
L:1/4
K:C
V:P1
[1 C D E F |
%@mks measure voice=P1 measure=1 number=1 implicit=0 ending-stop=1 ending-type=discontinue
`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    expect(outDoc.querySelector('part > measure[number="1"] > barline[location="left"] > ending')?.getAttribute("type")).toBe("start");
    expect(outDoc.querySelector('part > measure[number="1"] > barline[location="right"] > ending')?.getAttribute("number")).toBe("1");
    expect(outDoc.querySelector('part > measure[number="1"] > barline[location="right"] > ending')?.getAttribute("type")).toBe("discontinue");
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
