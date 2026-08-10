/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  createBrowserVerovioCapability,
  initializeBrowserVerovioCapability,
} from "./verovio-out";
import {
  bytesToArrayBuffer,
  extractMusicXmlTextFromMxl,
  extractTextFromZipByExtensions,
  formatXmlWithTwoSpaceIndent,
  makeMsczBytes,
  makeMxlBytes,
} from "./zip-io";
import type { CoreCommand } from "../../core/interfaces";
import { getVoiceText, parseXml as parseCoreXml, reindexNodeIds } from "../../core/xmlUtils";
import { loadMikuScoreRuntime, type RuntimeResult } from "./runtime-api";

export type CliResult =
  | {
    ok: true;
    output: string | Uint8Array;
    warnings: string[];
    diagnostics: string[];
  }
  | {
    ok: false;
    warnings: string[];
    diagnostics: string[];
  };

const lowerFileName = (fileName: string | undefined): string => {
  return String(fileName || "").trim().toLowerCase();
};

const textResult = (output: string): CliResult => ({
  ok: true,
  output,
  warnings: [],
  diagnostics: [],
});

const bytesResult = (output: Uint8Array): CliResult => ({
  ok: true,
  output,
  warnings: [],
  diagnostics: [],
});

const failureResult = (message: string): CliResult => ({
  ok: false,
  warnings: [],
  diagnostics: [message],
});

const invalidMusicXmlResult = (): CliResult => {
  return failureResult("Failed to parse MusicXML: input is not a valid MusicXML document.");
};

const caughtErrorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

const cliVerovioCapability = createBrowserVerovioCapability();
const runtime = loadMikuScoreRuntime({
  capabilities: { verovio: cliVerovioCapability },
});

const cliResultFromRuntime = (result: RuntimeResult<string | Uint8Array>): CliResult => {
  if (!result.ok) {
    return {
      ok: false,
      warnings: result.warnings.map((item) => item.message),
      diagnostics: result.diagnostics.map((item) => item.message),
    };
  }
  return {
    ok: true,
    output: result.value,
    warnings: result.warnings.map((item) => item.message),
    diagnostics: [],
  };
};

const cliMusicXmlExportResult = (result: RuntimeResult<string | Uint8Array>): CliResult => {
  if (!result.ok && result.diagnostics.some((item) => item.code === "MKS_MUSICXML_INVALID")) {
    return invalidMusicXmlResult();
  }
  return cliResultFromRuntime(result);
};

const jsonTextResult = (value: unknown): CliResult => {
  return textResult(`${JSON.stringify(value, null, 2)}\n`);
};

const decodeUtf8Text = (bytes: Uint8Array): string => {
  return new TextDecoder("utf-8").decode(bytes);
};

type MeasureNoteSelector = {
  part_id?: string | null;
  measure_number?: string | null;
  measure_note_index?: number | null;
  voice?: string | null;
  voice_note_index?: number | null;
};

type IndexedMeasureNote = {
  nodeId: string;
  selector: {
    part_id: string | null;
    measure_number: string;
    measure_note_index: number;
    voice: string | null;
    voice_note_index: number;
  };
};

type CliCommandNormalizationResult =
  | {
    ok: true;
    command: CoreCommand;
  }
  | {
    ok: false;
    message: string;
  };

type ResolvedMeasureNoteSelectorResult =
  | {
    ok: true;
    nodeId: string;
    voice?: string | null;
  }
  | {
    ok: false;
    message: string;
  };

const isResolvedMeasureNoteSelectorFailure = (
  result: ResolvedMeasureNoteSelectorResult
): result is { ok: false; message: string } => {
  return result.ok === false;
};

const isCliCommandNormalizationFailure = (
  result: CliCommandNormalizationResult
): result is { ok: false; message: string } => {
  return result.ok === false;
};

const buildIndexedMeasureNotes = (xmlText: string): IndexedMeasureNote[] => {
  const doc = parseCoreXml(xmlText);
  const nodeToId = new WeakMap();
  const idToNode = new Map();
  let sequence = 0;
  reindexNodeIds(doc, nodeToId, idToNode, () => {
    sequence += 1;
    return `n${sequence}`;
  });

  const indexedNotes: IndexedMeasureNote[] = [];
  for (const measure of Array.from(doc.querySelectorAll("score-partwise > part > measure"))) {
    const part = measure.parentElement;
    const partId = part?.getAttribute("id")?.trim() ?? null;
    const measureNumber = measure.getAttribute("number")?.trim() ?? "";
    const voiceNoteCounts = new Map<string, number>();
    for (const [noteIndex, note] of Array.from(measure.querySelectorAll(":scope > note")).entries()) {
      const nodeId = nodeToId.get(note);
      if (!nodeId) continue;
      const voice = getVoiceText(note);
      const voiceKey = voice ?? "__none__";
      const nextVoiceNoteIndex = (voiceNoteCounts.get(voiceKey) ?? 0) + 1;
      voiceNoteCounts.set(voiceKey, nextVoiceNoteIndex);
      indexedNotes.push({
        nodeId,
        selector: {
          part_id: partId,
          measure_number: measureNumber,
          measure_note_index: noteIndex + 1,
          voice,
          voice_note_index: nextVoiceNoteIndex,
        },
      });
    }
  }
  return indexedNotes;
};

const resolveMeasureNoteSelector = (
  selector: MeasureNoteSelector | undefined,
  indexedNotes: IndexedMeasureNote[],
  selectorName: string
): ResolvedMeasureNoteSelectorResult => {
  if (!selector || typeof selector !== "object") {
    return {
      ok: false,
      message: `${selectorName} must be an object when provided.`,
    };
  }

  const normalized = {
    part_id: selector.part_id == null ? undefined : String(selector.part_id),
    measure_number: selector.measure_number == null ? undefined : String(selector.measure_number),
    measure_note_index: Number.isInteger(selector.measure_note_index) ? Number(selector.measure_note_index) : undefined,
    voice: selector.voice == null ? undefined : String(selector.voice),
    voice_note_index: Number.isInteger(selector.voice_note_index) ? Number(selector.voice_note_index) : undefined,
  };

  const activeKeys = Object.entries(normalized).filter(([, value]) => value !== undefined);
  if (activeKeys.length === 0) {
    return {
      ok: false,
      message: `${selectorName} must include at least one selector field.`,
    };
  }

  const matches = indexedNotes.filter((note) => {
    return activeKeys.every(([key, value]) => note.selector[key as keyof typeof note.selector] === value);
  });

  if (matches.length === 0) {
    return {
      ok: false,
      message: `${selectorName} did not match any note in the current MusicXML state.`,
    };
  }

  if (matches.length > 1) {
    return {
      ok: false,
      message: `${selectorName} matched multiple notes; add more selector fields to disambiguate.`,
    };
  }

  return {
    ok: true,
    nodeId: matches[0].nodeId,
    voice: matches[0].selector.voice,
  };
};

const normalizeCliCommandSelectors = (xmlText: string, command: CoreCommand): CliCommandNormalizationResult => {
  const commandObject = command as Record<string, unknown>;
  const indexedNotes = buildIndexedMeasureNotes(xmlText);
  const nextCommand = { ...commandObject };

  if ("selector" in nextCommand && !("targetNodeId" in nextCommand)) {
    const resolved = resolveMeasureNoteSelector(nextCommand.selector as MeasureNoteSelector | undefined, indexedNotes, "selector");
    if (isResolvedMeasureNoteSelectorFailure(resolved)) {
      return {
        ok: false,
        message: `Failed to resolve CLI command selector: ${resolved.message}`,
      };
    }
    nextCommand.targetNodeId = resolved.nodeId;
    if (!("voice" in nextCommand) && resolved.voice != null) {
      nextCommand.voice = resolved.voice;
    }
  }

  if ("anchor_selector" in nextCommand && !("anchorNodeId" in nextCommand)) {
    const resolved = resolveMeasureNoteSelector(
      nextCommand.anchor_selector as MeasureNoteSelector | undefined,
      indexedNotes,
      "anchor_selector"
    );
    if (isResolvedMeasureNoteSelectorFailure(resolved)) {
      return {
        ok: false,
        message: `Failed to resolve CLI command selector: ${resolved.message}`,
      };
    }
    nextCommand.anchorNodeId = resolved.nodeId;
    if (!("voice" in nextCommand) && resolved.voice != null) {
      nextCommand.voice = resolved.voice;
    }
  }

  delete nextCommand.selector;
  delete nextCommand.anchor_selector;

  return {
    ok: true,
    command: nextCommand as CoreCommand,
  };
};

export const decodeCliMusicXmlInput = async (inputBytes: Uint8Array, inputPath?: string): Promise<CliResult> => {
  const name = lowerFileName(inputPath);
  try {
    if (name.endsWith(".mxl")) {
      return textResult(await extractMusicXmlTextFromMxl(bytesToArrayBuffer(inputBytes)));
    }
    return textResult(decodeUtf8Text(inputBytes));
  } catch (error) {
    return failureResult(`Failed to read MusicXML input: ${caughtErrorMessage(error)}`);
  }
};

export const decodeCliMuseScoreInput = async (inputBytes: Uint8Array, inputPath?: string): Promise<CliResult> => {
  const name = lowerFileName(inputPath);
  try {
    if (name.endsWith(".mscz")) {
      return textResult(await extractTextFromZipByExtensions(
        bytesToArrayBuffer(inputBytes),
        [".mscx"]
      ));
    }
    return textResult(decodeUtf8Text(inputBytes));
  } catch (error) {
    return failureResult(`Failed to read MuseScore input: ${caughtErrorMessage(error)}`);
  }
};

export const encodeCliMusicXmlOutput = async (xmlText: string, outputPath?: string): Promise<CliResult> => {
  const name = lowerFileName(outputPath);
  try {
    if (name.endsWith(".mxl")) {
      return bytesResult(await makeMxlBytes(xmlText));
    }
    return textResult(xmlText);
  } catch (error) {
    return failureResult(`Failed to encode MusicXML output: ${caughtErrorMessage(error)}`);
  }
};

export const encodeCliMuseScoreOutput = async (musescoreText: string, outputPath?: string): Promise<CliResult> => {
  const name = lowerFileName(outputPath);
  try {
    if (name.endsWith(".mscz")) {
      return bytesResult(await makeMsczBytes(formatXmlWithTwoSpaceIndent(musescoreText)));
    }
    return textResult(musescoreText);
  } catch (error) {
    return failureResult(`Failed to encode MuseScore output: ${caughtErrorMessage(error)}`);
  }
};

export const importAbcToMusicXml = async (abcText: string): Promise<CliResult> => {
  return cliResultFromRuntime(await runtime.convert.importToMusicXml({ format: "abc", data: abcText }));
};

export const exportMusicXmlToAbc = async (xmlText: string): Promise<CliResult> => {
  return cliMusicXmlExportResult(await runtime.convert.exportFromMusicXml({ format: "abc", xml: xmlText }));
};

export const importMidiToMusicXml = async (midiBytes: Uint8Array): Promise<CliResult> => {
  return cliResultFromRuntime(await runtime.convert.importToMusicXml({ format: "midi", data: midiBytes }));
};

export const exportMusicXmlToMidi = async (xmlText: string): Promise<CliResult> => {
  return cliMusicXmlExportResult(await runtime.convert.exportFromMusicXml({
    format: "midi",
    xml: xmlText,
    options: { midi: { rawWriter: true } },
  }));
};

export const importMuseScoreToMusicXml = async (musescoreText: string): Promise<CliResult> => {
  return cliResultFromRuntime(await runtime.convert.importToMusicXml({ format: "musescore", data: musescoreText }));
};

export const importMeiToMusicXml = async (meiText: string): Promise<CliResult> => {
  return cliResultFromRuntime(await runtime.convert.importToMusicXml({ format: "mei", data: meiText }));
};

export const exportMusicXmlToMei = async (xmlText: string): Promise<CliResult> => {
  return cliMusicXmlExportResult(await runtime.convert.exportFromMusicXml({ format: "mei", xml: xmlText }));
};

export const importLilyPondToMusicXml = async (lilypondText: string): Promise<CliResult> => {
  return cliResultFromRuntime(await runtime.convert.importToMusicXml({ format: "lilypond", data: lilypondText }));
};

export const exportMusicXmlToLilyPond = async (xmlText: string): Promise<CliResult> => {
  return cliMusicXmlExportResult(await runtime.convert.exportFromMusicXml({ format: "lilypond", xml: xmlText }));
};

export const exportMusicXmlToMuseScore = async (xmlText: string): Promise<CliResult> => {
  return cliMusicXmlExportResult(await runtime.convert.exportFromMusicXml({ format: "musescore", xml: xmlText }));
};

export const renderMusicXmlToSvg = async (xmlText: string): Promise<CliResult> => {
  try {
    await initializeBrowserVerovioCapability(cliVerovioCapability);
  } catch (error) {
    return failureResult(`Failed to render SVG: ${caughtErrorMessage(error)}`);
  }
  const result = runtime.render.renderSvg(xmlText, {
    pageWidth: 20000,
    pageHeight: 3000,
    scale: 40,
    breaks: "none",
    mnumInterval: 1,
    adjustPageHeight: 1,
    footer: "none",
    header: "none",
  });
  return cliMusicXmlExportResult(result);
};

export const summarizeMusicXmlState = (xmlText: string): CliResult => {
  const result = runtime.state.summarize(xmlText);
  if (!result.ok) {
    return {
      ok: false,
      warnings: result.warnings.map((item) => item.message),
      diagnostics: result.diagnostics.map((item) => item.message),
    };
  }
  return jsonTextResult(result.value);
};

export const validateMusicXmlCommand = (xmlText: string, command: CoreCommand): CliResult => {
  try {
    const normalized = normalizeCliCommandSelectors(xmlText, command);
    if (isCliCommandNormalizationFailure(normalized)) return failureResult(normalized.message);
    const result = runtime.state.validateCommand(xmlText, normalized.command);
    if (!result.ok) {
      return {
        ok: false,
        warnings: result.warnings.map((item) => item.message),
        diagnostics: result.diagnostics.map((item) => item.message),
      };
    }
    return jsonTextResult(result.value);
  } catch (error) {
    return failureResult(`Failed to validate MusicXML command: ${caughtErrorMessage(error)}`);
  }
};

export const applyMusicXmlCommand = (xmlText: string, command: CoreCommand): CliResult => {
  try {
    const normalized = normalizeCliCommandSelectors(xmlText, command);
    if (isCliCommandNormalizationFailure(normalized)) return failureResult(normalized.message);
    const result = runtime.state.applyCommand(xmlText, normalized.command);
    if (!result.ok) {
      return {
        ok: false,
        warnings: result.warnings.map((item) => item.message),
        diagnostics: result.diagnostics.map((item) => item.message),
      };
    }
    if (!result.value.ok) return jsonTextResult(result.value);
    return {
      ok: true,
      output: result.value.xml,
      warnings: result.value.warnings.map((item) => item.message),
      diagnostics: [],
    };
  } catch (error) {
    return failureResult(`Failed to apply MusicXML command: ${caughtErrorMessage(error)}`);
  }
};

export const inspectMusicXmlMeasure = (xmlText: string, measureNumber: string): CliResult => {
  const result = runtime.state.inspectMeasure(xmlText, measureNumber);
  if (!result.ok) {
    return {
      ok: false,
      warnings: result.warnings.map((item) => item.message),
      diagnostics: result.diagnostics.map((item) => item.message),
    };
  }
  return jsonTextResult(result.value);
};

export const diffMusicXmlState = (beforeXml: string, afterXml: string): CliResult => {
  const result = runtime.state.diff(beforeXml, afterXml);
  if (!result.ok) {
    return {
      ok: false,
      warnings: result.warnings.map((item) => item.message),
      diagnostics: result.diagnostics.map((item) => item.message),
    };
  }
  return jsonTextResult(result.value);
};

export const cliApi = {
  abc: {
    importToMusicXml: importAbcToMusicXml,
    exportFromMusicXml: exportMusicXmlToAbc,
  },
  fileIO: {
    musicxml: {
      decodeInput: decodeCliMusicXmlInput,
      encodeOutput: encodeCliMusicXmlOutput,
    },
    musescore: {
      decodeInput: decodeCliMuseScoreInput,
      encodeOutput: encodeCliMuseScoreOutput,
    },
  },
  midi: {
    importToMusicXml: importMidiToMusicXml,
    exportFromMusicXml: exportMusicXmlToMidi,
  },
  mei: {
    importToMusicXml: importMeiToMusicXml,
    exportFromMusicXml: exportMusicXmlToMei,
  },
  lilypond: {
    importToMusicXml: importLilyPondToMusicXml,
    exportFromMusicXml: exportMusicXmlToLilyPond,
  },
  musescore: {
    importToMusicXml: importMuseScoreToMusicXml,
    exportFromMusicXml: exportMusicXmlToMuseScore,
  },
  render: {
    svgFromMusicXml: renderMusicXmlToSvg,
  },
  state: {
    summarizeFromMusicXml: summarizeMusicXmlState,
    inspectMeasureFromMusicXml: inspectMusicXmlMeasure,
    validateCommandFromMusicXml: validateMusicXmlCommand,
    applyCommandFromMusicXml: applyMusicXmlCommand,
    diffMusicXmlState,
  },
};
