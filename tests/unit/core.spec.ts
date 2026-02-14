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
      type: "change_pitch",
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

  it("TI-2: underfull is allowed with warning", () => {
    const core = new ScoreCore();
    core.load(BASE_XML);
    const [first] = core.listNoteNodeIds();

    const result = core.dispatch({
      type: "delete_note",
      targetNodeId: first,
      voice: "1",
    });

    expect(result.ok).toBe(true);
    expect(result.warnings.map((x) => x.code)).toContain("MEASURE_UNDERFULL");
    expect(core.isDirty()).toBe(true);

    const saved = core.save();
    expect(saved.ok).toBe(true);
    expect(saved.mode).toBe("serialized_dirty");
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

  it("BF-1: non-editable voice is rejected", () => {
    const core = new ScoreCore();
    core.load(BASE_XML);
    const [first] = core.listNoteNodeIds();
    const before = core.save();
    expect(before.ok).toBe(true);

    const result = core.dispatch({
      type: "change_pitch",
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

  it("ID-2: surviving node IDs stay stable after delete", () => {
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
    expect(afterIds).not.toContain(second);
    for (const id of beforeIds.filter((x) => x !== second)) {
      expect(afterIds).toContain(id);
    }
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
      type: "change_pitch",
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
      type: "change_pitch",
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

  it("SV-4: save is rejected when a note has invalid voice", () => {
    const core = new ScoreCore();
    core.load(XML_WITH_INVALID_NOTE_VOICE);

    const saved = core.save();
    expect(saved.ok).toBe(false);
    expect(saved.diagnostics[0]?.code).toBe("MVP_INVALID_NOTE_VOICE");
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
      type: "change_pitch",
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
      type: "change_pitch",
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

  it("MP-2: delete keeps surviving notes stable except removed target", () => {
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

    const noteSig = (n: Element): string =>
      `${n.querySelector("voice")?.textContent?.trim()}:${n.querySelector("step")?.textContent?.trim()}:${n.querySelector("octave")?.textContent?.trim()}:${n.querySelector("duration")?.textContent?.trim()}`;
    const afterNotes = Array.from(afterDoc.querySelectorAll("measure > note")).map(noteSig);
    expect(afterNotes).toEqual(["1:C:4:1", "1:E:4:1", "1:F:4:1"]);
  });
});
