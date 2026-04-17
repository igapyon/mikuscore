/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";
import { extractMusicXmlTextFromMxl, extractTextFromZipByExtensions } from "../../src/ts/zip-io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const cliPath = path.resolve(repoRoot, "scripts/mikuscore-cli.mjs");

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true });
  }
});

describe("mikuscore cli", () => {
  it("prints top-level and command help", () => {
    const topLevel = runCli(["--help"]);
    const convertHelp = runCli(["convert", "--help"]);
    const renderHelp = runCli(["render", "--help"]);
    const stateHelp = runCli(["state", "--help"]);

    expect(topLevel.status).toBe(0);
    expect(topLevel.stdout).toContain("mikuscore convert --from abc --to musicxml");
    expect(topLevel.stdout).toContain("mikuscore convert --from midi --to musicxml");
    expect(topLevel.stdout).toContain("mikuscore convert --from musescore --to musicxml");
    expect(topLevel.stdout).toContain("mikuscore render svg");
    expect(topLevel.stdout).toContain("mikuscore state summarize");
    expect(topLevel.stderr).toBe("");

    expect(convertHelp.status).toBe(0);
    expect(convertHelp.stdout).toContain("Convert score text between supported formats");
    expect(convertHelp.stderr).toBe("");

    expect(renderHelp.status).toBe(0);
    expect(renderHelp.stdout).toContain("supported one-shot source formats");
    expect(renderHelp.stdout).toContain("--from <format>");
    expect(renderHelp.stderr).toBe("");

    expect(stateHelp.status).toBe(0);
    expect(stateHelp.stdout).toContain("Inspect canonical MusicXML state");
    expect(stateHelp.stdout).toContain("summarize");
    expect(stateHelp.stdout).toContain("inspect-measure");
    expect(stateHelp.stdout).toContain("validate-command");
    expect(stateHelp.stdout).toContain("apply-command");
    expect(stateHelp.stdout).toContain("diff");
    expect(stateHelp.stdout).toContain("selector/anchor_selector");
    expect(stateHelp.stderr).toBe("");
  }, 10000);

  it("converts stdin to stdout for a supported pair", () => {
    const result = runCli(["convert", "--from", "abc", "--to", "musicxml"], {
      input: "X:1\nT:STDIN\nM:4/4\nL:1/4\nK:C\nC D E F|\n",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<work-title>STDIN</work-title>");
  });

  it("writes output via --out", () => {
    const inputPath = writeTempFile("score.abc", "X:1\nT:Out\nM:4/4\nL:1/4\nK:C\nC D E F|\n");
    const outPath = tempPath("out.musicxml");

    const result = runCli(["convert", "--from", "abc", "--to", "musicxml", "--in", inputPath, "--out", outPath]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(readFileSync(outPath, "utf8")).toContain("<score-partwise");
  });

  it("treats --out - as explicit stdout", () => {
    const inputPath = writeTempFile("score.abc", "X:1\nT:Stdout dash\nM:4/4\nL:1/4\nK:C\nC D E F|\n");

    const result = runCli(["convert", "--from", "abc", "--to", "musicxml", "--in", inputPath, "--out", "-"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<work-title>Stdout dash</work-title>");
  });

  it("reads .mxl input files for musicxml source", () => {
    const inputPath = path.resolve(repoRoot, "src", "samples", "musicxml", "sample1.mxl");
    const result = runCli(["convert", "--from", "musicxml", "--to", "abc", "--in", inputPath]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("X:1");
    expect(result.stdout).toContain("K:");
  });

  it("reads .mscz input files for musescore source", () => {
    const inputPath = path.resolve(repoRoot, "src", "samples", "musescore", "sample1.mscz");
    const result = runCli(["convert", "--from", "musescore", "--to", "musicxml", "--in", inputPath]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<score-partwise");
  });

  it("writes .mxl output when --out ends with .mxl", async () => {
    const inputPath = writeTempFile("score.abc", "X:1\nT:Zip MusicXML\nM:4/4\nL:1/4\nK:C\nC D E F|\n");
    const outPath = tempPath("out.mxl");

    const result = runCli(["convert", "--from", "abc", "--to", "musicxml", "--in", inputPath, "--out", outPath]);

    expect(result.status).toBe(0);
    const archiveBytes = readFileSync(outPath);
    const extracted = await extractMusicXmlTextFromMxl(
      archiveBytes.buffer.slice(archiveBytes.byteOffset, archiveBytes.byteOffset + archiveBytes.byteLength)
    );
    expect(extracted).toContain("<work-title>Zip MusicXML</work-title>");
  });

  it("writes .mscz output when --out ends with .mscz", async () => {
    const inputPath = writeTempFile("score.musicxml", validMusicXml("Zip MuseScore"));
    const outPath = tempPath("out.mscz");

    const result = runCli(["convert", "--from", "musicxml", "--to", "musescore", "--in", inputPath, "--out", outPath]);

    expect(result.status).toBe(0);
    const archiveBytes = readFileSync(outPath);
    const extracted = await extractTextFromZipByExtensions(
      archiveBytes.buffer.slice(archiveBytes.byteOffset, archiveBytes.byteOffset + archiveBytes.byteLength),
      [".mscx"]
    );
    expect(extracted).toContain("<museScore version=\"4.0\">");
    expect(extracted).toContain("\n  <Score>");
  });

  it("renders SVG from stdin to stdout", () => {
    const result = runCli(["render", "svg"], {
      input: validMusicXml("SVG stdout"),
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<svg");
  });

  it("renders SVG directly from ABC input", () => {
    const inputPath = writeTempFile("score.abc", "X:1\nT:Render ABC\nM:4/4\nL:1/4\nK:C\nC D E F|\n");

    const result = runCli(["render", "svg", "--from", "abc", "--in", inputPath]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<svg");
  });

  it("summarizes canonical MusicXML state", () => {
    const result = runCli(["state", "summarize"], {
      input: validMusicXml("State summary"),
    });

    expect(result.status).toBe(0);
    const summary = JSON.parse(result.stdout);
    expect(summary.kind).toBe("musicxml_state_summary");
    expect(summary.title).toBe("State summary");
    expect(summary.part_count).toBe(1);
    expect(summary.measure_count).toBe(1);
    expect(summary.measure_numbers).toEqual(["1"]);
    expect(summary.voices).toEqual([]);
  });

  it("validates one bounded MusicXML command", () => {
    const result = runCli(
      [
        "state",
        "validate-command",
        "--command",
        JSON.stringify({
          type: "change_to_pitch",
          targetNodeId: "n1",
          voice: "1",
          pitch: { step: "G", octave: 4 },
        }),
      ],
      {
        input: validEditableMusicXml("Validate command"),
      }
    );

    expect(result.status).toBe(0);
    const validation = JSON.parse(result.stdout);
    expect(validation.kind).toBe("musicxml_command_validation");
    expect(validation.ok).toBe(true);
    expect(validation.changed_node_ids).toEqual(["n1"]);
    expect(validation.affected_measure_numbers).toEqual(["1"]);
  });

  it("validates one bounded MusicXML command via selector", () => {
    const result = runCli(
      [
        "state",
        "validate-command",
        "--command",
        JSON.stringify({
          type: "change_to_pitch",
          selector: {
            part_id: "P1",
            measure_number: "1",
            measure_note_index: 1,
            voice: "1",
          },
          pitch: { step: "G", octave: 4 },
        }),
      ],
      {
        input: validEditableMusicXml("Validate selector command"),
      }
    );

    expect(result.status).toBe(0);
    const validation = JSON.parse(result.stdout);
    expect(validation.kind).toBe("musicxml_command_validation");
    expect(validation.ok).toBe(true);
    expect(validation.changed_node_ids).toEqual(["n1"]);
  });

  it("inspects one measure for edit targeting", () => {
    const result = runCli(["state", "inspect-measure", "--measure", "1"], {
      input: validEditableMusicXml("Inspect measure"),
    });

    expect(result.status).toBe(0);
    const inspected = JSON.parse(result.stdout);
    expect(inspected.kind).toBe("musicxml_measure_inspection");
    expect(inspected.measure_number).toBe("1");
    expect(inspected.measures).toHaveLength(1);
    expect(inspected.measures[0].part_id).toBe("P1");
    expect(inspected.measures[0].note_count).toBe(4);
    expect(inspected.measures[0].notes[0].node_id).toBe("n1");
    expect(inspected.measures[0].notes[0].selector).toEqual({
      part_id: "P1",
      measure_number: "1",
      measure_note_index: 1,
      voice: "1",
      voice_note_index: 1,
    });
    expect(inspected.measures[0].notes[0].pitch.step).toBe("C");
  });

  it("applies one bounded MusicXML command", () => {
    const result = runCli(
      [
        "state",
        "apply-command",
        "--command",
        JSON.stringify({
          type: "change_to_pitch",
          targetNodeId: "n1",
          voice: "1",
          pitch: { step: "G", octave: 4 },
        }),
      ],
      {
        input: validEditableMusicXml("Apply command"),
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<step>G</step>");
    expect(result.stdout).toContain("<octave>4</octave>");
  });

  it("applies one bounded MusicXML command via selector", () => {
    const result = runCli(
      [
        "state",
        "apply-command",
        "--command",
        JSON.stringify({
          type: "change_to_pitch",
          selector: {
            part_id: "P1",
            measure_number: "1",
            measure_note_index: 1,
            voice: "1",
          },
          pitch: { step: "A", octave: 4 },
        }),
      ],
      {
        input: validEditableMusicXml("Apply selector command"),
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<step>A</step>");
    expect(result.stdout).toContain("<octave>4</octave>");
  });

  it("applies insert_note_after via anchor_selector", () => {
    const result = runCli(
      [
        "state",
        "apply-command",
        "--command",
        JSON.stringify({
          type: "insert_note_after",
          anchor_selector: {
            part_id: "P1",
            measure_number: "1",
            measure_note_index: 1,
            voice: "1",
          },
          note: {
            duration: 1,
            pitch: { step: "A", octave: 4 },
          },
        }),
      ],
      {
        input: validInsertableMusicXml("Apply anchor selector command"),
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<step>A</step>");
    expect(result.stdout).toContain("<step>D</step>");
    expect(result.stdout.match(/<note>/g)?.length).toBe(4);
  });

  it("diffs two canonical MusicXML states", () => {
    const beforePath = writeTempFile("before.musicxml", validEditableMusicXml("Before title"));
    const afterPath = writeTempFile("after.musicxml", validEditableMusicXml("After title").replace("<step>C</step>", "<step>G</step>"));

    const result = runCli(["state", "diff", "--before", beforePath, "--after", afterPath]);

    expect(result.status).toBe(0);
    const diff = JSON.parse(result.stdout);
    expect(diff.kind).toBe("musicxml_state_diff");
    expect(diff.changed).toBe(true);
    expect(diff.changed_fields).toContain("title");
    expect(diff.changed_measure_numbers).toEqual(["1"]);
    expect(diff.changed_measures).toEqual([
      {
        part_id: "P1",
        measure_number: "1",
        before_note_count: 4,
        after_note_count: 4,
      },
    ]);
    expect(diff.before.title).toBe("Before title");
    expect(diff.after.title).toBe("After title");
  });

  it("writes structured diagnostics as json when requested", () => {
    const result = runCli(["render", "svg", "--diagnostics", "json"], {
      input: validMusicXml("SVG diagnostics"),
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<svg");
    const diagnostics = JSON.parse(result.stderr);
    expect(diagnostics.ok).toBe(true);
    expect(diagnostics.diagnostics_version).toBe(1);
    expect(diagnostics.command).toBe("render svg");
    expect(diagnostics.status).toBe("success");
    expect(diagnostics.exit_code).toBe(0);
    expect(diagnostics.output?.mode).toBeUndefined();
    expect(diagnostics.io.output).toEqual({ mode: "stdout" });
    expect(diagnostics.stages).toBeUndefined();
  });

  it("writes stage-aware diagnostics for one-shot render json output", () => {
    const inputPath = writeTempFile("score.abc", "X:1\nT:Stage diagnostics\nM:4/4\nL:1/4\nK:C\nC D E F|\n");
    const result = runCli(["render", "svg", "--from", "abc", "--in", inputPath, "--diagnostics", "json"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<svg");
    const diagnostics = JSON.parse(result.stderr);
    expect(diagnostics.ok).toBe(true);
    expect(diagnostics.command).toBe("render svg");
    expect(diagnostics.stages).toEqual([
      {
        name: "abc_to_musicxml",
        status: "success",
        warning_count: 0,
        error_count: 0,
      },
      {
        name: "musicxml_to_svg",
        status: "success",
        warning_count: 0,
        error_count: 0,
      },
    ]);
  });

  it("writes structured usage diagnostics for usage failures when requested", () => {
    const result = runCli(["convert", "--from", "abc", "--diagnostics", "json"], {
      input: "X:1\nT:Bad\nM:4/4\nL:1/4\nK:C\nC D E F|\n",
    });

    expect(result.status).toBe(2);
    const diagnostics = JSON.parse(result.stderr);
    expect(diagnostics.ok).toBe(false);
    expect(diagnostics.error_type).toBe("usage_error");
    expect(diagnostics.error_code).toBe("missing_from_to");
    expect(diagnostics.exit_code).toBe(2);
  });

  it("reports expected CLI failures", () => {
    const missingInput = runCli(["convert", "--from", "abc", "--to", "musicxml"]);
    const inputPath = writeTempFile("invalid.abc", "");
    const invalidAbc = runCli(["convert", "--from", "abc", "--to", "musicxml", "--in", inputPath]);
    const invalidMusicXmlPath = writeTempFile("invalid.musicxml", "<not-xml");
    const invalidMusicXml = runCli(["convert", "--from", "musicxml", "--to", "abc", "--in", invalidMusicXmlPath]);
    const unsupportedPair = runCli(["convert", "--from", "abc", "--to", "midi"], {
      input: "X:1\nT:Bad\nM:4/4\nL:1/4\nK:C\nC D E F|\n",
    });
    const missingFromTo = runCli(["convert", "--from", "abc"], {
      input: "X:1\nT:Bad\nM:4/4\nL:1/4\nK:C\nC D E F|\n",
    });
    const unsupportedRenderSource = runCli(["render", "svg", "--from", "midi"], {
      input: "unused",
    });
    const missingCommandPayload = runCli(["state", "validate-command"], {
      input: validEditableMusicXml("Missing command"),
    });
    const unresolvedSelector = runCli(
      [
        "state",
        "validate-command",
        "--command",
        JSON.stringify({
          type: "change_to_pitch",
          selector: {
            part_id: "P1",
            measure_number: "99",
            measure_note_index: 1,
          },
          pitch: { step: "G", octave: 4 },
        }),
      ],
      {
        input: validEditableMusicXml("Bad selector"),
      }
    );
    const missingMeasureOption = runCli(["state", "inspect-measure"], {
      input: validEditableMusicXml("Missing measure"),
    });
    const missingDiffInputs = runCli(["state", "diff"]);

    expect(missingInput.status).toBe(2);
    expect(missingInput.stderr).toContain("Input is required");
    expect(invalidAbc.status).toBe(1);
    expect(invalidAbc.stderr).toContain("Failed to parse ABC");
    expect(invalidMusicXml.status).toBe(1);
    expect(invalidMusicXml.stderr).toContain("Failed to parse MusicXML");
    expect(unsupportedPair.status).toBe(2);
    expect(unsupportedPair.stderr).toContain("Unsupported conversion pair");
    expect(missingFromTo.status).toBe(2);
    expect(missingFromTo.stderr).toContain("convert requires both --from <format> and --to <format>");
    expect(unsupportedRenderSource.status).toBe(2);
    expect(unsupportedRenderSource.stderr).toContain("Unsupported render source");
    expect(missingCommandPayload.status).toBe(2);
    expect(missingCommandPayload.stderr).toContain("requires exactly one of --command");
    expect(unresolvedSelector.status).toBe(1);
    expect(unresolvedSelector.stderr).toContain("Failed to resolve CLI command selector");
    expect(missingMeasureOption.status).toBe(2);
    expect(missingMeasureOption.stderr).toContain("requires --measure");
    expect(missingDiffInputs.status).toBe(2);
    expect(missingDiffInputs.stderr).toContain("requires both --before");
  }, 15000);
});

function runCli(args: string[], options: { input?: string } = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    input: options.input,
  });
}

function createTempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "mikuscore-cli-test-"));
  tempDirs.push(dir);
  return dir;
}

function writeTempFile(fileName: string, text: string) {
  const filePath = path.join(createTempDir(), fileName);
  writeFileSync(filePath, text, "utf8");
  return filePath;
}

function writeTempBinaryFile(fileName: string, bytes: Uint8Array) {
  const filePath = path.join(createTempDir(), fileName);
  writeFileSync(filePath, bytes);
  return filePath;
}

function tempPath(fileName: string) {
  return path.join(createTempDir(), fileName);
}

function validMusicXml(title: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
 <work><work-title>${title}</work-title></work>
 <part-list>
  <score-part id="P1"><part-name>Music</part-name></score-part>
 </part-list>
 <part id="P1">
  <measure number="1">
   <attributes>
    <divisions>1</divisions>
    <key><fifths>0</fifths></key>
    <time><beats>4</beats><beat-type>4</beat-type></time>
    <clef><sign>G</sign><line>2</line></clef>
   </attributes>
   <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
   <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
   <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
   <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
  </measure>
 </part>
</score-partwise>`;
}

function validEditableMusicXml(title: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
 <work><work-title>${title}</work-title></work>
 <part-list>
  <score-part id="P1"><part-name>Music</part-name></score-part>
 </part-list>
 <part id="P1">
  <measure number="1">
   <attributes>
    <divisions>1</divisions>
    <key><fifths>0</fifths></key>
    <time><beats>4</beats><beat-type>4</beat-type></time>
    <clef><sign>G</sign><line>2</line></clef>
   </attributes>
   <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
   <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
   <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
   <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
  </measure>
 </part>
</score-partwise>`;
}

function validInsertableMusicXml(title: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
 <work><work-title>${title}</work-title></work>
 <part-list>
  <score-part id="P1"><part-name>Music</part-name></score-part>
 </part-list>
 <part id="P1">
  <measure number="1">
   <attributes>
    <divisions>1</divisions>
    <key><fifths>0</fifths></key>
    <time><beats>4</beats><beat-type>4</beat-type></time>
    <clef><sign>G</sign><line>2</line></clef>
   </attributes>
   <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
   <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
   <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type></note>
  </measure>
 </part>
</score-partwise>`;
}
