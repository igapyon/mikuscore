// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { convertMuseScoreToMusicXml, exportMusicXmlDomToMuseScore } from "../../src/ts/musescore-io";
import { parseMusicXmlDocument } from "../../src/ts/musicxml-io";

const parseDoc = (xml: string): Document => {
  const doc = parseMusicXmlDocument(xml);
  expect(doc).not.toBeNull();
  if (!doc) throw new Error("failed to parse MusicXML");
  return doc;
};

describe("Spot Check: articulation/dynamics roundtrip", () => {
  it("checks staccato/accent/tenuto/dynamics on MusicXML->MuseScore->MusicXML", () => {
    const srcXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <direction><direction-type><dynamics><mf/></dynamics></direction-type></direction>
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

    const srcDoc = parseDoc(srcXml);
    const mscx = exportMusicXmlDomToMuseScore(srcDoc);
    const dstXml = convertMuseScoreToMusicXml(mscx, { sourceMetadata: false, debugMetadata: false });
    const dstDoc = parseDoc(dstXml);

    const hasMf = dstDoc.querySelector("dynamics > mf") !== null;
    const hasStaccato = dstDoc.querySelector("note staccato") !== null;
    const hasAccent = dstDoc.querySelector("note accent") !== null;
    const hasTenuto = dstDoc.querySelector("note tenuto") !== null;

    expect(hasMf).toBe(true);
    expect(hasStaccato).toBe(true);
    expect(hasAccent).toBe(true);
    expect(hasTenuto).toBe(true);
  });
});
