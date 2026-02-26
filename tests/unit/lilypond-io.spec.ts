// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { convertLilyPondToMusicXml, exportMusicXmlDomToLilyPond } from "../../src/ts/lilypond-io";
import { parseMusicXmlDocument } from "../../src/ts/musicxml-io";
import { ScoreCore } from "../../core/ScoreCore";

describe("LilyPond I/O", () => {
  it("converts basic LilyPond source into MusicXML", () => {
    const lily = `\\version "2.24.0"
\\header {
  title = "Lily import test"
}
\\time 4/4
\\key c \\major
\\score {
  \\new Staff = "P1" { c'4 d'4 e'4 f'4 | g'4 a'4 b'4 c''4 }
}`;
    const xml = convertLilyPondToMusicXml(lily, { debugMetadata: true });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelectorAll("part").length).toBeGreaterThan(0);
    expect(doc.querySelectorAll("note").length).toBeGreaterThan(0);
  });

  it("writes LilyPond import warnings into diag:* fields", () => {
    const lily = `\\version "2.24.0"
\\time 4/4
\\key c \\major
\\score {
  \\new Staff = "P1" { c1 c1 }
}`;
    const xml = convertLilyPondToMusicXml(lily, { debugMetadata: true });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelector('miscellaneous-field[name="diag:count"]')).not.toBeNull();
    expect(doc.querySelector('miscellaneous-field[name="diag:0001"]')?.textContent).toContain(
      "code=LILYPOND_IMPORT_WARNING"
    );
  });

  it("imports \\relative notation", () => {
    const lily = `\\version "2.24.0"
\\time 4/4
\\key c \\major
\\score {
  \\new Staff = "P1" { \\relative c' { c4 d e f | g a b c } }
}`;
    const xml = convertLilyPondToMusicXml(lily, { debugMetadata: true });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const notes = Array.from(doc.querySelectorAll("note > pitch > step")).map((n) => (n.textContent || "").trim());
    expect(notes.length).toBeGreaterThanOrEqual(8);
    expect(notes.slice(0, 4)).toEqual(["C", "D", "E", "F"]);
  });

  it("imports basic chord token <...>", () => {
    const lily = `\\version "2.24.0"
\\time 4/4
\\key c \\major
\\score {
  \\new Staff = "P1" { <c' e' g'>4 r4 <d' f' a'>2 }
}`;
    const xml = convertLilyPondToMusicXml(lily, { debugMetadata: true });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const chordFollowers = doc.querySelectorAll("note > chord");
    expect(chordFollowers.length).toBeGreaterThan(0);
  });

  it("imports LilyPond absolute octave correctly (c' -> C4)", () => {
    const lily = `\\version "2.24.0"
\\time 4/4
\\key c \\major
\\score {
  \\new Staff = "P1" { c'4 }
}`;
    const xml = convertLilyPondToMusicXml(lily, { debugMetadata: true });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelector("note > pitch > step")?.textContent?.trim()).toBe("C");
    expect(doc.querySelector("note > pitch > octave")?.textContent?.trim()).toBe("4");
  });

  it("imports LilyPond absolute notes without marks as base octave (c -> C3)", () => {
    const lily = `\\version "2.24.0"
\\time 4/4
\\key c \\major
\\score {
  \\new Staff = "P1" { c4 d4 e4 f4 }
}`;
    const xml = convertLilyPondToMusicXml(lily, { debugMetadata: true });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const octaves = Array.from(doc.querySelectorAll("note > pitch > octave")).map((n) => (n.textContent || "").trim());
    expect(octaves.slice(0, 4)).toEqual(["3", "3", "3", "3"]);
  });

  it("imports multi-part staff blocks with \\with metadata", () => {
    const lily = `\\version "2.24.0"
\\time 4/4
\\key c \\major
\\score {
  <<
    \\new Staff = "Flute" \\with { instrumentName = "Fl." } { c'4 d'4 e'4 f'4 }
    \\new Staff = "Clarinet" \\with { instrumentName = "Cl." } { c4 d4 e4 f4 }
  >>
}`;
    const xml = convertLilyPondToMusicXml(lily, { debugMetadata: true });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelectorAll("score-partwise > part").length).toBeGreaterThanOrEqual(2);
  });

  it("roundtrips same-staff multi-voice note via %@mks lanes metadata", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>2</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>E</step><octave>5</octave></pitch>
        <duration>960</duration><voice>1</voice><type>half</type>
      </note>
      <backup><duration>960</duration></backup>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>480</duration><voice>2</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>B</step><octave>4</octave></pitch>
        <duration>480</duration><voice>2</voice><type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const lily = exportMusicXmlDomToLilyPond(srcDoc);
    expect(lily).toContain("%@mks lanes voice=P1 measure=1 data=");

    const roundtripXml = convertLilyPondToMusicXml(lily, { debugMetadata: true });
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const e5Half = outDoc.querySelector(
      "part > measure:nth-of-type(1) > note > pitch > step"
    );
    const measureNotes = outDoc.querySelectorAll("part > measure:nth-of-type(1) > note");
    const backup = outDoc.querySelector("part > measure:nth-of-type(1) > backup > duration")?.textContent?.trim();

    expect(measureNotes.length).toBe(3);
    expect(backup).toBe("960");
    expect(e5Half?.textContent?.trim()).toBe("E");
    expect(
      outDoc.querySelector("part > measure:nth-of-type(1) > note > pitch > octave")?.textContent?.trim()
    ).toBe("5");
    expect(
      outDoc.querySelector("part > measure:nth-of-type(1) > note > duration")?.textContent?.trim()
    ).toBe("960");
  });

  it("keeps final 16th note in 7:8 tuplet + 16th-run measure (m138-like)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>2</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>69</duration><voice>1</voice><type>32nd</type><time-modification><actual-notes>7</actual-notes><normal-notes>8</normal-notes></time-modification></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>69</duration><voice>1</voice><type>32nd</type><time-modification><actual-notes>7</actual-notes><normal-notes>8</normal-notes></time-modification></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>69</duration><voice>1</voice><type>32nd</type><time-modification><actual-notes>7</actual-notes><normal-notes>8</normal-notes></time-modification></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>69</duration><voice>1</voice><type>32nd</type><time-modification><actual-notes>7</actual-notes><normal-notes>8</normal-notes></time-modification></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>69</duration><voice>1</voice><type>32nd</type><time-modification><actual-notes>7</actual-notes><normal-notes>8</normal-notes></time-modification></note>
      <note><pitch><step>F</step><octave>5</octave></pitch><duration>69</duration><voice>1</voice><type>32nd</type><time-modification><actual-notes>7</actual-notes><normal-notes>8</normal-notes></time-modification></note>
      <note><pitch><step>A</step><octave>5</octave></pitch><duration>69</duration><voice>1</voice><type>32nd</type><time-modification><actual-notes>7</actual-notes><normal-notes>8</normal-notes></time-modification></note>
      <note><pitch><step>D</step><octave>6</octave></pitch><duration>120</duration><voice>1</voice><type>16th</type></note>
      <note><pitch><step>F</step><octave>6</octave></pitch><duration>120</duration><voice>1</voice><type>16th</type></note>
      <note><pitch><step>A</step><octave>6</octave></pitch><duration>120</duration><voice>1</voice><type>16th</type></note>
      <note><pitch><step>D</step><octave>7</octave></pitch><duration>120</duration><voice>1</voice><type>16th</type></note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const lily = exportMusicXmlDomToLilyPond(srcDoc);
    const roundtripXml = convertLilyPondToMusicXml(lily, { debugMetadata: true });
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const m1Notes = outDoc.querySelectorAll("part > measure:nth-of-type(1) > note");
    expect(m1Notes.length).toBe(11);
    const lastM1Step = outDoc.querySelector("part > measure:nth-of-type(1) > note:last-of-type > pitch > step")?.textContent?.trim();
    const lastM1Octave = outDoc.querySelector("part > measure:nth-of-type(1) > note:last-of-type > pitch > octave")?.textContent?.trim();
    expect(lastM1Step).toBe("D");
    expect(lastM1Octave).toBe("7");
  });

  it("keeps triplet-16th visual semantics (type/slur) on m85-like roundtrip", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>2</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>E</step><octave>6</octave></pitch>
        <duration>80</duration><voice>1</voice><type>16th</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="start"/><slur type="start" number="1" placement="above"/></notations>
      </note>
      <note>
        <pitch><step>F</step><octave>6</octave></pitch>
        <duration>80</duration><voice>1</voice><type>16th</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
      </note>
      <note>
        <pitch><step>E</step><octave>6</octave></pitch>
        <duration>80</duration><voice>1</voice><type>16th</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="stop"/><slur type="stop" number="1"/></notations>
      </note>
      <note>
        <pitch><step>C</step><octave>6</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <pitch><step>A</step><octave>5</octave></pitch>
        <duration>80</duration><voice>1</voice><type>16th</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="start"/><slur type="start" number="1" placement="above"/></notations>
      </note>
      <note>
        <pitch><step>B</step><octave>5</octave></pitch>
        <duration>80</duration><voice>1</voice><type>16th</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
      </note>
      <note>
        <pitch><step>A</step><octave>5</octave></pitch>
        <duration>80</duration><voice>1</voice><type>16th</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="stop"/><slur type="stop" number="1"/></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const srcDoc = parseMusicXmlDocument(xml);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const lily = exportMusicXmlDomToLilyPond(srcDoc);
    expect(lily).toContain("%@mks slur voice=P1 measure=1 event=1 type=start");
    expect(lily).toContain("%@mks slur voice=P1 measure=1 event=3 type=stop");

    const roundtripXml = convertLilyPondToMusicXml(lily, { debugMetadata: true });
    const outDoc = parseMusicXmlDocument(roundtripXml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const notes = outDoc.querySelectorAll("part > measure:nth-of-type(1) > note");
    expect(notes.length).toBe(7);
    expect(outDoc.querySelector("part > measure:nth-of-type(1) > note:nth-of-type(1) > type")?.textContent?.trim()).toBe("16th");
    expect(outDoc.querySelector("part > measure:nth-of-type(1) > note:nth-of-type(2) > type")?.textContent?.trim()).toBe("16th");
    expect(outDoc.querySelector("part > measure:nth-of-type(1) > note:nth-of-type(3) > type")?.textContent?.trim()).toBe("16th");
    expect(outDoc.querySelector("part > measure:nth-of-type(1) > note:nth-of-type(1) > notations > slur[type=\"start\"]")).not.toBeNull();
    expect(outDoc.querySelector("part > measure:nth-of-type(1) > note:nth-of-type(3) > notations > slur[type=\"stop\"]")).not.toBeNull();
    expect(outDoc.querySelector("part > measure:nth-of-type(1) > note:nth-of-type(5) > notations > slur[type=\"start\"]")).not.toBeNull();
    expect(outDoc.querySelector("part > measure:nth-of-type(1) > note:nth-of-type(7) > notations > slur[type=\"stop\"]")).not.toBeNull();
  });

  it("imports staff clef from LilyPond (\\clef bass)", () => {
    const lily = `\\version "2.24.0"
\\time 4/4
\\key c \\major
\\score {
  \\new Staff = "Bass" { \\clef bass c,4 d,4 e,4 f,4 }
}`;
    const xml = convertLilyPondToMusicXml(lily, { debugMetadata: true });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const clefSign = doc.querySelector("part > measure > attributes > clef > sign")?.textContent?.trim();
    expect(clefSign).toBe("F");
  });

  it("imports %@mks transpose metadata into MusicXML transpose", () => {
    const lily = `\\version "2.24.0"
\\time 4/4
\\key c \\major
% %@mks transpose voice=Clarinet chromatic=-3 diatonic=-2
\\score {
  \\new Staff = "Clarinet" { c'4 d'4 e'4 f'4 }
}`;
    const xml = convertLilyPondToMusicXml(lily, { debugMetadata: true });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelector("part > measure > attributes > transpose > chromatic")?.textContent?.trim()).toBe("-3");
    expect(doc.querySelector("part > measure > attributes > transpose > diatonic")?.textContent?.trim()).toBe("-2");
  });

  it("imports LilyPond \\transposition a into MusicXML transpose for in-A instruments", () => {
    const lily = `\\version "2.24.0"
\\time 4/4
\\key c \\major
\\score {
  \\new Staff = "ClarinetInA" { \\transposition a c'4 d'4 e'4 f'4 }
}`;
    const xml = convertLilyPondToMusicXml(lily, { debugMetadata: true });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelector("part > measure > attributes > transpose > chromatic")?.textContent?.trim()).toBe("-3");
    expect(doc.querySelector("part > measure > attributes > transpose > diatonic")?.textContent?.trim()).toBe("-2");
  });

  it("respects non-4/4 measure capacity on direct import (3/4)", () => {
    const lily = `\\version "2.24.0"
\\time 3/4
\\key c \\major
\\score {
  \\new Staff = "P1" { r4 r4 d'8 a8 f8 | r4 r4 r4 }
}`;
    const xml = convertLilyPondToMusicXml(lily, { debugMetadata: true });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    expect(doc.querySelector('miscellaneous-field[name="diag:count"]')).not.toBeNull();
    const core = new ScoreCore();
    core.load(xml);
    const saved = core.save();
    expect(saved.ok).toBe(true);
  });

  it("carries overfull event to next measure instead of dropping it", () => {
    const lily = `\\version "2.24.0"
\\time 3/4
\\key c \\major
\\score {
  \\new Staff = "P1" { r4 r4 d'8 a8 f8 | a8 d'8 f'8 a'8 d''8 f''8 }
}`;
    const xml = convertLilyPondToMusicXml(lily, { debugMetadata: true });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const firstMeasureNotes = Array.from(doc.querySelectorAll("part > measure:nth-of-type(1) > note > pitch > step")).map(
      (n) => (n.textContent || "").trim()
    );
    const secondMeasureNotes = Array.from(doc.querySelectorAll("part > measure:nth-of-type(2) > note > pitch > step")).map(
      (n) => (n.textContent || "").trim()
    );
    expect(firstMeasureNotes).toEqual(["D", "A"]);
    expect(secondMeasureNotes[0]).toBe("F");
    expect(xml).toContain("carried event to next measure");
  });

  it("parses LilyPond integer duration multiplier (r4*3) correctly", () => {
    const lily = `\\version "2.24.0"
\\time 3/4
\\key c \\major
\\score {
  \\new Staff = "P1" { r4*3 | c'4 d'4 e'4 }
}`;
    const xml = convertLilyPondToMusicXml(lily, { debugMetadata: true });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const m1RestDur = doc.querySelector("part > measure:nth-of-type(1) > note > rest + duration")?.textContent?.trim();
    const m2FirstStep = doc.querySelector("part > measure:nth-of-type(2) > note > pitch > step")?.textContent?.trim();
    expect(m1RestDur).toBe("1440");
    expect(m2FirstStep).toBe("C");
  });

  it("adds implicit beams on LilyPond import for short-note groups", () => {
    const lily = `\\version "2.24.0"
\\time 2/4
\\key c \\major
\\score {
  \\new Staff = "P1" { c'8 d'8 e'8 f'8 }
}`;
    const xml = convertLilyPondToMusicXml(lily, { debugMetadata: true });
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const notes = Array.from(doc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("begin");
    expect(notes[1]?.querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("end");
    expect(notes[2]?.querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("begin");
    expect(notes[3]?.querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("end");
  });

  it("exports MusicXML to LilyPond text", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const lily = exportMusicXmlDomToLilyPond(doc);
    expect(lily).toContain("\\score");
    expect(lily).toContain("\\new Staff");
    expect(lily).toContain("\\time 4/4");
  });

  it("exports movement-title as LilyPond title when work-title is missing", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <movement-title>Excerpt from Clarinet Quintet, K. 581</movement-title>
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><rest/><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const lily = exportMusicXmlDomToLilyPond(doc);
    expect(lily).toContain('title = "Excerpt from Clarinet Quintet, K. 581"');
  });

  it("exports MusicXML transpose as %@mks transpose metadata for roundtrip", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Clarinet in A</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <transpose><diatonic>-2</diatonic><chromatic>-3</chromatic></transpose>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const lily = exportMusicXmlDomToLilyPond(doc);
    expect(lily).toContain("% %@mks transpose voice=P1 chromatic=-3 diatonic=-2");
  });

  it("exports and imports %@mks measure metadata for implicit and repeat", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="12">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><rest/><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <barline location="right"><repeat direction="backward"/></barline>
    </measure>
    <measure number="X1" implicit="yes">
      <barline location="left"><repeat direction="forward"/></barline>
      <note><rest/><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
    <measure number="13">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1440</duration><voice>1</voice><type>half</type><dot/></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const lily = exportMusicXmlDomToLilyPond(doc);
    expect(lily).toContain("% %@mks measure voice=P1 measure=2 number=X1 implicit=1 repeat=forward");
    const roundtrip = convertLilyPondToMusicXml(lily, { debugMetadata: true });
    const outDoc = parseMusicXmlDocument(roundtrip);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const m2 = outDoc.querySelector("part > measure:nth-of-type(2)");
    expect(m2?.getAttribute("number")).toBe("X1");
    expect(m2?.getAttribute("implicit")).toBe("yes");
    expect(m2?.querySelector(':scope > barline[location="left"] > repeat[direction="forward"]')).not.toBeNull();
    const m1 = outDoc.querySelector("part > measure:nth-of-type(1)");
    expect(m1?.querySelector(':scope > barline[location="right"] > repeat[direction="backward"]')).not.toBeNull();
  });

  it("exports and imports section-boundary double bar + explicit same-meter time via %@mks measure metadata", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
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
      <barline location="left"><bar-style>light-light</bar-style></barline>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const lily = exportMusicXmlDomToLilyPond(doc);
    expect(lily).toContain("explicitTime=1");
    expect(lily).toContain("beats=2");
    expect(lily).toContain("beatType=4");
    expect(lily).toContain("doubleBar=right");
    expect(lily).toContain("doubleBar=left");

    const roundtrip = convertLilyPondToMusicXml(lily, { debugMetadata: true });
    const outDoc = parseMusicXmlDocument(roundtrip);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const m2 = outDoc.querySelector("part > measure:nth-of-type(2)");
    expect(m2?.querySelector(":scope > attributes > time > beats")?.textContent?.trim()).toBe("2");
    expect(m2?.querySelector(":scope > attributes > time > beat-type")?.textContent?.trim()).toBe("4");
    expect(
      m2?.querySelector(':scope > barline[location="left"] > bar-style')?.textContent?.trim()
      || outDoc.querySelector('part > measure:nth-of-type(1) > barline[location="right"] > bar-style')?.textContent?.trim()
    ).toBe("light-light");
  });

  it("exports and imports staccato/accent via %@mks articul metadata", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>2</beats><beat-type>4</beat-type></time>
      </attributes>
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
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const lily = exportMusicXmlDomToLilyPond(doc);
    expect(lily).toContain("% %@mks articul voice=P1 measure=1 event=1 kind=staccato");
    expect(lily).toContain("% %@mks articul voice=P1 measure=1 event=2 kind=accent");

    const roundtrip = convertLilyPondToMusicXml(lily);
    const outDoc = parseMusicXmlDocument(roundtrip);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(first?.querySelector(":scope > notations > articulations > staccato")).not.toBeNull();
    expect(second?.querySelector(":scope > notations > articulations > accent")).not.toBeNull();
  });

  it("exports and imports accidental display (natural/sharp/flat) via %@mks accidental metadata", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type><accidental>natural</accidental></note>
      <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type><accidental>sharp</accidental></note>
      <note><pitch><step>E</step><alter>-1</alter><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type><accidental>flat</accidental></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const lily = exportMusicXmlDomToLilyPond(doc);
    expect(lily).toContain("% %@mks accidental voice=P1 measure=1 event=1 value=natural");
    expect(lily).toContain("% %@mks accidental voice=P1 measure=1 event=2 value=sharp");
    expect(lily).toContain("% %@mks accidental voice=P1 measure=1 event=3 value=flat");

    const roundtrip = convertLilyPondToMusicXml(lily);
    const outDoc = parseMusicXmlDocument(roundtrip);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const notes = Array.from(outDoc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > accidental")?.textContent?.trim()).toBe("natural");
    expect(notes[1]?.querySelector(":scope > accidental")?.textContent?.trim()).toBe("sharp");
    expect(notes[2]?.querySelector(":scope > accidental")?.textContent?.trim()).toBe("flat");
  });

  it("exports and imports grace notes via %@mks grace metadata", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>2</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><grace slash="yes"/><pitch><step>C</step><octave>5</octave></pitch><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const lily = exportMusicXmlDomToLilyPond(doc);
    expect(lily).toContain("% %@mks grace voice=P1 measure=1 event=1 slash=1");

    const roundtrip = convertLilyPondToMusicXml(lily);
    const outDoc = parseMusicXmlDocument(roundtrip);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const second = outDoc.querySelector("part > measure > note:nth-of-type(2)");
    expect(first?.querySelector(":scope > grace")?.getAttribute("slash")).toBe("yes");
    expect(first?.querySelector(":scope > duration")).toBeNull();
    expect(second?.querySelector(":scope > duration")?.textContent?.trim()).toBe("480");
  });

  it("keeps grace + back-to-back triplets in the same 2/4 measure", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>2</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><grace slash="yes"/><pitch><step>A</step><octave>5</octave></pitch><voice>1</voice><type>16th</type></note>
      <note><grace slash="yes"/><pitch><step>C</step><octave>6</octave></pitch><voice>1</voice><type>16th</type></note>
      <note><pitch><step>E</step><octave>6</octave></pitch><duration>160</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><notations><tuplet type="start"/></notations></note>
      <note><pitch><step>C</step><octave>6</octave></pitch><duration>160</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
      <note><pitch><step>A</step><octave>5</octave></pitch><duration>160</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><notations><tuplet type="stop"/></notations></note>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>160</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><notations><tuplet type="start"/></notations></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>160</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>160</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><notations><tuplet type="stop"/></notations></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const lily = exportMusicXmlDomToLilyPond(doc);
    const roundtrip = convertLilyPondToMusicXml(lily);
    const outDoc = parseMusicXmlDocument(roundtrip);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const m1 = outDoc.querySelector("part > measure:nth-of-type(1)");
    const m2 = outDoc.querySelector("part > measure:nth-of-type(2)");
    const notes = Array.from(m1?.querySelectorAll(":scope > note") ?? []);
    expect(notes.length).toBe(8);
    expect(notes[0]?.querySelector(":scope > grace")).not.toBeNull();
    expect(notes[1]?.querySelector(":scope > grace")).not.toBeNull();
    expect(notes[2]?.querySelector(":scope > duration")?.textContent?.trim()).toBe("160");
    expect(notes[7]?.querySelector(":scope > duration")?.textContent?.trim()).toBe("160");
    expect(m2).toBeNull();
  });

  it("exports and imports tuplet markers/time-modification via %@mks tuplet metadata", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>2</beats><beat-type>4</beat-type></time>
      </attributes>
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
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const lily = exportMusicXmlDomToLilyPond(doc);
    expect(lily).toContain("% %@mks tuplet voice=P1 measure=1 event=1 actual=3 normal=2 start=1 number=1");
    expect(lily).toContain("% %@mks tuplet voice=P1 measure=1 event=3 actual=3 normal=2 stop=1 number=1");

    const roundtrip = convertLilyPondToMusicXml(lily);
    const outDoc = parseMusicXmlDocument(roundtrip);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    const first = outDoc.querySelector("part > measure > note:nth-of-type(1)");
    const third = outDoc.querySelector("part > measure > note:nth-of-type(3)");
    expect(first?.querySelector(":scope > time-modification > actual-notes")?.textContent?.trim()).toBe("3");
    expect(first?.querySelector(":scope > time-modification > normal-notes")?.textContent?.trim()).toBe("2");
    expect(first?.querySelector(':scope > notations > tuplet[type="start"]')?.getAttribute("number")).toBe("1");
    expect(third?.querySelector(':scope > notations > tuplet[type="stop"]')?.getAttribute("number")).toBe("1");
  });

  it("exports and imports octave-shift directions via %@mks octshift metadata", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <direction><direction-type><octave-shift type="up" size="8" number="1"/></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>half</type></note>
    </measure>
    <measure number="2">
      <direction><direction-type><octave-shift type="stop" size="8" number="1"/></direction-type></direction>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const lily = exportMusicXmlDomToLilyPond(doc);
    expect(lily).toContain("% %@mks octshift voice=P1 measure=1 type=up size=8 number=1");
    expect(lily).toContain("% %@mks octshift voice=P1 measure=2 type=stop size=8 number=1");
    const outDoc = parseMusicXmlDocument(convertLilyPondToMusicXml(lily));
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure:nth-of-type(1) > note > pitch > step")?.textContent?.trim()).toBe("C");
    expect(outDoc.querySelector("part > measure:nth-of-type(2) > note > pitch > step")?.textContent?.trim()).toBe("D");
    expect(
      outDoc.querySelector("part > measure:nth-of-type(1) > direction > direction-type > octave-shift[type=\"up\"]")
    ).not.toBeNull();
    expect(
      outDoc.querySelector("part > measure:nth-of-type(2) > direction > direction-type > octave-shift[type=\"stop\"]")
    ).not.toBeNull();
  });

  it("exports and imports trill ornaments via %@mks trill metadata", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>2</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        <notations><ornaments><trill-mark/><wavy-line type="start" number="1"/></ornaments></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>5</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        <notations><ornaments><wavy-line type="stop" number="1"/></ornaments></notations>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const lily = exportMusicXmlDomToLilyPond(doc);
    expect(lily).toContain("% %@mks trill voice=P1 measure=1 event=1 mark=1");
    expect(lily).toContain("% %@mks trill voice=P1 measure=1 event=1 wavy=start number=1");
    expect(lily).toContain("% %@mks trill voice=P1 measure=1 event=2 wavy=stop number=1");
    const outDoc = parseMusicXmlDocument(convertLilyPondToMusicXml(lily));
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;
    expect(outDoc.querySelector("part > measure > note:nth-of-type(1) > pitch > step")?.textContent?.trim()).toBe("C");
    expect(outDoc.querySelector("part > measure > note:nth-of-type(2) > pitch > step")?.textContent?.trim()).toBe("D");
    expect(outDoc.querySelector("part > measure > note:nth-of-type(1) > notations > ornaments > trill-mark")).not.toBeNull();
    expect(
      outDoc.querySelector("part > measure > note:nth-of-type(1) > notations > ornaments > wavy-line[type=\"start\"]")
    ).not.toBeNull();
    expect(
      outDoc.querySelector("part > measure > note:nth-of-type(2) > notations > ornaments > wavy-line[type=\"stop\"]")
    ).not.toBeNull();
  });

  it("exported LilyPond does not overfill 3/4 when source has backup lanes", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>3</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2880</duration><voice>1</voice><type>half</type><dot/></note>
      <backup><duration>2880</duration></backup>
      <note><pitch><step>G</step><octave>3</octave></pitch><duration>2880</duration><voice>2</voice><type>half</type><dot/></note>
    </measure>
    <measure number="2"></measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const lily = exportMusicXmlDomToLilyPond(doc);
    const roundtripXml = convertLilyPondToMusicXml(lily, { debugMetadata: true });
    const core = new ScoreCore();
    core.load(roundtripXml);
    const saved = core.save();
    expect(saved.ok).toBe(true);
  });

  it("chooses dense lane for single-staff backup measure (m97-like) instead of collapsing to one long note", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Part 1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>2</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>960</duration><voice>1</voice><type>half</type></note>
      <backup><duration>960</duration></backup>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>240</duration><voice>2</voice><type>eighth</type></note>
      <note><chord/><pitch><step>C</step><octave>5</octave></pitch><duration>240</duration><voice>2</voice><type>eighth</type></note>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>240</duration><voice>2</voice><type>eighth</type></note>
      <note><chord/><pitch><step>E</step><octave>5</octave></pitch><duration>240</duration><voice>2</voice><type>eighth</type></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>240</duration><voice>2</voice><type>eighth</type></note>
      <note><chord/><pitch><step>D</step><octave>5</octave></pitch><duration>240</duration><voice>2</voice><type>eighth</type></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>240</duration><voice>2</voice><type>eighth</type></note>
      <note><chord/><pitch><step>C</step><octave>5</octave></pitch><duration>240</duration><voice>2</voice><type>eighth</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const lily = exportMusicXmlDomToLilyPond(doc);
    expect(lily).toContain("<a' c''>8 <c'' e''>8 <b' d''>8 <a' c''>8");
    expect(lily).toContain("%@mks lanes voice=P1 measure=1 data=");
    expect(lily).not.toContain("dropped note/rest that would overfill a measure");
  });

  it("exports multi-staff part as PianoStaff with per-staff blocks", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
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
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1920</duration><voice>1</voice><staff>1</staff><type>whole</type></note>
      <backup><duration>1920</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>1920</duration><voice>1</voice><staff>2</staff><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const lily = exportMusicXmlDomToLilyPond(doc);
    expect(lily).toContain("\\new PianoStaff");
    expect(lily).toContain("\\new Staff = \"P1_s1\"");
    expect(lily).toContain("\\new Staff = \"P1_s2\"");
    expect(lily).toContain("\\clef bass");
  });

  it("exports non-voice1 notes on a staff (no forced voice=1 drop)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1920</duration><voice>1</voice><staff>1</staff><type>whole</type></note>
      <backup><duration>1920</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>1920</duration><voice>2</voice><staff>2</staff><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const lily = exportMusicXmlDomToLilyPond(doc);
    expect(lily).toContain("c''1");
    expect(lily).toContain("c1");
  });

  it("exports chord notes as LilyPond chord token without warning spam", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>1440</duration><voice>1</voice><type>half</type><dot/></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const lily = exportMusicXmlDomToLilyPond(doc);
    expect(lily).toContain("<c' e' g'>4");
    expect(lily).not.toContain("skipped chord-follow note");
  });

  it("omits rest-only staffs in multi-staff export", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Imported MIDI</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>4</staves>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1920</duration><voice>1</voice><staff>1</staff><type>whole</type></note>
      <backup><duration>1920</duration></backup>
      <note><rest/><duration>1920</duration><voice>1</voice><staff>2</staff><type>whole</type></note>
      <backup><duration>1920</duration></backup>
      <note><rest/><duration>1920</duration><voice>1</voice><staff>3</staff><type>whole</type></note>
      <backup><duration>1920</duration></backup>
      <note><rest/><duration>1920</duration><voice>1</voice><staff>4</staff><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const lily = exportMusicXmlDomToLilyPond(doc);
    expect(lily).toContain("\\new Staff = \"P1\"");
    expect(lily).not.toContain("P1_s2");
    expect(lily).not.toContain("P1_s3");
    expect(lily).not.toContain("P1_s4");
  });

  it("exports single-staff bass clef when MusicXML clef is F4", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Bass</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const lily = exportMusicXmlDomToLilyPond(doc);
    expect(lily).toContain("\\new Staff = \"P1\" { \\clef bass ");
  });

  it("infers bass clef for low staff when explicit clef number is missing", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1920</duration><voice>1</voice><staff>1</staff><type>whole</type></note>
      <backup><duration>1920</duration></backup>
      <note><pitch><step>C</step><octave>2</octave></pitch><duration>1920</duration><voice>1</voice><staff>2</staff><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseMusicXmlDocument(xml);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const lily = exportMusicXmlDomToLilyPond(doc);
    expect(lily).toContain("\\new Staff = \"P1_s1\" { ");
    expect(lily).toContain("\\new Staff = \"P1_s2\" { \\clef bass ");
  });
});
