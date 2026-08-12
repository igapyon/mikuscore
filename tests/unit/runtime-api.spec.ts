/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const MUSICXML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
 <work><work-title>Runtime API</work-title></work>
 <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
 <part id="P1"><measure number="1">
  <attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
  <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type><voice>1</voice></note>
  <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type><voice>1</voice></note>
  <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type><voice>1</voice></note>
  <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type><voice>1</voice></note>
 </measure></part>
</score-partwise>`;

const MUSICXML_WITH_MKS_METADATA = MUSICXML.replace(
  "<clef><sign>G</sign><line>2</line></clef></attributes>",
  [
    "<clef><sign>G</sign><line>2</line></clef>",
    "<miscellaneous>",
    '<miscellaneous-field name="mks:meta:test">round-trip</miscellaneous-field>',
    '<miscellaneous-field name="mks:src:test">source</miscellaneous-field>',
    '<miscellaneous-field name="mks:dbg:test">debug</miscellaneous-field>',
    '<miscellaneous-field name="mks:diag:test">diagnostic</miscellaneous-field>',
    "</miscellaneous></attributes>",
  ].join("")
);

const loadFreshRuntimeModule = async () => {
  vi.resetModules();
  return import("../../src/ts/runtime-api");
};

describe("browser runtime API", () => {
  it("exposes only the documented value exports and returns one idempotent API object", async () => {
    const runtimeModule = await loadFreshRuntimeModule();

    expect(Object.keys(runtimeModule).sort()).toEqual([
      "default",
      "embeddedModulePaths",
      "loadMikuScoreRuntime",
      "runtimeApiVersion",
      "version",
    ]);
    expect(runtimeModule.runtimeApiVersion).toBe("miku-score/runtime-api@2");
    expect(runtimeModule.embeddedModulePaths).toContain("src/ts/runtime-api.ts");

    const first = runtimeModule.loadMikuScoreRuntime({ expectedVersion: runtimeModule.version });
    const second = runtimeModule.default({ expectedVersion: runtimeModule.version });
    expect(second).toBe(first);
  });

  it("rejects a version mismatch before creating an API object", async () => {
    const runtimeModule = await loadFreshRuntimeModule();

    try {
      runtimeModule.loadMikuScoreRuntime({ expectedVersion: "0.0.0" });
      throw new Error("Expected runtime version check to fail.");
    } catch (error) {
      expect(error).toMatchObject({
        name: "RuntimeConfigurationError",
        code: "MKS_RUNTIME_VERSION_MISMATCH",
      });
    }
  });

  it("imports values, preserves MIDI bytes, and keeps command rejection non-destructive", async () => {
    const runtimeModule = await loadFreshRuntimeModule();
    const runtime = runtimeModule.loadMikuScoreRuntime({ expectedVersion: runtimeModule.version });

    const imported = await runtime.convert.importToMusicXml({
      format: "abc",
      data: "X:1\nT:Runtime\nM:4/4\nL:1/4\nK:C\nC D E F|\n",
    });
    expect(imported).toMatchObject({ ok: true, value: expect.stringContaining("<score-partwise") });

    const midi = await runtime.convert.exportFromMusicXml({ format: "midi", xml: MUSICXML });
    expect(midi.ok).toBe(true);
    if (midi.ok) {
      expect(midi.value).toBeInstanceOf(Uint8Array);
      expect(Array.from((midi.value as Uint8Array).slice(0, 4))).toEqual([0x4d, 0x54, 0x68, 0x64]);
    }

    const rejected = runtime.state.applyCommand(MUSICXML, {
      type: "change_to_pitch",
      targetNodeId: "missing-node",
      voice: "1",
      pitch: { step: "C", octave: 4 },
    });
    expect(rejected).toMatchObject({ ok: true, value: { ok: false, xml: MUSICXML } });
    if (rejected.ok) {
      expect(rejected.value.diagnostics[0]?.code).toBe("MVP_TARGET_NOT_FOUND");
    }
  });

  it("exposes measure and archive operations without publishing implementation modules", async () => {
    const runtimeModule = await loadFreshRuntimeModule();
    const runtime = runtimeModule.loadMikuScoreRuntime({ expectedVersion: runtimeModule.version });

    const extracted = runtime.measure.extractEditorMusicXml(MUSICXML, {
      partId: "P1",
      measureNumber: "1",
    });
    expect(extracted).toMatchObject({ ok: true, value: expect.stringContaining('<measure number="1"') });
    if (!extracted.ok) return;

    const replaced = runtime.measure.replaceEditorMusicXml(MUSICXML, {
      partId: "P1",
      measureNumber: "1",
      editorXml: extracted.value,
    });
    expect(replaced).toMatchObject({ ok: true, value: expect.stringContaining("<score-partwise") });

    const overfullEditorXml = extracted.value.replace(
      "<duration>1</duration>",
      "<duration>2</duration>"
    );
    const rejectedReplacement = runtime.measure.replaceEditorMusicXml(MUSICXML, {
      partId: "P1",
      measureNumber: "1",
      editorXml: overfullEditorXml,
    });
    expect(rejectedReplacement).toMatchObject({
      ok: false,
      diagnostics: [{ code: "MKS_MUSICXML_INVALID" }],
    });
    expect(MUSICXML).toContain("<duration>1</duration>");

    const missing = runtime.measure.extractEditorMusicXml(MUSICXML, {
      partId: "P1",
      measureNumber: "missing",
    });
    expect(missing).toMatchObject({ ok: false, diagnostics: [{ code: "MKS_INPUT_INVALID" }] });
    expect(MUSICXML).toContain('<measure number="1">');

    const appended = runtime.measure.appendMeasure(MUSICXML);
    expect(appended).toMatchObject({ ok: true, value: expect.stringContaining('<measure number="2"') });

    const encoded = await runtime.output.encodeZipBundle([
      { path: "score.abc", data: "X:1\nK:C\nC|\n" },
      { path: "nested/ignored.abc", data: "X:2\nK:C\nD|\n" },
    ], { compressed: false });
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;

    const paths = await runtime.archive.listRootEntryPaths(encoded.value, { extensions: [".abc"] });
    expect(paths).toEqual({ ok: true, value: ["score.abc"], warnings: [] });
    const bytes = await runtime.archive.extractEntryBytes(encoded.value, { path: "score.abc" });
    expect(bytes).toMatchObject({ ok: true, value: expect.any(Uint8Array) });
    if (bytes.ok) expect(new TextDecoder().decode(bytes.value)).toBe("X:1\nK:C\nC|\n");

    const malformed = await runtime.archive.listRootEntryPaths(new Uint8Array(), { extensions: [".abc"] });
    expect(malformed).toMatchObject({ ok: false, diagnostics: [{ code: "MKS_ARCHIVE_INVALID" }] });
  });

  it("applies validated metadata and import policies before conversion", async () => {
    const runtimeModule = await loadFreshRuntimeModule();
    const runtime = runtimeModule.loadMikuScoreRuntime({ expectedVersion: runtimeModule.version });

    const filtered = await runtime.convert.exportFromMusicXml({
      format: "musicxml",
      xml: MUSICXML_WITH_MKS_METADATA,
      options: { musicXml: { metadata: { roundTrip: false, source: false, debug: false } } },
    });
    expect(filtered).toMatchObject({ ok: true, value: expect.any(String) });
    if (filtered.ok && typeof filtered.value === "string") {
      expect(filtered.value).not.toContain("mks:meta:");
      expect(filtered.value).not.toContain("mks:src:");
      expect(filtered.value).not.toContain("mks:dbg:");
      expect(filtered.value).toContain("mks:diag:test");
    }

    const filteredMxl = await runtime.convert.exportFromMusicXml({
      format: "mxl",
      xml: MUSICXML_WITH_MKS_METADATA,
      options: { musicXml: { metadata: { source: false } } },
    });
    expect(filteredMxl).toMatchObject({ ok: true, value: expect.any(Uint8Array) });
    if (filteredMxl.ok && filteredMxl.value instanceof Uint8Array) {
      const extractedMxl = await runtime.archive.extractEntryBytes(filteredMxl.value, { path: "score.musicxml" });
      expect(extractedMxl).toMatchObject({ ok: true, value: expect.any(Uint8Array) });
      if (extractedMxl.ok) {
        const text = new TextDecoder().decode(extractedMxl.value);
        expect(text).not.toContain("mks:src:test");
        expect(text).toContain("mks:meta:test");
      }
    }

    const midi = await runtime.convert.exportFromMusicXml({ format: "midi", xml: MUSICXML });
    expect(midi.ok).toBe(true);
    if (!midi.ok || !(midi.value instanceof Uint8Array)) return;
    const importedMidi = await runtime.convert.importToMusicXml({
      format: "midi",
      data: midi.value,
      options: {
        importMetadata: { source: false, debug: false },
        midi: { quantizeGrid: "1/16", tripletAwareQuantize: true },
      },
    });
    expect(importedMidi).toMatchObject({ ok: true, value: expect.any(String) });
    if (importedMidi.ok) {
      expect(importedMidi.value).not.toContain("mks:src:midi:");
      expect(importedMidi.value).not.toContain("mks:dbg:midi:");
    }

    const invalidExport = await runtime.convert.exportFromMusicXml({
      format: "musicxml",
      xml: MUSICXML,
      options: { musicXml: { metadata: { source: "no" as never } } },
    });
    expect(invalidExport).toMatchObject({ ok: false, diagnostics: [{ code: "MKS_INPUT_INVALID" }] });

    const unsupportedExport = await runtime.convert.exportFromMusicXml({
      format: "musicxml",
      xml: MUSICXML,
      options: { unknown: true } as never,
    });
    expect(unsupportedExport).toMatchObject({ ok: false, diagnostics: [{ code: "MKS_INPUT_INVALID" }] });

    const invalidImport = await runtime.convert.importToMusicXml({
      format: "abc",
      data: "X:1\nK:C\nC|\n",
      options: { midi: { quantizeGrid: "1/16" } },
    });
    expect(invalidImport).toMatchObject({ ok: false, diagnostics: [{ code: "MKS_INPUT_INVALID" }] });
  });

  it("passes VSQX import policy only through the explicit bridge capability", async () => {
    const runtimeModule = await loadFreshRuntimeModule();
    const bridge = {
      convertVsqxToMusicXml: vi.fn(() => MUSICXML),
      convertVsqxToMusicXmlWithReport: vi.fn(() => ({ musicXml: MUSICXML })),
      convertMusicXmlToVsqx: vi.fn(() => "<vsq4/>"),
    };
    const runtime = runtimeModule.loadMikuScoreRuntime({
      expectedVersion: runtimeModule.version,
      capabilities: { vsqxBridge: bridge },
    });

    const imported = await runtime.convert.importToMusicXml({
      format: "vsqx",
      data: "<vsq4/>",
      options: { vsqx: { defaultLyric: "み" } },
    });
    expect(imported).toMatchObject({ ok: true, value: expect.stringContaining("<score-partwise") });
    expect(bridge.convertVsqxToMusicXmlWithReport).toHaveBeenCalledWith("<vsq4/>", {
      defaultLyric: "み",
    });
  });

  it("returns stable unavailable diagnostics and accepts an explicit renderer capability", async () => {
    const unavailableModule = await loadFreshRuntimeModule();
    const unavailableRuntime = unavailableModule.loadMikuScoreRuntime({
      expectedVersion: unavailableModule.version,
    });
    expect(unavailableRuntime.render.renderSvg(MUSICXML)).toMatchObject({
      ok: false,
      diagnostics: [{ code: "MKS_CAPABILITY_VEROVIO_UNAVAILABLE" }],
    });

    const configuredModule = await loadFreshRuntimeModule();
    const toolkit = {
      setOptions: vi.fn(),
      loadData: vi.fn(() => true),
      getPageCount: vi.fn(() => 1),
      renderToSVG: vi.fn(() => "<svg data-runtime=\"yes\"/>"),
    };
    const configuredRuntime = configuredModule.loadMikuScoreRuntime({
      expectedVersion: configuredModule.version,
      capabilities: {
        verovio: {
          toolkit,
          serializeDocument: (doc) => new XMLSerializer().serializeToString(doc),
        },
      },
    });
    expect(configuredRuntime.render.renderSvg(MUSICXML)).toMatchObject({
      ok: true,
      value: "<svg data-runtime=\"yes\"/>",
    });
    expect(toolkit.loadData).toHaveBeenCalledTimes(1);
  });
});
