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
  formatImportedMusicXml: (xml: string) => `FORMATTED:${xml}`,
  convertAbcToMusicXml: (_abc: string) => "<score-partwise version=\"4.0\"/>",
  convertMeiToMusicXml: (_mei: string) => "<score-partwise version=\"4.0\"/>",
  convertLilyPondToMusicXml: (_lily: string) => "<score-partwise version=\"4.0\"/>",
  convertMuseScoreToMusicXml: (_musescore: string) => "<score-partwise version=\"4.0\"/>",
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
    expect(result.xmlToLoad).toContain("FORMATTED:<score-partwise");
    expect(result.nextXmlInputText).toContain("FORMATTED:<score-partwise");
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

describe("load-flow MEI file input", () => {
  it("accepts .mei and converts via convertMeiToMusicXml", async () => {
    const mei = `<?xml version="1.0" encoding="UTF-8"?><mei xmlns="http://www.music-encoding.org/ns/mei"/>`;
    const file = new File([mei], "test.mei", { type: "application/mei+xml" });
    let called = false;
    const result = await resolveLoadFlow({
      ...baseParams(),
      selectedFile: file,
      convertMeiToMusicXml: (text: string) => {
        called = true;
        expect(text).toContain("<mei");
        return "<score-partwise version=\"4.0\"><part-list/><part id=\"P1\"/></score-partwise>";
      },
    });
    expect(called).toBe(true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.xmlToLoad).toContain("FORMATTED:<score-partwise");
  });

  it("does not reformat direct MusicXML file input", async () => {
    const xml = "<score-partwise version=\"4.0\"><part-list/></score-partwise>";
    const file = new File([xml], "test.musicxml", { type: "application/xml" });
    const result = await resolveLoadFlow({
      ...baseParams(),
      selectedFile: file,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.xmlToLoad).toBe(xml);
    expect(result.nextXmlInputText).toBe(xml);
  });
});

describe("load-flow LilyPond file input", () => {
  it("accepts .ly and converts via convertLilyPondToMusicXml", async () => {
    const lily = "\\version \"2.24.0\"\\n\\score { \\new Staff { c'4 d'4 e'4 f'4 } }";
    const file = new File([lily], "test.ly", { type: "text/plain" });
    let called = false;
    const result = await resolveLoadFlow({
      ...baseParams(),
      selectedFile: file,
      convertLilyPondToMusicXml: (text: string) => {
        called = true;
        expect(text).toContain("\\score");
        return "<score-partwise version=\"4.0\"><part-list/><part id=\"P1\"/></score-partwise>";
      },
    });
    expect(called).toBe(true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.xmlToLoad).toContain("FORMATTED:<score-partwise");
  });
});

describe("load-flow MuseScore file input", () => {
  it("accepts .mscx and converts via convertMuseScoreToMusicXml", async () => {
    const mscx = `<?xml version="1.0" encoding="UTF-8"?><museScore version="4.0"><Score/></museScore>`;
    const file = new File([mscx], "test.mscx", { type: "application/xml" });
    let called = false;
    const result = await resolveLoadFlow({
      ...baseParams(),
      selectedFile: file,
      convertMuseScoreToMusicXml: (text: string) => {
        called = true;
        expect(text).toContain("<museScore");
        return "<score-partwise version=\"4.0\"><part-list/><part id=\"P1\"/></score-partwise>";
      },
    });
    expect(called).toBe(true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.xmlToLoad).toContain("FORMATTED:<score-partwise");
  });
});
