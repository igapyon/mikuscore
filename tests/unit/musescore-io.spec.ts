// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { convertMuseScoreToMusicXml, exportMusicXmlDomToMuseScore } from "../../src/ts/musescore-io";
import { parseMusicXmlDocument } from "../../src/ts/musicxml-io";

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
    expect(doc.querySelector("miscellaneous-field[name=\"src:musescore:raw-encoding\"]")).not.toBeNull();
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
          <Dynamic><subtype>mf</subtype></Dynamic>
          <Chord><durationType>quarter</durationType><Note><pitch>60</pitch></Note></Chord>
        </voice>
      </Measure>
      <Measure endRepeat="1">
        <TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>
        <voice>
          <Dynamic><subtype>p</subtype></Dynamic>
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
    expect(doc.querySelector("miscellaneous-field[name=\"src:musescore:version\"]")?.textContent?.trim()).toBe("4.0");
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
    expect(mscx).toContain("<Part><trackName>Piano</trackName><Staff id=\"1\"/><Staff id=\"2\"/></Part>");
    expect(mscx).toContain("<Staff id=\"1\">");
    expect(mscx).toContain("<Staff id=\"2\">");
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

    const diag = doc.querySelector("miscellaneous-field[name=\"diag:0001\"]")?.textContent ?? "";
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
  });
});
