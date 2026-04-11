import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

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
  it("prints top-level help", () => {
    const result = runCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("mikuscore convert --from abc --to musicxml");
    expect(result.stdout).toContain("mikuscore convert --from midi --to musicxml");
    expect(result.stdout).toContain("mikuscore convert --from musescore --to musicxml");
    expect(result.stdout).toContain("mikuscore render svg");
    expect(result.stderr).toBe("");
  });

  it("prints convert help", () => {
    const result = runCli(["convert", "--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Convert score text between supported formats");
    expect(result.stderr).toBe("");
  });

  it("prints render help", () => {
    const result = runCli(["render", "--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Render derived outputs from canonical MusicXML input");
    expect(result.stderr).toBe("");
  });

  it("converts ABC to MusicXML from file", () => {
    const inputPath = writeTempFile("score.abc", "X:1\nT:CLI\nM:4/4\nL:1/4\nK:C\nC D E F|\n");

    const result = runCli(["convert", "--from", "abc", "--to", "musicxml", "--in", inputPath]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<score-partwise");
  });

  it("converts ABC to MusicXML from stdin", () => {
    const result = runCli(["convert", "--from", "abc", "--to", "musicxml"], {
      input: "X:1\nT:STDIN\nM:4/4\nL:1/4\nK:C\nC D E F|\n",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<work-title>STDIN</work-title>");
  });

  it("converts MusicXML to ABC from file", () => {
    const inputPath = writeTempFile("score.musicxml", validMusicXml("CLI export"));

    const result = runCli(["convert", "--from", "musicxml", "--to", "abc", "--in", inputPath]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("K:C");
  });

  it("converts MusicXML to ABC from stdin", () => {
    const result = runCli(["convert", "--from", "musicxml", "--to", "abc"], {
      input: validMusicXml("STDIN export"),
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("T:STDIN export");
  });

  it("converts MIDI to MusicXML from file", () => {
    const inputPath = writeTempBinaryFile("score.mid", buildSimpleMidi());

    const result = runCli(["convert", "--from", "midi", "--to", "musicxml", "--in", inputPath]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<score-partwise");
  });

  it("converts MIDI to MusicXML from stdin", () => {
    const result = runCliRaw(["convert", "--from", "midi", "--to", "musicxml"], {
      input: buildSimpleMidi(),
    });

    expect(result.status).toBe(0);
    expect(result.stdout.toString("utf8")).toContain("<score-partwise");
    expect(result.stderr.toString("utf8")).toBe("");
  });

  it("converts MusicXML to MIDI via --out", () => {
    const inputPath = writeTempFile("score.musicxml", validMusicXml("MIDI out"));
    const outPath = tempPath("out.mid");

    const result = runCli(["convert", "--from", "musicxml", "--to", "midi", "--in", inputPath, "--out", outPath]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(Array.from(readFileSync(outPath).slice(0, 4))).toEqual([0x4d, 0x54, 0x68, 0x64]);
  });

  it("converts MusicXML to MIDI via stdout", () => {
    const result = runCliRaw(["convert", "--from", "musicxml", "--to", "midi"], {
      input: Buffer.from(validMusicXml("MIDI stdout"), "utf8"),
    });

    expect(result.status).toBe(0);
    expect(Array.from(result.stdout.slice(0, 4))).toEqual([0x4d, 0x54, 0x68, 0x64]);
    expect(result.stderr.toString("utf8")).toBe("");
  });

  it("converts MuseScore to MusicXML from file", () => {
    const inputPath = writeTempFile("score.mscx", validMuseScoreXml("Muse file"));

    const result = runCli(["convert", "--from", "musescore", "--to", "musicxml", "--in", inputPath]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<score-partwise");
    expect(result.stdout).toContain("<work-title>Muse file</work-title>");
  });

  it("converts MusicXML to MuseScore via stdout", () => {
    const result = runCli(["convert", "--from", "musicxml", "--to", "musescore"], {
      input: validMusicXml("Muse stdout"),
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<museScore version=\"4.0\">");
    expect(result.stdout).toContain("<metaTag name=\"workTitle\">Muse stdout</metaTag>");
  });

  it("renders SVG from MusicXML via stdout", () => {
    const result = runCli(["render", "svg"], {
      input: validMusicXml("SVG stdout"),
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<svg");
  });

  it("writes output via --out", () => {
    const inputPath = writeTempFile("score.abc", "X:1\nT:Out\nM:4/4\nL:1/4\nK:C\nC D E F|\n");
    const outPath = tempPath("out.musicxml");

    const result = runCli(["convert", "--from", "abc", "--to", "musicxml", "--in", inputPath, "--out", outPath]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(readFileSync(outPath, "utf8")).toContain("<score-partwise");
  });

  it("fails on missing input", () => {
    const result = runCli(["convert", "--from", "abc", "--to", "musicxml"]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Input is required");
  });

  it("fails on invalid ABC", () => {
    const inputPath = writeTempFile("invalid.abc", "");

    const result = runCli(["convert", "--from", "abc", "--to", "musicxml", "--in", inputPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Failed to parse ABC");
  });

  it("fails on invalid MusicXML", () => {
    const inputPath = writeTempFile("invalid.musicxml", "<not-xml");

    const result = runCli(["convert", "--from", "musicxml", "--to", "abc", "--in", inputPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Failed to parse MusicXML");
  });

  it("fails on unsupported conversion pair", () => {
    const result = runCli(["convert", "--from", "abc", "--to", "midi"], {
      input: "X:1\nT:Bad\nM:4/4\nL:1/4\nK:C\nC D E F|\n",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unsupported conversion pair");
  });

  it("fails when --from or --to is missing", () => {
    const result = runCli(["convert", "--from", "abc"], {
      input: "X:1\nT:Bad\nM:4/4\nL:1/4\nK:C\nC D E F|\n",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("convert requires both --from <format> and --to <format>");
  });
});

function runCli(args: string[], options: { input?: string } = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    input: options.input,
  });
}

function runCliRaw(args: string[], options: { input?: Uint8Array | Buffer } = {}) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
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

function validMuseScoreXml(title: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.0">
  <Score>
    <metaTag name="workTitle">${title}</metaTag>
    <Division>480</Division>
    <Staff id="1">
      <Measure>
        <voice>
          <Chord>
            <durationType>quarter</durationType>
            <Note><pitch>60</pitch></Note>
          </Chord>
          <Rest>
            <durationType>quarter</durationType>
          </Rest>
        </voice>
      </Measure>
    </Staff>
  </Score>
</museScore>`;
}

function buildSimpleMidi() {
  return Uint8Array.from([
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    0x01, 0xe0,
    0x4d, 0x54, 0x72, 0x6b,
    0x00, 0x00, 0x00, 0x0d,
    0x00, 0x90, 0x3c, 0x60,
    0x83, 0x60, 0x80, 0x3c, 0x00,
    0x00, 0xff, 0x2f, 0x00,
  ]);
}
