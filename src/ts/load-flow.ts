/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  convertLoadInputToMusicXml,
  type LoadInputConverters,
  type LoadInputFormat,
  type LoadInputResult,
} from "./load-input";

export type LoadFlowParams = LoadInputConverters & {
  isNewType: boolean;
  sourceType: "xml" | "musescore" | "vsqx" | "abc" | "mei" | "lilypond";
  isFileMode: boolean;
  selectedFile: File | null;
  xmlSourceText: string;
  museScoreSourceText: string;
  vsqxSourceText: string;
  abcSourceText: string;
  meiSourceText: string;
  lilyPondSourceText: string;
  createNewMusicXml: () => string;
};

export type LoadFlowSuccess = {
  ok: true;
  xmlToLoad: string;
  collapseInputSection: boolean;
  nextXmlInputText?: string;
  nextAbcInputText?: string;
};

export type LoadFlowFailure = {
  ok: false;
  diagnosticCode: "MVP_INVALID_COMMAND_PAYLOAD";
  diagnosticMessage: string;
};

export type LoadFlowResult = LoadFlowSuccess | LoadFlowFailure;

const failure = (message: string): LoadFlowFailure => ({
  ok: false,
  diagnosticCode: "MVP_INVALID_COMMAND_PAYLOAD",
  diagnosticMessage: message,
});

const readBinaryFile = async (file: File): Promise<Uint8Array> => {
  const withArrayBuffer = file as File & { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof withArrayBuffer.arrayBuffer === "function") {
    return new Uint8Array(await withArrayBuffer.arrayBuffer());
  }

  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error("Failed to read binary file."));
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read binary file."));
    reader.readAsArrayBuffer(file);
  });
};

const readTextFile = async (file: File): Promise<string> => {
  const withText = file as File & { text?: () => Promise<string> };
  if (typeof withText.text === "function") return withText.text();

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Failed to read text file."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read text file."));
    reader.readAsText(file);
  });
};

const inputFormatForFileName = (fileName: string): LoadInputFormat | null => {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".mxl")) return "mxl";
  if (lowerName.endsWith(".musicxml") || lowerName.endsWith(".xml")) return "musicxml";
  if (lowerName.endsWith(".abc")) return "abc";
  if (lowerName.endsWith(".mid") || lowerName.endsWith(".midi")) return "midi";
  if (lowerName.endsWith(".vsqx")) return "vsqx";
  if (lowerName.endsWith(".mei")) return "mei";
  if (lowerName.endsWith(".ly")) return "lilypond";
  if (lowerName.endsWith(".mscx")) return "musescore";
  if (lowerName.endsWith(".mscz")) return "mscz";
  return null;
};

const isBinaryFormat = (format: LoadInputFormat): boolean => {
  return format === "mxl" || format === "midi" || format === "mscz";
};

const convertersFromParams = (params: LoadFlowParams): LoadInputConverters => ({
  convertAbcToMusicXml: params.convertAbcToMusicXml,
  convertMeiToMusicXml: params.convertMeiToMusicXml,
  convertLilyPondToMusicXml: params.convertLilyPondToMusicXml,
  convertMuseScoreToMusicXml: params.convertMuseScoreToMusicXml,
  formatImportedMusicXml: params.formatImportedMusicXml,
  convertVsqxToMusicXml: params.convertVsqxToMusicXml,
  convertMidiToMusicXml: params.convertMidiToMusicXml,
});

const toLoadFlowResult = (
  result: LoadInputResult,
  abcSourceText?: string
): LoadFlowResult => {
  if (!result.ok) {
    return {
      ok: false,
      diagnosticCode: result.diagnosticCode,
      diagnosticMessage: result.diagnosticMessage,
    };
  }
  return {
    ok: true,
    xmlToLoad: result.xml,
    collapseInputSection: true,
    nextXmlInputText: result.xml,
    ...(abcSourceText === undefined ? {} : { nextAbcInputText: abcSourceText }),
  };
};

const convertInput = async (
  format: LoadInputFormat,
  data: string | Uint8Array,
  converters: LoadInputConverters
): Promise<LoadInputResult> => {
  const request = { format, data };
  return convertLoadInputToMusicXml(request, converters);
};

const directInputFromParams = (
  params: LoadFlowParams
): { format: LoadInputFormat; sourceText: string } => {
  switch (params.sourceType) {
    case "xml":
      return { format: "musicxml", sourceText: params.xmlSourceText };
    case "abc":
      return { format: "abc", sourceText: params.abcSourceText };
    case "vsqx":
      return { format: "vsqx", sourceText: params.vsqxSourceText };
    case "mei":
      return { format: "mei", sourceText: params.meiSourceText };
    case "lilypond":
      return { format: "lilypond", sourceText: params.lilyPondSourceText };
    case "musescore":
      return { format: "musescore", sourceText: params.museScoreSourceText };
  }
};

export const resolveLoadFlow = async (params: LoadFlowParams): Promise<LoadFlowResult> => {
  if (params.isNewType) {
    const sourceText = params.createNewMusicXml();
    return {
      ok: true,
      xmlToLoad: sourceText,
      collapseInputSection: true,
      nextXmlInputText: sourceText,
    };
  }

  const converters = convertersFromParams(params);
  if (params.isFileMode) {
    const selected = params.selectedFile;
    if (!selected) return failure("Please select a file.");

    const format = inputFormatForFileName(selected.name);
    if (!format) {
      return failure(
        "Unsupported file extension. Use .musicxml, .xml, .mxl, .abc, .mid, .midi, .vsqx, .mei, .ly, .mscx, or .mscz."
      );
    }

    try {
      const data = isBinaryFormat(format)
        ? await readBinaryFile(selected)
        : await readTextFile(selected);
      const result = await convertInput(format, data, converters);
      return toLoadFlowResult(result, format === "abc" && typeof data === "string" ? data : undefined);
    } catch (error) {
      return failure(
        `Failed to read ${selected.name}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  const direct = directInputFromParams(params);
  const result = await convertInput(direct.format, direct.sourceText, converters);
  return toLoadFlowResult(result, direct.format === "abc" ? direct.sourceText : undefined);
};
