// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  applyImplicitBeamsToMusicXmlText,
  normalizeImportedMusicXmlText,
  parseMusicXmlDocument,
} from "../../src/ts/musicxml-io";

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

  it("adds missing part-list and part ids for minimal score-partwise imports", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="2.0"><part><measure number="1"><attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><sound tempo="128"/><note><pitch><step>A</step><octave>3</octave></pitch><duration>240</duration><lyric><syllabic>single</syllabic><text>will</text></lyric></note></measure></part></score-partwise>`;
    const normalized = normalizeImportedMusicXmlText(xml);
    const doc = parseMusicXmlDocument(normalized);
    expect(doc).not.toBeNull();
    if (!doc) return;

    const part = doc.querySelector("score-partwise > part");
    const partId = part?.getAttribute("id")?.trim() ?? "";
    expect(partId).toBeTruthy();

    const scorePart = doc.querySelector(`score-partwise > part-list > score-part[id="${partId}"]`);
    expect(scorePart).not.toBeNull();
    expect(scorePart?.querySelector(":scope > part-name")).not.toBeNull();
  });

  it("adds final right barline when the last measure has no explicit barline", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><rest/><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const normalized = normalizeImportedMusicXmlText(xml);
    const doc = parseMusicXmlDocument(normalized);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const finalBarStyle = doc.querySelector('score-partwise > part > measure:last-of-type > barline[location="right"] > bar-style');
    expect(finalBarStyle?.textContent?.trim()).toBe("light-heavy");
  });

  it("does not add implicit beams during generic MusicXML normalization", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
    </measure>
  </part>
</score-partwise>`;
    const normalized = normalizeImportedMusicXmlText(xml);
    const doc = parseMusicXmlDocument(normalized);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const notes = Array.from(doc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(":scope > beam")).toBeNull();
    expect(notes[1]?.querySelector(":scope > beam")).toBeNull();
    expect(notes[2]?.querySelector(":scope > beam")).toBeNull();
    expect(notes[3]?.querySelector(":scope > beam")).toBeNull();
  });

  it("adds implicit beams only when requested explicitly", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
    </measure>
  </part>
</score-partwise>`;
    const withBeams = applyImplicitBeamsToMusicXmlText(xml);
    const doc = parseMusicXmlDocument(withBeams);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const notes = Array.from(doc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("begin");
    expect(notes[1]?.querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("end");
    expect(notes[2]?.querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("begin");
    expect(notes[3]?.querySelector(':scope > beam[number="1"]')?.textContent?.trim()).toBe("end");
  });

  it("keeps lane beams untouched when explicit beam pass runs over existing beams", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type><beam number="1">begin</beam></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type><beam number="1">end</beam></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
    </measure>
  </part>
</score-partwise>`;
    const normalized = normalizeImportedMusicXmlText(xml);
    const doc = parseMusicXmlDocument(normalized);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const notes = Array.from(doc.querySelectorAll("part > measure > note"));
    expect(notes[0]?.querySelectorAll(":scope > beam").length).toBe(1);
    expect(notes[1]?.querySelectorAll(":scope > beam").length).toBe(1);
    expect(notes[2]?.querySelector(":scope > beam")).toBeNull();
    expect(notes[3]?.querySelector(":scope > beam")).toBeNull();
  });

  it("keeps existing final right barline as-is", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><rest/><duration>1920</duration><voice>1</voice><type>whole</type></note>
      <barline location="right"><bar-style>heavy-light</bar-style></barline>
    </measure>
  </part>
</score-partwise>`;
    const normalized = normalizeImportedMusicXmlText(xml);
    const doc = parseMusicXmlDocument(normalized);
    expect(doc).not.toBeNull();
    if (!doc) return;
    const finalBarlines = doc.querySelectorAll('score-partwise > part > measure:last-of-type > barline[location="right"]');
    expect(finalBarlines.length).toBe(1);
    const finalBarStyle = doc.querySelector('score-partwise > part > measure:last-of-type > barline[location="right"] > bar-style');
    expect(finalBarStyle?.textContent?.trim()).toBe("heavy-light");
  });
});
