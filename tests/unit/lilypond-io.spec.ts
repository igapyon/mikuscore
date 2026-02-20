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
