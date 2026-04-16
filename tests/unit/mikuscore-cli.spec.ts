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

    expect(topLevel.status).toBe(0);
    expect(topLevel.stdout).toContain("mikuscore convert --from abc --to musicxml");
    expect(topLevel.stdout).toContain("mikuscore convert --from midi --to musicxml");
    expect(topLevel.stdout).toContain("mikuscore convert --from musescore --to musicxml");
    expect(topLevel.stdout).toContain("mikuscore render svg");
    expect(topLevel.stderr).toBe("");

    expect(convertHelp.status).toBe(0);
    expect(convertHelp.stdout).toContain("Convert score text between supported formats");
    expect(convertHelp.stderr).toBe("");

    expect(renderHelp.status).toBe(0);
    expect(renderHelp.stdout).toContain("Render derived outputs from canonical MusicXML input");
    expect(renderHelp.stderr).toBe("");
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

    expect(missingInput.status).toBe(1);
    expect(missingInput.stderr).toContain("Input is required");
    expect(invalidAbc.status).toBe(1);
    expect(invalidAbc.stderr).toContain("Failed to parse ABC");
    expect(invalidMusicXml.status).toBe(1);
    expect(invalidMusicXml.stderr).toContain("Failed to parse MusicXML");
    expect(unsupportedPair.status).toBe(1);
    expect(unsupportedPair.stderr).toContain("Unsupported conversion pair");
    expect(missingFromTo.status).toBe(1);
    expect(missingFromTo.stderr).toContain("convert requires both --from <format> and --to <format>");
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
