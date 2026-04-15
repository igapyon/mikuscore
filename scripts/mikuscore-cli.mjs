#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCliApi } from "./lib/load-cli-api.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const TOP_LEVEL_HELP = `Usage:
  mikuscore convert --from abc --to musicxml [--in <file>] [--out <file>]
  mikuscore convert --from musicxml --to abc [--in <file>] [--out <file>]
  mikuscore convert --from midi --to musicxml [--in <file>] [--out <file>]
  mikuscore convert --from musicxml --to midi [--in <file>] [--out <file>]
  mikuscore convert --from musescore --to musicxml [--in <file>] [--out <file>]
  mikuscore convert --from musicxml --to musescore [--in <file>] [--out <file>]
  mikuscore render svg [--in <file>] [--out <file>]
  mikuscore render --help
  mikuscore convert --help
  mikuscore --help

Commands:
  convert   Convert score text between supported formats
  render    Render derived outputs such as SVG

Options:
  --from <format>  Source format
  --to <format>    Target format
  --in <file>   Read input from file instead of stdin
  --out <file>  Write output to file instead of stdout
  --help        Show help
`;

const CONVERT_HELP = `Usage:
  mikuscore convert --from abc --to musicxml [--in <file>] [--out <file>]
  mikuscore convert --from musicxml --to abc [--in <file>] [--out <file>]
  mikuscore convert --help

Description:
  Convert score text between supported formats.

Supported pairs:
  --from abc --to musicxml
  --from musicxml --to abc
  --from midi --to musicxml
  --from musicxml --to midi
  --from musescore --to musicxml
  --from musicxml --to musescore

Input:
  --in <file>  Read source text from file
  stdin        Used when --in is omitted

Output:
  --out <file>  Write converted text to file
  stdout        Used when --out is omitted

Options:
  --from <format>  Source format
  --to <format>    Target format
  --help        Show help
`;

const RENDER_HELP = `Usage:
  mikuscore render svg [--in <file>] [--out <file>]
  mikuscore render --help

Description:
  Render derived outputs from canonical MusicXML input.

Available targets:
  svg

Input:
  --in <file>  Read MusicXML text from file
  stdin        Used when --in is omitted

Output:
  --out <file>  Write rendered output to file
  stdout        Used when --out is omitted

Options:
  --help        Show help
`;

class CliCommandFailure extends Error {
  constructor(result, fallbackMessage) {
    super(result.diagnostics[0] || fallbackMessage);
    this.result = result;
  }
}

main().catch((error) => {
  if (error instanceof CliCommandFailure) {
    writeMessages(process.stderr, error.result.warnings, error.result.diagnostics);
    if (!error.result.diagnostics.length && error.message) {
      process.stderr.write(`${error.message}\n`);
    }
    process.exitCode = 1;
    return;
  }
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (command.length === 0 || (options.help && !options.helpCommand)) {
    process.stdout.write(TOP_LEVEL_HELP);
    return;
  }

  if (isCommand(command, ["convert"]) && options.helpCommand) {
    process.stdout.write(CONVERT_HELP);
    return;
  }

  if (isCommand(command, ["render"]) && options.helpCommand) {
    process.stdout.write(RENDER_HELP);
    return;
  }

  const loaded = loadCliApi({ rootDir: repoRoot });
  try {
    const result = await runCommand(command, options, loaded.api);
    writeMessages(process.stderr, result.warnings, result.diagnostics);
    writeOutput(result.output, options.out);
  } finally {
    loaded.dispose();
  }
}

function parseArgs(argv) {
  const command = [];
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      command.push(token);
      continue;
    }

    const key = token.slice(2);
    if (key === "help") {
      options.help = true;
      continue;
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Option ${token} requires a value.`);
    }
    options[key] = value;
    index += 1;
  }

  if (options.help && command.length > 0) {
    options.helpCommand = true;
  }

  return { command, options };
}

function isCommand(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

async function runCommand(command, options, api) {
  if (isCommand(command, ["convert"])) {
    const from = String(options.from || "").trim().toLowerCase();
    const to = String(options.to || "").trim().toLowerCase();

    if (!from || !to) {
      throw new Error("convert requires both --from <format> and --to <format>.");
    }

    if (from === "abc" && to === "musicxml") {
      const inputText = await readTextInput(options.in);
      const result = api.abc.importToMusicXml(inputText);
      if (!result.ok) {
        throw new CliCommandFailure(result, "ABC to MusicXML conversion failed.");
      }
      return result;
    }

    if (from === "musicxml" && to === "abc") {
      const inputText = await readTextInput(options.in);
      const result = api.abc.exportFromMusicXml(inputText);
      if (!result.ok) {
        throw new CliCommandFailure(result, "MusicXML to ABC conversion failed.");
      }
      return result;
    }

    if (from === "midi" && to === "musicxml") {
      const inputBytes = await readBinaryInput(options.in);
      const result = api.midi.importToMusicXml(inputBytes);
      if (!result.ok) {
        throw new CliCommandFailure(result, "MIDI to MusicXML conversion failed.");
      }
      return result;
    }

    if (from === "musicxml" && to === "midi") {
      const inputText = await readTextInput(options.in);
      const result = api.midi.exportFromMusicXml(inputText);
      if (!result.ok) {
        throw new CliCommandFailure(result, "MusicXML to MIDI conversion failed.");
      }
      return result;
    }

    if (from === "musescore" && to === "musicxml") {
      const inputText = await readTextInput(options.in);
      const result = api.musescore.importToMusicXml(inputText);
      if (!result.ok) {
        throw new CliCommandFailure(result, "MuseScore to MusicXML conversion failed.");
      }
      return result;
    }

    if (from === "musicxml" && to === "musescore") {
      const inputText = await readTextInput(options.in);
      const result = api.musescore.exportFromMusicXml(inputText);
      if (!result.ok) {
        throw new CliCommandFailure(result, "MusicXML to MuseScore conversion failed.");
      }
      return result;
    }

    throw new Error(`Unsupported conversion pair: --from ${from} --to ${to}`);
  }

  if (isCommand(command, ["render", "svg"])) {
    const inputText = await readTextInput(options.in);
    const result = await api.render.svgFromMusicXml(inputText);
    if (!result.ok) {
      throw new CliCommandFailure(result, "SVG render failed.");
    }
    return result;
  }

  throw new Error(`Unsupported command: ${command.join(" ")}`);
}

async function readTextInput(inputPath) {
  const bytes = await readBinaryInput(inputPath);
  return Buffer.from(bytes).toString("utf8");
}

async function readBinaryInput(inputPath) {
  if (inputPath) {
    return fs.readFileSync(path.resolve(inputPath));
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) {
    throw new Error("Input is required. Use --in <file> or pipe text via stdin.");
  }
  return Buffer.concat(chunks);
}

function writeMessages(stream, warnings = [], diagnostics = []) {
  for (const warning of warnings) {
    stream.write(`[warning] ${warning}\n`);
  }
  for (const diagnostic of diagnostics) {
    stream.write(`[diagnostic] ${diagnostic}\n`);
  }
}

function writeOutput(output, outPath) {
  const payload = typeof output === "string" ? output : Buffer.from(output);
  if (outPath) {
    fs.writeFileSync(path.resolve(outPath), payload);
    return;
  }
  process.stdout.write(payload);
}
