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
  const helpTopic = resolveHelpTopic(command, options);

  if (helpTopic) {
    writeHelp(process.stdout, helpTopic);
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

    const value = readOptionValue(argv, index, token);
    if (key === "diagnostics") {
      validateDiagnosticsOption(value);
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

function readOptionValue(argv, index, token) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new CliUsageError(`Option ${token} requires a value.`, "missing_option_value", { option: token });
  }
  return value;
}

function validateDiagnosticsOption(value) {
  if (value !== "text" && value !== "json") {
    throw new CliUsageError("--diagnostics must be either text or json.", "invalid_diagnostics_option", {
      option: "--diagnostics",
    });
  }
}

function resolveHelpTopic(command, options) {
  if (command.length === 0 || (options.help && !options.helpCommand)) {
    return "top";
  }

  const helpTopics = {
    convert: "convert",
    render: "render",
    state: "state",
  };

  if (options.helpCommand && command.length === 1) {
    return helpTopics[command[0]];
  }

  return undefined;
}

async function runCommand(command, options, api) {
  if (isCommand(command, ["convert"])) {
    return runConvertCommand(options, api);
  }

  if (isCommand(command, ["render", "svg"])) {
    return runRenderCommand(options, api);
  }

  if (command[0] === "state" && command.length >= 2) {
    return runStateCommand(command.slice(1).join(" "), options, api);
  }

  throw new CliUsageError(`Unsupported command: ${command.join(" ")}`, "unsupported_command");
}

function runConvertCommand(options, api) {
  const from = String(options.from || "").trim().toLowerCase();
  const to = String(options.to || "").trim().toLowerCase();

  if (!from || !to) {
    throw new CliUsageError("convert requires both --from <format> and --to <format>.", "missing_from_to");
  }

  const convertHandler = buildConvertHandlers(options, api)[`${from}:${to}`];
  if (convertHandler) {
    return convertHandler();
  }

  throw new CliUsageError(`Unsupported conversion pair: --from ${from} --to ${to}`, "unsupported_conversion_pair", {
    from,
    to,
  });
}

function runRenderCommand(options, api) {
  const from = String(options.from || "musicxml").trim().toLowerCase();
  const renderHandler = buildRenderHandlers(options, api)[from];
  if (renderHandler) {
    return renderHandler();
  }
  throw new CliUsageError(`Unsupported render source: --from ${from}`, "unsupported_render_source", {
    from,
  });
}

function runStateCommand(stateKey, options, api) {
  const stateHandler = buildStateHandlers(options, api)[stateKey];
  if (stateHandler) {
    return stateHandler();
  }
  throw new CliUsageError(`Unsupported command: state ${stateKey}`, "unsupported_command");
}

function buildConvertHandlers(options, api) {
  const to = String(options.to || "").trim().toLowerCase();
  return {
    "abc:musicxml": async () =>
      runEncodedImportCommand(options.in, options.out, api, to, (inputPath) =>
        runTextImportCommand(
          inputPath,
          (inputText) => api.abc.importToMusicXml(inputText),
          "ABC to MusicXML conversion failed."
        )
      ),
    "musicxml:abc": async () =>
      runMusicXmlExportCommand(
        options.in,
        api,
        (inputText) => api.abc.exportFromMusicXml(inputText),
        "MusicXML to ABC conversion failed."
      ),
    "midi:musicxml": async () =>
      runEncodedImportCommand(options.in, options.out, api, to, (inputPath) =>
        runBinaryImportCommand(
          inputPath,
          (inputBytes) => api.midi.importToMusicXml(inputBytes),
          "MIDI to MusicXML conversion failed."
        )
      ),
    "musicxml:midi": async () =>
      runMusicXmlExportCommand(
        options.in,
        api,
        (inputText) => api.midi.exportFromMusicXml(inputText),
        "MusicXML to MIDI conversion failed."
      ),
    "musescore:musicxml": async () =>
      runEncodedImportCommand(options.in, options.out, api, to, async (inputPath) => {
        const result = await runDecodedTextImportCommand(
          inputPath,
          (inputText) => api.musescore.importToMusicXml(inputText),
          (inputBytes, sourcePath) => api.fileIO.musescore.decodeInput(inputBytes, sourcePath),
          "Failed to read MuseScore input."
        );
        if (!result.ok) {
          throw new CliCommandFailure(result, "MuseScore to MusicXML conversion failed.");
        }
        return result;
      }),
    "musicxml:musescore": async () =>
      runEncodedMusicXmlExportCommand(
        options.in,
        options.out,
        api,
        to,
        (inputText) => api.musescore.exportFromMusicXml(inputText),
        "MusicXML to MuseScore conversion failed."
      ),
  };
}

function buildRenderHandlers(options, api) {
  return {
    abc: async () => runAbcToSvgRenderCommand(options.in, api),
    musicxml: async () =>
      runMusicXmlTextCommand(
        options.in,
        api,
        (inputText) => api.render.svgFromMusicXml(inputText),
        "SVG render failed."
      ),
  };
}

function buildStateHandlers(options, api) {
  return {
    summarize: async () => {
      return runMusicXmlTextCommand(
        options.in,
        api,
        (inputText) => api.state.summarizeFromMusicXml(inputText),
        "Failed to summarize MusicXML state."
      );
    },
    "inspect-measure": async () => {
      const measure = String(options.measure || "").trim();
      if (!measure) {
        throw new CliUsageError("state inspect-measure requires --measure <number>.", "missing_measure_option");
      }
      return runMusicXmlTextCommand(
        options.in,
        api,
        (inputText) => api.state.inspectMeasureFromMusicXml(inputText, measure),
        "Failed to inspect MusicXML measure."
      );
    },
    "validate-command": async () => {
      const commandPayload = await readCommandPayload(options);
      return runMusicXmlTextCommand(
        options.in,
        api,
        (inputText) => api.state.validateCommandFromMusicXml(inputText, commandPayload),
        "Failed to validate MusicXML command."
      );
    },
    "apply-command": async () => {
      const commandPayload = await readCommandPayload(options);
      return runMusicXmlTextCommand(
        options.in,
        api,
        (inputText) => api.state.applyCommandFromMusicXml(inputText, commandPayload),
        "Failed to apply MusicXML command."
      );
    },
    diff: async () => {
      if (!options.before || !options.after) {
        throw new CliUsageError("state diff requires both --before <file> and --after <file>.", "missing_diff_inputs");
      }
      const beforeText = await readDecodedTextInput(
        options.before,
        (inputBytes, inputPath) => api.fileIO.musicxml.decodeInput(inputBytes, inputPath),
        "Failed to read before MusicXML input."
      );
      const afterText = await readDecodedTextInput(
        options.after,
        (inputBytes, inputPath) => api.fileIO.musicxml.decodeInput(inputBytes, inputPath),
        "Failed to read after MusicXML input."
      );
      const result = api.state.diffMusicXmlState(beforeText, afterText);
      if (!result.ok) {
        throw new CliCommandFailure(result, "Failed to diff MusicXML state.");
      }
      return result;
    },
  };
}

async function readMusicXmlInputText(inputPath, api) {
  return readDecodedTextInput(
    inputPath,
    (inputBytes, inputFilePath) => api.fileIO.musicxml.decodeInput(inputBytes, inputFilePath),
    "Failed to read MusicXML input."
  );
}

async function runMusicXmlTextCommand(inputPath, api, run, fallbackMessage) {
  const inputText = await readMusicXmlInputText(inputPath, api);
  const result = await run(inputText);
  if (!result.ok) {
    throw new CliCommandFailure(result, fallbackMessage);
  }
  return result;
}

async function runMusicXmlExportCommand(inputPath, api, run, fallbackMessage) {
  return runMusicXmlTextCommand(inputPath, api, run, fallbackMessage);
}

async function runEncodedMusicXmlExportCommand(inputPath, outPath, api, to, run, fallbackMessage) {
  const result = await runMusicXmlExportCommand(inputPath, api, run, fallbackMessage);
  return outPath ? encodeOutputForTarget(result, outPath, api, to) : result;
}

async function runTextImportCommand(inputPath, run, fallbackMessage) {
  const inputText = await readTextInput(inputPath);
  const result = await run(inputText);
  if (!result.ok) {
    throw new CliCommandFailure(result, fallbackMessage);
  }
  return result;
}

async function runBinaryImportCommand(inputPath, run, fallbackMessage) {
  const inputBytes = await readBinaryInput(inputPath);
  const result = await run(inputBytes);
  if (!result.ok) {
    throw new CliCommandFailure(result, fallbackMessage);
  }
  return result;
}

async function runDecodedTextImportCommand(inputPath, run, decode, decodeFailureMessage) {
  const inputText = await readDecodedTextInput(inputPath, decode, decodeFailureMessage);
  return run(inputText);
}

async function runEncodedImportCommand(inputPath, outPath, api, to, run) {
  const result = await run(inputPath);
  return outPath ? encodeOutputForTarget(result, outPath, api, to) : result;
}

async function runAbcToSvgRenderCommand(inputPath, api) {
  const inputText = await readTextInput(inputPath);
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
      buildStageDiagnostics("abc_to_musicxml", imported),
      buildStageDiagnostics("musicxml_to_svg", rendered),
    ],
  };
}

function buildStageDiagnostics(name, result) {
  return {
    name,
    status: result.diagnostics.length > 0 ? "warning" : "success",
    warning_count: result.warnings.length,
    error_count: result.diagnostics.length,
  };
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

async function readDecodedTextInput(inputPath, decode, fallbackMessage) {
  const inputBytes = await readBinaryInput(inputPath);
  const decoded = await decode(inputBytes, inputPath);
  if (!decoded.ok || typeof decoded.output !== "string") {
    throw new CliCommandFailure(decoded, fallbackMessage);
  }
  return decoded.output;
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

function summarizeDiagnosticOutcome(warnings, errors) {
  const status = errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "success";
  return {
    status,
    ok: errors.length === 0,
    exit_code: status === "error" ? 1 : 0,
    warning_count: warnings.length,
    error_count: errors.length,
  };
}

function buildBaseDiagnostics(command, io, warnings, errors) {
  const outcome = summarizeDiagnosticOutcome(warnings, errors);
  return {
    ok: outcome.ok,
    diagnostics_version: DIAGNOSTICS_VERSION,
    command,
    context: command,
    status: outcome.status,
    exit_code: outcome.exit_code,
    warning_count: outcome.warning_count,
    error_count: outcome.error_count,
    io,
    warnings,
    errors,
  };
}

function buildSuccessDiagnostics(command, options, result) {
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  const errors = Array.isArray(result.diagnostics) ? result.diagnostics : [];
  const diagnostics = buildBaseDiagnostics(command.join(" "), buildIoDiagnostics(options), warnings, errors);
  diagnostics.ok = result.ok && diagnostics.ok;
  if (Array.isArray(result.stages) && result.stages.length > 0) {
    diagnostics.stages = result.stages;
  }
  return diagnostics;
}

function buildErrorDiagnostics(argv, error, exitCode) {
  const argvSummary = summarizeArgv(argv);
  const message = error instanceof Error ? error.message : String(error);
  const diagnostics = buildBaseDiagnostics(argvSummary.command, buildIoDiagnostics(argvSummary.options), [], [message]);
  diagnostics.ok = false;
  diagnostics.exit_code = exitCode;
  diagnostics.error_type = error instanceof CliUsageError ? "usage_error" : "processing_error";
  diagnostics.error_code = typeof error?.code === "string" ? error.code : "processing_error";
  diagnostics.error_details = error?.details;
  return diagnostics;
}

function summarizeArgv(argv) {
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
      continue;
    }
    options[key] = argv[index + 1];
    index += 1;
  }
  return {
    command: command.join(" ") || "cli",
    options,
  };
}

function buildIoDiagnostics(options) {
  return {
    inputs: buildInputListFromOptions(options),
    output: buildOutputFromValue(options.out),
  };
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
