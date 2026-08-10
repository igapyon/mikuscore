/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GraceTimingMode, MetricAccentProfile, MidiProgramPreset } from "./midi-io";
import type { MidiExportProfile } from "./midi-musescore-io";
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
} from "./output-encoding";
import { getBrowserMidiWriterRuntime } from "./midi-writer-browser";
import { bytesToArrayBuffer } from "./zip-io";

export type DownloadFilePayload = {
  fileName: string;
  blob: Blob;
};

const MIME_MXL = "application/vnd.recordare.musicxml";
const MIME_SVG = "image/svg+xml;charset=utf-8";
const MIME_JSON = "application/json;charset=utf-8";
const MIME_XML = "application/xml;charset=utf-8";
const MIME_MIDI = "audio/midi";
const MIME_TEXT = "text/plain;charset=utf-8";
const MIME_MEI = "application/mei+xml;charset=utf-8";
const MIME_ZIP = "application/zip";

const pad2 = (value: number): string => String(value).padStart(2, "0");

const buildFileTimestamp = (): string => {
  const now = new Date();
  return [
    now.getFullYear(),
    pad2(now.getMonth() + 1),
    pad2(now.getDate()),
    pad2(now.getHours()),
    pad2(now.getMinutes()),
  ].join("");
};

const toBlobPart = (content: EncodedOutput): BlobPart => {
  return typeof content === "string" ? content : bytesToArrayBuffer(content);
};

const createDownloadPayload = (
  fileName: string,
  content: EncodedOutput,
  type: string
): DownloadFilePayload => ({
  fileName,
  blob: new Blob([toBlobPart(content)], { type }),
});

const createTimestampedDownloadPayload = (
  extension: string,
  content: EncodedOutput,
  type: string,
  stem = "miku-score"
): DownloadFilePayload => {
  return createDownloadPayload(`${stem}-${buildFileTimestamp()}.${extension}`, content, type);
};

export const triggerFileDownload = (payload: DownloadFilePayload): void => {
  const url = URL.createObjectURL(payload.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = payload.fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const createMusicXmlDownloadPayload = async (
  xmlText: string,
  options: { compressed?: boolean; useXmlExtension?: boolean } = {}
): Promise<DownloadFilePayload> => {
  const encoded = await encodeMusicXmlOutput(xmlText, { compressed: options.compressed });
  if (options.compressed === true) {
    return createTimestampedDownloadPayload("mxl", encoded, MIME_MXL);
  }
  const extension = options.useXmlExtension === true ? "xml" : "musicxml";
  return createTimestampedDownloadPayload(extension, encoded, MIME_XML);
};

export const createSvgDownloadPayload = (svgText: string): DownloadFilePayload => {
  return createTimestampedDownloadPayload("svg", encodeSvgOutput(svgText), MIME_SVG);
};

export const createJsonDownloadPayload = (
  jsonText: string,
  stem = "measure-detail"
): DownloadFilePayload => {
  return createTimestampedDownloadPayload(
    "json",
    encodeJsonOutput(jsonText),
    MIME_JSON,
    `miku-score-${stem}`
  );
};

export const createVsqxDownloadPayload = (vsqxText: string): DownloadFilePayload => {
  return createTimestampedDownloadPayload("vsqx", encodeVsqxOutput(vsqxText), MIME_XML);
};

export const createMidiDownloadPayload = (
  xmlText: string,
  ticksPerQuarter: number,
  programPreset: MidiProgramPreset = "electric_piano_2",
  forceProgramPreset = false,
  graceTimingMode: GraceTimingMode = "before_beat",
  metricAccentEnabled = false,
  metricAccentProfile: MetricAccentProfile = "subtle",
  exportProfile: MidiExportProfile = "safe",
  keepRoundtripMetadata = true
): DownloadFilePayload | null => {
  const encoded = encodeMidiOutput(xmlText, {
    ticksPerQuarter,
    programPreset,
    forceProgramPreset,
    graceTimingMode,
    metricAccentEnabled,
    metricAccentProfile,
    exportProfile,
    keepRoundtripMetadata,
    midiWriterRuntime: getBrowserMidiWriterRuntime(),
  });
  return encoded === null
    ? null
    : createTimestampedDownloadPayload("mid", encoded, MIME_MIDI);
};

export const createAbcDownloadPayload = (
  xmlText: string,
  convertMusicXmlToAbc: (doc: Document) => string
): DownloadFilePayload | null => {
  const encoded = encodeAbcOutput(xmlText, convertMusicXmlToAbc);
  return encoded === null
    ? null
    : createTimestampedDownloadPayload("abc", encoded, MIME_TEXT);
};

export const createMeiDownloadPayload = (
  xmlText: string,
  convertMusicXmlToMei: (doc: Document, options?: { meiVersion?: string }) => string,
  options: { meiVersion?: string } = {}
): DownloadFilePayload | null => {
  const encoded = encodeMeiOutput(xmlText, convertMusicXmlToMei, options);
  return encoded === null
    ? null
    : createTimestampedDownloadPayload("mei", encoded, MIME_MEI);
};

export const createLilyPondDownloadPayload = (
  xmlText: string,
  convertMusicXmlToLilyPond: (doc: Document) => string
): DownloadFilePayload | null => {
  const encoded = encodeLilyPondOutput(xmlText, convertMusicXmlToLilyPond);
  return encoded === null
    ? null
    : createTimestampedDownloadPayload("ly", encoded, MIME_TEXT);
};

export const createMuseScoreDownloadPayload = async (
  xmlText: string,
  convertMusicXmlToMuseScore: (doc: Document) => string,
  options: { compressed?: boolean } = {}
): Promise<DownloadFilePayload | null> => {
  const encoded = await encodeMuseScoreOutput(xmlText, convertMusicXmlToMuseScore, options);
  if (encoded === null) return null;
  return options.compressed === true
    ? createTimestampedDownloadPayload("mscz", encoded, MIME_ZIP)
    : createTimestampedDownloadPayload("mscx", encoded, MIME_XML);
};

export const createZipBundleDownloadPayload = async (
  entries: Array<{ fileName: string; blob: Blob }>,
  options: { baseName?: string; compressed?: boolean } = {}
): Promise<DownloadFilePayload> => {
  const encodedEntries = await Promise.all(entries.map(async (entry) => ({
    path: entry.fileName,
    data: new Uint8Array(await entry.blob.arrayBuffer()),
  })));
  const encoded = await encodeZipBundleOutput(encodedEntries, {
    compressed: options.compressed,
  });
  const safeBase = String(options.baseName || "miku-score-all").trim() || "miku-score-all";
  return createTimestampedDownloadPayload("zip", encoded, MIME_ZIP, safeBase);
};
