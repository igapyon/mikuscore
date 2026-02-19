import { describe, expect, it } from "vitest";
import { resolveLoadFlow } from "../../src/ts/load-flow";

const baseParams = () => ({
  isNewType: false,
  isAbcType: false,
  isFileMode: true,
  selectedFile: null as File | null,
  xmlSourceText: "",
  abcSourceText: "",
  createNewMusicXml: () => "<score-partwise version=\"4.0\"/>",
  convertAbcToMusicXml: (_abc: string) => "<score-partwise version=\"4.0\"/>",
  convertMidiToMusicXml: (_bytes: Uint8Array) => ({
    ok: true,
    xml: "<score-partwise version=\"4.0\"><part-list/></score-partwise>",
    diagnostics: [],
    warnings: [],
  }),
});

describe("load-flow MIDI file input", () => {
  it("accepts .mid and converts via convertMidiToMusicXml", async () => {
    const midiBytes = Uint8Array.from([0x4d, 0x54, 0x68, 0x64]);
    const file = new File([midiBytes], "test.mid", { type: "audio/midi" });
    let called = false;
    const result = await resolveLoadFlow({
      ...baseParams(),
      selectedFile: file,
      convertMidiToMusicXml: (bytes: Uint8Array) => {
        called = true;
        expect(Array.from(bytes)).toEqual(Array.from(midiBytes));
        return {
          ok: true,
          xml: "<score-partwise version=\"4.0\"><part-list/><part id=\"P1\"/></score-partwise>",
          diagnostics: [],
          warnings: [],
        };
      },
    });
    expect(called).toBe(true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.xmlToLoad).toContain("<score-partwise");
    expect(result.nextXmlInputText).toContain("<score-partwise");
  });

  it("returns load failure when MIDI conversion reports diagnostics", async () => {
    const file = new File([Uint8Array.from([0x00])], "bad.midi", { type: "audio/midi" });
    const result = await resolveLoadFlow({
      ...baseParams(),
      selectedFile: file,
      convertMidiToMusicXml: () => ({
        ok: false,
        xml: "",
        diagnostics: [{ code: "MIDI_INVALID_FILE", message: "invalid header" }],
        warnings: [],
      }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnosticMessage).toContain("Failed to parse MIDI");
    expect(result.diagnosticMessage).toContain("MIDI_INVALID_FILE");
  });
});
