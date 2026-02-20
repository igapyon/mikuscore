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
        <KeySig><accidental>-1</accidental></KeySig>
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
    expect(doc.querySelector("measure:nth-of-type(1) direction sound")?.getAttribute("tempo")).toBe("120");
    expect(doc.querySelector("measure:nth-of-type(1) barline[location=\"left\"] repeat[direction=\"forward\"]")).not.toBeNull();
    expect(doc.querySelector("measure:nth-of-type(2) time > beats")?.textContent?.trim()).toBe("4");
    expect(doc.querySelector("measure:nth-of-type(2) barline[location=\"right\"] repeat[direction=\"backward\"]")).not.toBeNull();
    expect(doc.querySelector("measure:nth-of-type(1) dynamics > mf")).not.toBeNull();
    expect(doc.querySelector("measure:nth-of-type(2) dynamics > p")).not.toBeNull();
    expect(doc.querySelector("miscellaneous-field[name=\"src:musescore:version\"]")?.textContent?.trim()).toBe("4.0");
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
});
