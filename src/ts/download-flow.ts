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
    return {
      fileName: `mikuscore-${ts}.mxl`,
      blob: new Blob([bytesToArrayBuffer(mxlBytes)], { type: "application/vnd.recordare.musicxml" }),
    };
  }
  const extension = options.useXmlExtension === true ? "xml" : "musicxml";
  return {
    fileName: `mikuscore-${ts}.${extension}`,
    blob: new Blob([formattedXml], { type: "application/xml;charset=utf-8" }),
  };
};

export const createSvgDownloadPayload = (svgText: string): DownloadFilePayload => {
  const ts = buildFileTimestamp();
  return {
    fileName: `mikuscore-${ts}.svg`,
    blob: new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }),
  };
};

export const createJsonDownloadPayload = (jsonText: string, stem = "measure-detail"): DownloadFilePayload => {
  const ts = buildFileTimestamp();
  return {
    fileName: `mikuscore-${stem}-${ts}.json`,
    blob: new Blob([jsonText], { type: "application/json;charset=utf-8" }),
  };
};

export const createVsqxDownloadPayload = (vsqxText: string): DownloadFilePayload => {
  const ts = buildFileTimestamp();
  const formattedVsqx = formatXmlWithTwoSpaceIndent(vsqxText);
  return {
    fileName: `mikuscore-${ts}.vsqx`,
    blob: new Blob([formattedVsqx], { type: "application/xml;charset=utf-8" }),
  };
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

  const midiArrayBuffer = new ArrayBuffer(midiBytes.byteLength);
  new Uint8Array(midiArrayBuffer).set(midiBytes);
  const ts = buildFileTimestamp();
  return {
    fileName: `mikuscore-${ts}.mid`,
    blob: new Blob([midiArrayBuffer], { type: "audio/midi" }),
  };
};

export const createAbcDownloadPayload = (
  xmlText: string,
  convertMusicXmlToAbc: (doc: Document) => string
): DownloadFilePayload | null => {
  const musicXmlDoc = parseMusicXmlDocument(xmlText);
  if (!musicXmlDoc) return null;

  let abcText = "";
  try {
    abcText = convertMusicXmlToAbc(musicXmlDoc);
  } catch {
    return null;
  }

  const ts = buildFileTimestamp();
  return {
    fileName: `mikuscore-${ts}.abc`,
    blob: new Blob([abcText], { type: "text/plain;charset=utf-8" }),
  };
};

export const createMeiDownloadPayload = (
  xmlText: string,
  convertMusicXmlToMei: (
    doc: Document,
    options?: { meiVersion?: string }
  ) => string,
  options: { meiVersion?: string } = {}
): DownloadFilePayload | null => {
  const musicXmlDoc = parseMusicXmlDocument(xmlText);
  if (!musicXmlDoc) return null;

  let meiText = "";
  try {
    meiText = convertMusicXmlToMei(musicXmlDoc, options);
  } catch {
    return null;
  }
  const formattedMei = prettyPrintMusicXmlText(meiText);

  const ts = buildFileTimestamp();
  return {
    fileName: `mikuscore-${ts}.mei`,
    blob: new Blob([formattedMei], { type: "application/mei+xml;charset=utf-8" }),
  };
};

export const createLilyPondDownloadPayload = (
  xmlText: string,
  convertMusicXmlToLilyPond: (doc: Document) => string
): DownloadFilePayload | null => {
  const musicXmlDoc = parseMusicXmlDocument(xmlText);
  if (!musicXmlDoc) return null;

  let lilyText = "";
  try {
    lilyText = convertMusicXmlToLilyPond(musicXmlDoc);
  } catch {
    return null;
  }

  const ts = buildFileTimestamp();
  return {
    fileName: `mikuscore-${ts}.ly`,
    blob: new Blob([lilyText], { type: "text/plain;charset=utf-8" }),
  };
};

export const createMuseScoreDownloadPayload = async (
  xmlText: string,
  convertMusicXmlToMuseScore: (doc: Document) => string,
  options: { compressed?: boolean } = {}
): Promise<DownloadFilePayload | null> => {
  const musicXmlDoc = parseMusicXmlDocument(xmlText);
  if (!musicXmlDoc) return null;

  let mscxText = "";
  try {
    mscxText = convertMusicXmlToMuseScore(musicXmlDoc);
  } catch {
    return null;
  }
  const formattedMscx = formatXmlWithTwoSpaceIndent(mscxText);

  const ts = buildFileTimestamp();
  if (options.compressed === true) {
    const msczBytes = await makeMsczBytes(formattedMscx);
    return {
      fileName: `mikuscore-${ts}.mscz`,
      blob: new Blob([bytesToArrayBuffer(msczBytes)], { type: "application/zip" }),
    };
  }
  return {
    fileName: `mikuscore-${ts}.mscx`,
    blob: new Blob([formattedMscx], { type: "application/xml;charset=utf-8" }),
  };
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
  return {
    fileName: `${safeBase}-${ts}.zip`,
    blob: new Blob([bytesToArrayBuffer(zipBytes)], { type: "application/zip" }),
  };
};
