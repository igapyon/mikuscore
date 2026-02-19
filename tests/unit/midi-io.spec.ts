// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  buildPlaybackEventsFromMusicXmlDoc,
  collectMidiControlEventsFromMusicXmlDoc,
  collectMidiTempoEventsFromMusicXmlDoc,
} from "../../src/ts/midi-io";
import { parseMusicXmlDocument } from "../../src/ts/musicxml-io";

const parseDoc = (xml: string): Document => {
  const doc = parseMusicXmlDocument(xml);
  expect(doc).not.toBeNull();
  if (!doc) throw new Error("Invalid XML fixture.");
  return doc;
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
