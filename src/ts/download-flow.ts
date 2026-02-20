import {
  buildMidiBytesForPlayback,
  collectMidiControlEventsFromMusicXmlDoc,
  collectMidiKeySignatureEventsFromMusicXmlDoc,
  collectMidiTimeSignatureEventsFromMusicXmlDoc,
  collectMidiTempoEventsFromMusicXmlDoc,
  buildPlaybackEventsFromMusicXmlDoc,
  collectMidiProgramOverridesFromMusicXmlDoc,
  type GraceTimingMode,
  type MetricAccentProfile,
  type MidiProgramPreset,
} from "./midi-io";
import { parseMusicXmlDocument, prettyPrintMusicXmlText } from "./musicxml-io";

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

export const createMusicXmlDownloadPayload = (xmlText: string): DownloadFilePayload => {
  const ts = buildFileTimestamp();
  const formattedXml = prettyPrintMusicXmlText(xmlText);
  return {
    fileName: `mikuscore-${ts}.musicxml`,
    blob: new Blob([formattedXml], { type: "application/xml;charset=utf-8" }),
  };
};

export const createMidiDownloadPayload = (
  xmlText: string,
  ticksPerQuarter: number,
  programPreset: MidiProgramPreset = "electric_piano_2",
  forceProgramPreset = false,
  graceTimingMode: GraceTimingMode = "before_beat",
  metricAccentEnabled = false,
  metricAccentProfile: MetricAccentProfile = "subtle"
): DownloadFilePayload | null => {
  const playbackDoc = parseMusicXmlDocument(xmlText);
  if (!playbackDoc) return null;

  const parsedPlayback = buildPlaybackEventsFromMusicXmlDoc(playbackDoc, ticksPerQuarter, {
    mode: "midi",
    graceTimingMode,
    metricAccentEnabled,
    metricAccentProfile,
  });
  if (parsedPlayback.events.length === 0) return null;
  const midiProgramOverrides = forceProgramPreset
    ? new Map<string, number>()
    : collectMidiProgramOverridesFromMusicXmlDoc(playbackDoc);
  const midiControlEvents = collectMidiControlEventsFromMusicXmlDoc(playbackDoc, ticksPerQuarter);
  const midiTempoEvents = collectMidiTempoEventsFromMusicXmlDoc(playbackDoc, ticksPerQuarter);
  const midiTimeSignatureEvents = collectMidiTimeSignatureEventsFromMusicXmlDoc(playbackDoc, ticksPerQuarter);
  const midiKeySignatureEvents = collectMidiKeySignatureEventsFromMusicXmlDoc(playbackDoc, ticksPerQuarter);

  let midiBytes: Uint8Array;
  try {
    midiBytes = buildMidiBytesForPlayback(
      parsedPlayback.events,
      parsedPlayback.tempo,
      programPreset,
      midiProgramOverrides,
      midiControlEvents,
      midiTempoEvents,
      midiTimeSignatureEvents,
      midiKeySignatureEvents
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
  convertMusicXmlToMei: (doc: Document) => string
): DownloadFilePayload | null => {
  const musicXmlDoc = parseMusicXmlDocument(xmlText);
  if (!musicXmlDoc) return null;

  let meiText = "";
  try {
    meiText = convertMusicXmlToMei(musicXmlDoc);
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
