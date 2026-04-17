#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCliApi } from "./lib/load-cli-api.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const DIAGNOSTICS_VERSION = 1;

const HELP_TEXT = {
  top: [
    "Usage:",
    "  mikuscore convert --from abc --to musicxml [--in <file>|-] [--out <file>|-] [--diagnostics text|json]",
    "  mikuscore convert --from musicxml --to abc [--in <file>|-] [--out <file>|-] [--diagnostics text|json]",
    "  mikuscore convert --from midi --to musicxml [--in <file>|-] [--out <file>|-] [--diagnostics text|json]",
    "  mikuscore convert --from musicxml --to midi [--in <file>|-] [--out <file>|-] [--diagnostics text|json]",
    "  mikuscore convert --from musescore --to musicxml [--in <file>|-] [--out <file>|-] [--diagnostics text|json]",
    "  mikuscore convert --from musicxml --to musescore [--in <file>|-] [--out <file>|-] [--diagnostics text|json]",
    "  mikuscore render svg [--in <file>|-] [--out <file>|-] [--diagnostics text|json]",
    "  mikuscore state summarize [--in <file>|-] [--diagnostics text|json]",
    "  mikuscore state inspect-measure --measure <number> [--in <file>|-] [--diagnostics text|json]",
    "  mikuscore state validate-command [--in <file>|-] [--command <json>|--command-file <file>|-] [--diagnostics text|json]",
    "  mikuscore state apply-command [--in <file>|-] [--command <json>|--command-file <file>|-] [--out <file>|-] [--diagnostics text|json]",
    "  mikuscore state diff --before <file> --after <file> [--diagnostics text|json]",
    "  mikuscore render --help",
    "  mikuscore state --help",
    "  mikuscore convert --help",
    "  mikuscore --help",
    "",
    "Commands:",
    "  convert   Convert score text between supported formats",
    "  render    Render derived outputs such as SVG",
    "  state     Inspect canonical MusicXML state",
    "",
    "Options:",
    "  --from <format>          Source format",
    "  --to <format>            Target format",
    "  --in <file>|-            Read input from file or stdin",
    "  --out <file>|-           Write output to file or stdout",
    "  --diagnostics text|json  Select diagnostics format",
    "  --help                   Show help",
  ].join("\n"),
  convert: [
    "Usage:",
    "  mikuscore convert --from abc --to musicxml [--in <file>|-] [--out <file>|-] [--diagnostics text|json]",
    "  mikuscore convert --from musicxml --to abc [--in <file>|-] [--out <file>|-] [--diagnostics text|json]",
    "  mikuscore convert --help",
    "",
    "Description:",
    "  Convert score text between supported formats.",
    "",
    "Supported pairs:",
    "  --from abc --to musicxml",
    "  --from musicxml --to abc",
    "  --from midi --to musicxml",
    "  --from musicxml --to midi",
    "  --from musescore --to musicxml",
    "  --from musicxml --to musescore",
    "",
    "Input:",
    "  --in <file>|-  Read source text or bytes from file or stdin",
    "  stdin          Used when --in is omitted",
    "  file paths     musicxml accepts .musicxml / .xml / .mxl; musescore accepts .mscx / .mscz",
    "",
    "Output:",
    "  --out <file>|-  Write converted text or bytes to file or stdout",
    "  stdout          Used when --out is omitted",
    "  file paths      --to musicxml writes .mxl when --out ends with .mxl; --to musescore writes .mscz when --out ends with .mscz",
    "",
    "Options:",
    "  --from <format>          Source format",
    "  --to <format>            Target format",
    "  --diagnostics text|json  Select diagnostics format",
    "  --help                   Show help",
  ].join("\n"),
  render: [
    "Usage:",
    "  mikuscore render svg [--from <format>] [--in <file>|-] [--out <file>|-] [--diagnostics text|json]",
    "  mikuscore render --help",
    "",
    "Description:",
    "  Render derived outputs from canonical MusicXML input or supported one-shot source formats.",
    "",
    "Available targets:",
    "  svg",
    "",
    "Input:",
    "  --from <format>  Source format for render input (default: musicxml)",
    "  --in <file>|-    Read render input from file or stdin",
    "  stdin            Used when --in is omitted",
    "",
    "Output:",
    "  --out <file>|-  Write rendered output to file or stdout",
    "  stdout          Used when --out is omitted",
    "",
    "Options:",
    "  --from <format>          Source format",
    "  --diagnostics text|json  Select diagnostics format",
    "  --help                   Show help",
  ].join("\n"),
  state: [
    "Usage:",
    "  mikuscore state summarize [--in <file>|-] [--diagnostics text|json]",
    "  mikuscore state inspect-measure --measure <number> [--in <file>|-] [--diagnostics text|json]",
    "  mikuscore state validate-command [--in <file>|-] [--command <json>|--command-file <file>|-] [--diagnostics text|json]",
    "  mikuscore state apply-command [--in <file>|-] [--command <json>|--command-file <file>|-] [--out <file>|-] [--diagnostics text|json]",
    "  mikuscore state diff --before <file> --after <file> [--diagnostics text|json]",
    "  mikuscore state --help",
    "",
    "Description:",
    "  Inspect canonical MusicXML state.",
    "",
    "Available commands:",
    "  summarize   Emit a compact JSON summary of canonical MusicXML state",
    "  inspect-measure   Emit a compact JSON view of one measure for edit targeting",
    "  validate-command   Validate one bounded command against canonical MusicXML state",
    "  apply-command   Apply one bounded command and emit the next canonical MusicXML state",
    "  diff   Emit a compact JSON summary of differences between two canonical MusicXML states",
    "",
    "Command payload note:",
    "  state validate-command/apply-command accept core command JSON.",
    "  Targeting may use targetNodeId/anchorNodeId directly or selector/anchor_selector from inspect-measure output.",
    "",
    "Options:",
    "  --diagnostics text|json  Select diagnostics format",
    "  --help                   Show help",
  ].join("\n"),
};

class CliUsageError extends Error {
  constructor(message, code = "usage_error", details = undefined) {
    super(message);
    this.name = "CliUsageError";
    this.code = code;
    this.details = details;
  }
}

class CliProcessingError extends Error {
  constructor(message, code = "processing_error", details = undefined) {
    super(message);
    this.name = "CliProcessingError";
    this.code = code;
    this.details = details;
  }
}

class CliCommandFailure extends Error {
  constructor(result, fallbackMessage) {
    super(result.diagnostics[0] || fallbackMessage);
    this.name = "CliCommandFailure";
    this.result = result;
  }
}

main().catch((error) => {
  const rawArgv = process.argv.slice(2);
  const diagnosticsFormat = detectRequestedDiagnosticsFormat(rawArgv);
  const exitCode = error instanceof CliUsageError ? 2 : 1;
  if (diagnosticsFormat === "json") {
    process.stderr.write(`${JSON.stringify(buildErrorDiagnostics(rawArgv, error, exitCode), null, 2)}\n`);
  } else if (error instanceof CliCommandFailure) {
    writeMessages(process.stderr, error.result.warnings, error.result.diagnostics);
    if (!error.result.diagnostics.length && error.message) {
      process.stderr.write(`${error.message}\n`);
    }
  } else {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  }
  process.exit(exitCode);
});

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (command.length === 0 || (options.help && !options.helpCommand)) {
    writeHelp(process.stdout, "top");
    return;
  }

  if (isCommand(command, ["convert"]) && options.helpCommand) {
    writeHelp(process.stdout, "convert");
    return;
  }

  if (isCommand(command, ["render"]) && options.helpCommand) {
    writeHelp(process.stdout, "render");
    return;
  }

  if (isCommand(command, ["state"]) && options.helpCommand) {
    writeHelp(process.stdout, "state");
    return;
  }

  const loaded = loadCliApi({ rootDir: repoRoot });
  try {
    const result = await runCommand(command, options, loaded.api);
    writeDiagnostics(process.stderr, buildSuccessDiagnostics(command, options, result), options.diagnostics);
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

    if (key === "diagnostics") {
      const diagnosticsValue = argv[index + 1];
      if (!diagnosticsValue || diagnosticsValue.startsWith("--")) {
        throw new CliUsageError(`Option ${token} requires a value.`, "missing_option_value", { option: token });
      }
      if (diagnosticsValue !== "text" && diagnosticsValue !== "json") {
        throw new CliUsageError("--diagnostics must be either text or json.", "invalid_diagnostics_option", {
          option: "--diagnostics",
        });
      }
      options.diagnostics = diagnosticsValue;
      index += 1;
      continue;
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new CliUsageError(`Option ${token} requires a value.`, "missing_option_value", { option: token });
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
      throw new CliUsageError("convert requires both --from <format> and --to <format>.", "missing_from_to");
    }

    if (from === "abc" && to === "musicxml") {
      const inputText = await readTextInput(options.in);
      const result = api.abc.importToMusicXml(inputText);
      if (!result.ok) {
        throw new CliCommandFailure(result, "ABC to MusicXML conversion failed.");
      }
      return options.out ? await encodeOutputForTarget(result, options.out, api, to) : result;
    }

    if (from === "musicxml" && to === "abc") {
      const inputText = await readMusicXmlInputText(options.in, api);
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
      return options.out ? await encodeOutputForTarget(result, options.out, api, to) : result;
    }

    if (from === "musicxml" && to === "midi") {
      const inputText = await readMusicXmlInputText(options.in, api);
      const result = api.midi.exportFromMusicXml(inputText);
      if (!result.ok) {
        throw new CliCommandFailure(result, "MusicXML to MIDI conversion failed.");
      }
      return result;
    }

    if (from === "musescore" && to === "musicxml") {
      const inputBytes = await readBinaryInput(options.in);
      const decoded = await api.fileIO.musescore.decodeInput(inputBytes, options.in);
      if (!decoded.ok || typeof decoded.output !== "string") {
        throw new CliCommandFailure(decoded, "Failed to read MuseScore input.");
      }
      const result = api.musescore.importToMusicXml(decoded.output);
      if (!result.ok) {
        throw new CliCommandFailure(result, "MuseScore to MusicXML conversion failed.");
      }
      return options.out ? await encodeOutputForTarget(result, options.out, api, to) : result;
    }

    if (from === "musicxml" && to === "musescore") {
      const inputText = await readMusicXmlInputText(options.in, api);
      const result = api.musescore.exportFromMusicXml(inputText);
      if (!result.ok) {
        throw new CliCommandFailure(result, "MusicXML to MuseScore conversion failed.");
      }
      return options.out ? await encodeOutputForTarget(result, options.out, api, to) : result;
    }

    throw new CliUsageError(`Unsupported conversion pair: --from ${from} --to ${to}`, "unsupported_conversion_pair", {
      from,
      to,
    });
  }

  if (isCommand(command, ["render", "svg"])) {
    const from = String(options.from || "musicxml").trim().toLowerCase();

    if (from === "abc") {
      const inputText = await readTextInput(options.in);
      const imported = api.abc.importToMusicXml(inputText);
      if (!imported.ok || typeof imported.output !== "string") {
        throw new CliCommandFailure(imported, "ABC to MusicXML conversion failed.");
      }
      const rendered = await api.render.svgFromMusicXml(imported.output);
      if (!rendered.ok) {
        throw new CliCommandFailure(rendered, "SVG render failed.");
      }
      return {
        ...rendered,
        warnings: [...imported.warnings, ...rendered.warnings],
        diagnostics: [...imported.diagnostics, ...rendered.diagnostics],
        stages: [
          {
            name: "abc_to_musicxml",
            status: imported.diagnostics.length > 0 ? "warning" : "success",
            warning_count: imported.warnings.length,
            error_count: imported.diagnostics.length,
          },
          {
            name: "musicxml_to_svg",
            status: rendered.diagnostics.length > 0 ? "warning" : "success",
            warning_count: rendered.warnings.length,
            error_count: rendered.diagnostics.length,
          },
        ],
      };
    }

    if (from !== "musicxml") {
      throw new CliUsageError(`Unsupported render source: --from ${from}`, "unsupported_render_source", {
        from,
      });
    }

    const inputText = await readMusicXmlInputText(options.in, api);
    const result = await api.render.svgFromMusicXml(inputText);
    if (!result.ok) {
      throw new CliCommandFailure(result, "SVG render failed.");
    }
    return result;
  }

  if (isCommand(command, ["state", "summarize"])) {
    return runStateMusicXmlCommand(
      options.in,
      api,
      (inputText) => api.state.summarizeFromMusicXml(inputText),
      "Failed to summarize MusicXML state."
    );
  }

  if (isCommand(command, ["state", "inspect-measure"])) {
    const measure = String(options.measure || "").trim();
    if (!measure) {
      throw new CliUsageError("state inspect-measure requires --measure <number>.", "missing_measure_option");
    }
    return runStateMusicXmlCommand(
      options.in,
      api,
      (inputText) => api.state.inspectMeasureFromMusicXml(inputText, measure),
      "Failed to inspect MusicXML measure."
    );
  }

  if (isCommand(command, ["state", "validate-command"])) {
    const commandPayload = await readCommandPayload(options);
    return runStateMusicXmlCommand(
      options.in,
      api,
      (inputText) => api.state.validateCommandFromMusicXml(inputText, commandPayload),
      "Failed to validate MusicXML command."
    );
  }

  if (isCommand(command, ["state", "apply-command"])) {
    const commandPayload = await readCommandPayload(options);
    return runStateMusicXmlCommand(
      options.in,
      api,
      (inputText) => api.state.applyCommandFromMusicXml(inputText, commandPayload),
      "Failed to apply MusicXML command."
    );
  }

  if (isCommand(command, ["state", "diff"])) {
    if (!options.before || !options.after) {
      throw new CliUsageError("state diff requires both --before <file> and --after <file>.", "missing_diff_inputs");
    }
    const beforeBytes = await readBinaryInput(options.before);
    const afterBytes = await readBinaryInput(options.after);
    const beforeDecoded = await api.fileIO.musicxml.decodeInput(beforeBytes, options.before);
    const afterDecoded = await api.fileIO.musicxml.decodeInput(afterBytes, options.after);
    if (!beforeDecoded.ok || typeof beforeDecoded.output !== "string") {
      throw new CliCommandFailure(beforeDecoded, "Failed to read before MusicXML input.");
    }
    if (!afterDecoded.ok || typeof afterDecoded.output !== "string") {
      throw new CliCommandFailure(afterDecoded, "Failed to read after MusicXML input.");
    }
    const result = api.state.diffMusicXmlState(beforeDecoded.output, afterDecoded.output);
    if (!result.ok) {
      throw new CliCommandFailure(result, "Failed to diff MusicXML state.");
    }
    return result;
  }

  throw new CliUsageError(`Unsupported command: ${command.join(" ")}`, "unsupported_command");
}

async function readMusicXmlInputText(inputPath, api) {
  const inputBytes = await readBinaryInput(inputPath);
  const decoded = await api.fileIO.musicxml.decodeInput(inputBytes, inputPath);
  if (!decoded.ok || typeof decoded.output !== "string") {
    throw new CliCommandFailure(decoded, "Failed to read MusicXML input.");
  }
  return decoded.output;
}

async function runStateMusicXmlCommand(inputPath, api, run, fallbackMessage) {
  const inputText = await readMusicXmlInputText(inputPath, api);
  const result = await run(inputText);
  if (!result.ok) {
    throw new CliCommandFailure(result, fallbackMessage);
  }
  return result;
}

async function encodeOutputForTarget(result, outPath, api, to) {
  if (!result.ok) return result;
  if (to === "musicxml" && typeof result.output === "string") {
    return api.fileIO.musicxml.encodeOutput(result.output, outPath);
  }
  if (to === "musescore" && typeof result.output === "string") {
    return api.fileIO.musescore.encodeOutput(result.output, outPath);
  }
  return result;
}

async function readTextInput(inputPath) {
  const bytes = await readBinaryInput(inputPath);
  return Buffer.from(bytes).toString("utf8");
}

async function readBinaryInput(inputPath) {
  if (inputPath && inputPath !== "-") {
    return fs.readFileSync(path.resolve(inputPath));
  }

  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) {
    throw new CliUsageError("Input is required. Use --in <file> or pipe text via stdin.", "missing_input");
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

function writeDiagnostics(stream, diagnostics, diagnosticsFormat = "text") {
  if (diagnosticsFormat === "json") {
    stream.write(`${JSON.stringify(diagnostics, null, 2)}\n`);
    return;
  }
  writeMessages(stream, diagnostics.warnings, diagnostics.errors);
}

function writeOutput(output, outPath) {
  const payload = typeof output === "string" ? output : Buffer.from(output);
  if (outPath && outPath !== "-") {
    fs.writeFileSync(path.resolve(outPath), payload);
    return;
  }
  process.stdout.write(payload);
}

async function readCommandPayload(options) {
  const hasInline = typeof options.command === "string";
  const hasFile = typeof options["command-file"] === "string";
  if (hasInline === hasFile) {
    throw new CliUsageError(
      "state validate-command requires exactly one of --command <json> or --command-file <file>.",
      "missing_command_payload"
    );
  }

  const jsonText = hasInline ? options.command : await readTextInput(options["command-file"]);
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new CliUsageError(
      `Command payload must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      "invalid_command_json"
    );
  }
}

function writeHelp(stream, topic) {
  stream.write(`${HELP_TEXT[topic]}\n`);
}

function detectRequestedDiagnosticsFormat(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--diagnostics" && argv[index + 1] === "json") {
      return "json";
    }
  }
  return "text";
}

function buildSuccessDiagnostics(command, options, result) {
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const errors = Array.isArray(result.diagnostics) ? result.diagnostics : [];
  const status = errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "success";
  const diagnostics = {
    ok: result.ok && errors.length === 0,
    diagnostics_version: DIAGNOSTICS_VERSION,
    command: command.join(" "),
    context: command.join(" "),
    status,
    exit_code: status === "error" ? 1 : 0,
    warning_count: warnings.length,
    error_count: errors.length,
    io: buildIoDiagnostics(options),
    warnings,
    errors,
  };
  if (Array.isArray(result.stages) && result.stages.length > 0) {
    diagnostics.stages = result.stages;
  }
  return diagnostics;
}

function buildErrorDiagnostics(argv, error, exitCode) {
  const command = summarizeCommandFromArgv(argv);
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    diagnostics_version: DIAGNOSTICS_VERSION,
    command,
    context: command,
    status: "error",
    exit_code: exitCode,
    warning_count: 0,
    error_count: 1,
    io: buildIoDiagnosticsFromArgv(argv),
    error_type: error instanceof CliUsageError ? "usage_error" : "processing_error",
    error_code: typeof error?.code === "string" ? error.code : "processing_error",
    error_details: error?.details,
    warnings: [],
    errors: [message],
  };
}

function summarizeCommandFromArgv(argv) {
  const command = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      command.push(token);
      continue;
    }
    if (token !== "--help") {
      index += 1;
    }
  }
  return command.join(" ") || "cli";
}

function buildIoDiagnostics(options) {
  return {
    inputs: buildInputListFromOptions(options),
    output: buildOutputFromValue(options.out),
  };
}

function buildIoDiagnosticsFromArgv(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (key === "help") continue;
    options[key] = argv[index + 1];
    index += 1;
  }
  return buildIoDiagnostics(options);
}

function buildInputListFromOptions(options) {
  const inputs = [];
  if ("in" in options) {
    inputs.push(buildInputDescriptor("--in", options.in));
  }
  return inputs.length > 0 ? inputs : [{ option: "--in", mode: "stdin" }];
}

function buildInputDescriptor(option, value) {
  if (value === "-" || value === undefined) {
    return { option, mode: "stdin" };
  }
  return { option, mode: "file", path: value };
}

function buildOutputFromValue(value) {
  if (value === "-" || value === undefined) {
    return { mode: "stdout" };
  }
  return { mode: "file", path: value };
}
