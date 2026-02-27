// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildPlaybackEventsFromMusicXmlDoc,
  collectMidiControlEventsFromMusicXmlDoc,
  collectMidiKeySignatureEventsFromMusicXmlDoc,
  collectMidiTimeSignatureEventsFromMusicXmlDoc,
  collectMidiTempoEventsFromMusicXmlDoc,
  convertMidiToMusicXml,
} from "../../src/ts/midi-io";
import { parseMusicXmlDocument } from "../../src/ts/musicxml-io";

const parseDoc = (xml: string): Document => {
  const doc = parseMusicXmlDocument(xml);
  expect(doc).not.toBeNull();
  if (!doc) throw new Error("Invalid XML fixture.");
  return doc;
};

const vlq = (value: number): number[] => {
  let buffer = Math.max(0, Math.round(value)) & 0x0fffffff;
  const bytes = [buffer & 0x7f];
  buffer >>= 7;
  while (buffer > 0) {
    bytes.unshift((buffer & 0x7f) | 0x80);
    buffer >>= 7;
  }
  return bytes;
};

const asciiTextBytes = (text: string): number[] => Array.from(text).map((ch) => ch.charCodeAt(0) & 0xff);

const metaTextEvent = (deltaTicks: number, text: string, metaType = 0x01): number[] => {
  const payload = asciiTextBytes(text);
  return [...vlq(deltaTicks), 0xff, metaType & 0xff, ...vlq(payload.length), ...payload];
};

const buildSmfFormat0 = (trackEvents: number[], ticksPerQuarter = 480): Uint8Array => {
  const track = [...trackEvents, 0x00, 0xff, 0x2f, 0x00];
  const header = [
    0x4d, 0x54, 0x68, 0x64, // MThd
    0x00, 0x00, 0x00, 0x06, // header length
    0x00, 0x00, // format 0
    0x00, 0x01, // one track
    (ticksPerQuarter >> 8) & 0xff,
    ticksPerQuarter & 0xff,
  ];
  const trackHeader = [
    0x4d, 0x54, 0x72, 0x6b, // MTrk
    (track.length >>> 24) & 0xff,
    (track.length >>> 16) & 0xff,
    (track.length >>> 8) & 0xff,
    track.length & 0xff,
  ];
  return Uint8Array.from([...header, ...trackHeader, ...track]);
};

const buildSmfFormat1 = (tracks: number[][], ticksPerQuarter = 480): Uint8Array => {
  const header = [
    0x4d, 0x54, 0x68, 0x64, // MThd
    0x00, 0x00, 0x00, 0x06, // header length
    0x00, 0x01, // format 1
    (tracks.length >> 8) & 0xff,
    tracks.length & 0xff,
    (ticksPerQuarter >> 8) & 0xff,
    ticksPerQuarter & 0xff,
  ];
  const chunks: number[] = [];
  for (const trackEvents of tracks) {
    const track = [...trackEvents, 0x00, 0xff, 0x2f, 0x00];
    const trackHeader = [
      0x4d, 0x54, 0x72, 0x6b, // MTrk
      (track.length >>> 24) & 0xff,
      (track.length >>> 16) & 0xff,
      (track.length >>> 8) & 0xff,
      track.length & 0xff,
    ];
    chunks.push(...trackHeader, ...track);
  }
  return Uint8Array.from([...header, ...chunks]);
};

describe("midi-io MIDI nuance regressions", () => {
  it("keeps full non-implicit measure length for playback timeline", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>3</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseDoc(xml);
    const result = buildPlaybackEventsFromMusicXmlDoc(doc, 128, { mode: "playback" });
    expect(result.events.length).toBeGreaterThanOrEqual(2);
    const sorted = result.events.slice().sort((a, b) => a.startTicks - b.startTicks);
    expect(sorted[0].startTicks).toBe(0);
    // 3/4 one full measure at tpq=128 -> 384 ticks.
    expect(sorted[1].startTicks).toBe(384);
  });

  it("does not double-count underfull bar when followed by implicit pickup", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>3</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>half</type></note>
    </measure>
    <measure number="X1" implicit="yes">
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseDoc(xml);
    const result = buildPlaybackEventsFromMusicXmlDoc(doc, 128, { mode: "playback" });
    const sorted = result.events.slice().sort((a, b) => a.startTicks - b.startTicks);
    expect(sorted.length).toBeGreaterThanOrEqual(3);
    // m1(2 beats=256) + X1(1 beat=128) => m2 starts at 384, not 512.
    expect(sorted[2].startTicks).toBe(384);
  });

  it("expands grace notes before principal notes in MIDI mode", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <grace slash="yes"/>
        <pitch><step>G</step><octave>5</octave></pitch>
        <voice>1</voice>
        <type>16th</type>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>480</duration>
        <voice>1</voice>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseDoc(xml);
    const result = buildPlaybackEventsFromMusicXmlDoc(doc, 128, { mode: "midi" });
    const principal = result.events.find((e) => e.midiNumber === 60);
    const grace = result.events.find((e) => e.midiNumber === 79);
    expect(principal).toBeDefined();
    expect(grace).toBeDefined();
    if (!principal || !grace) return;
    expect(grace.startTicks).toBeLessThan(principal.startTicks);
  });

  it("supports on-beat grace timing mode (grace starts on beat, principal delayed)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>480</duration>
        <voice>1</voice>
        <type>quarter</type>
      </note>
      <note>
        <grace slash="yes"/>
        <pitch><step>G</step><octave>5</octave></pitch>
        <voice>1</voice>
        <type>16th</type>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>480</duration>
        <voice>1</voice>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseDoc(xml);
    const result = buildPlaybackEventsFromMusicXmlDoc(doc, 128, { mode: "midi", graceTimingMode: "on_beat" });
    const grace = result.events.find((e) => e.midiNumber === 79);
    const principal = result.events.find((e) => e.midiNumber === 62);
    expect(grace).toBeDefined();
    expect(principal).toBeDefined();
    if (!grace || !principal) return;
    expect(grace.startTicks).toBe(128);
    expect(principal.startTicks).toBeGreaterThan(grace.startTicks);
  });

  it("supports classical-equal grace timing mode (grace/principal split beat equally)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>480</duration>
        <voice>1</voice>
        <type>quarter</type>
      </note>
      <note>
        <grace/>
        <pitch><step>G</step><octave>5</octave></pitch>
        <voice>1</voice>
        <type>16th</type>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>480</duration>
        <voice>1</voice>
        <type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseDoc(xml);
    const result = buildPlaybackEventsFromMusicXmlDoc(doc, 128, {
      mode: "midi",
      graceTimingMode: "classical_equal",
    });
    const grace = result.events.find((e) => e.midiNumber === 79);
    const principal = result.events.find((e) => e.midiNumber === 62);
    expect(grace).toBeDefined();
    expect(principal).toBeDefined();
    if (!grace || !principal) return;
    expect(grace.startTicks).toBe(128);
    expect(principal.startTicks).toBe(grace.startTicks + grace.durTicks);
    expect(Math.abs(grace.durTicks - principal.durTicks)).toBeLessThanOrEqual(1);
  });

  it("merges tied notes into one sustained playback event in MIDI mode", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        <tie type="start"/><notations><tied type="start"/></notations>
      </note>
      <note><rest/><duration>1440</duration><voice>1</voice><type>half</type><dot/></note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        <tie type="stop"/><notations><tied type="stop"/></notations>
      </note>
      <note><rest/><duration>1440</duration><voice>1</voice><type>half</type><dot/></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseDoc(xml);
    const midiMode = buildPlaybackEventsFromMusicXmlDoc(doc, 128, { mode: "midi" });
    const c4Events = midiMode.events
      .filter((e) => e.midiNumber === 60)
      .sort((a, b) => a.startTicks - b.startTicks);
    expect(c4Events.length).toBe(1);
    expect(c4Events[0]?.startTicks).toBe(0);
    expect(c4Events[0]?.durTicks).toBeGreaterThanOrEqual(256);
  });

  it("keeps slurred notes longer than detached notes in MIDI mode", () => {
    const baseXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>2</beats><beat-type>4</beat-type></time>
      </attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        %NOTATIONS1%
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
        %NOTATIONS2%
      </note>
    </measure>
  </part>
</score-partwise>`;
    const plainDoc = parseDoc(baseXml.replace("%NOTATIONS1%", "").replace("%NOTATIONS2%", ""));
    const slurDoc = parseDoc(
      baseXml
        .replace("%NOTATIONS1%", '<notations><slur type="start" number="1"/></notations>')
        .replace("%NOTATIONS2%", '<notations><slur type="stop" number="1"/></notations>')
    );
    const plain = buildPlaybackEventsFromMusicXmlDoc(plainDoc, 128, { mode: "midi" }).events
      .sort((a, b) => a.startTicks - b.startTicks);
    const slurred = buildPlaybackEventsFromMusicXmlDoc(slurDoc, 128, { mode: "midi" }).events
      .sort((a, b) => a.startTicks - b.startTicks);
    expect(plain.length).toBe(2);
    expect(slurred.length).toBe(2);
    expect(slurred[0]?.durTicks ?? 0).toBeGreaterThan(plain[0]?.durTicks ?? 0);
    expect(slurred[1]?.durTicks ?? 0).toBeGreaterThan(plain[1]?.durTicks ?? 0);
  });

  it("keeps timeline stable for underfull + implicit + regular-underfull sequence", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>half</type></note>
    </measure>
    <measure number="X1" implicit="yes">
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
    <measure number="3">
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseDoc(xml);
    const result = buildPlaybackEventsFromMusicXmlDoc(doc, 128, { mode: "playback" });
    const sorted = result.events.slice().sort((a, b) => a.startTicks - b.startTicks);
    expect(sorted.length).toBeGreaterThanOrEqual(4);
    expect(sorted[0]?.startTicks).toBe(0);   // m1
    expect(sorted[1]?.startTicks).toBe(256); // X1 (underfull m1 respected before implicit)
    expect(sorted[2]?.startTicks).toBe(384); // m2
    expect(sorted[3]?.startTicks).toBe(896); // m3 (m2 underfull but not followed by implicit -> full bar advance)
  });

  it("applies metric beat accents in 4/4 when enabled", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseDoc(xml);
    const enabled = buildPlaybackEventsFromMusicXmlDoc(doc, 128, { mode: "midi", metricAccentEnabled: true });
    const disabled = buildPlaybackEventsFromMusicXmlDoc(doc, 128, { mode: "midi", metricAccentEnabled: false });
    expect(enabled.events.map((e) => e.velocity)).toEqual([82, 80, 81, 80]);
    expect(disabled.events.map((e) => e.velocity)).toEqual([80, 80, 80, 80]);
  });

  it("applies metric beat accents in 6/8 and 5-beat signatures", () => {
    const sixEightXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>6</beats><beat-type>8</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
    </measure>
  </part>
</score-partwise>`;
    const fiveFourXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>5</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const sixEightDoc = parseDoc(sixEightXml);
    const fiveFourDoc = parseDoc(fiveFourXml);
    const sixEight = buildPlaybackEventsFromMusicXmlDoc(sixEightDoc, 128, { mode: "midi", metricAccentEnabled: true });
    const fiveFour = buildPlaybackEventsFromMusicXmlDoc(fiveFourDoc, 128, { mode: "midi", metricAccentEnabled: true });
    expect(sixEight.events.map((e) => e.velocity)).toEqual([82, 80, 80, 81, 80, 80]);
    expect(fiveFour.events.map((e) => e.velocity)).toEqual([82, 80, 81, 80, 80]);
  });

  it("applies 3-beat and fallback patterns as specified", () => {
    const threeThreeXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>3</beats><beat-type>3</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>640</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>640</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>640</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const sevenEightXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>7</beats><beat-type>8</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>240</duration><voice>1</voice><type>eighth</type></note>
    </measure>
  </part>
</score-partwise>`;
    const threeThreeDoc = parseDoc(threeThreeXml);
    const sevenEightDoc = parseDoc(sevenEightXml);
    const threeThree = buildPlaybackEventsFromMusicXmlDoc(threeThreeDoc, 128, { mode: "midi", metricAccentEnabled: true });
    const sevenEight = buildPlaybackEventsFromMusicXmlDoc(sevenEightDoc, 128, { mode: "midi", metricAccentEnabled: true });
    expect(threeThree.events.map((e) => e.velocity)).toEqual([82, 80, 80]);
    expect(sevenEight.events.map((e) => e.velocity)).toEqual([82, 80, 80, 80, 80, 80, 80]);
  });

  it("supports configurable metric accent amount profiles", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseDoc(xml);
    const subtle = buildPlaybackEventsFromMusicXmlDoc(doc, 128, {
      mode: "midi",
      metricAccentEnabled: true,
      metricAccentProfile: "subtle",
    });
    const balanced = buildPlaybackEventsFromMusicXmlDoc(doc, 128, {
      mode: "midi",
      metricAccentEnabled: true,
      metricAccentProfile: "balanced",
    });
    const strong = buildPlaybackEventsFromMusicXmlDoc(doc, 128, {
      mode: "midi",
      metricAccentEnabled: true,
      metricAccentProfile: "strong",
    });
    expect(subtle.events.map((e) => e.velocity)).toEqual([82, 80, 81, 80]);
    expect(balanced.events.map((e) => e.velocity)).toEqual([84, 80, 82, 80]);
    expect(strong.events.map((e) => e.velocity)).toEqual([86, 80, 83, 80]);
  });

  it("collects in-score tempo changes with tick positions", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <direction><sound tempo="90"/></direction>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>60</per-minute></metronome></direction-type></direction>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseDoc(xml);
    const tempos = collectMidiTempoEventsFromMusicXmlDoc(doc, 128);
    expect(tempos[0]).toEqual({ startTicks: 0, bpm: 120 });
    expect(tempos.some((t) => t.bpm === 90 && t.startTicks > 0)).toBe(true);
    expect(tempos.some((t) => t.bpm === 60 && t.startTicks > 0)).toBe(true);
  });

  it("collects pedal markings as CC64 events", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <direction><direction-type><pedal type="start"/></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <direction><direction-type><pedal type="change"/></direction-type></direction>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>quarter</type></note>
      <direction><direction-type><pedal type="stop"/></direction-type></direction>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseDoc(xml);
    const ccEvents = collectMidiControlEventsFromMusicXmlDoc(doc, 128);
    const values = ccEvents.map((e) => e.controllerValue);
    expect(ccEvents.length).toBe(4);
    expect(ccEvents.every((e) => e.controllerNumber === 64)).toBe(true);
    expect(values).toEqual([127, 0, 127, 0]);
  });

  it("maps drum notes via midi-unpitched and instrument-name hints", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Drums</part-name>
      <score-instrument id="P1-I-Kick"><instrument-name>Bass Drum</instrument-name></score-instrument>
      <score-instrument id="P1-I-Snare"><instrument-name>Snare Drum</instrument-name></score-instrument>
      <midi-instrument id="P1-I-Kick"><midi-channel>10</midi-channel><midi-unpitched>36</midi-unpitched></midi-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <instrument id="P1-I-Kick"/>
        <unpitched><display-step>D</display-step><display-octave>4</display-octave></unpitched>
        <duration>480</duration><voice>1</voice><type>quarter</type>
      </note>
      <note>
        <instrument id="P1-I-Snare"/>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>480</duration><voice>1</voice><type>quarter</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseDoc(xml);
    const result = buildPlaybackEventsFromMusicXmlDoc(doc, 128, { mode: "midi" });
    expect(result.events.length).toBeGreaterThanOrEqual(2);
    expect(result.events[0]?.channel).toBe(10);
    expect(result.events[0]?.midiNumber).toBe(36);
    expect(result.events[1]?.midiNumber).toBe(38);
  });
});

describe("midi-io MIDI import MVP", () => {
  it("converts simple note MIDI into pitched MusicXML notes", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x90, 60, 96,
      ...vlq(480), 0x80, 60, 0,
    ]);
    const result = convertMidiToMusicXml(midi);
    expect(result.ok).toBe(true);
    expect(result.diagnostics.length).toBe(0);
    const doc = parseDoc(result.xml);
    const notes = Array.from(doc.querySelectorAll("part > measure > note"));
    expect(notes.some((note) => note.querySelector("pitch > step")?.textContent === "C")).toBe(true);
    expect(notes.some((note) => note.querySelector("type")?.textContent === "quarter")).toBe(true);
  });

  it("applies beam tags to grouped short notes and breaks beams across rests", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x90, 60, 96,
      ...vlq(240), 0x80, 60, 0,
      ...vlq(0), 0x90, 62, 96,
      ...vlq(240), 0x80, 62, 0,
      ...vlq(240), 0x90, 64, 96,
      ...vlq(240), 0x80, 64, 0,
    ]);
    const result = convertMidiToMusicXml(midi, { quantizeGrid: "1/8" });
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    const pitchedNotes = Array.from(doc.querySelectorAll("part > measure > note"))
      .filter((note) => note.querySelector("pitch") !== null);
    expect(pitchedNotes.length).toBeGreaterThanOrEqual(3);
    const firstBeam = pitchedNotes[0]?.querySelector("beam")?.textContent?.trim();
    const secondBeam = pitchedNotes[1]?.querySelector("beam")?.textContent?.trim();
    const thirdBeam = pitchedNotes[2]?.querySelector("beam");
    expect(firstBeam).toBe("begin");
    expect(secondBeam).toBe("end");
    expect(thirdBeam).toBeNull();
  });

  it("splits implicit beams at beat boundaries in MIDI import", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0xff, 0x58, 0x04, 0x02, 0x02, 0x18, 0x08, // 2/4
      ...vlq(0), 0x90, 60, 96,
      ...vlq(240), 0x80, 60, 0,
      ...vlq(0), 0x90, 62, 96,
      ...vlq(240), 0x80, 62, 0,
      ...vlq(0), 0x90, 64, 96,
      ...vlq(240), 0x80, 64, 0,
      ...vlq(0), 0x90, 65, 96,
      ...vlq(240), 0x80, 65, 0,
    ]);
    const result = convertMidiToMusicXml(midi, { quantizeGrid: "1/8" });
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    const pitchedNotes = Array.from(doc.querySelectorAll("part > measure > note"))
      .filter((note) => note.querySelector("pitch") !== null);
    expect(pitchedNotes.length).toBeGreaterThanOrEqual(4);
    const beams = pitchedNotes.map((note) => note.querySelector("beam")?.textContent?.trim() ?? "");
    expect(beams[0]).toBe("begin");
    expect(beams[1]).toBe("end");
    expect(beams[2]).toBe("begin");
    expect(beams[3]).toBe("end");
  });

  it("keeps same-pitch retrigger stable even when note-on appears before note-off at same tick", () => {
    const midiOffThenOn = buildSmfFormat0([
      ...vlq(0), 0x90, 60, 96,
      ...vlq(120), 0x80, 60, 0,
      ...vlq(0), 0x90, 60, 96,
      ...vlq(120), 0x80, 60, 0,
    ]);
    const midiOnThenOff = buildSmfFormat0([
      ...vlq(0), 0x90, 60, 96,
      ...vlq(120), 0x90, 60, 96,
      ...vlq(0), 0x80, 60, 0,
      ...vlq(120), 0x80, 60, 0,
    ]);

    const resultOffThenOn = convertMidiToMusicXml(midiOffThenOn, { quantizeGrid: "1/16" });
    const resultOnThenOff = convertMidiToMusicXml(midiOnThenOff, { quantizeGrid: "1/16" });
    expect(resultOffThenOn.ok).toBe(true);
    expect(resultOnThenOff.ok).toBe(true);

    const readDurations = (xml: string): string[] => {
      const doc = parseDoc(xml);
      return Array.from(doc.querySelectorAll("part > measure > note"))
        .filter((note) => note.querySelector("pitch > step")?.textContent?.trim() === "C")
        .map((note) => note.querySelector("duration")?.textContent?.trim() ?? "");
    };
    const offThenOnDurations = readDurations(resultOffThenOn.xml);
    const onThenOffDurations = readDurations(resultOnThenOff.xml);

    expect(offThenOnDurations.length).toBeGreaterThanOrEqual(2);
    expect(onThenOffDurations.length).toBeGreaterThanOrEqual(2);
    expect(onThenOffDurations).toEqual(offThenOnDurations);
    expect(resultOnThenOff.warnings.some((warning) => warning.code === "MIDI_NOTE_PAIR_BROKEN")).toBe(false);
  });

  it("auto-splits overlapping notes into multiple voices", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x90, 60, 96,
      ...vlq(120), 0x90, 64, 96,
      ...vlq(360), 0x80, 60, 0,
      ...vlq(120), 0x80, 64, 0,
    ]);
    const result = convertMidiToMusicXml(midi, { quantizeGrid: "1/16", tripletAwareQuantize: true });
    const doc = parseDoc(result.xml);
    const voices = Array.from(doc.querySelectorAll("part > measure > note > voice"))
      .map((voice) => Number(voice.textContent ?? "0"))
      .filter((voice) => Number.isFinite(voice));
    expect(new Set(voices).size).toBeGreaterThanOrEqual(2);
    expect(result.warnings.some((warning) => warning.code === "MIDI_POLYPHONY_VOICE_ASSIGNED")).toBe(true);
  });

  it("separates same MIDI channel across different tracks into separate parts", () => {
    const midi = buildSmfFormat1([
      [
        ...vlq(0), 0x90, 60, 96,
        ...vlq(480), 0x80, 60, 0,
      ],
      [
        ...vlq(0), 0x90, 64, 96,
        ...vlq(480), 0x80, 64, 0,
      ],
    ]);
    const result = convertMidiToMusicXml(midi);
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    const partNames = Array.from(doc.querySelectorAll("part-list > score-part > part-name"))
      .map((node) => node.textContent?.trim() ?? "")
      .filter(Boolean);
    expect(partNames).toContain("Track 1 Ch 1");
    expect(partNames).toContain("Track 2 Ch 1");
    expect(doc.querySelectorAll("score-partwise > part").length).toBeGreaterThanOrEqual(2);
  });

  it("separates channel 10 into dedicated drum part", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x99, 36, 100,
      ...vlq(240), 0x89, 36, 0,
    ]);
    const result = convertMidiToMusicXml(midi);
    const doc = parseDoc(result.xml);
    const drumPart = Array.from(doc.querySelectorAll("score-part")).find(
      (scorePart) => (scorePart.querySelector("part-name")?.textContent?.trim() ?? "").startsWith("Drums")
    );
    expect(drumPart).toBeDefined();
    expect(result.warnings.some((warning) => warning.code === "MIDI_DRUM_CHANNEL_SEPARATED")).toBe(true);
    expect(doc.querySelector('miscellaneous-field[name="diag:0001"]')?.textContent).toContain(
      "MIDI_DRUM_CHANNEL_SEPARATED"
    );
  });

  it("does not create empty parts from channels without note events", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0xc0, 0x00,   // ch1 program
      ...vlq(0), 0xc1, 0x28,   // ch2 program only (no notes)
      ...vlq(0), 0x90, 60, 96, // ch1 note
      ...vlq(480), 0x80, 60, 0,
    ]);
    const result = convertMidiToMusicXml(midi);
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    expect(doc.querySelectorAll("score-partwise > part").length).toBe(1);
    expect(doc.querySelectorAll("part-list > score-part").length).toBe(1);
  });

  it("reflects CC11 expression in imported dynamics estimation", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x90, 60, 100,
      ...vlq(480), 0x80, 60, 0,
      ...vlq(0), 0xb0, 11, 20, // CC11 expression down
      ...vlq(0), 0x90, 62, 100,
      ...vlq(480), 0x80, 62, 0,
    ]);
    const result = convertMidiToMusicXml(midi);
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    const dynamics = Array.from(doc.querySelectorAll("part > measure > direction > direction-type > dynamics > *"))
      .map((node) => node.tagName.toLowerCase());
    expect(dynamics).toContain("ff");
    expect(dynamics).toContain("pp");
  });

  it("reads MIDI key signature meta event into MusicXML key", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0xff, 0x59, 0x02, 0xfd, 0x01, // key: -3, minor
      ...vlq(0), 0x90, 69, 96,
      ...vlq(480), 0x80, 69, 0,
    ]);
    const result = convertMidiToMusicXml(midi);
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    const fifths = doc.querySelector("part > measure > attributes > key > fifths")?.textContent?.trim();
    const mode = doc.querySelector("part > measure > attributes > key > mode")?.textContent?.trim();
    expect(fifths).toBe("-3");
    expect(mode).toBe("minor");
  });

  it("normalizes leading pickup FF58 (1/8 at tick 0 then 3/8) to 3/8 on MIDI import", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0xff, 0x58, 0x04, 0x01, 0x03, 0x18, 0x08, // 1/8 at tick 0
      ...vlq(0), 0x90, 69, 96,
      ...vlq(240), 0x80, 69, 0, // 1/8 later (tpq=480)
      ...vlq(0), 0xff, 0x58, 0x04, 0x03, 0x03, 0x18, 0x08, // 3/8
      ...vlq(0), 0x90, 71, 96,
      ...vlq(480), 0x80, 71, 0,
    ]);
    const result = convertMidiToMusicXml(midi);
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    const beats = doc.querySelector("part > measure > attributes > time > beats")?.textContent?.trim();
    const beatType = doc.querySelector("part > measure > attributes > time > beat-type")?.textContent?.trim();
    expect(beats).toBe("3");
    expect(beatType).toBe("8");
    expect(result.warnings.some((warning) => warning.code === "MIDI_TIME_SIGNATURE_PICKUP_NORMALIZED")).toBe(true);
  });

  it("uses triplet-aware divisions for 1/16 import when triplet-like timing is detected", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x90, 60, 100,
      ...vlq(160), 0x80, 60, 0,
      ...vlq(0), 0x90, 62, 100,
      ...vlq(160), 0x80, 62, 0,
      ...vlq(0), 0x90, 64, 100,
      ...vlq(160), 0x80, 64, 0,
    ]);
    const result = convertMidiToMusicXml(midi, { quantizeGrid: "1/16", tripletAwareQuantize: true });
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    const divisions = doc.querySelector("part > measure > attributes > divisions")?.textContent?.trim();
    expect(divisions).toBe("12");
    const tripletLikeDuration = Array.from(doc.querySelectorAll("part > measure > note > duration"))
      .map((node) => node.textContent?.trim() ?? "")
      .some((value) => value === "4");
    expect(tripletLikeDuration).toBe(true);
  });

  it("chooses 1/8 grid on auto mode for straight eighth-note timing", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x90, 60, 96,
      ...vlq(240), 0x80, 60, 0,
      ...vlq(0), 0x90, 62, 96,
      ...vlq(240), 0x80, 62, 0,
      ...vlq(0), 0x90, 64, 96,
      ...vlq(240), 0x80, 64, 0,
    ]);
    const result = convertMidiToMusicXml(midi, { quantizeGrid: "auto" });
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    const divisions = doc.querySelector("part > measure > attributes > divisions")?.textContent?.trim();
    expect(divisions).toBe("2");
  });

  it("keeps triplet-aware grid behavior on auto mode when triplet-like timing is dominant", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x90, 60, 100,
      ...vlq(160), 0x80, 60, 0,
      ...vlq(0), 0x90, 62, 100,
      ...vlq(160), 0x80, 62, 0,
      ...vlq(0), 0x90, 64, 100,
      ...vlq(160), 0x80, 64, 0,
    ]);
    const result = convertMidiToMusicXml(midi, { quantizeGrid: "auto", tripletAwareQuantize: true });
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    const divisions = doc.querySelector("part > measure > attributes > divisions")?.textContent?.trim();
    expect(divisions).toBe("12");
  });

  it("keeps pickup measure as implicit when leading FF58 encodes anacrusis", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0xff, 0x58, 0x04, 0x01, 0x03, 0x18, 0x08, // 1/8 at tick 0
      ...vlq(0), 0x90, 76, 96,
      ...vlq(120), 0x80, 76, 0,
      ...vlq(0), 0x90, 75, 96,
      ...vlq(120), 0x80, 75, 0, // pickup ends at tick 240
      ...vlq(0), 0xff, 0x58, 0x04, 0x03, 0x03, 0x18, 0x08, // 3/8 from here
      ...vlq(0), 0x90, 76, 96,
      ...vlq(120), 0x80, 76, 0,
      ...vlq(0), 0x90, 71, 96,
      ...vlq(120), 0x80, 71, 0,
    ]);
    const result = convertMidiToMusicXml(midi);
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    const firstMeasure = doc.querySelector("part > measure[number=\"0\"]");
    expect(firstMeasure?.getAttribute("implicit")).toBe("yes");
    const beats = doc.querySelector("part > measure[number=\"0\"] > attributes > time > beats")?.textContent?.trim();
    const beatType = doc.querySelector("part > measure[number=\"0\"] > attributes > time > beat-type")?.textContent?.trim();
    expect(beats).toBe("3");
    expect(beatType).toBe("8");
    const sumVoiceDuration = (measureSelector: string, voice: string): number =>
      Array.from(doc.querySelectorAll(`${measureSelector} > note`))
        .filter((note) => note.querySelector("voice")?.textContent?.trim() === voice)
        .reduce((sum, note) => {
          const dur = Number(note.querySelector("duration")?.textContent?.trim() ?? "0");
          return sum + (Number.isFinite(dur) ? dur : 0);
        }, 0);
    const firstMeasureVoice1Duration = sumVoiceDuration("part > measure[number=\"0\"]", "1");
    const secondMeasureVoice1Duration = sumVoiceDuration("part > measure[number=\"1\"]", "1");
    expect(firstMeasureVoice1Duration).toBeGreaterThan(0);
    expect(secondMeasureVoice1Duration).toBeGreaterThan(0);
    expect(firstMeasureVoice1Duration).toBeLessThan(secondMeasureVoice1Duration);
  });

  it("infers MusicXML key when MIDI key signature meta event is missing", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x90, 62, 96, // D
      ...vlq(480), 0x80, 62, 0,
      ...vlq(0), 0x90, 66, 96, // F#
      ...vlq(480), 0x80, 66, 0,
      ...vlq(0), 0x90, 69, 96, // A
      ...vlq(480), 0x80, 69, 0,
      ...vlq(0), 0x90, 74, 96, // D
      ...vlq(480), 0x80, 74, 0,
    ]);
    const result = convertMidiToMusicXml(midi);
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    const fifths = doc.querySelector("part > measure > attributes > key > fifths")?.textContent?.trim();
    const mode = doc.querySelector("part > measure > attributes > key > mode")?.textContent?.trim();
    expect(fifths).toBe("2");
    expect(mode).toBe("major");
    expect(result.warnings.some((warning) => warning.code === "MIDI_KEY_SIGNATURE_INFERRED")).toBe(true);
  });

  it("emits natural accidental when note contradicts key signature", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0xff, 0x59, 0x02, 0x01, 0x00, // key: +1 (G major, F#)
      ...vlq(0), 0x90, 65, 100, // F natural
      ...vlq(480), 0x80, 65, 0,
    ]);
    const result = convertMidiToMusicXml(midi);
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    const accidental = doc.querySelector("part > measure > note > accidental")?.textContent?.trim();
    expect(accidental).toBe("natural");
  });

  it("keeps upper-staff hysteresis around split boundary in grand staff mode", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x90, 64, 100, // E4 -> upper
      ...vlq(480), 0x80, 64, 0,
      ...vlq(0), 0x90, 59, 100, // B3 stays upper by hysteresis (prev upper && >=55)
      ...vlq(480), 0x80, 59, 0,
      ...vlq(0), 0x90, 54, 100, // F#3 -> lower (drops below upper hold min)
      ...vlq(480), 0x80, 54, 0,
    ]);
    const result = convertMidiToMusicXml(midi);
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    const staves = doc.querySelector("part > measure > attributes > staves")?.textContent?.trim();
    expect(staves).toBe("2");
    const clef1 = doc.querySelector("part > measure > attributes > clef[number=\"1\"] > sign")?.textContent?.trim();
    const clef2 = doc.querySelector("part > measure > attributes > clef[number=\"2\"] > sign")?.textContent?.trim();
    expect(clef1).toBe("G");
    expect(clef2).toBe("F");
    const b3Note = Array.from(doc.querySelectorAll("part > measure > note"))
      .find((note) => note.querySelector("pitch > step")?.textContent?.trim() === "B"
        && note.querySelector("pitch > octave")?.textContent?.trim() === "3");
    const fs3Note = Array.from(doc.querySelectorAll("part > measure > note"))
      .find((note) => note.querySelector("pitch > step")?.textContent?.trim() === "F"
        && note.querySelector("pitch >alter")?.textContent?.trim() === "1"
        && note.querySelector("pitch > octave")?.textContent?.trim() === "3");
    expect(b3Note?.querySelector("staff")?.textContent?.trim()).toBe("1");
    expect(fs3Note?.querySelector("staff")?.textContent?.trim()).toBe("2");
  });

  it("does not emit phantom empty staff when melody stays on one side", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x90, 72, 100, // C5 only (treble side)
      ...vlq(480), 0x80, 72, 0,
    ]);
    const result = convertMidiToMusicXml(midi);
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    const staves = doc.querySelector("part > measure > attributes > staves");
    expect(staves).toBeNull();
    const clefSign = doc.querySelector("part > measure > attributes > clef > sign")?.textContent?.trim();
    expect(clefSign).toBe("G");
    const staff2Notes = Array.from(doc.querySelectorAll("part > measure > note"))
      .filter((note) => note.querySelector("staff")?.textContent?.trim() === "2");
    expect(staff2Notes.length).toBe(0);
  });

  it("does not emit full-rest-only inactive voice in a measure that already has notes", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0xff, 0x58, 0x04, 0x01, 0x02, 0x18, 0x08, // 1/4
      ...vlq(0), 0x90, 60, 100,  // m1 voice 1 candidate
      ...vlq(120), 0x90, 64, 100, // m1 overlap -> voice 2 candidate
      ...vlq(240), 0x80, 64, 0,
      ...vlq(120), 0x80, 60, 0,
      ...vlq(0), 0x90, 67, 100, // m2 only one sounding note
      ...vlq(240), 0x80, 67, 0,
    ]);
    const result = convertMidiToMusicXml(midi);
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    const measure2Voice2Notes = Array.from(doc.querySelectorAll('part > measure[number="2"] > note'))
      .filter((note) => note.querySelector("voice")?.textContent?.trim() === "2");
    expect(measure2Voice2Notes.length).toBe(0);
  });

  it("reads MIDI tempo meta event into MusicXML direction/sound tempo", () => {
    const microsPerQuarter = 600000; // 100 BPM
    const midi = buildSmfFormat0([
      ...vlq(0), 0xff, 0x51, 0x03,
      (microsPerQuarter >> 16) & 0xff,
      (microsPerQuarter >> 8) & 0xff,
      microsPerQuarter & 0xff,
      ...vlq(0), 0x90, 60, 96,
      ...vlq(480), 0x80, 60, 0,
    ]);
    const result = convertMidiToMusicXml(midi);
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    const soundTempo = Number(doc.querySelector("part > measure > direction > sound")?.getAttribute("tempo") ?? "");
    const metronomeTempo = doc.querySelector("part > measure > direction > direction-type > metronome > per-minute")?.textContent?.trim();
    expect(soundTempo).toBe(100);
    expect(metronomeTempo).toBe("100");
    const tempoEvents = collectMidiTempoEventsFromMusicXmlDoc(doc, 128);
    expect(tempoEvents[0]?.bpm).toBe(100);
  });

  it("maps note velocity to fixed dynamics marks (ppp..fff) and suppresses repeats", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x90, 60, 20,   // pp
      ...vlq(480), 0x80, 60, 0,
      ...vlq(0), 0x90, 62, 20,   // pp (same -> no extra direction)
      ...vlq(480), 0x80, 62, 0,
      ...vlq(0), 0x90, 64, 100,  // ff
      ...vlq(480), 0x80, 64, 0,
    ]);
    const result = convertMidiToMusicXml(midi);
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    const dynamics = Array.from(doc.querySelectorAll("part > measure > direction > direction-type > dynamics > *"))
      .map((node) => node.tagName.toLowerCase());
    expect(dynamics).toContain("pp");
    expect(dynamics).toContain("ff");
    expect(dynamics.filter((tag) => tag === "pp").length).toBe(1);
  });

  it("splits non-notatable imported durations into tied notes with valid type tags", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x90, 60, 96,
      ...vlq(1200), 0x80, 60, 0,
    ]);
    const result = convertMidiToMusicXml(midi);
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    const pitchNotes = Array.from(doc.querySelectorAll("part > measure > note"))
      .filter((note) => note.querySelector("pitch") !== null);
    expect(pitchNotes.length).toBeGreaterThan(1);
    expect(pitchNotes.every((note) => note.querySelector("type") !== null)).toBe(true);
    expect(pitchNotes.some((note) => note.querySelector('tie[type="start"]') !== null)).toBe(true);
    expect(pitchNotes.some((note) => note.querySelector('tie[type="stop"]') !== null)).toBe(true);
    expect(
      pitchNotes.some((note) => note.querySelector("duration")?.textContent?.trim() === "10")
    ).toBe(false);
  });

  it("writes MIDI meta metadata into miscellaneous-field by default", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x90, 60, 96,
      ...vlq(480), 0x80, 60, 0,
    ]);
    const result = convertMidiToMusicXml(midi);
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    const metaFields = Array.from(
      doc.querySelectorAll('part > measure > attributes > miscellaneous > miscellaneous-field[name^="mks:midi-meta"]')
    );
    expect(metaFields.length).toBeGreaterThan(0);
    const firstPayload = metaFields.find((node) =>
      /^mks:midi-meta-\d{4}$/.test(node.getAttribute("name") ?? "")
    )?.textContent;
    expect(firstPayload ?? "").toContain("key=0x3C");
    expect(firstPayload ?? "").toContain("vel=0x60");
  });

  it("writes src:midi raw source metadata by default", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x90, 60, 96,
      ...vlq(480), 0x80, 60, 0,
    ]);
    const result = convertMidiToMusicXml(midi);
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    expect(
      doc.querySelector('part > measure > attributes > miscellaneous > miscellaneous-field[name="src:midi:raw-encoding"]')
        ?.textContent
    ).toBe("hex-v1");
    expect(
      doc.querySelector('part > measure > attributes > miscellaneous > miscellaneous-field[name="src:midi:raw-0001"]')
        ?.textContent
    ).toMatch(/^[0-9A-F]+$/);
  });

  it("reads mikuscore SysEx metadata into mks:midi-sysex miscellaneous fields", () => {
    const payloadText =
      "mks|v=1|m=0001|i=0001|n=0001|d=" +
      encodeURIComponent("schema=mks-sysex-v1\napp=mikuscore\nsource=musicxml");
    const payloadBytes = Array.from(payloadText).map((ch) => ch.charCodeAt(0) & 0x7f);
    const midi = buildSmfFormat0([
      ...vlq(0),
      0xf0,
      ...vlq(payloadBytes.length + 1),
      ...payloadBytes,
      0xf7,
      ...vlq(0),
      0x90,
      60,
      96,
      ...vlq(480),
      0x80,
      60,
      0,
    ]);
    const result = convertMidiToMusicXml(midi);
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    expect(
      doc.querySelector(
        'part > measure > attributes > miscellaneous > miscellaneous-field[name="mks:midi-sysex:schema"]'
      )?.textContent
    ).toBe("mks-sysex-v1");
    expect(
      doc.querySelector(
        'part > measure > attributes > miscellaneous > miscellaneous-field[name="mks:midi-sysex:app"]'
      )?.textContent
    ).toBe("mikuscore");
  });

  it("pretty-prints imported MusicXML by default when debug metadata is enabled", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x90, 60, 96,
      ...vlq(480), 0x80, 60, 0,
    ]);
    const result = convertMidiToMusicXml(midi, { debugMetadata: true });
    expect(result.ok).toBe(true);
    expect(result.xml.includes("\n")).toBe(true);
  });

  it("keeps pretty-print output even when debugPrettyPrint is false", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x90, 60, 96,
      ...vlq(480), 0x80, 60, 0,
    ]);
    const result = convertMidiToMusicXml(midi, { debugMetadata: true, debugPrettyPrint: false });
    expect(result.ok).toBe(true);
    expect(result.xml.includes("\n")).toBe(true);
  });

  it("can disable MIDI debug metadata output", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x90, 60, 96,
      ...vlq(480), 0x80, 60, 0,
    ]);
    const result = convertMidiToMusicXml(midi, { debugMetadata: false });
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    expect(
      doc.querySelector('part > measure > attributes > miscellaneous > miscellaneous-field[name^="mks:midi-meta"]')
    ).toBeNull();
  });

  it("writes MIDI import warnings into diag:* miscellaneous fields", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x90, 60, 96,
      ...vlq(120), 0x90, 64, 96,
      ...vlq(360), 0x80, 60, 0,
      ...vlq(120), 0x80, 64, 0,
    ]);
    const result = convertMidiToMusicXml(midi, { debugMetadata: true, quantizeGrid: "1/16" });
    expect(result.ok).toBe(true);
    expect(result.warnings.some((warning) => warning.code === "MIDI_POLYPHONY_VOICE_ASSIGNED")).toBe(true);
    const doc = parseDoc(result.xml);
    expect(doc.querySelector('miscellaneous-field[name="diag:count"]')?.textContent).toBe("1");
    expect(doc.querySelector('miscellaneous-field[name="diag:0001"]')?.textContent).toContain(
      "code=MIDI_POLYPHONY_VOICE_ASSIGNED"
    );
  });

  it("collects key signature events from MusicXML for MIDI FF59 export", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <key><fifths>4</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>E</step><alter>1</alter><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
    <measure number="2">
      <attributes><key><fifths>-1</fifths><mode>minor</mode></key></attributes>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseDoc(xml);
    const ticksPerQuarter = 128;
    const keyEvents = collectMidiKeySignatureEventsFromMusicXmlDoc(doc, ticksPerQuarter);
    expect(keyEvents[0]).toEqual({ startTicks: 0, fifths: 4, mode: "major" });
    expect(keyEvents[1]?.fifths).toBe(-1);
    expect(keyEvents[1]?.mode).toBe("minor");
  });

  it("collects time signature events from MusicXML for MIDI FF58 export", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1440</duration><voice>1</voice><type>half</type><dot/></note>
    </measure>
    <measure number="2">
      <attributes><time><beats>6</beats><beat-type>8</beat-type></time></attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1440</duration><voice>1</voice><type>half</type><dot/></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseDoc(xml);
    const ticksPerQuarter = 128;
    const timeEvents = collectMidiTimeSignatureEventsFromMusicXmlDoc(doc, ticksPerQuarter);
    expect(timeEvents[0]).toEqual({ startTicks: 0, beats: 3, beatType: 4 });
    expect(timeEvents[1]?.beats).toBe(6);
    expect(timeEvents[1]?.beatType).toBe(8);
  });

  it("keeps stable triplet-eighth timing in MusicXML playback extraction", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch>
        <duration>160</duration><voice>1</voice><type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
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
      </note>
      <note><rest/><duration>480</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;
    const doc = parseDoc(xml);
    const result = buildPlaybackEventsFromMusicXmlDoc(doc, 128, { mode: "midi" });
    const events = result.events.slice().sort((a, b) => a.startTicks - b.startTicks);
    expect(events.length).toBe(3);
    expect(events[0]?.startTicks).toBe(0);
    const d1 = (events[1]?.startTicks ?? 0) - (events[0]?.startTicks ?? 0);
    const d2 = (events[2]?.startTicks ?? 0) - (events[1]?.startTicks ?? 0);
    expect([42, 43]).toContain(d1);
    expect([42, 43]).toContain(d2);
    expect(d1 + d2).toBe(85);
    expect(events.every((ev) => ev.durTicks > 0)).toBe(true);
  });

  it("keeps note timing extraction stable with staccato/accent notations", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>480</divisions><time><beats>2</beats><beat-type>4</beat-type></time></attributes>
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
    const doc = parseDoc(xml);
    const result = buildPlaybackEventsFromMusicXmlDoc(doc, 128, { mode: "midi" });
    const events = result.events.slice().sort((a, b) => a.startTicks - b.startTicks);
    expect(events.length).toBe(2);
    expect(events[0]?.startTicks).toBe(0);
    expect(events[1]?.startTicks).toBe(128);
    expect(events[0]?.durTicks).toBeGreaterThan(0);
    expect(events[0]?.durTicks ?? 0).toBeLessThanOrEqual(128);
    expect(events[1]?.durTicks).toBeGreaterThan(0);
    expect(events[1]?.durTicks ?? 0).toBeLessThanOrEqual(128);
  });

  it("does not duplicate FF58 events on explicit same-meter re-declaration", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
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
    </measure>
  </part>
</score-partwise>`;
    const doc = parseDoc(xml);
    const timeEvents = collectMidiTimeSignatureEventsFromMusicXmlDoc(doc, 128);
    expect(timeEvents).toEqual([{ startTicks: 0, beats: 2, beatType: 4 }]);
  });

  it("restores title/composer/part-name from mks text meta", () => {
    const track0 = [
      ...metaTextEvent(0, "mks:meta-version:1"),
      ...metaTextEvent(0, "mks:title:Roundtrip%20Title"),
      ...metaTextEvent(0, "mks:composer:Roundtrip%20Composer"),
      ...metaTextEvent(0, "mks:part-name-track:1:Violin%20Solo"),
      ...vlq(0),
      0xff,
      0x51,
      0x03,
      0x07,
      0xa1,
      0x20, // tempo=120
    ];
    const track1 = [
      ...metaTextEvent(0, "Track 1", 0x03),
      ...vlq(0),
      0x90,
      60,
      100,
      ...vlq(480),
      0x80,
      60,
      0,
    ];
    const midi = buildSmfFormat1([track0, track1], 480);
    const result = convertMidiToMusicXml(midi);
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    expect(doc.querySelector("work > work-title")?.textContent?.trim()).toBe("Roundtrip Title");
    expect(doc.querySelector('identification > creator[type="composer"]')?.textContent?.trim()).toBe(
      "Roundtrip Composer"
    );
    expect(doc.querySelector("part-list > score-part > part-name")?.textContent?.trim()).toBe("Violin Solo");
  });
});
