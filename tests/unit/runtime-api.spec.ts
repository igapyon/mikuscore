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
    expect(runtimeModule.runtimeApiVersion).toBe("miku-score/runtime-api@1");
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
