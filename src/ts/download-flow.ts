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
import {
  resolveMidiExportRuntimeOptions,
  resolvePlaybackBuildModeForMidiExport,
  type MidiExportProfile,
} from "./midi-musescore-io";
import { parseMusicXmlDocument, prettyPrintMusicXmlText } from "./musicxml-io";

export type DownloadFilePayload = {
  fileName: string;
  blob: Blob;
};

type ZipEntryPayload = {
  path: string;
  bytes: Uint8Array;
};

type EncodedZipEntry = {
  pathBytes: Uint8Array;
  data: Uint8Array;
  crc: number;
  method: 0 | 8;
  compressedSize: number;
  uncompressedSize: number;
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

const prettyPrintXmlWithTwoSpaceIndent = (xml: string): string => {
  const compact = String(xml || "").replace(/>\s+</g, "><").trim();
  const split = compact.replace(/(>)(<)(\/*)/g, "$1\n$2$3").split("\n");
  let indentLevel = 0;
  const lines: string[] = [];
  for (const rawToken of split) {
    const token = rawToken.trim();
    if (!token) continue;
    if (/^<\//.test(token)) indentLevel = Math.max(0, indentLevel - 1);
    lines.push(`${"  ".repeat(indentLevel)}${token}`);
    const isOpening = /^<[^!?/][^>]*>$/.test(token);
    const isSelfClosing = /\/>$/.test(token);
    if (isOpening && !isSelfClosing) indentLevel += 1;
  }
  return lines.join("\n");
};

export const triggerFileDownload = (payload: DownloadFilePayload): void => {
  const url = URL.createObjectURL(payload.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = payload.fileName;
  a.click();
  URL.revokeObjectURL(url);
};

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = crc32Table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const writeU16 = (target: Uint8Array, offset: number, value: number): void => {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
};

const writeU32 = (target: Uint8Array, offset: number, value: number): void => {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
};

const toDosDateTime = (date: Date): { dosTime: number; dosDate: number } => {
  const year = Math.max(1980, Math.min(2107, date.getFullYear()));
  const month = Math.max(1, Math.min(12, date.getMonth() + 1));
  const day = Math.max(1, Math.min(31, date.getDate()));
  const hours = Math.max(0, Math.min(23, date.getHours()));
  const minutes = Math.max(0, Math.min(59, date.getMinutes()));
  const seconds = Math.max(0, Math.min(59, date.getSeconds()));
  const dosTime = ((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | ((Math.floor(seconds / 2)) & 0x1f);
  const dosDate = (((year - 1980) & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f);
  return { dosTime, dosDate };
};

const compressDeflateRaw = async (input: Uint8Array): Promise<Uint8Array | null> => {
  const CS = (globalThis as { CompressionStream?: new (format: string) => unknown }).CompressionStream;
  if (!CS) return null;
  try {
    const source = new Uint8Array(input.length);
    source.set(input);
    const stream = new Blob([bytesToArrayBuffer(source)]).stream().pipeThrough(new CS("deflate-raw") as never);
    const compressedBuffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(compressedBuffer);
  } catch {
    return null;
  }
};

const makeZipBytes = async (entries: ZipEntryPayload[], preferCompression: boolean): Promise<Uint8Array> => {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;
  const nowDos = toDosDateTime(new Date());

  const encodedEntries: EncodedZipEntry[] = [];
  for (const entry of entries) {
    const pathBytes = encoder.encode(entry.path.replace(/\\/g, "/").replace(/^\/+/, ""));
    const uncompressed = entry.bytes;
    let data = uncompressed;
    let method: 0 | 8 = 0;
    if (preferCompression) {
      const compressed = await compressDeflateRaw(uncompressed);
      if (compressed && compressed.length < uncompressed.length) {
        data = compressed;
        method = 8;
      }
    }
    encodedEntries.push({
      pathBytes,
      data,
      crc: crc32(uncompressed),
      method,
      compressedSize: data.length,
      uncompressedSize: uncompressed.length,
    });
  }

  for (const entry of encodedEntries) {
    const { pathBytes, data, crc, method, compressedSize, uncompressedSize } = entry;

    const localHeader = new Uint8Array(30 + pathBytes.length);
    writeU32(localHeader, 0, 0x04034b50);
    writeU16(localHeader, 4, 20);
    writeU16(localHeader, 6, 0x0800);
    writeU16(localHeader, 8, method);
    writeU16(localHeader, 10, nowDos.dosTime);
    writeU16(localHeader, 12, nowDos.dosDate);
    writeU32(localHeader, 14, crc);
    writeU32(localHeader, 18, compressedSize);
    writeU32(localHeader, 22, uncompressedSize);
    writeU16(localHeader, 26, pathBytes.length);
    writeU16(localHeader, 28, 0);
    localHeader.set(pathBytes, 30);
    localChunks.push(localHeader, data);

    const centralHeader = new Uint8Array(46 + pathBytes.length);
    writeU32(centralHeader, 0, 0x02014b50);
    writeU16(centralHeader, 4, 20);
    writeU16(centralHeader, 6, 20);
    writeU16(centralHeader, 8, 0x0800);
    writeU16(centralHeader, 10, method);
    writeU16(centralHeader, 12, nowDos.dosTime);
    writeU16(centralHeader, 14, nowDos.dosDate);
    writeU32(centralHeader, 16, crc);
    writeU32(centralHeader, 20, compressedSize);
    writeU32(centralHeader, 24, uncompressedSize);
    writeU16(centralHeader, 28, pathBytes.length);
    writeU16(centralHeader, 30, 0);
    writeU16(centralHeader, 32, 0);
    writeU16(centralHeader, 34, 0);
    writeU16(centralHeader, 36, 0);
    writeU32(centralHeader, 38, 0);
    writeU32(centralHeader, 42, localOffset);
    centralHeader.set(pathBytes, 46);
    centralChunks.push(centralHeader);

    localOffset += localHeader.length + compressedSize;
  }

  const localSize = localChunks.reduce((sum, b) => sum + b.length, 0);
  const centralSize = centralChunks.reduce((sum, b) => sum + b.length, 0);
  const eocd = new Uint8Array(22);
  writeU32(eocd, 0, 0x06054b50);
  writeU16(eocd, 4, 0);
  writeU16(eocd, 6, 0);
  writeU16(eocd, 8, entries.length);
  writeU16(eocd, 10, entries.length);
  writeU32(eocd, 12, centralSize);
  writeU32(eocd, 16, localSize);
  writeU16(eocd, 20, 0);

  const out = new Uint8Array(localSize + centralSize + eocd.length);
  let cursor = 0;
  for (const chunk of localChunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  for (const chunk of centralChunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  out.set(eocd, cursor);
  return out;
};

const makeMxlBytes = async (formattedXml: string): Promise<Uint8Array> => {
  const encoder = new TextEncoder();
  const containerXml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">` +
    `<rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles>` +
    `</container>`;
  return makeZipBytes([
    { path: "META-INF/container.xml", bytes: encoder.encode(containerXml) },
    { path: "score.musicxml", bytes: encoder.encode(formattedXml) },
  ], true);
};

const makeMsczBytes = async (mscxText: string): Promise<Uint8Array> => {
  const encoder = new TextEncoder();
  return makeZipBytes([{ path: "score.mscx", bytes: encoder.encode(mscxText) }], true);
};

const bytesToArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
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

export const createVsqxDownloadPayload = (vsqxText: string): DownloadFilePayload => {
  const ts = buildFileTimestamp();
  const formattedVsqx = prettyPrintXmlWithTwoSpaceIndent(vsqxText);
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
  exportProfile: MidiExportProfile = "safe"
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
        ticksPerQuarter: exportTicksPerQuarter,
        normalizeForParity: runtime.normalizeForParity,
        rawWriter: runtime.rawWriter,
        rawRetriggerPolicy: runtime.rawRetriggerPolicy,
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
  const formattedMscx = prettyPrintXmlWithTwoSpaceIndent(mscxText);

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
