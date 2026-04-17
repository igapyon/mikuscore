/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import { convertAbcToMusicXml, exportMusicXmlDomToAbc } from "./abc-io";
import {
  buildMidiBytesForPlayback,
  buildPlaybackEventsFromMusicXmlDoc,
  collectLeadingPickupTicksFromMusicXmlDoc,
  collectMidiControlEventsFromMusicXmlDoc,
  collectMidiKeySignatureEventsFromMusicXmlDoc,
  collectMidiProgramOverridesFromMusicXmlDoc,
  collectMidiTempoEventsFromMusicXmlDoc,
  collectMidiTimeSignatureEventsFromMusicXmlDoc,
  convertMidiToMusicXml,
} from "./midi-io";
import { normalizeImportedMusicXmlText, parseMusicXmlDocument } from "./musicxml-io";
import { convertMuseScoreToMusicXml, exportMusicXmlDomToMuseScore } from "./musescore-io";
import { renderMusicXmlDomToSvg } from "./verovio-out";
import {
  bytesToArrayBuffer,
  extractMusicXmlTextFromMxl,
  extractTextFromZipByExtensions,
  formatXmlWithTwoSpaceIndent,
  makeMsczBytes,
  makeMxlBytes,
} from "./zip-io";
import { ScoreCore } from "../../core/ScoreCore";
import type { CoreCommand } from "../../core/interfaces";
import { getDurationValue, getVoiceText, parseXml as parseCoreXml, reindexNodeIds } from "../../core/xmlUtils";

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

const decodeUtf8Text = (bytes: Uint8Array): string => {
  return new TextDecoder("utf-8").decode(bytes);
};

export const decodeCliMusicXmlInput = async (inputBytes: Uint8Array, inputPath?: string): Promise<CliResult> => {
  const name = lowerFileName(inputPath);
  try {
    if (name.endsWith(".mxl")) {
      return textResult(await extractMusicXmlTextFromMxl(bytesToArrayBuffer(inputBytes)));
    }
    return textResult(decodeUtf8Text(inputBytes));
  } catch (error) {
    return failureResult(`Failed to read MusicXML input: ${error instanceof Error ? error.message : String(error)}`);
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
    return failureResult(`Failed to read MuseScore input: ${error instanceof Error ? error.message : String(error)}`);
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
    return failureResult(`Failed to encode MusicXML output: ${error instanceof Error ? error.message : String(error)}`);
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
    return failureResult(`Failed to encode MuseScore output: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const importAbcToMusicXml = (abcText: string): CliResult => {
  try {
    const xmlText = normalizeImportedMusicXmlText(convertAbcToMusicXml(abcText));
    return {
      ok: true,
      output: xmlText,
      warnings: [],
      diagnostics: [],
    };
  } catch (error) {
    return {
      ok: false,
      warnings: [],
      diagnostics: [`Failed to parse ABC: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
};

export const exportMusicXmlToAbc = (xmlText: string): CliResult => {
  const doc = parseMusicXmlDocument(xmlText);
  if (!doc) {
    return {
      ok: false,
      warnings: [],
      diagnostics: ["Failed to parse MusicXML: input is not a valid MusicXML document."],
    };
  }

  try {
    return {
      ok: true,
      output: exportMusicXmlDomToAbc(doc),
      warnings: [],
      diagnostics: [],
    };
  } catch (error) {
    return {
      ok: false,
      warnings: [],
      diagnostics: [`Failed to export ABC: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
};

export const importMidiToMusicXml = (midiBytes: Uint8Array): CliResult => {
  const result = convertMidiToMusicXml(midiBytes);
  if (!result.ok) {
    return {
      ok: false,
      warnings: result.warnings.map((item) => item.message),
      diagnostics: result.diagnostics.map((item) => item.message),
    };
  }
  return {
    ok: true,
    output: normalizeImportedMusicXmlText(result.xml),
    warnings: result.warnings.map((item) => item.message),
    diagnostics: result.diagnostics.map((item) => item.message),
  };
};

export const exportMusicXmlToMidi = (xmlText: string): CliResult => {
  const doc = parseMusicXmlDocument(xmlText);
  if (!doc) {
    return {
      ok: false,
      warnings: [],
      diagnostics: ["Failed to parse MusicXML: input is not a valid MusicXML document."],
    };
  }

  try {
    const ticksPerQuarter = 480;
    const parsedPlayback = buildPlaybackEventsFromMusicXmlDoc(doc, ticksPerQuarter, {
      mode: "midi",
    });
    if (parsedPlayback.events.length === 0) {
      return {
        ok: false,
        warnings: [],
        diagnostics: ["Failed to export MIDI: no playable note events found."],
      };
    }
    const midiBytes = buildMidiBytesForPlayback(
      parsedPlayback.events,
      parsedPlayback.tempo,
      "electric_piano_2",
      collectMidiProgramOverridesFromMusicXmlDoc(doc),
      collectMidiControlEventsFromMusicXmlDoc(doc, ticksPerQuarter),
      collectMidiTempoEventsFromMusicXmlDoc(doc, ticksPerQuarter),
      collectMidiTimeSignatureEventsFromMusicXmlDoc(doc, ticksPerQuarter),
      collectMidiKeySignatureEventsFromMusicXmlDoc(doc, ticksPerQuarter),
      {
        embedMksSysEx: true,
        emitMksTextMeta: true,
        ticksPerQuarter,
        rawWriter: true,
        metadata: {
          title:
            doc.querySelector("score-partwise > work > work-title")?.textContent?.trim() ??
            doc.querySelector("score-partwise > movement-title")?.textContent?.trim() ??
            "",
          movementTitle: doc.querySelector("score-partwise > movement-title")?.textContent?.trim() ?? "",
          composer:
            doc.querySelector('score-partwise > identification > creator[type="composer"]')?.textContent?.trim() ??
            doc.querySelector("score-partwise > identification > creator")?.textContent?.trim() ??
            "",
          pickupTicks: collectLeadingPickupTicksFromMusicXmlDoc(doc, ticksPerQuarter),
        },
      }
    );
    return {
      ok: true,
      output: midiBytes,
      warnings: [],
      diagnostics: [],
    };
  } catch (error) {
    return {
      ok: false,
      warnings: [],
      diagnostics: [`Failed to export MIDI: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
};

export const importMuseScoreToMusicXml = (musescoreText: string): CliResult => {
  try {
    return {
      ok: true,
      output: normalizeImportedMusicXmlText(convertMuseScoreToMusicXml(musescoreText)),
      warnings: [],
      diagnostics: [],
    };
  } catch (error) {
    return {
      ok: false,
      warnings: [],
      diagnostics: [`Failed to parse MuseScore: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
};

export const exportMusicXmlToMuseScore = (xmlText: string): CliResult => {
  const doc = parseMusicXmlDocument(xmlText);
  if (!doc) {
    return {
      ok: false,
      warnings: [],
      diagnostics: ["Failed to parse MusicXML: input is not a valid MusicXML document."],
    };
  }

  try {
    return {
      ok: true,
      output: exportMusicXmlDomToMuseScore(doc),
      warnings: [],
      diagnostics: [],
    };
  } catch (error) {
    return {
      ok: false,
      warnings: [],
      diagnostics: [`Failed to export MuseScore: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
};

export const renderMusicXmlToSvg = async (xmlText: string): Promise<CliResult> => {
  const doc = parseMusicXmlDocument(xmlText);
  if (!doc) {
    return {
      ok: false,
      warnings: [],
      diagnostics: ["Failed to parse MusicXML: input is not a valid MusicXML document."],
    };
  }

  try {
    const { svg } = await renderMusicXmlDomToSvg(doc, {
      pageWidth: 20000,
      pageHeight: 3000,
      scale: 40,
      breaks: "none",
      mnumInterval: 1,
      adjustPageHeight: 1,
      footer: "none",
      header: "none",
    });
    return {
      ok: true,
      output: svg,
      warnings: [],
      diagnostics: [],
    };
  } catch (error) {
    return {
      ok: false,
      warnings: [],
      diagnostics: [`Failed to render SVG: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
};

export const summarizeMusicXmlState = (xmlText: string): CliResult => {
  const doc = parseMusicXmlDocument(xmlText);
  if (!doc) {
    return {
      ok: false,
      warnings: [],
      diagnostics: ["Failed to parse MusicXML: input is not a valid MusicXML document."],
    };
  }

  try {
    const parts = Array.from(doc.querySelectorAll("score-partwise > part"));
    const measures = Array.from(doc.querySelectorAll("score-partwise > part > measure"));
    const measureNumbers = Array.from(
      new Set(
        measures
          .map((measure) => measure.getAttribute("number")?.trim() ?? "")
          .filter((value) => value.length > 0)
      )
    );
    const voices = Array.from(
      new Set(
        Array.from(doc.querySelectorAll("score-partwise > part > measure > note > voice"))
          .map((voice) => voice.textContent?.trim() ?? "")
          .filter((value) => value.length > 0)
      )
    );
    const summary = {
      kind: "musicxml_state_summary",
      title:
        doc.querySelector("score-partwise > work > work-title")?.textContent?.trim() ??
        doc.querySelector("score-partwise > movement-title")?.textContent?.trim() ??
        null,
      part_count: parts.length,
      measure_count: measures.length,
      measure_numbers: measureNumbers,
      voices,
    };
    return {
      ok: true,
      output: `${JSON.stringify(summary, null, 2)}\n`,
      warnings: [],
      diagnostics: [],
    };
  } catch (error) {
    return {
      ok: false,
      warnings: [],
      diagnostics: [`Failed to summarize MusicXML state: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
};

export const validateMusicXmlCommand = (xmlText: string, command: CoreCommand): CliResult => {
  try {
    const core = new ScoreCore();
    core.load(xmlText);
    const result = core.dispatch(command);
    return {
      ok: true,
      output: `${JSON.stringify(
        {
          kind: "musicxml_command_validation",
          ok: result.ok,
          dirty_changed: result.dirtyChanged,
          changed_node_ids: result.changedNodeIds,
          affected_measure_numbers: result.affectedMeasureNumbers,
          warnings: result.warnings,
          diagnostics: result.diagnostics,
        },
        null,
        2
      )}\n`,
      warnings: [],
      diagnostics: [],
    };
  } catch (error) {
    return {
      ok: false,
      warnings: [],
      diagnostics: [`Failed to validate MusicXML command: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
};

export const applyMusicXmlCommand = (xmlText: string, command: CoreCommand): CliResult => {
  try {
    const core = new ScoreCore();
    core.load(xmlText);
    const result = core.dispatch(command);
    if (!result.ok) {
      return {
        ok: true,
        output: `${JSON.stringify(
          {
            kind: "musicxml_command_apply",
            ok: false,
            changed_node_ids: result.changedNodeIds,
            affected_measure_numbers: result.affectedMeasureNumbers,
            warnings: result.warnings,
            diagnostics: result.diagnostics,
          },
          null,
          2
        )}\n`,
        warnings: [],
        diagnostics: [],
      };
    }

    const saved = core.save();
    if (!saved.ok) {
      return {
        ok: false,
        warnings: [],
        diagnostics: saved.diagnostics.map((item) => item.message),
      };
    }

    return {
      ok: true,
      output: saved.xml,
      warnings: result.warnings.map((item) => item.message),
      diagnostics: [],
    };
  } catch (error) {
    return {
      ok: false,
      warnings: [],
      diagnostics: [`Failed to apply MusicXML command: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
};

export const inspectMusicXmlMeasure = (xmlText: string, measureNumber: string): CliResult => {
  try {
    const doc = parseCoreXml(xmlText);
    const nodeToId = new WeakMap();
    const idToNode = new Map();
    let sequence = 0;
    reindexNodeIds(doc, nodeToId, idToNode, () => {
      sequence += 1;
      return `n${sequence}`;
    });

    const measures = Array.from(doc.querySelectorAll("score-partwise > part > measure"))
      .filter((measure) => (measure.getAttribute("number")?.trim() ?? "") === measureNumber);

    const summary = {
      kind: "musicxml_measure_inspection",
      measure_number: measureNumber,
      measures: measures.map((measure) => {
        const part = measure.parentElement;
        const partId = part?.getAttribute("id")?.trim() ?? null;
        const voiceNoteCounts = new Map<string, number>();
        const notes = Array.from(measure.querySelectorAll(":scope > note")).map((note, noteIndex) => {
          const nodeId = nodeToId.get(note) ?? null;
          const voice = getVoiceText(note);
          const step = note.querySelector(":scope > pitch > step")?.textContent?.trim() ?? null;
          const octaveText = note.querySelector(":scope > pitch > octave")?.textContent?.trim() ?? null;
          const alterText = note.querySelector(":scope > pitch > alter")?.textContent?.trim() ?? null;
          const alter = alterText === null ? null : Number(alterText);
          const voiceKey = voice ?? "__none__";
          const nextVoiceNoteIndex = (voiceNoteCounts.get(voiceKey) ?? 0) + 1;
          voiceNoteCounts.set(voiceKey, nextVoiceNoteIndex);
          return {
            node_id: nodeId,
            selector: {
              part_id: partId,
              measure_number: measureNumber,
              measure_note_index: noteIndex + 1,
              voice,
              voice_note_index: nextVoiceNoteIndex,
            },
            voice,
            duration: getDurationValue(note),
            is_rest: note.querySelector(":scope > rest") !== null,
            pitch: step && octaveText
              ? {
                step,
                alter: Number.isFinite(alter) ? alter : null,
                octave: Number(octaveText),
              }
              : null,
          };
        });
        return {
          part_id: partId,
          note_count: notes.length,
          notes,
        };
      }),
    };

    return {
      ok: true,
      output: `${JSON.stringify(summary, null, 2)}\n`,
      warnings: [],
      diagnostics: [],
    };
  } catch (error) {
    return {
      ok: false,
      warnings: [],
      diagnostics: [`Failed to inspect MusicXML measure: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
};

const buildMusicXmlStateSummaryObject = (doc: Document) => {
  const parts = Array.from(doc.querySelectorAll("score-partwise > part"));
  const measures = Array.from(doc.querySelectorAll("score-partwise > part > measure"));
  const notes = Array.from(doc.querySelectorAll("score-partwise > part > measure > note"));
  return {
    title:
      doc.querySelector("score-partwise > work > work-title")?.textContent?.trim() ??
      doc.querySelector("score-partwise > movement-title")?.textContent?.trim() ??
      null,
    part_count: parts.length,
    measure_count: measures.length,
    note_count: notes.length,
    measure_numbers: Array.from(
      new Set(
        measures
          .map((measure) => measure.getAttribute("number")?.trim() ?? "")
          .filter((value) => value.length > 0)
      )
    ),
  };
};

export const diffMusicXmlState = (beforeXml: string, afterXml: string): CliResult => {
  try {
    const beforeDoc = parseCoreXml(beforeXml);
    const afterDoc = parseCoreXml(afterXml);
    const beforeSummary = buildMusicXmlStateSummaryObject(beforeDoc);
    const afterSummary = buildMusicXmlStateSummaryObject(afterDoc);

    const changedFields = Object.keys(beforeSummary).filter((key) => {
      return JSON.stringify(beforeSummary[key as keyof typeof beforeSummary]) !==
        JSON.stringify(afterSummary[key as keyof typeof afterSummary]);
    });

    const diff = {
      kind: "musicxml_state_diff",
      changed: changedFields.length > 0,
      changed_fields: changedFields,
      before: beforeSummary,
      after: afterSummary,
    };

    return {
      ok: true,
      output: `${JSON.stringify(diff, null, 2)}\n`,
      warnings: [],
      diagnostics: [],
    };
  } catch (error) {
    return {
      ok: false,
      warnings: [],
      diagnostics: [`Failed to diff MusicXML state: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
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
