// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseMusicXmlDocument } from "../../src/ts/musicxml-io";
import { convertAbcToMusicXml, exportMusicXmlDomToAbc } from "../../src/ts/abc-io";
import { convertMeiToMusicXml, exportMusicXmlDomToMei } from "../../src/ts/mei-io";
import { convertLilyPondToMusicXml, exportMusicXmlDomToLilyPond } from "../../src/ts/lilypond-io";
import { convertMuseScoreToMusicXml, exportMusicXmlDomToMuseScore } from "../../src/ts/musescore-io";
import { convertMusicXmlToVsqx, convertVsqxToMusicXml, isVsqxBridgeAvailable } from "../../src/ts/vsqx-io";
import {
  buildMidiBytesForPlayback,
  buildPlaybackEventsFromMusicXmlDoc,
  collectMidiControlEventsFromMusicXmlDoc,
  collectMidiKeySignatureEventsFromMusicXmlDoc,
  collectMidiProgramOverridesFromMusicXmlDoc,
  collectMidiTempoEventsFromMusicXmlDoc,
  collectMidiTimeSignatureEventsFromMusicXmlDoc,
  convertMidiToMusicXml,
} from "../../src/ts/midi-io";

const parseDoc = (xml: string): Document => {
  const doc = parseMusicXmlDocument(xml);
  expect(doc).not.toBeNull();
  if (!doc) throw new Error("failed to parse MusicXML");
  return doc;
};

const ensureMidiWriterLoaded = (): void => {
  const maybeWindow = window as Window & { MidiWriter?: unknown };
  if (maybeWindow.MidiWriter) return;
  const runtimeJs = readFileSync(resolve(process.cwd(), "src", "js", "midi-writer.js"), "utf-8");
  window.eval(runtimeJs);
  expect(maybeWindow.MidiWriter).toBeDefined();
};

const ensureVsqxBridgeLoaded = (): void => {
  if (isVsqxBridgeAvailable()) return;
  const runtimeJs = readFileSync(
    resolve(process.cwd(), "src", "vendor", "utaformatix3", "utaformatix3-ts-plus.mikuscore.iife.js"),
    "utf-8"
  );
  window.eval(runtimeJs);
};

const firstPitchedFact = (doc: Document): { step: string; octave: number; quarterLen: number; startDiv: number } => {
  let currentDivisions = 1;
  let cursorDiv = 0;
  const part = doc.querySelector("score-partwise > part");
  if (!part) throw new Error("missing part");
  for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
    const parsedDivisions = Number(measure.querySelector(":scope > attributes > divisions")?.textContent?.trim() || "");
    if (Number.isFinite(parsedDivisions) && parsedDivisions > 0) {
      currentDivisions = parsedDivisions;
    }
    for (const child of Array.from(measure.children)) {
      if (child.tagName === "backup") {
        const d = Number(child.querySelector(":scope > duration")?.textContent?.trim() || "0");
        if (Number.isFinite(d) && d > 0) cursorDiv = Math.max(0, cursorDiv - d);
        continue;
      }
      if (child.tagName !== "note") continue;
      const isChord = child.querySelector(":scope > chord") !== null;
      const isRest = child.querySelector(":scope > rest") !== null;
      const isGrace = child.querySelector(":scope > grace") !== null;
      const duration = Number(child.querySelector(":scope > duration")?.textContent?.trim() || "0");
      const startDiv = cursorDiv;
      if (!isRest) {
        const step = child.querySelector(":scope > pitch > step")?.textContent?.trim() || "";
        const octave = Number(child.querySelector(":scope > pitch > octave")?.textContent?.trim() || "0");
        if (step && Number.isFinite(octave)) {
          return {
            step,
            octave,
            quarterLen: (Number.isFinite(duration) && duration > 0 ? duration : 0) / currentDivisions,
            startDiv,
          };
        }
      }
      if (!isChord && !isGrace && Number.isFinite(duration) && duration > 0) {
        cursorDiv += duration;
      }
    }
  }
  throw new Error("no pitched note found");
};

const roundtripAbc = (srcDoc: Document): Document => parseDoc(convertAbcToMusicXml(exportMusicXmlDomToAbc(srcDoc)));
const roundtripMei = (srcDoc: Document): Document => parseDoc(convertMeiToMusicXml(exportMusicXmlDomToMei(srcDoc)));
const roundtripLilyPond = (srcDoc: Document): Document =>
  parseDoc(convertLilyPondToMusicXml(exportMusicXmlDomToLilyPond(srcDoc), { debugMetadata: true }));
const roundtripMuseScore = (srcDoc: Document): Document =>
  parseDoc(convertMuseScoreToMusicXml(exportMusicXmlDomToMuseScore(srcDoc), { sourceMetadata: false, debugMetadata: false }));
const roundtripMidi = (srcDoc: Document): Document => {
  const ticksPerQuarter = 128;
  const playback = buildPlaybackEventsFromMusicXmlDoc(srcDoc, ticksPerQuarter, { mode: "midi" });
  const midiBytes = buildMidiBytesForPlayback(
    playback.events,
    playback.tempo,
    "electric_piano_2",
    collectMidiProgramOverridesFromMusicXmlDoc(srcDoc),
    collectMidiControlEventsFromMusicXmlDoc(srcDoc, ticksPerQuarter),
    collectMidiTempoEventsFromMusicXmlDoc(srcDoc, ticksPerQuarter),
    collectMidiTimeSignatureEventsFromMusicXmlDoc(srcDoc, ticksPerQuarter),
    collectMidiKeySignatureEventsFromMusicXmlDoc(srcDoc, ticksPerQuarter)
  );
  const imported = convertMidiToMusicXml(midiBytes, { quantizeGrid: "1/16" });
  expect(imported.ok).toBe(true);
  return parseDoc(imported.xml);
};
const roundtripVsqx = (srcXml: string): Document => {
  ensureVsqxBridgeLoaded();
  if (!isVsqxBridgeAvailable()) throw new Error("VSQX bridge unavailable");
  const exported = convertMusicXmlToVsqx(srcXml, { musicXml: { defaultLyric: "la" } });
  expect(exported.ok).toBe(true);
  const imported = convertVsqxToMusicXml(exported.vsqx, { defaultLyric: "la" });
  expect(imported.ok).toBe(true);
  return parseDoc(imported.xml);
};

type CffpCase = {
  id: string;
  xml: string;
  requirePitchedFact?: boolean;
  preserveByFormat: Partial<Record<"abc" | "mei" | "lilypond" | "musescore" | "midi" | "vsqx", boolean>>;
  preservePitchByFormat?: Partial<Record<"abc" | "mei" | "lilypond" | "musescore" | "midi" | "vsqx", boolean>>;
  preserveDurationByFormat?: Partial<Record<"abc" | "mei" | "lilypond" | "musescore" | "midi" | "vsqx", boolean>>;
  hasFeature: (doc: Document) => boolean;
};

const CFFP_CASES: CffpCase[] = [
  {
    id: "CFFP-TRILL",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type><notations><ornaments><trill-mark/></ornaments></notations></note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: { abc: true, lilypond: true, musescore: true },
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > ornaments > trill-mark") !== null,
  },
  {
    id: "CFFP-TRILL-VARIANTS",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><ornaments><trill-mark/><wavy-line type="start" number="1"/><accidental-mark>sharp</accidental-mark></ornaments></notations>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><ornaments><wavy-line type="stop" number="1"/></ornaments></notations>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    preserveDurationByFormat: { mei: false, midi: false, vsqx: false },
    hasFeature: (doc) => {
      const trill = doc.querySelector("part > measure > note > notations > ornaments > trill-mark");
      const wavyStart = doc.querySelector("part > measure > note > notations > ornaments > wavy-line[type=\"start\"]");
      const wavyStop = doc.querySelector("part > measure > note > notations > ornaments > wavy-line[type=\"stop\"]");
      const accidental = doc.querySelector("part > measure > note > notations > ornaments > accidental-mark");
      return trill !== null && wavyStart !== null && wavyStop !== null && accidental !== null;
    },
  },
  {
    id: "CFFP-TURN",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><ornaments><turn/></ornaments></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    preservePitchByFormat: { abc: false, mei: false, lilypond: false, musescore: false, midi: false, vsqx: false },
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > ornaments > turn") !== null,
  },
  {
    id: "CFFP-TURN-VARIANTS",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><ornaments><inverted-turn/><delayed-turn/></ornaments></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    preservePitchByFormat: { abc: false, mei: false, lilypond: false, musescore: false, midi: false, vsqx: false },
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > ornaments > inverted-turn") !== null &&
      doc.querySelector("part > measure > note > notations > ornaments > delayed-turn") !== null,
  },
  {
    id: "CFFP-MORDENT-VARIANTS",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>B</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><ornaments><mordent/><inverted-mordent/></ornaments></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    preservePitchByFormat: { abc: false, mei: false, lilypond: false, musescore: false, midi: false, vsqx: false },
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > ornaments > mordent") !== null &&
      doc.querySelector("part > measure > note > notations > ornaments > inverted-mordent") !== null,
  },
  {
    id: "CFFP-ORNAMENT-ACCIDENTAL-MARK",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><ornaments><trill-mark/><accidental-mark>flat</accidental-mark></ornaments></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    preservePitchByFormat: { abc: false, mei: false, lilypond: false, musescore: false, midi: false, vsqx: false },
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > ornaments > accidental-mark") !== null,
  },
  {
    id: "CFFP-SCHLEIFER",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><ornaments><schleifer/></ornaments></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    preservePitchByFormat: { abc: false, mei: false, lilypond: false, musescore: false, midi: false, vsqx: false },
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > ornaments > schleifer") !== null,
  },
  {
    id: "CFFP-SHAKE",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>B</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><ornaments><shake/></ornaments></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    preservePitchByFormat: { abc: false, mei: false, lilypond: false, musescore: false, midi: false, vsqx: false },
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > ornaments > shake") !== null,
  },
  {
    id: "CFFP-DYNAMICS-BASIC",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <direction placement="below"><direction-type><dynamics><pp/></dynamics></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type></note>
      <direction placement="below"><direction-type><dynamics><ff/></dynamics></direction-type></direction>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    preserveDurationByFormat: { mei: false, midi: false, vsqx: false },
    hasFeature: (doc) => {
      const pp = doc.querySelector("part > measure > direction > direction-type > dynamics > pp");
      const ff = doc.querySelector("part > measure > direction > direction-type > dynamics > ff");
      return pp !== null && ff !== null;
    },
  },
  {
    id: "CFFP-DYNAMICS-ACCENTED",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <direction><direction-type><dynamics><mf/></dynamics></direction-type></direction>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type></note>
      <direction><direction-type><dynamics><sfz/></dynamics></direction-type></direction>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    preservePitchByFormat: { abc: false, mei: false, lilypond: false, musescore: false, midi: false, vsqx: false },
    hasFeature: (doc) => {
      const mf = doc.querySelector("part > measure > direction > direction-type > dynamics > mf");
      const sfz = doc.querySelector("part > measure > direction > direction-type > dynamics > sfz");
      return mf !== null && sfz !== null;
    },
  },
  {
    id: "CFFP-DYNAMICS-WEDGE",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <direction><direction-type><wedge type="crescendo" number="1"/></direction-type></direction>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type></note>
      <direction><direction-type><wedge type="stop" number="1"/></direction-type></direction>
      <direction><direction-type><wedge type="diminuendo" number="2"/></direction-type></direction>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
      <direction><direction-type><wedge type="stop" number="2"/></direction-type></direction>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    preserveDurationByFormat: { mei: false, midi: false, vsqx: false },
    hasFeature: (doc) => {
      const cres = doc.querySelector("part > measure > direction > direction-type > wedge[type=\"crescendo\"]");
      const dim = doc.querySelector("part > measure > direction > direction-type > wedge[type=\"diminuendo\"]");
      return cres !== null && dim !== null;
    },
  },
  {
    id: "CFFP-FERMATA",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>3840</duration><voice>1</voice><type>whole</type>
        <notations><fermata type="upright">normal</fermata></notations>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > fermata") !== null,
  },
  {
    id: "CFFP-ARPEGGIATE",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <chord/>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><arpeggiate number="1"/></notations>
      </note>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><arpeggiate number="1"/></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    preservePitchByFormat: { abc: false, mei: false, lilypond: false, musescore: false, midi: false, vsqx: false },
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > arpeggiate") !== null,
  },
  {
    id: "CFFP-BREATH-CAESURA",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><articulations><breath-mark/><caesura/></articulations></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > articulations > breath-mark") !== null &&
      doc.querySelector("part > measure > note > notations > articulations > caesura") !== null,
  },
  {
    id: "CFFP-GLISSANDO",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><glissando type="start" number="1">wavy</glissando></notations>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><glissando type="stop" number="1">wavy</glissando></notations>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > glissando[type=\"start\"]") !== null &&
      doc.querySelector("part > measure > note > notations > glissando[type=\"stop\"]") !== null,
  },
  {
    id: "CFFP-PEDAL",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <direction><direction-type><pedal type="start" number="1"/></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type></note>
      <direction><direction-type><pedal type="stop" number="1"/></direction-type></direction>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > direction > direction-type > pedal[type=\"start\"]") !== null &&
      doc.querySelector("part > measure > direction > direction-type > pedal[type=\"stop\"]") !== null,
  },
  {
    id: "CFFP-SEGNO-CODA",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <direction><direction-type><segno/></direction-type></direction>
      <direction><direction-type><coda/></direction-type></direction>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: { musescore: true },
    hasFeature: (doc) =>
      doc.querySelector("part > measure > direction > direction-type > segno") !== null &&
      doc.querySelector("part > measure > direction > direction-type > coda") !== null,
  },
  {
    id: "CFFP-HARMONY-CHORDSYMBOL",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <harmony>
        <root><root-step>C</root-step><root-alter>1</root-alter></root>
        <kind text="maj7">major-seventh</kind>
        <bass><bass-step>E</bass-step></bass>
      </harmony>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const rootStep = doc.querySelector("part > measure > harmony > root > root-step")?.textContent?.trim();
      const rootAlter = Number(doc.querySelector("part > measure > harmony > root > root-alter")?.textContent?.trim() ?? "");
      const kind = doc.querySelector("part > measure > harmony > kind")?.textContent?.trim();
      const bass = doc.querySelector("part > measure > harmony > bass > bass-step")?.textContent?.trim();
      return rootStep === "C" && rootAlter === 1 && kind === "major-seventh" && bass === "E";
    },
  },
  {
    id: "CFFP-KEY-MODE",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
    <measure number="2">
      <attributes><key><fifths>0</fifths><mode>minor</mode></key></attributes>
      <note><pitch><step>A</step><octave>3</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const m1 = doc.querySelector("part > measure:nth-of-type(1) > attributes > key > mode")?.textContent?.trim().toLowerCase() ?? "";
      const m2 = doc.querySelector("part > measure:nth-of-type(2) > attributes > key > mode")?.textContent?.trim().toLowerCase() ?? "";
      return m1 === "major" && m2 === "minor";
    },
  },
  {
    id: "CFFP-TECHNIQUE-TEXT",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <direction><direction-type><words>pizz.</words></direction-type></direction>
      <direction><direction-type><words>arco</words></direction-type></direction>
      <direction><direction-type><words>con sord.</words></direction-type></direction>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const words = Array.from(doc.querySelectorAll("part > measure > direction > direction-type > words")).map((n) =>
        (n.textContent?.trim().toLowerCase() ?? "")
      );
      return words.includes("pizz.") && words.includes("arco") && words.includes("con sord.");
    },
  },
  {
    id: "CFFP-LEFT-HAND-PIZZICATO",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Strings</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch>
        <duration>3840</duration><voice>1</voice><type>whole</type>
        <notations><technical><left-hand-pizzicato/></technical></notations>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > technical > left-hand-pizzicato") !== null,
  },
  {
    id: "CFFP-BOWING-DIRECTION",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Strings</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><technical><up-bow/></technical></notations>
      </note>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><technical><down-bow/></technical></notations>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > technical > up-bow") !== null &&
      doc.querySelector("part > measure > note > notations > technical > down-bow") !== null,
  },
  {
    id: "CFFP-ARTICULATION-EXT",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1280</duration><voice>1</voice><type>quarter</type>
        <notations><articulations><tenuto/></articulations></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>1280</duration><voice>1</voice><type>quarter</type>
        <notations><articulations><staccatissimo/></articulations></notations>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>1280</duration><voice>1</voice><type>quarter</type>
        <notations><articulations><strong-accent/></articulations></notations>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    preserveDurationByFormat: { mei: false, musescore: false },
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > articulations > tenuto") !== null &&
      doc.querySelector("part > measure > note > notations > articulations > staccatissimo") !== null &&
      doc.querySelector("part > measure > note > notations > articulations > strong-accent") !== null,
  },
  {
    id: "CFFP-NOTEHEAD",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type><notehead>cross</notehead></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type><notehead>diamond</notehead></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const heads = Array.from(doc.querySelectorAll("part > measure > note > notehead"))
        .map((n) => n.textContent?.trim().toLowerCase() ?? "");
      return heads.includes("cross") && heads.includes("diamond");
    },
  },
  {
    id: "CFFP-CLEF-MIDMEASURE",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type></note>
      <attributes><clef><sign>F</sign><line>4</line></clef></attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const clefs = Array.from(doc.querySelectorAll("part > measure > attributes > clef > sign"))
        .map((n) => n.textContent?.trim().toUpperCase() ?? "");
      return clefs.includes("G") && clefs.includes("F");
    },
  },
  {
    id: "CFFP-STEM-BEAM-DIR",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type><stem>up</stem><beam number="1">begin</beam></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type><stem>down</stem><beam number="1">end</beam></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type><dot/></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const stems = Array.from(doc.querySelectorAll("part > measure > note > stem"))
        .map((n) => n.textContent?.trim().toLowerCase() ?? "");
      const beams = Array.from(doc.querySelectorAll("part > measure > note > beam[number=\"1\"]"))
        .map((n) => n.textContent?.trim().toLowerCase() ?? "");
      return stems.includes("up") && stems.includes("down") && beams.includes("begin") && beams.includes("end");
    },
  },
  {
    id: "CFFP-VOICE-STAFF-SWAP",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    preservePitchByFormat: { abc: false, mei: false, lilypond: false, musescore: false, midi: false, vsqx: false },
    hasFeature: (doc) => {
      const notes = Array.from(doc.querySelectorAll("part > measure > note"));
      const v1s1 = notes.some((n) => {
        const v = n.querySelector(":scope > voice")?.textContent?.trim();
        const s = n.querySelector(":scope > staff")?.textContent?.trim();
        return v === "1" && s === "1";
      });
      const v1s2 = notes.some((n) => {
        const v = n.querySelector(":scope > voice")?.textContent?.trim();
        const s = n.querySelector(":scope > staff")?.textContent?.trim();
        return v === "1" && s === "2";
      });
      return v1s1 && v1s2;
    },
  },
  {
    id: "CFFP-MEASURE-STYLE",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef>
        <measure-style><slash type="start"/></measure-style>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
    <measure number="2">
      <attributes><measure-style><multiple-rest>2</multiple-rest><slash type="stop"/></measure-style></attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const slashStart = doc.querySelector("part > measure:nth-of-type(1) > attributes > measure-style > slash[type=\"start\"]");
      const slashStop = doc.querySelector("part > measure:nth-of-type(2) > attributes > measure-style > slash[type=\"stop\"]");
      const multi = Number(
        doc.querySelector("part > measure:nth-of-type(2) > attributes > measure-style > multiple-rest")?.textContent?.trim() ?? ""
      );
      return slashStart !== null && slashStop !== null && multi === 2;
    },
  },
  {
    id: "CFFP-PRINT-LAYOUT-MIN",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <print new-system="yes"/>
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
    <measure number="2">
      <print new-page="yes"/>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const m1 = doc.querySelector("part > measure:nth-of-type(1) > print[new-system=\"yes\"]");
      const m2 = doc.querySelector("part > measure:nth-of-type(2) > print[new-page=\"yes\"]");
      return m1 !== null && m2 !== null;
    },
  },
  {
    id: "CFFP-MIDMEASURE-REPEAT",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <direction><direction-type><words>||:</words></direction-type><sound forward-repeat="yes"/></direction>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <direction><direction-type><words>:||</words></direction-type><sound backward-repeat="yes"/></direction>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const fwd = doc.querySelector("part > measure > direction > sound[forward-repeat=\"yes\"]");
      const back = doc.querySelector("part > measure > direction > sound[backward-repeat=\"yes\"]");
      return fwd !== null && back !== null;
    },
  },
  {
    id: "CFFP-OTTAVA-NUMBERING",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <direction><direction-type><octave-shift type="up" size="8" number="1"/></direction-type></direction>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <direction><direction-type><octave-shift type="up" size="8" number="2"/></direction-type></direction>
      <note><pitch><step>D</step><octave>5</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <direction><direction-type><octave-shift type="stop" size="8" number="1"/></direction-type></direction>
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <direction><direction-type><octave-shift type="stop" size="8" number="2"/></direction-type></direction>
      <note><pitch><step>F</step><octave>5</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    preservePitchByFormat: { musescore: false, midi: false, vsqx: false },
    hasFeature: (doc) => {
      const starts = Array.from(doc.querySelectorAll("part > measure > direction > direction-type > octave-shift[type=\"up\"]"))
        .map((n) => n.getAttribute("number") ?? "");
      const stops = Array.from(doc.querySelectorAll("part > measure > direction > direction-type > octave-shift[type=\"stop\"]"))
        .map((n) => n.getAttribute("number") ?? "");
      return starts.includes("1") && starts.includes("2") && stops.includes("1") && stops.includes("2");
    },
  },
  {
    id: "CFFP-LYRIC-BASIC",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Vocal</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>half</type>
        <lyric number="1"><syllabic>begin</syllabic><text>la</text></lyric>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>half</type>
        <lyric number="1"><syllabic>end</syllabic><extend/></lyric>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const text = doc.querySelector("part > measure > note > lyric > text")?.textContent?.trim().toLowerCase() ?? "";
      const hasExtend = doc.querySelector("part > measure > note > lyric > extend") !== null;
      return text === "la" && hasExtend;
    },
  },
  {
    id: "CFFP-SLIDE",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><slide type="start" number="1"/></notations>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>half</type>
        <notations><slide type="stop" number="1"/></notations>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > slide[type=\"start\"]") !== null &&
      doc.querySelector("part > measure > note > notations > slide[type=\"stop\"]") !== null,
  },
  {
    id: "CFFP-TREMOLO",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>960</duration><voice>1</voice><type>quarter</type>
        <notations><ornaments><tremolo type="single">3</tremolo></ornaments></notations>
      </note>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch>
        <duration>1440</duration><voice>1</voice><type>quarter</type><dot/>
        <notations><ornaments><tremolo type="start">2</tremolo></ornaments></notations>
      </note>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch>
        <duration>1440</duration><voice>1</voice><type>quarter</type><dot/>
        <notations><ornaments><tremolo type="stop">2</tremolo></ornaments></notations>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > ornaments > tremolo[type=\"single\"]") !== null &&
      doc.querySelector("part > measure > note > notations > ornaments > tremolo[type=\"start\"]") !== null &&
      doc.querySelector("part > measure > note > notations > ornaments > tremolo[type=\"stop\"]") !== null,
  },
  {
    id: "CFFP-REHEARSAL-MARK",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <direction><direction-type><rehearsal>A1</rehearsal></direction-type></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      (doc.querySelector("part > measure > direction > direction-type > rehearsal")?.textContent?.trim() ?? "") === "A1",
  },
  {
    id: "CFFP-DA-CAPO-DAL-SEGNO",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <direction><direction-type><words>Da Capo</words></direction-type><sound dacapo="yes"/></direction>
      <direction><direction-type><words>Dal Segno</words></direction-type><sound dalsegno="segno1"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const words = Array.from(doc.querySelectorAll("part > measure > direction > direction-type > words"))
        .map((n) => n.textContent?.trim().toLowerCase() ?? "");
      const hasDaCapoWord = words.some((w) => w.includes("da capo"));
      const hasDalSegnoWord = words.some((w) => w.includes("dal segno"));
      const hasDaCapoSound = doc.querySelector("part > measure > direction > sound[dacapo=\"yes\"]") !== null;
      const hasDalSegnoSound = doc.querySelector("part > measure > direction > sound[dalsegno]") !== null;
      return hasDaCapoWord && hasDalSegnoWord && hasDaCapoSound && hasDalSegnoSound;
    },
  },
  {
    id: "CFFP-ENDING-TYPE",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <barline location="left"><ending number="1" type="start"/></barline>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
    <measure number="2">
      <barline location="left"><ending number="1" type="stop"/></barline>
      <barline location="right"><ending number="2" type="discontinue"/></barline>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const start = doc.querySelector("part > measure:nth-of-type(1) > barline[location=\"left\"] > ending[type=\"start\"]");
      const stop = doc.querySelector("part > measure:nth-of-type(2) > barline[location=\"left\"] > ending[type=\"stop\"]");
      const discontinue = doc.querySelector("part > measure:nth-of-type(2) > barline[location=\"right\"] > ending[type=\"discontinue\"]");
      return start !== null && stop !== null && discontinue !== null;
    },
  },
  {
    id: "CFFP-ACCIDENTAL",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>1</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type><accidental>natural</accidental></note>
      <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>2880</duration><voice>1</voice><type>half</type><dot/></note>
    </measure>
    <measure number="2">
      <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: { abc: true, musescore: true },
    hasFeature: (doc) => {
      const m1n1 = doc.querySelector("part > measure:nth-of-type(1) > note:nth-of-type(1)");
      const m1n2 = doc.querySelector("part > measure:nth-of-type(1) > note:nth-of-type(2)");
      const m2n1 = doc.querySelector("part > measure:nth-of-type(2) > note:nth-of-type(1)");
      const a1 = m1n1?.querySelector(":scope > accidental")?.textContent?.trim().toLowerCase() ?? "";
      const al2 = Number(m1n2?.querySelector(":scope > pitch > alter")?.textContent?.trim() ?? "0");
      const al3 = Number(m2n1?.querySelector(":scope > pitch > alter")?.textContent?.trim() ?? "0");
      return a1 === "natural" && al2 === 1 && al3 === 1;
    },
  },
  {
    id: "CFFP-ACCIDENTAL-RESET",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type><accidental>sharp</accidental></note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: { abc: true, mei: true, lilypond: true, musescore: true, midi: true },
    preservePitchByFormat: { vsqx: false },
    hasFeature: (doc) => {
      const m1n1 = doc.querySelector("part > measure:nth-of-type(1) > note:nth-of-type(1)");
      const m2n1 = doc.querySelector("part > measure:nth-of-type(2) > note:nth-of-type(1)");
      const m1Alter = Number(m1n1?.querySelector(":scope > pitch > alter")?.textContent?.trim() ?? "0");
      const m2AlterRaw = m2n1?.querySelector(":scope > pitch > alter")?.textContent?.trim() ?? "";
      return m1Alter === 1 && (m2AlterRaw === "" || Number(m2AlterRaw) === 0);
    },
  },
  {
    id: "CFFP-COURTESY-ACCIDENTAL",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type><accidental cautionary="yes">natural</accidental></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > accidental[cautionary=\"yes\"]") !== null,
  },
  {
    id: "CFFP-BEAM-CONTINUITY",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type><beam number="1">begin</beam></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type><beam number="1">continue</beam></note>
      <note><rest/><duration>480</duration><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type><beam number="1">begin</beam></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type><beam number="1">end</beam></note>
      <note><rest/><duration>1440</duration><voice>1</voice><type>quarter</type><dot/></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    preservePitchByFormat: { abc: false, mei: false, lilypond: false, musescore: false, midi: false, vsqx: false },
    hasFeature: (doc) => {
      const beams = Array.from(doc.querySelectorAll("part > measure > note > beam[number=\"1\"]")).map(
        (n) => (n.textContent?.trim().toLowerCase() ?? "")
      );
      return beams.includes("begin") && (beams.includes("continue") || beams.includes("end"));
    },
  },
  {
    id: "CFFP-MULTIVOICE-BACKUP",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
      <backup><duration>3840</duration></backup>
      <note><rest/><duration>1920</duration><voice>2</voice><type>half</type></note>
      <note><pitch><step>G</step><octave>3</octave></pitch><duration>1920</duration><voice>2</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: { musescore: true },
    preservePitchByFormat: { abc: false, mei: false, lilypond: false, musescore: false, midi: false, vsqx: false },
    hasFeature: (doc) => {
      const hasV1 = doc.querySelector("part > measure > note > voice")?.textContent?.trim() === "1";
      const hasV2 = Array.from(doc.querySelectorAll("part > measure > note > voice")).some((v) => v.textContent?.trim() === "2");
      return hasV1 && hasV2;
    },
  },
  {
    id: "CFFP-PICKUP-IMPLICIT",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="0" implicit="yes">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
    </measure>
    <measure number="1">
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: { musescore: true },
    hasFeature: (doc) => {
      const m1 = doc.querySelector("part > measure:nth-of-type(1)");
      const num = m1?.getAttribute("number") ?? "";
      const implicit = m1?.getAttribute("implicit") ?? "";
      return num === "0" && implicit.toLowerCase() === "yes";
    },
  },
  {
    id: "CFFP-TRANSPOSE",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef>
        <transpose><diatonic>1</diatonic><chromatic>2</chromatic></transpose>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
    <measure number="2">
      <attributes><transpose><diatonic>-1</diatonic><chromatic>-2</chromatic></transpose></attributes>
      <note><pitch><step>B</step><octave>3</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    preservePitchByFormat: { abc: false, mei: false, lilypond: false, musescore: false, midi: false, vsqx: false },
    hasFeature: (doc) => {
      const m1d = Number(doc.querySelector("part > measure:nth-of-type(1) > attributes > transpose > diatonic")?.textContent?.trim() ?? "");
      const m1c = Number(doc.querySelector("part > measure:nth-of-type(1) > attributes > transpose > chromatic")?.textContent?.trim() ?? "");
      const m2d = Number(doc.querySelector("part > measure:nth-of-type(2) > attributes > transpose > diatonic")?.textContent?.trim() ?? "");
      const m2c = Number(doc.querySelector("part > measure:nth-of-type(2) > attributes > transpose > chromatic")?.textContent?.trim() ?? "");
      return m1d === 1 && m1c === 2 && m2d === -1 && m2c === -2;
    },
  },
  {
    id: "CFFP-GRANDSTAFF-MAPPING",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type><staff>1</staff></note>
      <backup><duration>3840</duration></backup>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>3840</duration><voice>2</voice><type>whole</type><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: { musescore: true },
    preservePitchByFormat: { abc: false, mei: false, lilypond: false, musescore: false, midi: false, vsqx: false },
    hasFeature: (doc) => {
      const hasStaff1 = Array.from(doc.querySelectorAll("part > measure > note > staff")).some((n) => n.textContent?.trim() === "1");
      const hasStaff2 = Array.from(doc.querySelectorAll("part > measure > note > staff")).some((n) => n.textContent?.trim() === "2");
      return hasStaff1 && hasStaff2;
    },
  },
  {
    id: "CFFP-KEY-CHANGE",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
    <measure number="2">
      <attributes><key><fifths>2</fifths></key></attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const m1 = Number(doc.querySelector("part > measure:nth-of-type(1) > attributes > key > fifths")?.textContent?.trim() ?? "");
      const m2 = Number(doc.querySelector("part > measure:nth-of-type(2) > attributes > key > fifths")?.textContent?.trim() ?? "");
      return m1 === 0 && m2 === 2;
    },
  },
  {
    id: "CFFP-TIME-CHANGE",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
    <measure number="2">
      <attributes><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2880</duration><voice>1</voice><type>half</type><dot/></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: { mei: true, lilypond: true, musescore: true },
    hasFeature: (doc) => {
      const b1 = Number(doc.querySelector("part > measure:nth-of-type(1) > attributes > time > beats")?.textContent?.trim() ?? "");
      const bt1 = Number(doc.querySelector("part > measure:nth-of-type(1) > attributes > time > beat-type")?.textContent?.trim() ?? "");
      const b2 = Number(doc.querySelector("part > measure:nth-of-type(2) > attributes > time > beats")?.textContent?.trim() ?? "");
      const bt2 = Number(doc.querySelector("part > measure:nth-of-type(2) > attributes > time > beat-type")?.textContent?.trim() ?? "");
      return b1 === 4 && bt1 === 4 && b2 === 3 && bt2 === 4;
    },
  },
  {
    id: "CFFP-DOUBLE-BARLINE",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
      <barline location="right"><bar-style>light-light</bar-style></barline>
    </measure>
    <measure number="2">
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const bar = doc.querySelector("part > measure:nth-of-type(1) > barline[location=\"right\"] > bar-style");
      return (bar?.textContent?.trim().toLowerCase() ?? "") === "light-light";
    },
  },
  {
    id: "CFFP-REPEAT-ENDING",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <barline location="left"><repeat direction="forward"/></barline>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
    <measure number="2">
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
      <barline location="right"><bar-style>light-heavy</bar-style><repeat direction="backward"/><ending number="2" type="stop"/></barline>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: { abc: true, lilypond: true, musescore: true },
    hasFeature: (doc) => {
      const forward = doc.querySelector("part > measure:nth-of-type(1) > barline[location=\"left\"] > repeat[direction=\"forward\"]");
      const backward = doc.querySelector("part > measure:nth-of-type(2) > barline[location=\"right\"] > repeat[direction=\"backward\"]");
      return forward !== null && backward !== null;
    },
  },
  {
    id: "CFFP-TEMPO-MAP",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome></direction-type><sound tempo="120"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
    <measure number="2">
      <direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>90</per-minute></metronome></direction-type><sound tempo="90"/></direction>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: { musescore: true },
    hasFeature: (doc) => {
      const sounds = Array.from(doc.querySelectorAll("part > measure > direction > sound[tempo]"))
        .map((n) => Number(n.getAttribute("tempo") ?? ""))
        .filter((n) => Number.isFinite(n) && n > 0);
      return sounds.includes(120) && sounds.includes(90);
    },
  },
  {
    id: "CFFP-OCTSHIFT",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <direction><direction-type><octave-shift type="up" size="8" number="1"/></direction-type></direction>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type></note>
      <direction><direction-type><octave-shift type="stop" size="8" number="1"/></direction-type></direction>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: { lilypond: true },
    preservePitchByFormat: { musescore: false, midi: false, vsqx: false },
    preserveDurationByFormat: { midi: false, vsqx: false },
    hasFeature: (doc) =>
      doc.querySelector('part > measure > direction > direction-type > octave-shift[type="up"]') !== null,
  },
  {
    id: "CFFP-SLUR",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type><notations><slur type="start"/></notations></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type><notations><slur type="stop"/></notations></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: { abc: true, lilypond: true, musescore: true },
    hasFeature: (doc) =>
      doc.querySelector('part > measure > note > notations > slur[type="start"]') !== null &&
      doc.querySelector('part > measure > note > notations > slur[type="stop"]') !== null,
  },
  {
    id: "CFFP-TIE",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type><tie type="start"/><notations><tied type="start"/></notations></note>
    </measure>
    <measure number="2">
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type><tie type="stop"/><notations><tied type="stop"/></notations></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: { abc: true, musescore: true },
    hasFeature: (doc) =>
      doc.querySelector('part > measure > note > tie[type="start"]') !== null &&
      doc.querySelector('part > measure > note > tie[type="stop"]') !== null,
  },
  {
    id: "CFFP-STACCATO",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type><notations><articulations><staccato/></articulations></notations></note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: { abc: true, mei: true, lilypond: true, musescore: true },
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > articulations > staccato") !== null,
  },
  {
    id: "CFFP-ACCENT",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type><notations><articulations><accent/></articulations></notations></note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: { mei: true, lilypond: true, musescore: true },
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > articulations > accent") !== null,
  },
  {
    id: "CFFP-GRACE",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><grace slash="yes"/><pitch><step>G</step><octave>4</octave></pitch><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>A</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type></note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: { abc: true, mei: true, lilypond: true, musescore: true },
    hasFeature: (doc) => doc.querySelector("part > measure > note > grace") !== null,
  },
  {
    id: "CFFP-TUPLET",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>640</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><notations><tuplet type="start"/></notations></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>640</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>640</duration><voice>1</voice><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification><notations><tuplet type="stop"/></notations></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: { abc: true, mei: true, lilypond: true, musescore: true },
    preserveDurationByFormat: { mei: false, midi: false, vsqx: false },
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > time-modification > actual-notes") !== null,
  },
  {
    id: "CFFP-TRIPLET-BRACKET",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>2</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>640</duration><voice>1</voice><type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="start" number="1" bracket="yes" placement="above"/></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>640</duration><voice>1</voice><type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
      </note>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>640</duration><voice>1</voice><type>eighth</type>
        <time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>
        <notations><tuplet type="stop" number="1" bracket="yes" placement="above"/></notations>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    preserveDurationByFormat: { mei: false, midi: false, vsqx: false },
    hasFeature: (doc) => {
      const start = doc.querySelector("part > measure > note > notations > tuplet[type=\"start\"]");
      const stop = doc.querySelector("part > measure > note > notations > tuplet[type=\"stop\"]");
      const startBracket = start?.getAttribute("bracket")?.toLowerCase() ?? "";
      const stopBracket = stop?.getAttribute("bracket")?.toLowerCase() ?? "";
      const startPlacement = start?.getAttribute("placement")?.toLowerCase() ?? "";
      const stopPlacement = stop?.getAttribute("placement")?.toLowerCase() ?? "";
      return startBracket === "yes" && stopBracket === "yes" && startPlacement === "above" && stopPlacement === "above";
    },
  },
  {
    id: "CFFP-PERCUSSION-UNPITCHED",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1">
      <part-name>Drums</part-name>
      <score-instrument id="P1-I35"><instrument-name>Bass Drum</instrument-name></score-instrument>
      <midi-instrument id="P1-I35"><midi-channel>10</midi-channel><midi-unpitched>36</midi-unpitched></midi-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>percussion</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><unpitched><display-step>F</display-step><display-octave>4</display-octave></unpitched><duration>960</duration><voice>1</voice><type>quarter</type><instrument id="P1-I35"/></note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    requirePitchedFact: false,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > unpitched > display-step") !== null &&
      doc.querySelector("part > measure > note > unpitched > display-octave") !== null,
  },
  {
    id: "CFFP-PERCUSSION-NOTEHEAD",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Drums</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>percussion</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><unpitched><display-step>E</display-step><display-octave>5</display-octave></unpitched><duration>960</duration><voice>1</voice><type>quarter</type><notehead>x</notehead></note>
      <note><unpitched><display-step>G</display-step><display-octave>5</display-octave></unpitched><duration>960</duration><voice>1</voice><type>quarter</type><notehead>triangle</notehead></note>
      <note><rest/><duration>960</duration><voice>1</voice><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const heads = Array.from(doc.querySelectorAll("part > measure > note > notehead")).map((n) =>
        n.textContent?.trim().toLowerCase() ?? ""
      );
      return heads.includes("x") && heads.includes("triangle");
    },
  },
  {
    id: "CFFP-PERCUSSION-INSTRUMENT-ID",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1">
      <part-name>Drums</part-name>
      <score-instrument id="P1-I38"><instrument-name>Snare Drum</instrument-name></score-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>percussion</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>960</duration><voice>1</voice><type>quarter</type><instrument id="P1-I38"/></note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > instrument[id]") !== null &&
      doc.querySelector("part-list score-part > score-instrument[id]") !== null,
  },
  {
    id: "CFFP-PERCUSSION-VOICE-LAYER",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Drums</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>percussion</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><unpitched><display-step>F</display-step><display-octave>4</display-octave></unpitched><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <backup><duration>1920</duration></backup>
      <note><unpitched><display-step>C</display-step><display-octave>5</display-octave></unpitched><duration>960</duration><voice>2</voice><type>quarter</type></note>
      <note><rest/><duration>960</duration><voice>2</voice><type>quarter</type></note>
      <forward><duration>1920</duration></forward>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: { musescore: true },
    hasFeature: (doc) => {
      const voices = Array.from(doc.querySelectorAll("part > measure > note > voice")).map((n) => n.textContent?.trim() ?? "");
      return voices.includes("1") && voices.includes("2");
    },
  },
  {
    id: "CFFP-PERCUSSION-STAFF-LINE",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Percussion Staff</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>percussion</sign><line>2</line></clef><staff-details number="1"><staff-lines>1</staff-lines></staff-details>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type><dot/></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > attributes > staff-details > staff-lines")?.textContent?.trim() === "1",
  },
  {
    id: "CFFP-TRANSPOSING-INSTRUMENT",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Clarinet in A</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef>
        <transpose><diatonic>-2</diatonic><chromatic>-3</chromatic></transpose>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    preservePitchByFormat: { abc: false, mei: false, lilypond: false, musescore: false, midi: false, vsqx: false },
    hasFeature: (doc) => {
      const d = doc.querySelector("part > measure > attributes > transpose > diatonic")?.textContent?.trim();
      const c = doc.querySelector("part > measure > attributes > transpose > chromatic")?.textContent?.trim();
      return d === "-2" && c === "-3";
    },
  },
  {
    id: "CFFP-TIMEWISE-BACKUP-FORWARD",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <forward><duration>960</duration></forward>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <backup><duration>2880</duration></backup>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1920</duration><voice>2</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > backup > duration") !== null &&
      doc.querySelector("part > measure > forward > duration") !== null,
  },
  {
    id: "CFFP-CROSS-STAFF-BEAM",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type><staff>1</staff><beam number="1">begin</beam></note>
      <note><pitch><step>B</step><octave>4</octave></pitch><duration>480</duration><voice>1</voice><type>eighth</type><staff>2</staff><beam number="1">end</beam></note>
      <note><rest/><duration>2880</duration><voice>1</voice><type>half</type><dot/></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const st1 = doc.querySelector("part > measure > note:nth-of-type(1) > staff")?.textContent?.trim();
      const st2 = doc.querySelector("part > measure > note:nth-of-type(2) > staff")?.textContent?.trim();
      const b1 = doc.querySelector("part > measure > note:nth-of-type(1) > beam")?.textContent?.trim().toLowerCase();
      const b2 = doc.querySelector("part > measure > note:nth-of-type(2) > beam")?.textContent?.trim().toLowerCase();
      return st1 === "1" && st2 === "2" && b1 === "begin" && b2 === "end";
    },
  },
  {
    id: "CFFP-CHORD-SYMBOL-ALTER",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <harmony>
        <root><root-step>C</root-step></root>
        <kind text="7(#11,b9)">dominant</kind>
        <degree><degree-value>11</degree-value><degree-alter>1</degree-alter><degree-type>add</degree-type></degree>
        <degree><degree-value>9</degree-value><degree-alter>-1</degree-alter><degree-type>add</degree-type></degree>
      </harmony>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const d11 = doc.querySelector("part > measure > harmony > degree:nth-of-type(1) > degree-value")?.textContent?.trim();
      const a11 = doc.querySelector("part > measure > harmony > degree:nth-of-type(1) > degree-alter")?.textContent?.trim();
      const d9 = doc.querySelector("part > measure > harmony > degree:nth-of-type(2) > degree-value")?.textContent?.trim();
      const a9 = doc.querySelector("part > measure > harmony > degree:nth-of-type(2) > degree-alter")?.textContent?.trim();
      return d11 === "11" && a11 === "1" && d9 === "9" && a9 === "-1";
    },
  },
  {
    id: "CFFP-NOTE-TIES-CROSS-MEASURE",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type>
        <tie type="start"/><notations><tied type="start"/></notations>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>C</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type>
        <tie type="stop"/><notations><tied type="stop"/></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: { musescore: true },
    hasFeature: (doc) =>
      doc.querySelector("part > measure:nth-of-type(1) > note > tie[type=\"start\"]") !== null &&
      doc.querySelector("part > measure:nth-of-type(2) > note > tie[type=\"stop\"]") !== null,
  },
  {
    id: "CFFP-MULTI-REST-COUNT",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef>
        <measure-style><multiple-rest>2</multiple-rest></measure-style>
      </attributes>
      <note><rest measure="yes"/><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
    <measure number="2">
      <note><rest measure="yes"/><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
    requirePitchedFact: false,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > attributes > measure-style > multiple-rest")?.textContent?.trim() === "2",
  },
  {
    id: "CFFP-REPEAT-JUMP-SOUND",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <direction><direction-type><words>D.S. al Coda</words></direction-type><sound segno="seg1" tocoda="coda1"/></direction>
      <direction><direction-type><words>Fine</words></direction-type><sound fine="yes"/></direction>
      <direction><direction-type><words>Coda</words></direction-type><sound coda="coda1"/></direction>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > direction > sound[segno]") !== null &&
      doc.querySelector("part > measure > direction > sound[tocoda]") !== null &&
      doc.querySelector("part > measure > direction > sound[fine]") !== null &&
      doc.querySelector("part > measure > direction > sound[coda]") !== null,
  },
  {
    id: "CFFP-CUE-GRACE-MIX",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><cue/><pitch><step>C</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type></note>
      <note><grace slash="yes"/><pitch><step>D</step><octave>4</octave></pitch><voice>1</voice><type>eighth</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2880</duration><voice>1</voice><type>half</type><dot/></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > cue") !== null &&
      doc.querySelector("part > measure > note > grace") !== null,
  },
  {
    id: "CFFP-ACCIDENTAL-COURTESY-MODE",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>P1</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type><accidental>sharp</accidental></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>960</duration><voice>1</voice><type>quarter</type><accidental cautionary="yes" parentheses="yes">natural</accidental></note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    preservePitchByFormat: { vsqx: false },
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > accidental[cautionary=\"yes\"]") !== null &&
      doc.querySelector("part > measure > note > accidental[parentheses=\"yes\"]") !== null,
  },
  {
    id: "CFFP-LYRICS-MULTI-VERSE",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type>
        <lyric number="1"><syllabic>single</syllabic><text>la</text></lyric>
        <lyric number="2"><syllabic>single</syllabic><text>lu</text></lyric>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > lyric[number=\"1\"] > text") !== null &&
      doc.querySelector("part > measure > note > lyric[number=\"2\"] > text") !== null,
  },
  {
    id: "CFFP-TEXT-ENCODING",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <direction><direction-type><words>テンポ：モデラート ♪=108</words></direction-type></direction>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type>
        <lyric number="1"><syllabic>single</syllabic><text>こんにちは</text></lyric>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const words = doc.querySelector("part > measure > direction > direction-type > words")?.textContent?.trim() ?? "";
      const lyric = doc.querySelector("part > measure > note > lyric > text")?.textContent?.trim() ?? "";
      return words.includes("テンポ") && lyric.includes("こんにちは");
    },
  },
  {
    id: "CFFP-HARMONIC-NATURAL-ARTIFICIAL",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Strings</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type>
        <notations><technical><harmonic><natural/></harmonic></technical></notations>
      </note>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type>
        <notations><technical><harmonic><artificial/></harmonic></technical></notations>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > technical > harmonic > natural") !== null &&
      doc.querySelector("part > measure > note > notations > technical > harmonic > artificial") !== null,
  },
  {
    id: "CFFP-OPEN-STRING",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Strings</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type>
        <notations><technical><open-string/></technical></notations>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > technical > open-string") !== null,
  },
  {
    id: "CFFP-STOPPED",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Brass</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>F</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type>
        <notations><technical><stopped/></technical></notations>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > technical > stopped") !== null,
  },
  {
    id: "CFFP-SNAP-PIZZICATO",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Strings</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type>
        <notations><technical><snap-pizzicato/></technical></notations>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > technical > snap-pizzicato") !== null,
  },
  {
    id: "CFFP-FINGERING",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Strings</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type>
        <notations><technical><fingering>1</fingering><fingering substitution="yes">4</fingering></technical></notations>
      </note>
      <note><rest/><duration>1920</duration><voice>1</voice><type>half</type></note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const values = Array.from(doc.querySelectorAll("part > measure > note > notations > technical > fingering")).map((n) =>
        n.textContent?.trim() ?? ""
      );
      return values.includes("1") && values.includes("4");
    },
  },
  {
    id: "CFFP-STRING",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Violin</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type>
        <notations><technical><string>1</string></technical></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type>
        <notations><technical><string>4</string></technical></notations>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const values = Array.from(doc.querySelectorAll("part > measure > note > notations > technical > string")).map((n) =>
        n.textContent?.trim() ?? ""
      );
      return values.includes("1") && values.includes("4");
    },
  },
  {
    id: "CFFP-DOUBLE-TRIPLE-TONGUE",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Woodwind</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type>
        <notations><articulations><double-tongue/></articulations></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>5</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type>
        <notations><articulations><triple-tongue/></articulations></notations>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > articulations > double-tongue") !== null &&
      doc.querySelector("part > measure > note > notations > articulations > triple-tongue") !== null,
  },
  {
    id: "CFFP-HEEL-TOE",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Organ</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>F</sign><line>4</line></clef></attributes>
      <note>
        <pitch><step>C</step><octave>3</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type>
        <notations><technical><heel/></technical></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>3</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type>
        <notations><technical><toe/></technical></notations>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelector("part > measure > note > notations > technical > heel") !== null &&
      doc.querySelector("part > measure > note > notations > technical > toe") !== null,
  },
  {
    id: "CFFP-PLUCK-TEXT",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Guitar</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>E</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type>
        <notations><technical><pluck>p</pluck><pluck>i</pluck><pluck>m</pluck><pluck>a</pluck></technical></notations>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const values = Array.from(doc.querySelectorAll("part > measure > note > notations > technical > pluck")).map((n) =>
        (n.textContent?.trim() ?? "").toLowerCase()
      );
      return values.includes("p") && values.includes("i") && values.includes("m") && values.includes("a");
    },
  },
  {
    id: "CFFP-BREATH-VARIANTS",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>G</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type>
        <notations><articulations><breath-mark>comma</breath-mark></articulations></notations>
      </note>
      <note>
        <pitch><step>A</step><octave>4</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type>
        <notations><articulations><breath-mark>tick</breath-mark></articulations></notations>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const marks = Array.from(doc.querySelectorAll("part > measure > note > notations > articulations > breath-mark")).map((n) =>
        (n.textContent?.trim() ?? "").toLowerCase()
      );
      return marks.includes("comma") && marks.includes("tick");
    },
  },
  {
    id: "CFFP-BREATH-PLACEMENT",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>B</step><octave>4</octave></pitch><duration>3840</duration><voice>1</voice><type>whole</type>
        <notations><articulations><breath-mark placement="above" default-x="10" default-y="8">comma</breath-mark></articulations></notations>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) => {
      const mark = doc.querySelector("part > measure > note > notations > articulations > breath-mark");
      if (!mark) return false;
      return (mark.getAttribute("placement") ?? "").toLowerCase() === "above" && mark.getAttribute("default-x") === "10";
    },
  },
  {
    id: "CFFP-CAESURA-STYLE",
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>960</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
      <note>
        <pitch><step>C</step><octave>5</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type>
        <notations><articulations><caesura/></articulations></notations>
      </note>
      <note>
        <pitch><step>D</step><octave>5</octave></pitch><duration>1920</duration><voice>1</voice><type>half</type>
        <notations><articulations><caesura/></articulations></notations>
      </note>
    </measure>
  </part>
</score-partwise>`,
    preserveByFormat: {},
    hasFeature: (doc) =>
      doc.querySelectorAll("part > measure > note > notations > articulations > caesura").length >= 2,
  },
];

describe("CFFP series: minimal MusicXML -> cross-format roundtrip", () => {
  beforeAll(() => {
    ensureMidiWriterLoaded();
    ensureVsqxBridgeLoaded();
  });

  for (const c of CFFP_CASES) {
    it(`${c.id}`, () => {
      const srcDoc = parseDoc(c.xml);
      const srcFact = c.requirePitchedFact === false ? null : firstPitchedFact(srcDoc);
      const formats = [
        { name: "abc" as const, preserveDuration: true, run: () => roundtripAbc(srcDoc) },
        { name: "mei" as const, preserveDuration: true, run: () => roundtripMei(srcDoc) },
        { name: "lilypond" as const, preserveDuration: true, run: () => roundtripLilyPond(srcDoc) },
        { name: "musescore" as const, preserveDuration: true, run: () => roundtripMuseScore(srcDoc) },
        { name: "midi" as const, preserveDuration: false, run: () => roundtripMidi(srcDoc) },
      ];
      if (isVsqxBridgeAvailable()) {
        formats.push({ name: "vsqx" as const, preserveDuration: false, run: () => roundtripVsqx(c.xml) });
      }

      for (const fmt of formats) {
        const outDoc = fmt.run();
        if (srcFact) {
          const outFact = firstPitchedFact(outDoc);
          const preservePitch = c.preservePitchByFormat?.[fmt.name] ?? true;
          if (preservePitch) {
            expect(outFact.step, `${c.id}:${fmt.name}: step`).toBe(srcFact.step);
            expect(outFact.octave, `${c.id}:${fmt.name}: octave`).toBe(srcFact.octave);
          }
          expect(outFact.startDiv, `${c.id}:${fmt.name}: startDiv`).toBe(0);
          const preserveDuration = c.preserveDurationByFormat?.[fmt.name] ?? fmt.preserveDuration;
          if (preserveDuration) {
            expect(outFact.quarterLen, `${c.id}:${fmt.name}: duration(quarter)`).toBeCloseTo(srcFact.quarterLen, 1);
          }
        }
        if (c.preserveByFormat[fmt.name]) {
          expect(c.hasFeature(outDoc), `${c.id}:${fmt.name}: feature must preserve`).toBe(true);
        }
      }
    });
  }
});
