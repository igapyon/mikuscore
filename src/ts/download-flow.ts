import { buildMidiBytesForPlayback, buildPlaybackEventsFromMusicXmlDoc } from "./midi-io";
import { parseMusicXmlDocument } from "./musicxml-io";

export type DownloadFilePayload = {
  fileName: string;
  blob: Blob;
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
  return {
    fileName: "mikuscore.musicxml",
    blob: new Blob([xmlText], { type: "application/xml;charset=utf-8" }),
  };
};

export const createMidiDownloadPayload = (
  xmlText: string,
  ticksPerQuarter: number
): DownloadFilePayload | null => {
  const playbackDoc = parseMusicXmlDocument(xmlText);
  if (!playbackDoc) return null;

  const parsedPlayback = buildPlaybackEventsFromMusicXmlDoc(playbackDoc, ticksPerQuarter);
  if (parsedPlayback.events.length === 0) return null;

  let midiBytes: Uint8Array;
  try {
    midiBytes = buildMidiBytesForPlayback(parsedPlayback.events, parsedPlayback.tempo);
  } catch {
    return null;
  }

  const midiArrayBuffer = new ArrayBuffer(midiBytes.byteLength);
  new Uint8Array(midiArrayBuffer).set(midiBytes);
  return {
    fileName: "mikuscore.mid",
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

  return {
    fileName: "mikuscore.abc",
    blob: new Blob([abcText], { type: "text/plain;charset=utf-8" }),
  };
};

