// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildPlaybackEventsFromMusicXmlDoc,
  collectMidiControlEventsFromMusicXmlDoc,
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

  it("auto-splits overlapping notes into multiple voices", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x90, 60, 96,
      ...vlq(120), 0x90, 64, 96,
      ...vlq(360), 0x80, 60, 0,
      ...vlq(120), 0x80, 64, 0,
    ]);
    const result = convertMidiToMusicXml(midi, { quantizeGrid: "1/16" });
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

  it("splits melodic notes into grand staff by middle C threshold", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x90, 60, 100, // C4 -> treble (staff 1)
      ...vlq(0), 0x90, 59, 100, // B3 -> bass (staff 2)
      ...vlq(480), 0x80, 60, 0,
      ...vlq(0), 0x80, 59, 0,
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
    const c4Note = Array.from(doc.querySelectorAll("part > measure > note"))
      .find((note) => note.querySelector("pitch > step")?.textContent?.trim() === "C"
        && note.querySelector("pitch > octave")?.textContent?.trim() === "4");
    const b3Note = Array.from(doc.querySelectorAll("part > measure > note"))
      .find((note) => note.querySelector("pitch > step")?.textContent?.trim() === "B"
        && note.querySelector("pitch > octave")?.textContent?.trim() === "3");
    expect(c4Note?.querySelector("staff")?.textContent?.trim()).toBe("1");
    expect(b3Note?.querySelector("staff")?.textContent?.trim()).toBe("2");
  });

  it("fills empty staff with a full-measure rest in grand staff mode", () => {
    const midi = buildSmfFormat0([
      ...vlq(0), 0x90, 72, 100, // C5 only (treble side)
      ...vlq(480), 0x80, 72, 0,
    ]);
    const result = convertMidiToMusicXml(midi);
    expect(result.ok).toBe(true);
    const doc = parseDoc(result.xml);
    const bassRests = Array.from(doc.querySelectorAll("part > measure > note"))
      .filter((note) => note.querySelector("staff")?.textContent?.trim() === "2")
      .filter((note) => note.querySelector("rest") !== null);
    expect(bassRests.length).toBeGreaterThan(0);
    expect(bassRests.some((note) => note.querySelector("type")?.textContent?.trim() === "whole")).toBe(true);
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
});
