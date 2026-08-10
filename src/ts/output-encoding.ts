/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  buildMidiBytesForPlayback,
  buildPlaybackEventsFromMusicXmlDoc,
  collectLeadingPickupTicksFromMusicXmlDoc,
  collectMidiControlEventsFromMusicXmlDoc,
  collectMidiKeySignatureEventsFromMusicXmlDoc,
  collectMidiProgramOverridesFromMusicXmlDoc,
  collectMidiTempoEventsFromMusicXmlDoc,
  collectMidiTimeSignatureEventsFromMusicXmlDoc,
  type GraceTimingMode,
  type MetricAccentProfile,
  type MidiProgramPreset,
  type MidiWriterRuntime,
} from "./midi-io";
import {
  resolveMidiExportRuntimeOptions,
  resolvePlaybackBuildModeForMidiExport,
  type MidiExportProfile,
} from "./midi-musescore-io";
import { parseMusicXmlDocument, prettyPrintMusicXmlText } from "./musicxml-io";
import {
  formatXmlWithTwoSpaceIndent,
  makeMsczBytes,
  makeMxlBytes,
  makeZipBytes,
  type ZipEntryPayload,
} from "./zip-io";

export type EncodedOutput = string | Uint8Array;

export type MidiOutputOptions = {
  ticksPerQuarter: number;
  programPreset?: MidiProgramPreset;
  forceProgramPreset?: boolean;
  graceTimingMode?: GraceTimingMode;
  metricAccentEnabled?: boolean;
  metricAccentProfile?: MetricAccentProfile;
  exportProfile?: MidiExportProfile;
  keepRoundtripMetadata?: boolean;
  rawWriter?: boolean;
  midiWriterRuntime?: MidiWriterRuntime | null;
};

export type OutputArchiveEntry = {
  path: string;
  data: EncodedOutput;
};

const convertMusicXmlOutput = <T>(
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

export const encodeMusicXmlOutput = async (
  xmlText: string,
  options: { compressed?: boolean } = {}
): Promise<EncodedOutput> => {
  const formattedXml = prettyPrintMusicXmlText(xmlText);
  return options.compressed === true ? makeMxlBytes(formattedXml) : formattedXml;
};

export const encodeSvgOutput = (svgText: string): string => svgText;

export const encodeJsonOutput = (jsonText: string): string => jsonText;

export const encodeVsqxOutput = (vsqxText: string): string => {
  return formatXmlWithTwoSpaceIndent(vsqxText);
};

export const encodeMidiOutput = (
  xmlText: string,
  options: MidiOutputOptions
): Uint8Array | null => {
  const playbackDoc = parseMusicXmlDocument(xmlText);
  if (!playbackDoc) return null;

  const runtime = resolveMidiExportRuntimeOptions(
    options.exportProfile ?? "safe",
    options.ticksPerQuarter
  );
  const exportTicksPerQuarter = runtime.ticksPerQuarter;
  const buildMode = resolvePlaybackBuildModeForMidiExport(runtime.eventBuildPolicy);
  const parsedPlayback = buildPlaybackEventsFromMusicXmlDoc(playbackDoc, exportTicksPerQuarter, {
    mode: buildMode,
    graceTimingMode: options.graceTimingMode ?? "before_beat",
    metricAccentEnabled: options.metricAccentEnabled ?? false,
    metricAccentProfile: options.metricAccentProfile ?? "subtle",
    includeGraceInPlaybackLikeMode: runtime.includeGraceInPlaybackLikeMode,
    includeOrnamentInPlaybackLikeMode: runtime.includeOrnamentInPlaybackLikeMode,
    includeTieInPlaybackLikeMode: runtime.includeTieInPlaybackLikeMode,
  });
  if (parsedPlayback.events.length === 0) return null;

  const midiProgramOverrides = options.forceProgramPreset === true
    ? new Map<string, number>()
    : collectMidiProgramOverridesFromMusicXmlDoc(playbackDoc);
  const midiControlEvents = collectMidiControlEventsFromMusicXmlDoc(
    playbackDoc,
    exportTicksPerQuarter
  );
  const midiTempoEvents = collectMidiTempoEventsFromMusicXmlDoc(
    playbackDoc,
    exportTicksPerQuarter
  );
  const midiTimeSignatureEvents = collectMidiTimeSignatureEventsFromMusicXmlDoc(
    playbackDoc,
    exportTicksPerQuarter
  );
  const midiKeySignatureEvents = collectMidiKeySignatureEventsFromMusicXmlDoc(
    playbackDoc,
    exportTicksPerQuarter
  );

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
    const pickupTicks = collectLeadingPickupTicksFromMusicXmlDoc(
      playbackDoc,
      exportTicksPerQuarter
    );

    return buildMidiBytesForPlayback(
      parsedPlayback.events,
      parsedPlayback.tempo,
      options.programPreset ?? "electric_piano_2",
      midiProgramOverrides,
      midiControlEvents,
      midiTempoEvents,
      midiTimeSignatureEvents,
      midiKeySignatureEvents,
      {
        embedMksSysEx: true,
        emitMksTextMeta: options.keepRoundtripMetadata !== false,
        ticksPerQuarter: exportTicksPerQuarter,
        normalizeForParity: runtime.normalizeForParity,
        rawWriter: options.rawWriter ?? runtime.rawWriter,
        midiWriterRuntime: options.midiWriterRuntime,
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
};

export const encodeAbcOutput = (
  xmlText: string,
  convertMusicXmlToAbc: (doc: Document) => string
): string | null => {
  return convertMusicXmlOutput(xmlText, convertMusicXmlToAbc);
};

export const encodeMeiOutput = (
  xmlText: string,
  convertMusicXmlToMei: (doc: Document, options?: { meiVersion?: string }) => string,
  options: { meiVersion?: string } = {}
): string | null => {
  const meiText = convertMusicXmlOutput(xmlText, (doc) => convertMusicXmlToMei(doc, options));
  return meiText === null ? null : prettyPrintMusicXmlText(meiText);
};

export const encodeLilyPondOutput = (
  xmlText: string,
  convertMusicXmlToLilyPond: (doc: Document) => string
): string | null => {
  return convertMusicXmlOutput(xmlText, convertMusicXmlToLilyPond);
};

export const encodeMuseScoreOutput = async (
  xmlText: string,
  convertMusicXmlToMuseScore: (doc: Document) => string,
  options: { compressed?: boolean } = {}
): Promise<EncodedOutput | null> => {
  const mscxText = convertMusicXmlOutput(xmlText, convertMusicXmlToMuseScore);
  if (mscxText === null) return null;
  const formattedMscx = formatXmlWithTwoSpaceIndent(mscxText);
  return options.compressed === true ? makeMsczBytes(formattedMscx) : formattedMscx;
};

export const encodeZipBundleOutput = async (
  entries: OutputArchiveEntry[],
  options: { compressed?: boolean } = {}
): Promise<Uint8Array> => {
  const textEncoder = new TextEncoder();
  const zipEntries: ZipEntryPayload[] = [];
  for (const entry of entries) {
    const path = String(entry.path || "").trim();
    if (!path) continue;
    const bytes = typeof entry.data === "string" ? textEncoder.encode(entry.data) : entry.data;
    zipEntries.push({ path, bytes });
  }
  return makeZipBytes(zipEntries, options.compressed !== false);
};
