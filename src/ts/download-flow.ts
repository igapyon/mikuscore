/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  buildMidiBytesForPlayback,
  collectMidiControlEventsFromMusicXmlDoc,
  collectMidiKeySignatureEventsFromMusicXmlDoc,
  collectMidiTimeSignatureEventsFromMusicXmlDoc,
  collectMidiTempoEventsFromMusicXmlDoc,
  buildPlaybackEventsFromMusicXmlDoc,
  collectMidiProgramOverridesFromMusicXmlDoc,
  collectLeadingPickupTicksFromMusicXmlDoc,
  type GraceTimingMode,
  type MetricAccentProfile,
  type MidiProgramPreset,
} from "./midi-io";
import {
  resolveMidiExportRuntimeOptions,
  resolvePlaybackBuildModeForMidiExport,
  type MidiExportProfile,
} from "./midi-musescore-io";
import { parseMusicXmlDocument, prettyPrintMusicXmlText } from "./musicxml-io";
import {
  bytesToArrayBuffer,
  formatXmlWithTwoSpaceIndent,
  makeMsczBytes,
  makeMxlBytes,
  makeZipBytes,
  type ZipEntryPayload,
} from "./zip-io";

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

const createDownloadPayload = (
  fileName: string,
  content: BlobPart,
  type: string
): DownloadFilePayload => {
  return {
    fileName,
    blob: new Blob([content], { type }),
  };
};

const createTimestampedDownloadPayload = (
  extension: string,
  content: BlobPart,
  type: string,
  stem = "mikuscore"
): DownloadFilePayload => {
  const ts = buildFileTimestamp();
  return createDownloadPayload(`${stem}-${ts}.${extension}`, content, type);
};

const convertMusicXmlForDownload = <T>(
  xmlText: string,
  convert: (doc: Document) => T
): T | null => {
  const musicXmlDoc = parseMusicXmlDocument(xmlText);
  if (!musicXmlDoc) return null;
  try {
    return convert(musicXmlDoc);
  } catch {
    return null;
  }
};

export const triggerFileDownload = (payload: DownloadFilePayload): void => {
  const url = URL.createObjectURL(payload.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = payload.fileName;
  a.click();
  URL.revokeObjectURL(url);
};

export const createMusicXmlDownloadPayload = async (
  xmlText: string,
  options: { compressed?: boolean; useXmlExtension?: boolean } = {}
): Promise<DownloadFilePayload> => {
  const ts = buildFileTimestamp();
  const formattedXml = prettyPrintMusicXmlText(xmlText);
  if (options.compressed === true) {
    const mxlBytes = await makeMxlBytes(formattedXml);
    return createDownloadPayload(
      `mikuscore-${ts}.mxl`,
      bytesToArrayBuffer(mxlBytes),
      MIME_MXL
    );
  }
  const extension = options.useXmlExtension === true ? "xml" : "musicxml";
  return createDownloadPayload(`mikuscore-${ts}.${extension}`, formattedXml, MIME_XML);
};

export const createSvgDownloadPayload = (svgText: string): DownloadFilePayload => {
  return createTimestampedDownloadPayload("svg", svgText, MIME_SVG);
};

export const createJsonDownloadPayload = (jsonText: string, stem = "measure-detail"): DownloadFilePayload => {
  return createTimestampedDownloadPayload("json", jsonText, MIME_JSON, `mikuscore-${stem}`);
};

export const createVsqxDownloadPayload = (vsqxText: string): DownloadFilePayload => {
  const formattedVsqx = formatXmlWithTwoSpaceIndent(vsqxText);
  return createTimestampedDownloadPayload("vsqx", formattedVsqx, MIME_XML);
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
  const playbackDoc = parseMusicXmlDocument(xmlText);
  if (!playbackDoc) return null;
  const runtime = resolveMidiExportRuntimeOptions(exportProfile, ticksPerQuarter);
  const exportTicksPerQuarter = runtime.ticksPerQuarter;
  const buildMode = resolvePlaybackBuildModeForMidiExport(runtime.eventBuildPolicy);

  const parsedPlayback = buildPlaybackEventsFromMusicXmlDoc(playbackDoc, exportTicksPerQuarter, {
    mode: buildMode,
    graceTimingMode,
    metricAccentEnabled,
    metricAccentProfile,
    includeGraceInPlaybackLikeMode: runtime.includeGraceInPlaybackLikeMode,
    includeOrnamentInPlaybackLikeMode: runtime.includeOrnamentInPlaybackLikeMode,
    includeTieInPlaybackLikeMode: runtime.includeTieInPlaybackLikeMode,
  });
  if (parsedPlayback.events.length === 0) return null;
  const midiProgramOverrides = forceProgramPreset
    ? new Map<string, number>()
    : collectMidiProgramOverridesFromMusicXmlDoc(playbackDoc);
  const midiControlEvents = collectMidiControlEventsFromMusicXmlDoc(playbackDoc, exportTicksPerQuarter);
  const midiTempoEvents = collectMidiTempoEventsFromMusicXmlDoc(playbackDoc, exportTicksPerQuarter);
  const midiTimeSignatureEvents = collectMidiTimeSignatureEventsFromMusicXmlDoc(playbackDoc, exportTicksPerQuarter);
  const midiKeySignatureEvents = collectMidiKeySignatureEventsFromMusicXmlDoc(playbackDoc, exportTicksPerQuarter);

  let midiBytes: Uint8Array;
  try {
    const scoreTitle =
      playbackDoc.querySelector("score-partwise > work > work-title")?.textContent?.trim() ??
      playbackDoc.querySelector("score-partwise > movement-title")?.textContent?.trim() ??
      "";
    const movementTitle =
      playbackDoc.querySelector("score-partwise > movement-title")?.textContent?.trim() ?? "";
    const scoreComposer =
      playbackDoc
        .querySelector('score-partwise > identification > creator[type="composer"]')
        ?.textContent?.trim() ??
      playbackDoc.querySelector("score-partwise > identification > creator")?.textContent?.trim() ??
      "";
    const pickupTicks = collectLeadingPickupTicksFromMusicXmlDoc(playbackDoc, exportTicksPerQuarter);
    midiBytes = buildMidiBytesForPlayback(
      parsedPlayback.events,
      parsedPlayback.tempo,
      programPreset,
      midiProgramOverrides,
      midiControlEvents,
      midiTempoEvents,
      midiTimeSignatureEvents,
      midiKeySignatureEvents,
      {
        embedMksSysEx: true,
        emitMksTextMeta: keepRoundtripMetadata,
        ticksPerQuarter: exportTicksPerQuarter,
        normalizeForParity: runtime.normalizeForParity,
        rawWriter: runtime.rawWriter,
        rawRetriggerPolicy: runtime.rawRetriggerPolicy,
        metadata: {
          title: scoreTitle,
          movementTitle,
          composer: scoreComposer,
          pickupTicks,
        },
      }
    );
  } catch {
    return null;
  }

  return createTimestampedDownloadPayload("mid", bytesToArrayBuffer(midiBytes), MIME_MIDI);
};

export const createAbcDownloadPayload = (
  xmlText: string,
  convertMusicXmlToAbc: (doc: Document) => string
): DownloadFilePayload | null => {
  const abcText = convertMusicXmlForDownload(xmlText, convertMusicXmlToAbc);
  if (abcText === null) return null;
  return createTimestampedDownloadPayload("abc", abcText, MIME_TEXT);
};

export const createMeiDownloadPayload = (
  xmlText: string,
  convertMusicXmlToMei: (
    doc: Document,
    options?: { meiVersion?: string }
  ) => string,
  options: { meiVersion?: string } = {}
): DownloadFilePayload | null => {
  const meiText = convertMusicXmlForDownload(xmlText, (musicXmlDoc) =>
    convertMusicXmlToMei(musicXmlDoc, options)
  );
  if (meiText === null) return null;
  const formattedMei = prettyPrintMusicXmlText(meiText);

  return createTimestampedDownloadPayload("mei", formattedMei, MIME_MEI);
};

export const createLilyPondDownloadPayload = (
  xmlText: string,
  convertMusicXmlToLilyPond: (doc: Document) => string
): DownloadFilePayload | null => {
  const lilyText = convertMusicXmlForDownload(xmlText, convertMusicXmlToLilyPond);
  if (lilyText === null) return null;
  return createTimestampedDownloadPayload("ly", lilyText, MIME_TEXT);
};

export const createMuseScoreDownloadPayload = async (
  xmlText: string,
  convertMusicXmlToMuseScore: (doc: Document) => string,
  options: { compressed?: boolean } = {}
): Promise<DownloadFilePayload | null> => {
  const mscxText = convertMusicXmlForDownload(xmlText, convertMusicXmlToMuseScore);
  if (mscxText === null) return null;
  const formattedMscx = formatXmlWithTwoSpaceIndent(mscxText);

  const ts = buildFileTimestamp();
  if (options.compressed === true) {
    const msczBytes = await makeMsczBytes(formattedMscx);
    return createDownloadPayload(`mikuscore-${ts}.mscz`, bytesToArrayBuffer(msczBytes), MIME_ZIP);
  }
  return createDownloadPayload(`mikuscore-${ts}.mscx`, formattedMscx, MIME_XML);
};

export const createZipBundleDownloadPayload = async (
  entries: Array<{ fileName: string; blob: Blob }>,
  options: { baseName?: string; compressed?: boolean } = {}
): Promise<DownloadFilePayload> => {
  const ts = buildFileTimestamp();
  const safeBase = String(options.baseName || "mikuscore-all").trim() || "mikuscore-all";
  const zipEntries: ZipEntryPayload[] = [];
  for (const entry of entries) {
    const fileName = String(entry.fileName || "").trim();
    if (!fileName) continue;
    const bytes = new Uint8Array(await entry.blob.arrayBuffer());
    zipEntries.push({ path: fileName, bytes });
  }
  const zipBytes = await makeZipBytes(zipEntries, options.compressed !== false);
  return createDownloadPayload(`${safeBase}-${ts}.zip`, bytesToArrayBuffer(zipBytes), MIME_ZIP);
};
