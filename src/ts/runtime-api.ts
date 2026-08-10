/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import { ScoreCore } from "../../core/ScoreCore";
import type { CoreCommand } from "../../core/interfaces";
import { convertAbcToMusicXml, exportMusicXmlDomToAbc } from "./abc-io";
import { convertLilyPondToMusicXml, exportMusicXmlDomToLilyPond } from "./lilypond-io";
import { convertLoadInputToMusicXml, type LoadInputFormat } from "./load-input";
import { convertMeiToMusicXml, exportMusicXmlDomToMei } from "./mei-io";
import { convertMidiToMusicXml, type MidiWriterRuntime } from "./midi-io";
import {
  applyMusicXmlCommand,
  diffMusicXmlState,
  inspectMusicXmlMeasure,
  summarizeMusicXmlState,
  validateMusicXmlCommand,
  type MusicXmlCommandApplication,
  type MusicXmlCommandOutcome,
  type MusicXmlMeasureInspection,
  type MusicXmlStateDiff,
  type MusicXmlStateSummary,
} from "./musicxml-state";
import { normalizeImportedMusicXmlText, parseMusicXmlDocument } from "./musicxml-io";
import { convertMuseScoreToMusicXml, exportMusicXmlDomToMuseScore } from "./musescore-io";
import { createNewScoreMusicXml, type CreateNewScoreOptions } from "./new-score";
import {
  encodeAbcOutput,
  encodeJsonOutput,
  encodeLilyPondOutput,
  encodeMeiOutput,
  encodeMidiOutput,
  encodeMuseScoreOutput,
  encodeMusicXmlOutput,
  encodeSvgOutput,
  encodeVsqxOutput,
  encodeZipBundleOutput,
  type EncodedOutput,
  type MidiOutputOptions,
} from "./output-encoding";
import { buildPlaybackPlan, type PlaybackPlanOptions, type PlaybackPlanSuccess } from "./playback-model";
import {
  renderMusicXmlDomWithVerovioToolkit,
  type VerovioToolkitApi,
  type XmlDocumentSerializer,
} from "./verovio-render";
import {
  convertMusicXmlToVsqxWithBridge,
  convertVsqxToMusicXmlWithBridge,
  type MusicXmlToVsqxOptions,
  type VsqxConversionBridge,
  type VsqxToMusicXmlOptions,
} from "./vsqx-conversion";

export type { CoreCommand } from "../../core/interfaces";
export type { CreateNewScoreOptions } from "./new-score";
export type { MidiWriterRuntime } from "./midi-io";
export type {
  MusicXmlCommandApplication,
  MusicXmlCommandOutcome,
  MusicXmlMeasureInspection,
  MusicXmlStateDiff,
  MusicXmlStateSummary,
} from "./musicxml-state";
export type { PlaybackPlanOptions, PlaybackPlanSuccess } from "./playback-model";
export type { VerovioToolkitApi, XmlDocumentSerializer } from "./verovio-render";
export type { MusicXmlToVsqxOptions, VsqxConversionBridge, VsqxToMusicXmlOptions } from "./vsqx-conversion";

// scripts/build-browser-runtime.mjs replaces this placeholder from package.json.
export const version = "__MIKU_SCORE_PACKAGE_VERSION__";
export const runtimeApiVersion = "miku-score/runtime-api@1";

export const embeddedModulePaths = Object.freeze([
  "core/ScoreCore.ts",
  "core/accidentalSpelling.ts",
  "core/commands.ts",
  "core/staffClefPolicy.ts",
  "core/timeIndex.ts",
  "core/validators.ts",
  "core/xmlUtils.ts",
  "src/ts/abc-io.ts",
  "src/ts/abc-layout.ts",
  "src/ts/abc-lexer.ts",
  "src/ts/abc-parser.ts",
  "src/ts/beam-common.ts",
  "src/ts/lilypond-io.ts",
  "src/ts/load-input.ts",
  "src/ts/mei-io.ts",
  "src/ts/midi-io.ts",
  "src/ts/midi-musescore-io.ts",
  "src/ts/musescore-io.ts",
  "src/ts/musicxml-io.ts",
  "src/ts/musicxml-state.ts",
  "src/ts/new-score.ts",
  "src/ts/output-encoding.ts",
  "src/ts/playback-model.ts",
  "src/ts/runtime-api.ts",
  "src/ts/score-features/articulations.ts",
  "src/ts/score-features/barlines.ts",
  "src/ts/score-features/clefs.ts",
  "src/ts/score-features/direction-text.ts",
  "src/ts/score-features/durations.ts",
  "src/ts/score-features/dynamics.ts",
  "src/ts/score-features/key-signatures.ts",
  "src/ts/score-features/measure-flow.ts",
  "src/ts/score-features/note-elements.ts",
  "src/ts/score-features/ornaments.ts",
  "src/ts/score-features/pitches.ts",
  "src/ts/score-features/slurs.ts",
  "src/ts/score-features/ties.ts",
  "src/ts/score-features/time-signatures.ts",
  "src/ts/score-features/transposition.ts",
  "src/ts/score-features/tuplets.ts",
  "src/ts/verovio-render.ts",
  "src/ts/vsqx-conversion.ts",
  "src/ts/zip-io.ts",
] as const);

export type RuntimeDiagnostic = { code: string; message: string };

export type RuntimeSuccess<T> = {
  ok: true;
  value: T;
  warnings: RuntimeDiagnostic[];
};

export type RuntimeFailure = {
  ok: false;
  diagnostics: RuntimeDiagnostic[];
  warnings: RuntimeDiagnostic[];
};

export type RuntimeResult<T> = RuntimeSuccess<T> | RuntimeFailure;

export type RuntimeCapabilities = {
  midiWriterRuntime?: MidiWriterRuntime | null;
  vsqxBridge?: VsqxConversionBridge | null;
  verovio?: {
    toolkit: VerovioToolkitApi;
    serializeDocument: XmlDocumentSerializer;
  } | null;
};

export type RuntimeLoadOptions = {
  expectedVersion?: string;
  capabilities?: RuntimeCapabilities;
};

export type RuntimeImportRequest = {
  format: LoadInputFormat;
  data: string | Uint8Array;
};

export type RuntimeScoreExportFormat =
  | "musicxml"
  | "mxl"
  | "abc"
  | "midi"
  | "vsqx"
  | "mei"
  | "lilypond"
  | "musescore"
  | "mscz"
  | "svg";

export type RuntimeSvgRenderOptions = Record<string, unknown>;

export type RuntimeExportRequest = {
  format: RuntimeScoreExportFormat;
  xml: string;
  options?: {
    midi?: Partial<MidiOutputOptions>;
    vsqx?: MusicXmlToVsqxOptions;
    svg?: RuntimeSvgRenderOptions;
  };
};

export type RuntimeArchiveEntry = { path: string; data: EncodedOutput };

export type MikuScoreRuntimeApi = {
  score: {
    createNewMusicXml: (options?: CreateNewScoreOptions) => RuntimeResult<string>;
    loadMusicXml: (xml: string) => RuntimeResult<string>;
    saveMusicXml: (xml: string) => RuntimeResult<string>;
  };
  state: {
    summarize: (xml: string) => RuntimeResult<MusicXmlStateSummary>;
    inspectMeasure: (xml: string, measureNumber: string) => RuntimeResult<MusicXmlMeasureInspection>;
    validateCommand: (xml: string, command: CoreCommand) => RuntimeResult<MusicXmlCommandOutcome>;
    applyCommand: (xml: string, command: CoreCommand) => RuntimeResult<MusicXmlCommandApplication>;
    diff: (beforeXml: string, afterXml: string) => RuntimeResult<MusicXmlStateDiff>;
  };
  convert: {
    importToMusicXml: (request: RuntimeImportRequest) => Promise<RuntimeResult<string>>;
    exportFromMusicXml: (request: RuntimeExportRequest) => Promise<RuntimeResult<EncodedOutput>>;
  };
  output: {
    encodeMusicXml: (xml: string, options?: { compressed?: boolean }) => Promise<RuntimeResult<EncodedOutput>>;
    encodeZipBundle: (entries: RuntimeArchiveEntry[], options?: { compressed?: boolean }) => Promise<RuntimeResult<Uint8Array>>;
    encodeSvg: (svg: string) => RuntimeResult<string>;
    encodeJson: (json: string) => RuntimeResult<string>;
    encodeVsqx: (vsqx: string) => RuntimeResult<string>;
  };
  playback: {
    buildPlan: (xml: string, options: PlaybackPlanOptions) => RuntimeResult<PlaybackPlanSuccess>;
  };
  render: {
    renderSvg: (xml: string, options?: RuntimeSvgRenderOptions) => RuntimeResult<string>;
  };
};

class RuntimeConfigurationError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = "RuntimeConfigurationError";
    this.code = code;
  }
}

type NormalizedCapabilities = {
  midiWriterRuntime: MidiWriterRuntime | null;
  vsqxBridge: VsqxConversionBridge | null;
  verovio: NonNullable<RuntimeCapabilities["verovio"]> | null;
};

const success = <T>(value: T, warnings: RuntimeDiagnostic[] = []): RuntimeSuccess<T> => ({
  ok: true,
  value,
  warnings,
});

const failure = (diagnostics: RuntimeDiagnostic[], warnings: RuntimeDiagnostic[] = []): RuntimeFailure => ({
  ok: false,
  diagnostics,
  warnings,
});

const diagnostic = (code: string, message: string): RuntimeDiagnostic => ({ code, message });

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

const withRuntimeResult = <T>(
  operation: () => T,
  failureCode = "MKS_CONVERSION_FAILED"
): RuntimeResult<T> => {
  try {
    return success(operation());
  } catch (error) {
    return failure([diagnostic(failureCode, errorMessage(error))]);
  }
};

const withAsyncRuntimeResult = async <T>(
  operation: () => Promise<T>,
  failureCode = "MKS_CONVERSION_FAILED"
): Promise<RuntimeResult<T>> => {
  try {
    return success(await operation());
  } catch (error) {
    return failure([diagnostic(failureCode, errorMessage(error))]);
  }
};

const normalizeCapabilities = (capabilities: RuntimeCapabilities | undefined): NormalizedCapabilities => ({
  midiWriterRuntime: capabilities?.midiWriterRuntime ?? null,
  vsqxBridge: capabilities?.vsqxBridge ?? null,
  verovio: capabilities?.verovio ?? null,
});

const sameCapabilities = (left: NormalizedCapabilities, right: NormalizedCapabilities): boolean => {
  return left.midiWriterRuntime === right.midiWriterRuntime &&
    left.vsqxBridge === right.vsqxBridge &&
    left.verovio === right.verovio;
};

const defaultSvgRenderOptions = (): RuntimeSvgRenderOptions => ({
  pageWidth: 20000,
  pageHeight: 3000,
  scale: 40,
  breaks: "none",
  mnumInterval: 1,
  adjustPageHeight: 1,
  footer: "none",
  header: "none",
});

const createRuntimeApi = (capabilities: NormalizedCapabilities): MikuScoreRuntimeApi => {
  const importToMusicXml = async (request: RuntimeImportRequest): Promise<RuntimeResult<string>> => {
    if (request.format === "vsqx" && !capabilities.vsqxBridge) {
      return failure([diagnostic(
        "MKS_CAPABILITY_VSQX_UNAVAILABLE",
        "VSQX import requires an injected VSQX bridge capability."
      )]);
    }
    try {
      const converted = await convertLoadInputToMusicXml(request, {
        convertAbcToMusicXml,
        convertMeiToMusicXml,
        convertLilyPondToMusicXml,
        convertMuseScoreToMusicXml,
        formatImportedMusicXml: normalizeImportedMusicXmlText,
        convertVsqxToMusicXml: (vsqxText) =>
          convertVsqxToMusicXmlWithBridge(capabilities.vsqxBridge, vsqxText),
        convertMidiToMusicXml,
      });
      if (!converted.ok) {
        return failure(
          converted.diagnostics.length > 0
            ? converted.diagnostics
            : [diagnostic("MKS_INPUT_INVALID", converted.diagnosticMessage)],
          converted.warnings
        );
      }
      return success(converted.xml, converted.warnings);
    } catch (error) {
      return failure([diagnostic("MKS_CONVERSION_FAILED", errorMessage(error))]);
    }
  };

  const exportFromMusicXml = async (request: RuntimeExportRequest): Promise<RuntimeResult<EncodedOutput>> => {
    const doc = parseMusicXmlDocument(request.xml);
    if (!doc) {
      return failure([diagnostic("MKS_MUSICXML_INVALID", "Input is not a valid MusicXML document.")]);
    }
    const midiOptions = request.options?.midi ?? {};
    if (request.format === "midi" && midiOptions.rawWriter === false && !capabilities.midiWriterRuntime) {
      return failure([diagnostic(
        "MKS_CAPABILITY_MIDI_WRITER_UNAVAILABLE",
        "The selected MIDI export profile requires an injected MIDI writer capability."
      )]);
    }
    if (request.format === "vsqx" && !capabilities.vsqxBridge) {
      return failure([diagnostic(
        "MKS_CAPABILITY_VSQX_UNAVAILABLE",
        "VSQX export requires an injected VSQX bridge capability."
      )]);
    }
    if (request.format === "svg" && !capabilities.verovio) {
      return failure([diagnostic(
        "MKS_CAPABILITY_VEROVIO_UNAVAILABLE",
        "SVG rendering requires an injected Verovio capability."
      )]);
    }

    return withAsyncRuntimeResult(async () => {
      switch (request.format) {
        case "musicxml":
          return encodeMusicXmlOutput(request.xml);
        case "mxl":
          return encodeMusicXmlOutput(request.xml, { compressed: true });
        case "abc": {
          const output = encodeAbcOutput(request.xml, exportMusicXmlDomToAbc);
          if (output === null) throw new Error("Failed to export ABC.");
          return output;
        }
        case "midi": {
          const output = encodeMidiOutput(request.xml, {
            ticksPerQuarter: midiOptions.ticksPerQuarter ?? 480,
            programPreset: midiOptions.programPreset ?? "electric_piano_2",
            exportProfile: midiOptions.exportProfile ?? "safe",
            keepRoundtripMetadata: midiOptions.keepRoundtripMetadata ?? true,
            rawWriter: midiOptions.rawWriter ?? !capabilities.midiWriterRuntime,
            midiWriterRuntime: capabilities.midiWriterRuntime,
            forceProgramPreset: midiOptions.forceProgramPreset,
            graceTimingMode: midiOptions.graceTimingMode,
            metricAccentEnabled: midiOptions.metricAccentEnabled,
            metricAccentProfile: midiOptions.metricAccentProfile,
          });
          if (output === null) throw new Error("Failed to export MIDI: no playable note events found.");
          return output;
        }
        case "vsqx": {
          const output = convertMusicXmlToVsqxWithBridge(
            capabilities.vsqxBridge,
            request.xml,
            request.options?.vsqx
          );
          if (!output.ok) throw new Error(output.diagnostic?.message ?? "Failed to export VSQX.");
          return encodeVsqxOutput(output.vsqx);
        }
        case "mei": {
          const output = encodeMeiOutput(request.xml, exportMusicXmlDomToMei);
          if (output === null) throw new Error("Failed to export MEI.");
          return output;
        }
        case "lilypond": {
          const output = encodeLilyPondOutput(request.xml, exportMusicXmlDomToLilyPond);
          if (output === null) throw new Error("Failed to export LilyPond.");
          return output;
        }
        case "musescore":
        case "mscz": {
          const output = await encodeMuseScoreOutput(request.xml, exportMusicXmlDomToMuseScore, {
            compressed: request.format === "mscz",
          });
          if (output === null) throw new Error("Failed to export MuseScore.");
          return output;
        }
        case "svg":
          return renderMusicXmlDomWithVerovioToolkit(
            doc,
            { ...defaultSvgRenderOptions(), ...request.options?.svg },
            capabilities.verovio!.toolkit,
            capabilities.verovio!.serializeDocument
          ).svg;
      }
    }, "MKS_OUTPUT_FAILED");
  };

  return Object.freeze({
    score: Object.freeze({
      createNewMusicXml: (options: CreateNewScoreOptions = {}) =>
        withRuntimeResult(() => createNewScoreMusicXml(options), "MKS_INPUT_INVALID"),
      loadMusicXml: (xml: string) => withRuntimeResult(() => {
        const core = new ScoreCore();
        core.load(xml);
        return core.save().xml;
      }, "MKS_MUSICXML_INVALID"),
      saveMusicXml: (xml: string) => withRuntimeResult(() => {
        const core = new ScoreCore();
        core.load(xml);
        const saved = core.save();
        if (!saved.ok) throw new Error(saved.diagnostics[0]?.message ?? "Failed to save MusicXML.");
        return saved.xml;
      }, "MKS_MUSICXML_INVALID"),
    }),
    state: Object.freeze({
      summarize: (xml: string) => withRuntimeResult(
        () => summarizeMusicXmlState(xml),
        "MKS_MUSICXML_INVALID"
      ),
      inspectMeasure: (xml: string, measureNumber: string) =>
        withRuntimeResult(() => inspectMusicXmlMeasure(xml, measureNumber), "MKS_MUSICXML_INVALID"),
      validateCommand: (xml: string, command: CoreCommand) =>
        withRuntimeResult(() => validateMusicXmlCommand(xml, command), "MKS_MUSICXML_INVALID"),
      applyCommand: (xml: string, command: CoreCommand) =>
        withRuntimeResult(() => applyMusicXmlCommand(xml, command), "MKS_MUSICXML_INVALID"),
      diff: (beforeXml: string, afterXml: string) =>
        withRuntimeResult(() => diffMusicXmlState(beforeXml, afterXml), "MKS_MUSICXML_INVALID"),
    }),
    convert: Object.freeze({ importToMusicXml, exportFromMusicXml }),
    output: Object.freeze({
      encodeMusicXml: (xml: string, options: { compressed?: boolean } = {}) =>
        withAsyncRuntimeResult(() => encodeMusicXmlOutput(xml, options), "MKS_OUTPUT_FAILED"),
      encodeZipBundle: (entries: RuntimeArchiveEntry[], options: { compressed?: boolean } = {}) =>
        withAsyncRuntimeResult(() => encodeZipBundleOutput(entries, options), "MKS_OUTPUT_FAILED"),
      encodeSvg: (svg: string) => withRuntimeResult(() => encodeSvgOutput(svg), "MKS_OUTPUT_FAILED"),
      encodeJson: (json: string) => withRuntimeResult(() => encodeJsonOutput(json), "MKS_OUTPUT_FAILED"),
      encodeVsqx: (vsqx: string) => withRuntimeResult(() => encodeVsqxOutput(vsqx), "MKS_OUTPUT_FAILED"),
    }),
    playback: Object.freeze({
      buildPlan: (xml: string, options: PlaybackPlanOptions): RuntimeResult<PlaybackPlanSuccess> => {
        const plan = buildPlaybackPlan(xml, options);
        if (!plan.ok) {
          return failure([diagnostic(
            plan.code === "INVALID_MUSICXML" ? "MKS_MUSICXML_INVALID" : "MKS_CONVERSION_FAILED",
            plan.message
          )]);
        }
        return success(plan);
      },
    }),
    render: Object.freeze({
      renderSvg: (xml: string, options: RuntimeSvgRenderOptions = {}): RuntimeResult<string> => {
        if (!capabilities.verovio) {
          return failure([diagnostic(
            "MKS_CAPABILITY_VEROVIO_UNAVAILABLE",
            "SVG rendering requires an injected Verovio capability."
          )]);
        }
        const doc = parseMusicXmlDocument(xml);
        if (!doc) {
          return failure([diagnostic("MKS_MUSICXML_INVALID", "Input is not a valid MusicXML document.")]);
        }
        return withRuntimeResult(() => renderMusicXmlDomWithVerovioToolkit(
          doc,
          { ...defaultSvgRenderOptions(), ...options },
          capabilities.verovio!.toolkit,
          capabilities.verovio!.serializeDocument
        ).svg);
      },
    }),
  });
};

let initializedCapabilities: NormalizedCapabilities | null = null;
let initializedRuntime: MikuScoreRuntimeApi | null = null;

export const loadMikuScoreRuntime = (options: RuntimeLoadOptions = {}): MikuScoreRuntimeApi => {
  if (options.expectedVersion !== undefined && options.expectedVersion !== version) {
    throw new RuntimeConfigurationError(
      "MKS_RUNTIME_VERSION_MISMATCH",
      `Expected miku-score runtime ${options.expectedVersion}, but loaded ${version}.`
    );
  }
  const capabilities = normalizeCapabilities(options.capabilities);
  if (initializedRuntime && initializedCapabilities) {
    if (!sameCapabilities(initializedCapabilities, capabilities)) {
      throw new RuntimeConfigurationError(
        "MKS_RUNTIME_CAPABILITIES_FIXED",
        "miku-score runtime capabilities were already fixed by the first successful load."
      );
    }
    return initializedRuntime;
  }
  initializedCapabilities = capabilities;
  initializedRuntime = createRuntimeApi(capabilities);
  return initializedRuntime;
};

export default loadMikuScoreRuntime;
