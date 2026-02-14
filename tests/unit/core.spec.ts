// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ScoreCore } from "../../core/ScoreCore";

const BASE_XML = `<?xml version="1.0" encoding="UTF-8"?>
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
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
    </measure>
  </part>
</score-partwise>`;

describe("ScoreCore MVP", () => {
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

    const saved = core.save();
    expect(saved.ok).toBe(true);
    expect(saved.mode).toBe("serialized_dirty");
    expect(saved.xml).toContain("<step>G</step>");
    expect(saved.xml).toContain("<octave>5</octave>");
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

  it("BF-1: non-editable voice is rejected", () => {
    const core = new ScoreCore();
    core.load(BASE_XML);
    const [first] = core.listNoteNodeIds();

    const result = core.dispatch({
      type: "change_pitch",
      targetNodeId: first,
      voice: "2",
      pitch: { step: "A", octave: 4 },
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("MVP_UNSUPPORTED_NON_EDITABLE_VOICE");
  });

  it("NK-1: unsupported note kind is rejected", () => {
    const xmlWithRest = BASE_XML.replace(
      "<note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>",
      "<note><rest/><duration>1</duration><voice>1</voice></note>"
    );
    const core = new ScoreCore();
    core.load(xmlWithRest);
    const [first] = core.listNoteNodeIds();

    const result = core.dispatch({
      type: "delete_note",
      targetNodeId: first,
      voice: "1",
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.code).toBe("MVP_UNSUPPORTED_NOTE_KIND");
  });

  it("PT-1: unknown elements are preserved", () => {
    const xmlWithUnknown = BASE_XML.replace(
      "</measure>",
      "<unknown-tag foo=\"bar\">x</unknown-tag></measure>"
    );
    const core = new ScoreCore();
    core.load(xmlWithUnknown);
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
});
