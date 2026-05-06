/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

export type ZipEntry = {
  path: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  dataOffset: number;
};

export type ZipEntryPayload = {
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

type ZipDosDateTime = {
  dosTime: number;
  dosDate: number;
};

type ReadZipEntryResult = {
  entry: ZipEntry | null;
  nextOffset: number;
};

type ZipCentralDirectoryBounds = {
  offset: number;
  end: number;
};

const ZIP_EOCD_SIG = 0x06054b50;
const ZIP_CDFH_SIG = 0x02014b50;
const ZIP_LFH_SIG = 0x04034b50;

const readU16 = (bytes: Uint8Array, offset: number): number => {
  return bytes[offset] | (bytes[offset + 1] << 8);
};

const readU32 = (bytes: Uint8Array, offset: number): number => {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
};

const normalizeZipPath = (value: string): string => {
  return value.replace(/\\/g, "/").replace(/^\.?\//, "");
};

const decodeUtf8 = (bytes: Uint8Array): string => {
  return new TextDecoder("utf-8").decode(bytes);
};

const encodeUtf8 = (text: string): Uint8Array => {
  return new TextEncoder().encode(text);
};

const normalizeZipEntryPathForWrite = (path: string): string => {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
};

const copyBytes = (bytes: Uint8Array): ArrayBuffer => {
  const copied = new Uint8Array(bytes.length);
  copied.set(bytes);
  return copied.buffer;
};

const responseBodyFromBytes = (bytes: Uint8Array, unavailableMessage: string): ReadableStream<Uint8Array> => {
  const body = new Response(copyBytes(bytes)).body;
  if (!body) {
    throw new Error(unavailableMessage);
  }
  return body;
};

const responseStreamToBytes = async (stream: BodyInit): Promise<Uint8Array> => {
  const arrayBuffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(arrayBuffer);
};

const decodeZipFileName = (bytes: Uint8Array, utf8Flag: boolean): string => {
  if (utf8Flag) return decodeUtf8(bytes);
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
};

const findEndOfCentralDirectoryOffset = (bytes: Uint8Array): number => {
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (readU32(bytes, offset) === ZIP_EOCD_SIG) return offset;
  }
  return -1;
};

const readCentralDirectoryBounds = (bytes: Uint8Array): ZipCentralDirectoryBounds => {
  const eocdOffset = findEndOfCentralDirectoryOffset(bytes);
  if (eocdOffset < 0) throw new Error("Invalid ZIP: end of central directory was not found.");

  const size = readU32(bytes, eocdOffset + 12);
  const offset = readU32(bytes, eocdOffset + 16);
  const end = offset + size;
  if (end > bytes.length) {
    throw new Error("Invalid ZIP: central directory is out of range.");
  }
  return { offset, end };
};

const readCentralDirectoryEntry = (bytes: Uint8Array, offset: number): ReadZipEntryResult => {
  if (readU32(bytes, offset) !== ZIP_CDFH_SIG) {
    throw new Error("Invalid ZIP: central directory entry is malformed.");
  }

  const flags = readU16(bytes, offset + 8);
  const compressionMethod = readU16(bytes, offset + 10);
  const compressedSize = readU32(bytes, offset + 20);
  const uncompressedSize = readU32(bytes, offset + 24);
  const fileNameLength = readU16(bytes, offset + 28);
  const extraLength = readU16(bytes, offset + 30);
  const commentLength = readU16(bytes, offset + 32);
  const localHeaderOffset = readU32(bytes, offset + 42);

  const fileNameStart = offset + 46;
  const fileNameEnd = fileNameStart + fileNameLength;
  if (fileNameEnd > bytes.length) {
    throw new Error("Invalid ZIP: entry filename is out of range.");
  }
  const fileName = decodeZipFileName(bytes.slice(fileNameStart, fileNameEnd), (flags & 0x0800) !== 0);
  const normalizedPath = normalizeZipPath(fileName);

  if (localHeaderOffset + 30 > bytes.length || readU32(bytes, localHeaderOffset) !== ZIP_LFH_SIG) {
    throw new Error(`Invalid ZIP: local header is missing for "${normalizedPath}".`);
  }
  const localNameLength = readU16(bytes, localHeaderOffset + 26);
  const localExtraLength = readU16(bytes, localHeaderOffset + 28);
  const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
  if (dataOffset + compressedSize > bytes.length) {
    throw new Error(`Invalid ZIP: data is out of range for "${normalizedPath}".`);
  }

  const nextOffset = fileNameEnd + extraLength + commentLength;
  if (!normalizedPath || normalizedPath.endsWith("/")) {
    return { entry: null, nextOffset };
  }

  return {
    entry: {
      path: normalizedPath,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      dataOffset,
    },
    nextOffset,
  };
};

const readZipEntries = (bytes: Uint8Array): ZipEntry[] => {
  const centralDirectory = readCentralDirectoryBounds(bytes);

  const entries: ZipEntry[] = [];
  let offset = centralDirectory.offset;
  while (offset < centralDirectory.end) {
    const result = readCentralDirectoryEntry(bytes, offset);
    if (result.entry) entries.push(result.entry);
    offset = result.nextOffset;
  }

  return entries;
};

const readNonEmptyZipArchive = (archiveBuffer: ArrayBuffer): { archiveBytes: Uint8Array; entries: ZipEntry[] } => {
  const archiveBytes = new Uint8Array(archiveBuffer);
  const entries = readZipEntries(archiveBytes);
  if (!entries.length) {
    throw new Error("The ZIP archive is empty.");
  }
  return { archiveBytes, entries };
};

const inflateDeflateRaw = async (compressed: Uint8Array): Promise<Uint8Array> => {
  const DS = (globalThis as { DecompressionStream?: new (format: string) => unknown }).DecompressionStream;
  if (!DS) {
    throw new Error("DecompressionStream is not available in this runtime.");
  }

  const source = responseBodyFromBytes(compressed, "DecompressionStream source body is not available in this runtime.");
  const stream = source.pipeThrough(new DS("deflate-raw") as never);
  return responseStreamToBytes(stream);
};

const extractEntryBytes = async (archiveBytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> => {
  const compressed = archiveBytes.slice(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  if (entry.compressionMethod === 0) {
    return compressed;
  }
  if (entry.compressionMethod === 8) {
    const inflated = await inflateDeflateRaw(compressed);
    return inflated;
  }
  throw new Error(`Unsupported ZIP compression method: ${entry.compressionMethod}.`);
};

const extractEntryText = async (archiveBytes: Uint8Array, entry: ZipEntry): Promise<string> => {
  return decodeUtf8(await extractEntryBytes(archiveBytes, entry));
};

const findEntryByPath = (entries: ZipEntry[], path: string): ZipEntry | null => {
  const normalized = normalizeZipPath(path);
  return entries.find((entry) => entry.path === normalized) ?? null;
};

const findLikelyMusicXmlEntry = (entries: ZipEntry[]): ZipEntry | null => {
  for (const entry of entries) {
    const p = entry.path.toLowerCase();
    if (p.endsWith(".musicxml")) return entry;
  }
  for (const entry of entries) {
    const p = entry.path.toLowerCase();
    if (p.endsWith(".xml") && p !== "meta-inf/container.xml") return entry;
  }
  return null;
};

const normalizeZipExtensions = (extensions: string[]): string[] => {
  return extensions.map((ext) => ext.trim().toLowerCase()).filter((ext) => ext.length > 0);
};

const zipEntryPathHasAnyExtension = (entry: ZipEntry, extensions: string[]): boolean => {
  const p = entry.path.toLowerCase();
  return extensions.some((ext) => p.endsWith(ext));
};

const findFirstEntryByExtensions = (entries: ZipEntry[], extensions: string[]): ZipEntry | null => {
  const normalized = normalizeZipExtensions(extensions);
  if (!normalized.length) return null;
  for (const entry of entries) {
    if (zipEntryPathHasAnyExtension(entry, normalized)) return entry;
  }
  return null;
};

const listRootEntriesByExtensions = (entries: ZipEntry[], extensions: string[]): ZipEntry[] => {
  const normalized = normalizeZipExtensions(extensions);
  if (!normalized.length) return [];
  return entries.filter((entry) => {
    if (entry.path.includes("/")) return false;
    return zipEntryPathHasAnyExtension(entry, normalized);
  });
};

const parseContainerRootFilePath = (containerXmlText: string): string | null => {
  const doc = new DOMParser().parseFromString(containerXmlText, "application/xml");
  if (doc.querySelector("parsererror")) return null;
  const rootFileNode = doc.querySelector("rootfile[full-path]");
  const fullPath = rootFileNode?.getAttribute("full-path")?.trim() ?? "";
  return fullPath || null;
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

const toDosDateTime = (date: Date): ZipDosDateTime => {
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

const sumByteLengths = (chunks: Uint8Array[]): number => {
  return chunks.reduce((sum, chunk) => sum + chunk.length, 0);
};

const compressDeflateRaw = async (input: Uint8Array): Promise<Uint8Array | null> => {
  const CS = (globalThis as { CompressionStream?: new (format: string) => unknown }).CompressionStream;
  if (!CS) return null;
  try {
    const body = responseBodyFromBytes(input, "CompressionStream source body is not available in this runtime.");
    const stream = body.pipeThrough(new CS("deflate-raw") as never);
    return responseStreamToBytes(stream);
  } catch {
    return null;
  }
};

export const formatXmlWithTwoSpaceIndent = (xml: string): string => {
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

export const bytesToArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
};

const encodeZipEntries = async (
  entries: ZipEntryPayload[],
  preferCompression: boolean
): Promise<EncodedZipEntry[]> => {
  const encodedEntries: EncodedZipEntry[] = [];
  for (const entry of entries) {
    const pathBytes = encodeUtf8(normalizeZipEntryPathForWrite(entry.path));
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
  return encodedEntries;
};

const buildZipLocalHeader = (
  entry: EncodedZipEntry,
  nowDos: ZipDosDateTime
): Uint8Array => {
  const { pathBytes, crc, method, compressedSize, uncompressedSize } = entry;
  const localHeader = new Uint8Array(30 + pathBytes.length);
  writeU32(localHeader, 0, ZIP_LFH_SIG);
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
  return localHeader;
};

const buildZipCentralHeader = (
  entry: EncodedZipEntry,
  nowDos: ZipDosDateTime,
  localOffset: number
): Uint8Array => {
  const { pathBytes, crc, method, compressedSize, uncompressedSize } = entry;
  const centralHeader = new Uint8Array(46 + pathBytes.length);
  writeU32(centralHeader, 0, ZIP_CDFH_SIG);
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
  return centralHeader;
};

const buildZipEndOfCentralDirectory = (
  entryCount: number,
  centralSize: number,
  localSize: number
): Uint8Array => {
  const eocd = new Uint8Array(22);
  writeU32(eocd, 0, ZIP_EOCD_SIG);
  writeU16(eocd, 4, 0);
  writeU16(eocd, 6, 0);
  writeU16(eocd, 8, entryCount);
  writeU16(eocd, 10, entryCount);
  writeU32(eocd, 12, centralSize);
  writeU32(eocd, 16, localSize);
  writeU16(eocd, 20, 0);
  return eocd;
};

const concatZipChunks = (
  localChunks: Uint8Array[],
  centralChunks: Uint8Array[],
  eocd: Uint8Array
): Uint8Array => {
  const localSize = sumByteLengths(localChunks);
  const centralSize = sumByteLengths(centralChunks);
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

export const makeZipBytes = async (entries: ZipEntryPayload[], preferCompression: boolean): Promise<Uint8Array> => {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;
  const nowDos = toDosDateTime(new Date());
  const encodedEntries = await encodeZipEntries(entries, preferCompression);

  for (const entry of encodedEntries) {
    const { data, compressedSize } = entry;
    const localHeader = buildZipLocalHeader(entry, nowDos);
    localChunks.push(localHeader, data);

    centralChunks.push(buildZipCentralHeader(entry, nowDos, localOffset));

    localOffset += localHeader.length + compressedSize;
  }

  const localSize = sumByteLengths(localChunks);
  const centralSize = sumByteLengths(centralChunks);
  const eocd = buildZipEndOfCentralDirectory(entries.length, centralSize, localSize);
  return concatZipChunks(localChunks, centralChunks, eocd);
};

export const makeMxlBytes = async (formattedXml: string): Promise<Uint8Array> => {
  const containerXml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">` +
    `<rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles>` +
    `</container>`;
  return makeZipBytes([
    { path: "META-INF/container.xml", bytes: encodeUtf8(containerXml) },
    { path: "score.musicxml", bytes: encodeUtf8(formattedXml) },
  ], true);
};

export const makeMsczBytes = async (mscxText: string): Promise<Uint8Array> => {
  return makeZipBytes([{ path: "score.mscx", bytes: encodeUtf8(mscxText) }], true);
};

export const extractMusicXmlTextFromMxl = async (archiveBuffer: ArrayBuffer): Promise<string> => {
  const archiveBytes = new Uint8Array(archiveBuffer);
  const entries = readZipEntries(archiveBytes);
  if (entries.length === 0) {
    throw new Error("The MXL archive is empty.");
  }

  const containerEntry = findEntryByPath(entries, "META-INF/container.xml");
  if (containerEntry) {
    const containerText = await extractEntryText(archiveBytes, containerEntry);
    const rootPath = parseContainerRootFilePath(containerText);
    if (rootPath) {
      const rootEntry = findEntryByPath(entries, rootPath);
      if (!rootEntry) {
        throw new Error(`MusicXML root file was not found in archive: ${rootPath}`);
      }
      return extractEntryText(archiveBytes, rootEntry);
    }
  }

  const fallbackEntry = findLikelyMusicXmlEntry(entries);
  if (!fallbackEntry) {
    throw new Error("No MusicXML file (.musicxml or .xml) was found in the MXL archive.");
  }
  return extractEntryText(archiveBytes, fallbackEntry);
};

export const extractTextFromZipByExtensions = async (
  archiveBuffer: ArrayBuffer,
  extensions: string[]
): Promise<string> => {
  const { archiveBytes, entries } = readNonEmptyZipArchive(archiveBuffer);
  const entry = findFirstEntryByExtensions(entries, extensions);
  if (!entry) {
    throw new Error(`No matching entry was found for extensions: ${extensions.join(", ")}`);
  }
  return extractEntryText(archiveBytes, entry);
};

export const listZipRootEntryPathsByExtensions = async (
  archiveBuffer: ArrayBuffer,
  extensions: string[]
): Promise<string[]> => {
  const { entries } = readNonEmptyZipArchive(archiveBuffer);
  return listRootEntriesByExtensions(entries, extensions).map((entry) => entry.path);
};

export const extractZipEntryBytesByPath = async (
  archiveBuffer: ArrayBuffer,
  entryPath: string
): Promise<Uint8Array> => {
  const { archiveBytes, entries } = readNonEmptyZipArchive(archiveBuffer);
  const entry = findEntryByPath(entries, entryPath);
  if (!entry) {
    throw new Error(`ZIP entry not found: ${entryPath}`);
  }
  return extractEntryBytes(archiveBytes, entry);
};
