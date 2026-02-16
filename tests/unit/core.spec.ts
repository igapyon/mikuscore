// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ScoreCore } from "../../core/ScoreCore";
import { loadFixture } from "./fixtureLoader";
import { expectXmlStructurallyEqual } from "./domAssertions";

const BASE_XML = loadFixture("base.musicxml");
const OVERFULL_XML = loadFixture("overfull.musicxml");
const UNDERFULL_XML = loadFixture("underfull.musicxml");
const XML_WITH_BACKUP = loadFixture("with_backup.musicxml");
const XML_WITH_MIXED_VOICES = loadFixture("mixed_voices.musicxml");
const XML_WITH_INTERLEAVED_VOICES = loadFixture("interleaved_voices.musicxml");
const XML_WITH_REST = loadFixture("with_rest.musicxml");
const XML_WITH_FOLLOWING_REST = loadFixture("with_following_rest.musicxml");
const XML_WITH_REST_TAIL = loadFixture("with_rest_tail.musicxml");
const XML_WITH_FULL_WITH_HALF = loadFixture("full_with_half.musicxml");
const XML_WITH_UNKNOWN = loadFixture("with_unknown.musicxml");
const XML_WITH_BEAM = loadFixture("with_beam.musicxml");
const XML_WITH_INHERITED_ATTRIBUTES = loadFixture("inherited_attributes.musicxml");
const XML_WITH_INHERITED_DIVISIONS = loadFixture("inherited_divisions_changed.musicxml");
const XML_WITH_INHERITED_TIME = loadFixture("inherited_time_changed.musicxml");
const XML_WITH_BACKUP_SAFE = loadFixture("with_backup_safe.musicxml");
const XML_WITH_INVALID_NOTE_DURATION = loadFixture("invalid_note_duration.musicxml");
const XML_WITH_INVALID_NOTE_VOICE = loadFixture("invalid_note_voice.musicxml");
const XML_WITH_INVALID_NOTE_PITCH = loadFixture("invalid_note_pitch.musicxml");
const XML_WITH_INVALID_REST_WITH_PITCH = loadFixture("invalid_rest_with_pitch.musicxml");
const XML_WITH_INVALID_CHORD_WITHOUT_PITCH = loadFixture("invalid_chord_without_pitch.musicxml");
const XML_WITH_CHORD_TIMING = loadFixture("with_chord_timing.musicxml");

describe("ScoreCore MVP", () => {
  const expectNoopStateUnchanged = (core: ScoreCore, beforeXml: string): void => {
    const after = core.save();
    expect(after.ok).toBe(true);
    expect(after.mode).toBe("original_noop");
    expectXmlStructurallyEqual(after.xml, beforeXml);
  };

  it("RT-0: no-op save returns original text", () => {
    const core = new ScoreCore();
    core.load(BASE_XML);

    const saved = core.save();
    expect(saved.ok).toBe(true);
    expect(saved.mode).toBe("original_noop");
    expect(saved.xml).toBe(BASE_XML);
  });

  it("RT-1: pitch change returns serialized output", () => {
    const core = new ScoreCore();
    core.load(BASE_XML);
    const [first] = core.listNoteNodeIds();

    const result = core.dispatch({
      type: "change_to_pitch",
      targetNodeId: first,
      voice: "1",
      pitch: { step: "G", octave: 5 },
    });

    expect(result.ok).toBe(true);
    expect(core.isDirty()).toBe(true);
    expect(result.changedNodeIds).toEqual([first]);
    expect(result.affectedMeasureNumbers).toEqual(["1"]);

    const saved = core.save();
    expect(saved.ok).toBe(true);
    expect(saved.mode).toBe("serialized_dirty");
    expect(saved.xml).toContain("<step>G</step>");
    expect(saved.xml).toContain("<octave>5</octave>");
  });

  it("RT-1a: pitch change converts rest note into pitched note", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_REST);
    const [first] = core.listNoteNodeIds();

    const result = core.dispatch({
      type: "change_to_pitch",
      targetNodeId: first,
      voice: "1",
      pitch: { step: "C", octave: 4 },
    });

    expect(result.ok).toBe(true);
    const saved = core.save();
    expect(saved.ok).toBe(true);
    const doc = new DOMParser().parseFromString(saved.xml, "application/xml");
    const firstNote = doc.querySelector("measure > note");
    expect(firstNote?.querySelector(":scope > rest")).toBeNull();
    expect(firstNote?.querySelector(":scope > pitch > step")?.textContent?.trim()).toBe("C");
    expect(firstNote?.querySelector(":scope > pitch > octave")?.textContent?.trim()).toBe("4");
  });

  it("RT-1a2: pitch-down auto-assigns staff 2 in grand-staff context", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>
    </measure>
  </part>
</score-partwise>`;
    const core = new ScoreCore();
    core.load(xml);
    const [first] = core.listNoteNodeIds();

    const result = core.dispatch({
      type: "change_to_pitch",
      targetNodeId: first,
      voice: "1",
      pitch: { step: "A", octave: 2 },
    });
    expect(result.ok).toBe(true);

    const saved = core.save();
    expect(saved.ok).toBe(true);
    const doc = new DOMParser().parseFromString(saved.xml, "application/xml");
    const note = doc.querySelector("part > measure > note");
    expect(note?.querySelector(":scope > staff")?.textContent?.trim()).toBe("2");
  });

  it("RT-1a3: pitch-up auto-assigns staff 1 in grand-staff context", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration><voice>1</voice><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;
    const core = new ScoreCore();
    core.load(xml);
    const [first] = core.listNoteNodeIds();

    const result = core.dispatch({
      type: "change_to_pitch",
      targetNodeId: first,
      voice: "1",
      pitch: { step: "C", octave: 5 },
    });
    expect(result.ok).toBe(true);

    const saved = core.save();
    expect(saved.ok).toBe(true);
    const doc = new DOMParser().parseFromString(saved.xml, "application/xml");
    const note = doc.querySelector("part > measure > note");
    expect(note?.querySelector(":scope > staff")?.textContent?.trim()).toBe("1");
  });

  it("RT-1b: duration change updates note type for simple values", () => {
    const core = new ScoreCore();
    core.load(UNDERFULL_XML); // divisions=1, occupied=3/4
    const [first] = core.listNoteNodeIds();

    const result = core.dispatch({
      type: "change_duration",
      targetNodeId: first,
      voice: "1",
      duration: 2, // half note when divisions=1
    });

    expect(result.ok).toBe(true);
    const saved = core.save();
    expect(saved.ok).toBe(true);
    const doc = new DOMParser().parseFromString(saved.xml, "application/xml");
    const firstNote = doc.querySelector("measure > note");
    expect(firstNote?.querySelector("duration")?.textContent?.trim()).toBe("2");
    expect(firstNote?.querySelector("type")?.textContent?.trim()).toBe("half");
  });

  it("RT-1c: duration change updates dotted/triplet notation metadata", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_REST_TAIL); // divisions=1
    const ids = core.listNoteNodeIds();
    const first = ids[0];

    const result = core.dispatch({
      type: "change_duration",
      targetNodeId: first,
      voice: "1",
      duration: 3, // dotted half when divisions=1
    });

    expect(result.ok).toBe(true);
    const saved = core.save();
    expect(saved.ok).toBe(true);
    const doc = new DOMParser().parseFromString(saved.xml, "application/xml");
    const note = doc.querySelector("measure > note");
    expect(note?.querySelector("type")?.textContent?.trim()).toBe("half");
    expect(note?.querySelectorAll("dot").length).toBe(1);
    expect(note?.querySelector("time-modification")).toBeNull();
  });

  it("RT-1d: triplet duration is rejected when measure has no tuplet context", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>3</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>3</duration><voice>1</voice><type>quarter</type></note>
      <note><rest/><duration>9</duration><voice>1</voice><type>half</type><dot/></note>
    </measure>
  </part>
</score-partwise>`;
    const core = new ScoreCore();
    core.load(xml);
    const first = core.listNoteNodeIds()[0];

    const result = core.dispatch({
      type: "change_duration",
      targetNodeId: first,
      voice: "1",
      duration: 2, // quarter triplet when divisions=3
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("MVP_INVALID_COMMAND_PAYLOAD");
  });

  it("RT-1e: split_note divides selected note into two equal durations", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_FULL_WITH_HALF);
    const first = core.listNoteNodeIds()[0];

    const result = core.dispatch({
      type: "split_note",
      targetNodeId: first,
      voice: "1",
    });
    expect(result.ok).toBe(true);

    const saved = core.save();
    expect(saved.ok).toBe(true);
    const doc = new DOMParser().parseFromString(saved.xml, "application/xml");
    const notes = Array.from(doc.querySelectorAll("measure > note"));
    expect(notes).toHaveLength(4);
    expect(notes[0]?.querySelector(":scope > pitch > step")?.textContent?.trim()).toBe("C");
    expect(notes[0]?.querySelector(":scope > duration")?.textContent?.trim()).toBe("1");
    expect(notes[0]?.querySelector(":scope > type")?.textContent?.trim()).toBe("quarter");
    expect(notes[1]?.querySelector(":scope > pitch > step")?.textContent?.trim()).toBe("C");
    expect(notes[1]?.querySelector(":scope > duration")?.textContent?.trim()).toBe("1");
    expect(notes[1]?.querySelector(":scope > type")?.textContent?.trim()).toBe("quarter");
  });

  it("RT-1f: split_note rejects odd duration values", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_FULL_WITH_HALF);
    const second = core.listNoteNodeIds()[1]; // duration=1

    const result = core.dispatch({
      type: "split_note",
      targetNodeId: second,
      voice: "1",
    });
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("MVP_INVALID_COMMAND_PAYLOAD");
  });

  it("DR-1: ui-only command does not set dirty", () => {
    const core = new ScoreCore();
    core.load(BASE_XML);

    const result = core.dispatch({
      type: "ui_noop",
      reason: "cursor_move",
    });

    expect(result.ok).toBe(true);
    expect(result.dirtyChanged).toBe(false);
    expect(result.changedNodeIds).toEqual([]);
    expect(result.affectedMeasureNumbers).toEqual([]);
    expect(core.isDirty()).toBe(false);

    const saved = core.save();
    expect(saved.ok).toBe(true);
    expect(saved.mode).toBe("original_noop");
    expect(saved.xml).toBe(BASE_XML);
  });

  it("TI-1: overfull is rejected", () => {
    const core = new ScoreCore();
    core.load(BASE_XML);
    const [first] = core.listNoteNodeIds();

    const result = core.dispatch({
      type: "change_duration",
      targetNodeId: first,
      voice: "1",
      duration: 2,
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("MEASURE_OVERFULL");
    expect(core.isDirty()).toBe(false);
  });

  it("TI-2: delete_note replaces target with same-duration rest", () => {
    const core = new ScoreCore();
    core.load(BASE_XML);
    const [first] = core.listNoteNodeIds();

    const result = core.dispatch({
      type: "delete_note",
      targetNodeId: first,
      voice: "1",
    });

    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(core.isDirty()).toBe(true);

    const saved = core.save();
    expect(saved.ok).toBe(true);
    expect(saved.mode).toBe("serialized_dirty");
    const doc = new DOMParser().parseFromString(saved.xml, "application/xml");
    const firstNote = doc.querySelector("measure > note");
    expect(firstNote?.querySelector("rest")).not.toBeNull();
    expect(firstNote?.querySelector("duration")?.textContent?.trim()).toBe("1");
    expect(firstNote?.querySelector("voice")?.textContent?.trim()).toBe("1");
    expect(firstNote?.querySelector("pitch")).toBeNull();
  });

  it("TI-3: overfull validation uses inherited attributes from previous measure", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_INHERITED_ATTRIBUTES);
    const ids = core.listNoteNodeIds();
    const firstNoteInMeasure2 = ids[4];

    const result = core.dispatch({
      type: "change_duration",
      targetNodeId: firstNoteInMeasure2,
      voice: "1",
      duration: 2,
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("MEASURE_OVERFULL");
    expect(core.isDirty()).toBe(false);
  });

  it("TI-4: measure capacity uses updated divisions with inherited time", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_INHERITED_DIVISIONS);
    const ids = core.listNoteNodeIds();
    const firstNoteInMeasure2 = ids[4];

    const result = core.dispatch({
      type: "change_duration",
      targetNodeId: firstNoteInMeasure2,
      voice: "1",
      duration: 3, // 8 - 2 + 3 = 9, overfull for 4/4 with divisions=2 (capacity 8)
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("MEASURE_OVERFULL");
    expect(core.isDirty()).toBe(false);
  });

  it("TI-5: measure capacity uses updated time with inherited divisions", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_INHERITED_TIME);
    const ids = core.listNoteNodeIds();
    const firstNoteInMeasure2 = ids[4];

    const result = core.dispatch({
      type: "change_duration",
      targetNodeId: firstNoteInMeasure2,
      voice: "1",
      duration: 2, // 3 - 1 + 2 = 4, overfull for 3/4 with divisions=1 (capacity 3)
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("MEASURE_OVERFULL");
    expect(core.isDirty()).toBe(false);
  });

  it("TI-6: chord notes do not advance occupied time", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_CHORD_TIMING);

    const saved = core.save();
    expect(saved.ok).toBe(true);
    expect(saved.mode).toBe("original_noop");
    expect(saved.diagnostics).toEqual([]);
  });

  it("TI-8: deleting chord head promotes next chord tone instead of inserting rest", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_CHORD_TIMING);
    const ids = core.listNoteNodeIds();
    const first = ids[0];

    const result = core.dispatch({
      type: "delete_note",
      targetNodeId: first,
      voice: "1",
    });

    expect(result.ok).toBe(true);
    const saved = core.save();
    expect(saved.ok).toBe(true);

    const doc = new DOMParser().parseFromString(saved.xml, "application/xml");
    const notes = Array.from(doc.querySelectorAll("measure > note"));
    expect(notes).toHaveLength(3);

    // First note should be the former chord tone (E4) promoted to chord head.
    const firstAfter = notes[0];
    expect(firstAfter.querySelector(":scope > chord")).toBeNull();
    expect(firstAfter.querySelector(":scope > rest")).toBeNull();
    expect(firstAfter.querySelector(":scope > pitch > step")?.textContent?.trim()).toBe("E");
    expect(firstAfter.querySelector(":scope > pitch > octave")?.textContent?.trim()).toBe("4");
    expect(firstAfter.querySelector(":scope > duration")?.textContent?.trim()).toBe("8");
  });

  it("TI-9: extending duration consumes following rest in same voice", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_FOLLOWING_REST);
    const ids = core.listNoteNodeIds();
    const second = ids[1];

    const result = core.dispatch({
      type: "change_duration",
      targetNodeId: second,
      voice: "1",
      duration: 2,
    });

    expect(result.ok).toBe(true);
    const saved = core.save();
    expect(saved.ok).toBe(true);
    const doc = new DOMParser().parseFromString(saved.xml, "application/xml");
    const notes = Array.from(doc.querySelectorAll("measure > note"));

    // C(1), D(2), E(1): the following rest should be consumed away.
    expect(notes).toHaveLength(3);
    expect(notes[0]?.querySelector(":scope > pitch > step")?.textContent?.trim()).toBe("C");
    expect(notes[1]?.querySelector(":scope > pitch > step")?.textContent?.trim()).toBe("D");
    expect(notes[1]?.querySelector(":scope > duration")?.textContent?.trim()).toBe("2");
    expect(notes[2]?.querySelector(":scope > pitch > step")?.textContent?.trim()).toBe("E");
  });

  it("TI-10: shortening duration auto-fills trailing rest to avoid underfull", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_FULL_WITH_HALF);
    const ids = core.listNoteNodeIds();
    const first = ids[0];

    const result = core.dispatch({
      type: "change_duration",
      targetNodeId: first,
      voice: "1",
      duration: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual([]);

    const saved = core.save();
    expect(saved.ok).toBe(true);
    const doc = new DOMParser().parseFromString(saved.xml, "application/xml");
    const notes = Array.from(doc.querySelectorAll("measure > note"));

    // C(1), auto rest(1), D(1), E(1)
    expect(notes).toHaveLength(4);
    const inserted = notes[1];
    expect(inserted?.querySelector(":scope > rest")).not.toBeNull();
    expect(inserted?.querySelector(":scope > duration")?.textContent?.trim()).toBe("1");
    expect(inserted?.querySelector(":scope > voice")?.textContent?.trim()).toBe("1");
    expect(inserted?.querySelector(":scope > type")?.textContent?.trim()).toBe("quarter");
    expect(inserted?.querySelector(":scope > dot")).toBeNull();
    expect(inserted?.querySelector(":scope > time-modification")).toBeNull();
    expect(notes[2]?.querySelector(":scope > pitch > step")?.textContent?.trim()).toBe("D");
    expect(notes[3]?.querySelector(":scope > pitch > step")?.textContent?.trim()).toBe("E");
  });

  it("IN-2: insert that makes measure overfull is rejected", () => {
    const core = new ScoreCore();
    core.load(BASE_XML); // already full
    const [first] = core.listNoteNodeIds();
    const before = core.save();
    expect(before.ok).toBe(true);
    expect(before.mode).toBe("original_noop");

    const result = core.dispatch({
      type: "insert_note_after",
      anchorNodeId: first,
      voice: "1",
      note: {
        duration: 1,
        pitch: { step: "A", octave: 4 },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("MEASURE_OVERFULL");
    expect(core.isDirty()).toBe(false);

    const after = core.save();
    expect(after.ok).toBe(true);
    expect(after.mode).toBe("original_noop");
    expect(after.xml).toBe(before.xml);
  });

  it("IN-1: insert_note_after succeeds on matching voice anchor", () => {
    const core = new ScoreCore();
    core.load(UNDERFULL_XML);
    const [first] = core.listNoteNodeIds();

    const result = core.dispatch({
      type: "insert_note_after",
      anchorNodeId: first,
      voice: "1",
      note: {
        duration: 1,
        pitch: { step: "A", octave: 4 },
      },
    });

    expect(result.ok).toBe(true);
    expect(core.isDirty()).toBe(true);
    expect(result.changedNodeIds.length).toBe(2);
    expect(result.affectedMeasureNumbers).toEqual(["1"]);

    const saved = core.save();
    expect(saved.ok).toBe(true);
    expect(saved.xml).toContain("<step>A</step>");
  });

  it("ID-1: existing node IDs stay stable after insert", () => {
    const core = new ScoreCore();
    core.load(UNDERFULL_XML);
    const beforeIds = core.listNoteNodeIds();
    const first = beforeIds[0];

    const result = core.dispatch({
      type: "insert_note_after",
      anchorNodeId: first,
      voice: "1",
      note: { duration: 1, pitch: { step: "A", octave: 4 } },
    });
    expect(result.ok).toBe(true);

    const afterIds = core.listNoteNodeIds();
    for (const id of beforeIds) {
      expect(afterIds).toContain(id);
    }
    expect(afterIds.length).toBe(beforeIds.length + 1);
  });

  it("MP-1: insert keeps non-target notes stable except local insertion", () => {
    const core = new ScoreCore();
    core.load(UNDERFULL_XML);
    const [first] = core.listNoteNodeIds();
    const beforeDoc = new DOMParser().parseFromString(UNDERFULL_XML, "application/xml");
    const beforeAttributes = beforeDoc.querySelector("measure > attributes")?.outerHTML;

    const result = core.dispatch({
      type: "insert_note_after",
      anchorNodeId: first,
      voice: "1",
      note: { duration: 1, pitch: { step: "A", octave: 4 } },
    });
    expect(result.ok).toBe(true);

    const saved = core.save();
    expect(saved.ok).toBe(true);
    const afterDoc = new DOMParser().parseFromString(saved.xml, "application/xml");
    const afterAttributes = afterDoc.querySelector("measure > attributes")?.outerHTML;
    expect(afterAttributes).toBe(beforeAttributes);

    const noteSig = (n: Element): string =>
      `${n.querySelector("voice")?.textContent?.trim()}:${n.querySelector("step")?.textContent?.trim()}:${n.querySelector("octave")?.textContent?.trim()}:${n.querySelector("duration")?.textContent?.trim()}`;
    const afterNotes = Array.from(afterDoc.querySelectorAll("measure > note")).map(noteSig);
    expect(afterNotes).toEqual(["1:C:4:1", "1:A:4:1", "1:D:4:1", "1:E:4:1"]);
  });

  it("BF-1: change command with target voice mismatch is rejected", () => {
    const core = new ScoreCore();
    core.load(BASE_XML);
    const [first] = core.listNoteNodeIds();
    const before = core.save();
    expect(before.ok).toBe(true);

    const result = core.dispatch({
      type: "change_to_pitch",
      targetNodeId: first,
      voice: "2",
      pitch: { step: "A", octave: 4 },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("MVP_UNSUPPORTED_NON_EDITABLE_VOICE");
    expect(result.changedNodeIds).toEqual([]);
    expect(core.isDirty()).toBe(false);
    expectNoopStateUnchanged(core, before.xml);
  });

  it("BF-1a: non-primary voice is editable when command voice matches target", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_MIXED_VOICES);
    const ids = core.listNoteNodeIds();
    const second = ids[1]; // voice=2
    const before = core.save();
    expect(before.ok).toBe(true);

    const result = core.dispatch({
      type: "change_to_pitch",
      targetNodeId: second,
      voice: "2",
      pitch: { step: "A", octave: 3 },
    });

    expect(result.ok).toBe(true);
    expect(core.isDirty()).toBe(true);
    expect(result.changedNodeIds).toEqual([second]);
    const saved = core.save();
    expect(saved.ok).toBe(true);

    const beforeDoc = new DOMParser().parseFromString(before.xml, "application/xml");
    const afterDoc = new DOMParser().parseFromString(saved.xml, "application/xml");

    const noteSig = (n: Element): string => {
      const voice = n.querySelector(":scope > voice")?.textContent?.trim() ?? "";
      const duration = n.querySelector(":scope > duration")?.textContent?.trim() ?? "";
      if (n.querySelector(":scope > rest")) return `${voice}:rest:${duration}`;
      const step = n.querySelector(":scope > pitch > step")?.textContent?.trim() ?? "";
      const octave = n.querySelector(":scope > pitch > octave")?.textContent?.trim() ?? "";
      return `${voice}:${step}${octave}:${duration}`;
    };
    const beforeNotes = Array.from(beforeDoc.querySelectorAll("measure > note")).map(noteSig);
    const afterNotes = Array.from(afterDoc.querySelectorAll("measure > note")).map(noteSig);

    expect(beforeNotes).toEqual(["1:C4:1", "2:G3:1", "1:D4:1", "1:E4:1"]);
    expect(afterNotes).toEqual(["1:C4:1", "2:A3:1", "1:D4:1", "1:E4:1"]);
  });

  it("BF-1b: changing duration in voice 2 does not mutate voice 1 notes", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>
      <note><pitch><step>G</step><octave>3</octave></pitch><duration>1</duration><voice>2</voice></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>
    </measure>
  </part>
</score-partwise>`;
    const core = new ScoreCore();
    core.load(xml);
    const ids = core.listNoteNodeIds();
    const second = ids[1]; // voice=2

    const result = core.dispatch({
      type: "change_duration",
      targetNodeId: second,
      voice: "2",
      duration: 3,
    });
    expect(result.ok).toBe(true);

    const saved = core.save();
    expect(saved.ok).toBe(true);
    const doc = new DOMParser().parseFromString(saved.xml, "application/xml");
    const notes = Array.from(doc.querySelectorAll("measure > note"));
    const voice1 = notes
      .filter((n) => (n.querySelector(":scope > voice")?.textContent?.trim() ?? "") === "1")
      .map((n) => {
        const step = n.querySelector(":scope > pitch > step")?.textContent?.trim() ?? "";
        const octave = n.querySelector(":scope > pitch > octave")?.textContent?.trim() ?? "";
        const duration = n.querySelector(":scope > duration")?.textContent?.trim() ?? "";
        return `${step}${octave}:${duration}`;
      });
    const voice2 = notes
      .filter((n) => (n.querySelector(":scope > voice")?.textContent?.trim() ?? "") === "2")
      .map((n) => n.querySelector(":scope > duration")?.textContent?.trim() ?? "");

    expect(voice1).toEqual(["C4:2", "D4:2"]);
    // Engine may auto-fill underfull gap in the edited voice lane.
    expect(voice2).toEqual(["3", "1"]);
  });

  it("BF-3: insert anchor voice mismatch is rejected", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_MIXED_VOICES);
    const ids = core.listNoteNodeIds();
    const second = ids[1]; // voice=2 note
    const before = core.save();
    expect(before.ok).toBe(true);

    const result = core.dispatch({
      type: "insert_note_after",
      anchorNodeId: second,
      voice: "1",
      note: {
        duration: 1,
        pitch: { step: "A", octave: 4 },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("MVP_UNSUPPORTED_NON_EDITABLE_VOICE");
    expect(core.isDirty()).toBe(false);
    expectNoopStateUnchanged(core, before.xml);
  });

  it("BF-4: insert crossing interleaved voice lane is rejected", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_INTERLEAVED_VOICES);
    const [first] = core.listNoteNodeIds(); // voice=1, next note is voice=2
    const before = core.save();
    expect(before.ok).toBe(true);

    const result = core.dispatch({
      type: "insert_note_after",
      anchorNodeId: first,
      voice: "1",
      note: {
        duration: 1,
        pitch: { step: "A", octave: 4 },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("MVP_UNSUPPORTED_NON_EDITABLE_VOICE");
    expect(core.isDirty()).toBe(false);
    expectNoopStateUnchanged(core, before.xml);
  });

  it("BF-2: structural edit across backup/forward boundary is rejected", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_BACKUP);
    const [first] = core.listNoteNodeIds();
    const before = core.save();
    expect(before.ok).toBe(true);

    const result = core.dispatch({
      type: "insert_note_after",
      anchorNodeId: first,
      voice: "1",
      note: {
        duration: 1,
        pitch: { step: "A", octave: 4 },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("MVP_UNSUPPORTED_NON_EDITABLE_VOICE");
    expect(core.isDirty()).toBe(false);
    expectNoopStateUnchanged(core, before.xml);
  });

  it("BF-5: structural edit away from backup/forward boundary is allowed", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_BACKUP_SAFE);
    const ids = core.listNoteNodeIds();
    const last = ids[3];

    const result = core.dispatch({
      type: "insert_note_after",
      anchorNodeId: last,
      voice: "1",
      note: {
        duration: 1,
        pitch: { step: "F", octave: 4 },
      },
    });

    expect(result.ok).toBe(true);
    expect(core.isDirty()).toBe(true);
  });

  it("BF-6: delete away from backup/forward boundary is allowed", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_BACKUP_SAFE);
    const ids = core.listNoteNodeIds();
    const last = ids[3];

    const result = core.dispatch({
      type: "delete_note",
      targetNodeId: last,
      voice: "1",
    });

    expect(result.ok).toBe(true);
    expect(core.isDirty()).toBe(true);
    expect(result.changedNodeIds).toEqual([last]);
    expect(result.affectedMeasureNumbers).toEqual(["1"]);
  });

  it("BF-7: split immediately before backup boundary is allowed", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_BACKUP);
    const [first] = core.listNoteNodeIds();

    const result = core.dispatch({
      type: "split_note",
      targetNodeId: first,
      voice: "1",
    });

    expect(result.ok).toBe(true);
    const saved = core.save();
    expect(saved.ok).toBe(true);
  });

  it("BF-8: split immediately before forward boundary is rejected", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>
      <forward><duration>1</duration></forward>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
      <note><rest/><duration>1</duration><voice>1</voice></note>
    </measure>
  </part>
</score-partwise>`;
    const core = new ScoreCore();
    core.load(xml);
    const [first] = core.listNoteNodeIds();

    const result = core.dispatch({
      type: "split_note",
      targetNodeId: first,
      voice: "1",
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("MVP_UNSUPPORTED_NON_EDITABLE_VOICE");
  });

  it("ID-2: node IDs stay stable after delete-to-rest replacement", () => {
    const core = new ScoreCore();
    core.load(BASE_XML);
    const beforeIds = core.listNoteNodeIds();
    const second = beforeIds[1];

    const result = core.dispatch({
      type: "delete_note",
      targetNodeId: second,
      voice: "1",
    });
    expect(result.ok).toBe(true);

    const afterIds = core.listNoteNodeIds();
    for (const id of beforeIds) {
      expect(afterIds).toContain(id);
    }
    expect(afterIds).toHaveLength(beforeIds.length);
  });

  it("NK-1: unsupported note kind is rejected", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_REST);
    const [first] = core.listNoteNodeIds();
    const before = core.save();
    expect(before.ok).toBe(true);

    const result = core.dispatch({
      type: "delete_note",
      targetNodeId: first,
      voice: "1",
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("MVP_UNSUPPORTED_NOTE_KIND");
    expect(core.isDirty()).toBe(false);
    expectNoopStateUnchanged(core, before.xml);
  });

  it("PT-1: unknown elements are preserved", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_UNKNOWN);
    const [first] = core.listNoteNodeIds();
    core.dispatch({
      type: "change_to_pitch",
      targetNodeId: first,
      voice: "1",
      pitch: { step: "B", octave: 4 },
    });

    const saved = core.save();
    expect(saved.ok).toBe(true);
    expect(saved.xml).toContain("<unknown-tag foo=\"bar\">x</unknown-tag>");
  });

  it("BM-1: existing beam remains unchanged", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_BEAM);
    const ids = core.listNoteNodeIds();
    const third = ids[2];

    const result = core.dispatch({
      type: "change_to_pitch",
      targetNodeId: third,
      voice: "1",
      pitch: { step: "B", octave: 5 },
    });
    expect(result.ok).toBe(true);

    const saved = core.save();
    expect(saved.ok).toBe(true);
    expect(saved.xml).toContain("<beam number=\"1\">begin</beam>");
    expect(saved.xml).toContain("<beam number=\"1\">end</beam>");
  });

  it("SV-2: save is rejected when current state is overfull", () => {
    const core = new ScoreCore();
    core.load(OVERFULL_XML);

    const saved = core.save();
    expect(saved.ok).toBe(false);
    expect(saved.diagnostics[0]?.code).toBe("MEASURE_OVERFULL");
  });

  it("SV-3: save is rejected when a note has invalid duration", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_INVALID_NOTE_DURATION);

    const saved = core.save();
    expect(saved.ok).toBe(false);
    expect(saved.diagnostics[0]?.code).toBe("MVP_INVALID_NOTE_DURATION");
  });

  it("SV-3a: save allows grace note without duration", () => {
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
        <grace/>
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
      <note><rest/><duration>1440</duration><voice>1</voice><type>half</type><dot/></note>
    </measure>
  </part>
</score-partwise>`;
    const core = new ScoreCore();
    core.load(xml);

    const saved = core.save();
    expect(saved.ok).toBe(true);
  });

  it("SV-4: save is rejected when a note has invalid voice", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_INVALID_NOTE_VOICE);

    const saved = core.save();
    expect(saved.ok).toBe(false);
    expect(saved.diagnostics[0]?.code).toBe("MVP_INVALID_NOTE_VOICE");
  });

  it("SV-8: save allows same-voice notes split by backup (grand-staff style timeline)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
      <note><rest measure="yes"/><duration>3840</duration><voice>1</voice><staff>1</staff></note>
      <backup><duration>3840</duration></backup>
      <note><rest measure="yes"/><duration>3840</duration><voice>1</voice><staff>2</staff></note>
    </measure>
  </part>
</score-partwise>`;
    const core = new ScoreCore();
    core.load(xml);

    const saved = core.save();
    expect(saved.ok).toBe(true);
  });

  it("SV-5: save is rejected when a note has invalid pitch", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_INVALID_NOTE_PITCH);

    const saved = core.save();
    expect(saved.ok).toBe(false);
    expect(saved.diagnostics[0]?.code).toBe("MVP_INVALID_NOTE_PITCH");
  });

  it("SV-6: save is rejected when rest note contains pitch", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_INVALID_REST_WITH_PITCH);

    const saved = core.save();
    expect(saved.ok).toBe(false);
    expect(saved.diagnostics[0]?.code).toBe("MVP_INVALID_NOTE_PITCH");
  });

  it("SV-7: save is rejected when chord note lacks pitch", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_INVALID_CHORD_WITHOUT_PITCH);

    const saved = core.save();
    expect(saved.ok).toBe(false);
    expect(saved.diagnostics[0]?.code).toBe("MVP_INVALID_NOTE_PITCH");
  });

  it("PL-1: invalid duration payload is rejected before mutation", () => {
    const core = new ScoreCore();
    core.load(BASE_XML);
    const [first] = core.listNoteNodeIds();
    const before = core.save();

    const result = core.dispatch({
      type: "change_duration",
      targetNodeId: first,
      voice: "1",
      duration: 0,
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("MVP_INVALID_COMMAND_PAYLOAD");
    expect(result.changedNodeIds).toEqual([]);
    expectNoopStateUnchanged(core, before.xml);
  });

  it("PL-2: invalid pitch payload is rejected before mutation", () => {
    const core = new ScoreCore();
    core.load(BASE_XML);
    const [first] = core.listNoteNodeIds();
    const before = core.save();

    const result = core.dispatch({
      type: "change_to_pitch",
      targetNodeId: first,
      voice: "1",
      pitch: { step: "H" as unknown as "A", octave: 4 },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("MVP_INVALID_COMMAND_PAYLOAD");
    expect(result.changedNodeIds).toEqual([]);
    expectNoopStateUnchanged(core, before.xml);
  });

  it("AT-1: failed command is atomic and does not mutate existing successful edits", () => {
    const core = new ScoreCore();
    core.load(BASE_XML);
    const ids = core.listNoteNodeIds();
    const first = ids[0];
    const second = ids[1];

    const ok1 = core.dispatch({
      type: "change_to_pitch",
      targetNodeId: first,
      voice: "1",
      pitch: { step: "G", octave: 5 },
    });
    expect(ok1.ok).toBe(true);
    const savedAfterSuccess = core.save();
    expect(savedAfterSuccess.ok).toBe(true);

    const fail = core.dispatch({
      type: "change_duration",
      targetNodeId: second,
      voice: "1",
      duration: 2,
    });
    expect(fail.ok).toBe(false);
    expect(fail.diagnostics[0]?.code).toBe("MEASURE_OVERFULL");

    const saved = core.save();
    expect(saved.ok).toBe(true);
    // Atomicity: failed command must not change serialized state at all.
    expect(saved.xml).toBe(savedAfterSuccess.xml);
    // Successful pitch change remains.
    expect(saved.xml).toContain("<step>G</step>");
    expect(saved.xml).toContain("<octave>5</octave>");
    // Failed duration change must not be applied.
    const doc = new DOMParser().parseFromString(saved.xml, "application/xml");
    const notes = Array.from(doc.querySelectorAll("measure note"));
    const secondDuration = notes[1]?.querySelector("duration")?.textContent?.trim();
    expect(secondDuration).toBe("1");
  });

  it("MP-2: delete replaces only target note with rest and keeps others stable", () => {
    const core = new ScoreCore();
    core.load(BASE_XML);
    const ids = core.listNoteNodeIds();
    const second = ids[1];
    const beforeDoc = new DOMParser().parseFromString(BASE_XML, "application/xml");
    const beforeAttributes = beforeDoc.querySelector("measure > attributes")?.outerHTML;

    const result = core.dispatch({
      type: "delete_note",
      targetNodeId: second,
      voice: "1",
    });
    expect(result.ok).toBe(true);

    const saved = core.save();
    expect(saved.ok).toBe(true);
    const afterDoc = new DOMParser().parseFromString(saved.xml, "application/xml");
    const afterAttributes = afterDoc.querySelector("measure > attributes")?.outerHTML;
    expect(afterAttributes).toBe(beforeAttributes);

    const notes = Array.from(afterDoc.querySelectorAll("measure > note"));
    expect(notes).toHaveLength(4);

    const noteSig = (n: Element): string => {
      if (n.querySelector("rest")) {
        return `rest:${n.querySelector("voice")?.textContent?.trim()}:${n.querySelector("duration")?.textContent?.trim()}`;
      }
      return `${n.querySelector("voice")?.textContent?.trim()}:${n.querySelector("step")?.textContent?.trim()}:${n.querySelector("octave")?.textContent?.trim()}:${n.querySelector("duration")?.textContent?.trim()}`;
    };
    const afterNotes = notes.map(noteSig);
    expect(afterNotes).toEqual(["1:C:4:1", "rest:1:1", "1:E:4:1", "1:F:4:1"]);
  });

  it("MP-3: delete replaces target with rest at same position and same duration", () => {
    const core = new ScoreCore();
    core.load(UNDERFULL_XML);
    const ids = core.listNoteNodeIds();
    const second = ids[1];

    const before = core.save();
    expect(before.ok).toBe(true);
    const beforeDoc = new DOMParser().parseFromString(before.xml, "application/xml");
    const beforeNotes = Array.from(beforeDoc.querySelectorAll("measure > note"));
    const targetBefore = beforeNotes[1];
    expect(targetBefore).toBeTruthy();
    const targetBeforeDuration = targetBefore?.querySelector("duration")?.textContent?.trim() ?? "";
    expect(targetBeforeDuration).not.toBe("");
    expect(targetBefore?.querySelector("rest")).toBeNull();

    const result = core.dispatch({
      type: "delete_note",
      targetNodeId: second,
      voice: "1",
    });
    expect(result.ok).toBe(true);

    const saved = core.save();
    expect(saved.ok).toBe(true);
    const afterDoc = new DOMParser().parseFromString(saved.xml, "application/xml");
    const afterNotes = Array.from(afterDoc.querySelectorAll("measure > note"));
    expect(afterNotes).toHaveLength(beforeNotes.length);

    const targetAfter = afterNotes[1];
    expect(targetAfter?.querySelector("rest")).not.toBeNull();
    expect(targetAfter?.querySelector("duration")?.textContent?.trim()).toBe(targetBeforeDuration);
    expect(targetAfter?.querySelector("pitch")).toBeNull();
  });

  it("TI-7: delete_note keeps total duration unchanged in target measure/voice", () => {
    const core = new ScoreCore();
    core.load(BASE_XML);
    const ids = core.listNoteNodeIds();
    const second = ids[1];

    const sumDurationForVoice = (xml: string, measureNumber: string, voice: string): number => {
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      const measure = Array.from(doc.querySelectorAll("part > measure")).find(
        (m) => (m.getAttribute("number") ?? "") === measureNumber
      );
      if (!measure) return 0;
      return Array.from(measure.querySelectorAll(":scope > note"))
        .filter((n) => (n.querySelector(":scope > voice")?.textContent?.trim() ?? "") === voice)
        .reduce((sum, n) => {
          const d = Number(n.querySelector(":scope > duration")?.textContent?.trim() ?? "");
          return sum + (Number.isFinite(d) ? d : 0);
        }, 0);
    };

    const beforeSave = core.save();
    expect(beforeSave.ok).toBe(true);
    const beforeTotal = sumDurationForVoice(beforeSave.xml, "1", "1");

    const result = core.dispatch({
      type: "delete_note",
      targetNodeId: second,
      voice: "1",
    });
    expect(result.ok).toBe(true);

    const afterSave = core.save();
    expect(afterSave.ok).toBe(true);
    const afterTotal = sumDurationForVoice(afterSave.xml, "1", "1");

    expect(afterTotal).toBe(beforeTotal);
  });
});
