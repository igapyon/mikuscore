/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  bytesToArrayBuffer,
  extractMusicXmlTextFromMxl,
  extractTextFromZipByExtensions,
} from "./zip-io";

export type LoadInputFormat =
  | "musicxml"
  | "mxl"
  | "abc"
  | "midi"
  | "vsqx"
  | "mei"
  | "lilypond"
  | "musescore"
  | "mscz";

export type LoadInputDiagnostic = {
  code: string;
  message: string;
};

export type LoadInputConversionResult = {
  ok: boolean;
  xml: string;
  diagnostics: LoadInputDiagnostic[];
  warnings: LoadInputDiagnostic[];
};

export type LoadInputConverters = {
  convertAbcToMusicXml: (abcSource: string) => string;
  convertMeiToMusicXml: (meiSource: string) => string;
  convertLilyPondToMusicXml: (lilySource: string) => string;
  convertMuseScoreToMusicXml: (musescoreSource: string) => string;
  formatImportedMusicXml: (xml: string) => string;
  convertVsqxToMusicXml: (vsqxSource: string) => LoadInputConversionResult;
  convertMidiToMusicXml: (midiBytes: Uint8Array) => LoadInputConversionResult;
};

export type LoadInputRequest = {
  format: LoadInputFormat;
  data: string | Uint8Array;
};

export type LoadInputSuccess = {
  ok: true;
  xml: string;
  diagnostics: LoadInputDiagnostic[];
  warnings: LoadInputDiagnostic[];
};

export type LoadInputFailure = {
  ok: false;
  diagnosticCode: "MVP_INVALID_COMMAND_PAYLOAD";
  diagnosticMessage: string;
  diagnostics: LoadInputDiagnostic[];
  warnings: LoadInputDiagnostic[];
};

export type LoadInputResult = LoadInputSuccess | LoadInputFailure;

const success = (
  xml: string,
  diagnostics: LoadInputDiagnostic[] = [],
  warnings: LoadInputDiagnostic[] = []
): LoadInputSuccess => ({
  ok: true,
  xml,
  diagnostics,
  warnings,
});

const failure = (
  message: string,
  diagnostics: LoadInputDiagnostic[] = [],
  warnings: LoadInputDiagnostic[] = []
): LoadInputFailure => {
  const normalizedDiagnostics = diagnostics.length > 0
    ? diagnostics
    : [{ code: "MVP_INVALID_COMMAND_PAYLOAD", message }];
  return {
    ok: false,
    diagnosticCode: "MVP_INVALID_COMMAND_PAYLOAD",
    diagnosticMessage: message,
    diagnostics: normalizedDiagnostics,
    warnings,
  };
};

const errorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

const looksLikeScorePartwise = (xmlText: string): boolean => {
  return /<\s*score-partwise(?:\s|>)/i.test(xmlText);
};

const requireText = (request: LoadInputRequest): string | LoadInputFailure => {
  if (typeof request.data === "string") return request.data;
  return failure(`Expected text input for ${request.format}.`);
};

const requireBytes = (request: LoadInputRequest): Uint8Array | LoadInputFailure => {
  if (request.data instanceof Uint8Array) return request.data;
  return failure(`Expected binary input for ${request.format}.`);
};

const isFailure = (value: string | Uint8Array | LoadInputFailure): value is LoadInputFailure => {
  return typeof value === "object" && !(value instanceof Uint8Array) && "ok" in value && value.ok === false;
};

const formatConvertedXml = (
  xml: string,
  converters: LoadInputConverters,
  diagnostics: LoadInputDiagnostic[] = [],
  warnings: LoadInputDiagnostic[] = []
): LoadInputSuccess => {
  return success(converters.formatImportedMusicXml(xml), diagnostics, warnings);
};

const structuredConversionFailure = (
  label: string,
  converted: LoadInputConversionResult
): LoadInputFailure => {
  const first = converted.diagnostics[0];
  const detail = first ? `${first.message} (${first.code})` : "Unknown parse error.";
  return failure(`Failed to parse ${label}: ${detail}`, converted.diagnostics, converted.warnings);
};

export const convertLoadInputToMusicXml = async (
  request: LoadInputRequest,
  converters: LoadInputConverters
): Promise<LoadInputResult> => {
  if (request.format === "musicxml") {
    const source = requireText(request);
    if (isFailure(source)) return source;
    try {
      return formatConvertedXml(source, converters);
    } catch (error) {
      return failure(`Failed to parse MusicXML: ${errorMessage(error)}`);
    }
  }

  if (request.format === "mxl") {
    const bytes = requireBytes(request);
    if (isFailure(bytes)) return bytes;
    try {
      const source = await extractMusicXmlTextFromMxl(bytesToArrayBuffer(bytes));
      return formatConvertedXml(source, converters);
    } catch (error) {
      return failure(`Failed to parse MXL: ${errorMessage(error)}`);
    }
  }

  if (request.format === "midi") {
    const bytes = requireBytes(request);
    if (isFailure(bytes)) return bytes;
    try {
      const converted = converters.convertMidiToMusicXml(bytes);
      if (!converted.ok) return structuredConversionFailure("MIDI", converted);
      return formatConvertedXml(
        converted.xml,
        converters,
        converted.diagnostics,
        converted.warnings
      );
    } catch (error) {
      return failure(`Failed to parse MIDI: ${errorMessage(error)}`);
    }
  }

  if (request.format === "mscz") {
    const bytes = requireBytes(request);
    if (isFailure(bytes)) return bytes;
    const archiveBuffer = bytesToArrayBuffer(bytes);
    try {
      try {
        const mscxText = await extractTextFromZipByExtensions(archiveBuffer, [".mscx"]);
        return formatConvertedXml(converters.convertMuseScoreToMusicXml(mscxText), converters);
      } catch {
        const source = await extractMusicXmlTextFromMxl(archiveBuffer);
        if (looksLikeScorePartwise(source)) {
          return formatConvertedXml(source, converters);
        }
        return formatConvertedXml(converters.convertMuseScoreToMusicXml(source), converters);
      }
    } catch (error) {
      return failure(`Failed to parse MuseScore: ${errorMessage(error)}`);
    }
  }

  if (request.format === "vsqx") {
    const source = requireText(request);
    if (isFailure(source)) return source;
    try {
      const converted = converters.convertVsqxToMusicXml(source);
      if (!converted.ok) return structuredConversionFailure("VSQX", converted);
      return formatConvertedXml(
        converted.xml,
        converters,
        converted.diagnostics,
        converted.warnings
      );
    } catch (error) {
      return failure(`Failed to parse VSQX: ${errorMessage(error)}`);
    }
  }

  const textSource = requireText(request);
  if (isFailure(textSource)) return textSource;

  try {
    if (request.format === "abc") {
      return formatConvertedXml(converters.convertAbcToMusicXml(textSource), converters);
    }
    if (request.format === "mei") {
      return formatConvertedXml(converters.convertMeiToMusicXml(textSource), converters);
    }
    if (request.format === "lilypond") {
      return formatConvertedXml(converters.convertLilyPondToMusicXml(textSource), converters);
    }
    if (request.format === "musescore") {
      return formatConvertedXml(converters.convertMuseScoreToMusicXml(textSource), converters);
    }
  } catch (error) {
    const label = request.format === "abc"
      ? "ABC"
      : request.format === "mei"
        ? "MEI"
        : request.format === "lilypond"
          ? "LilyPond"
          : "MuseScore";
    return failure(`Failed to parse ${label}: ${errorMessage(error)}`);
  }

  return failure(`Unsupported input format: ${request.format}`);
};
