// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { normalizeImportedMusicXmlText, parseMusicXmlDocument } from "../../src/ts/musicxml-io";

describe("musicxml-io normalizeImportedMusicXmlText", () => {
  it("adds tuplet start/stop notations when only time-modification exists", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>160</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>160</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>160</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
    </measure>
  </part>
</score-partwise>`;
    const normalized = normalizeImportedMusicXmlText(xml);
    const doc = parseMusicXmlDocument(normalized);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const first = doc.querySelector("part > measure > note:nth-of-type(1)");
    const third = doc.querySelector("part > measure > note:nth-of-type(3)");
    expect(first?.querySelector(':scope > notations > tuplet[type="start"]')).not.toBeNull();
    expect(third?.querySelector(':scope > notations > tuplet[type="stop"]')).not.toBeNull();
  });

  it("keeps existing tuplet notations untouched", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>160</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><notations><tuplet type="start" number="7"/></notations></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>160</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>160</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><notations><tuplet type="stop" number="7"/></notations></note>
    </measure>
  </part>
</score-partwise>`;
    const normalized = normalizeImportedMusicXmlText(xml);
    const doc = parseMusicXmlDocument(normalized);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const start = doc.querySelector('part > measure > note:nth-of-type(1) > notations > tuplet[type="start"]');
    const stop = doc.querySelector('part > measure > note:nth-of-type(3) > notations > tuplet[type="stop"]');
    expect(start?.getAttribute("number")).toBe("7");
    expect(stop?.getAttribute("number")).toBe("7");
  });

  it("adds display attrs to existing tuplet start when missing", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>120</duration><voice>1</voice><type>16th</type><time-modification><actual-notes>8</actual-notes><normal-notes>4</normal-notes></time-modification><notations><tuplet type="start" number="3"/></notations></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>120</duration><voice>1</voice><type>16th</type><time-modification><actual-notes>8</actual-notes><normal-notes>4</normal-notes></time-modification></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>120</duration><voice>1</voice><type>16th</type><time-modification><actual-notes>8</actual-notes><normal-notes>4</normal-notes></time-modification><notations><tuplet type="stop" number="3"/></notations></note>
    </measure>
  </part>
</score-partwise>`;
    const normalized = normalizeImportedMusicXmlText(xml);
    const doc = parseMusicXmlDocument(normalized);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const start = doc.querySelector('part > measure > note:nth-of-type(1) > notations > tuplet[type="start"]');
    expect(start?.getAttribute("show-number")).toBe("actual");
    expect(start?.getAttribute("bracket")).toBe("yes");
  });

  it("fills missing tuplet groups even when another group in the same lane already has explicit tuplet tags", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>160</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><notations><tuplet type="start" number="7"/></notations></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>160</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>160</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><notations><tuplet type="stop" number="7"/></notations></note>
      <note><rest/></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>160</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>160</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>160</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
    </measure>
  </part>
</score-partwise>`;
    const normalized = normalizeImportedMusicXmlText(xml);
    const doc = parseMusicXmlDocument(normalized);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const start1 = doc.querySelector('part > measure > note:nth-of-type(1) > notations > tuplet[type="start"]');
    const stop1 = doc.querySelector('part > measure > note:nth-of-type(3) > notations > tuplet[type="stop"]');
    const start2 = doc.querySelector('part > measure > note:nth-of-type(5) > notations > tuplet[type="start"]');
    const stop2 = doc.querySelector('part > measure > note:nth-of-type(7) > notations > tuplet[type="stop"]');
    expect(start1?.getAttribute("number")).toBe("7");
    expect(stop1?.getAttribute("number")).toBe("7");
    expect(start2).not.toBeNull();
    expect(stop2).not.toBeNull();
  });
});
