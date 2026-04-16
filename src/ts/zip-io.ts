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

const decodeZipFileName = (bytes: Uint8Array, utf8Flag: boolean): string => {
  if (utf8Flag) return new TextDecoder("utf-8").decode(bytes);
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

const readZipEntries = (bytes: Uint8Array): ZipEntry[] => {
  const eocdOffset = findEndOfCentralDirectoryOffset(bytes);
  if (eocdOffset < 0) throw new Error("Invalid ZIP: end of central directory was not found.");

  const centralDirectorySize = readU32(bytes, eocdOffset + 12);
  const centralDirectoryOffset = readU32(bytes, eocdOffset + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (centralDirectoryEnd > bytes.length) {
    throw new Error("Invalid ZIP: central directory is out of range.");
  }

  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;
  while (offset < centralDirectoryEnd) {
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

    if (normalizedPath && !normalizedPath.endsWith("/")) {
      entries.push({
        path: normalizedPath,
        compressionMethod,
        compressedSize,
        uncompressedSize,
        dataOffset,
      });
    }

    offset = fileNameEnd + extraLength + commentLength;
  }

  return entries;
};

const inflateDeflateRaw = async (compressed: Uint8Array): Promise<Uint8Array> => {
  const DS = (globalThis as { DecompressionStream?: new (format: string) => unknown }).DecompressionStream;
  if (!DS) {
    throw new Error("DecompressionStream is not available in this runtime.");
  }

  const copied = new Uint8Array(compressed.length);
  copied.set(compressed);
  const source = new Response(copied).body;
  if (!source) {
    throw new Error("DecompressionStream source body is not available in this runtime.");
  }
  const stream = source.pipeThrough(new DS("deflate-raw") as never);
  const arrayBuffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(arrayBuffer);
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

const findFirstEntryByExtensions = (entries: ZipEntry[], extensions: string[]): ZipEntry | null => {
  const normalized = extensions.map((ext) => ext.trim().toLowerCase()).filter((ext) => ext.length > 0);
  if (!normalized.length) return null;
  for (const entry of entries) {
    const p = entry.path.toLowerCase();
    if (normalized.some((ext) => p.endsWith(ext))) return entry;
  }
  return null;
};

const listRootEntriesByExtensions = (entries: ZipEntry[], extensions: string[]): ZipEntry[] => {
  const normalized = extensions.map((ext) => ext.trim().toLowerCase()).filter((ext) => ext.length > 0);
  if (!normalized.length) return [];
  return entries.filter((entry) => {
    if (entry.path.includes("/")) return false;
    const p = entry.path.toLowerCase();
    return normalized.some((ext) => p.endsWith(ext));
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
    const body = new Response(source).body;
    if (!body) return null;
    const stream = body.pipeThrough(new CS("deflate-raw") as never);
    const compressedBuffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(compressedBuffer);
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

export const makeZipBytes = async (entries: ZipEntryPayload[], preferCompression: boolean): Promise<Uint8Array> => {
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

export const makeMxlBytes = async (formattedXml: string): Promise<Uint8Array> => {
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

export const makeMsczBytes = async (mscxText: string): Promise<Uint8Array> => {
  const encoder = new TextEncoder();
  return makeZipBytes([{ path: "score.mscx", bytes: encoder.encode(mscxText) }], true);
};

export const extractMusicXmlTextFromMxl = async (archiveBuffer: ArrayBuffer): Promise<string> => {
  const archiveBytes = new Uint8Array(archiveBuffer);
  const entries = readZipEntries(archiveBytes);
  if (entries.length === 0) {
    throw new Error("The MXL archive is empty.");
  }

  const containerEntry = findEntryByPath(entries, "META-INF/container.xml");
  if (containerEntry) {
    const containerBytes = await extractEntryBytes(archiveBytes, containerEntry);
    const containerText = new TextDecoder("utf-8").decode(containerBytes);
    const rootPath = parseContainerRootFilePath(containerText);
    if (rootPath) {
      const rootEntry = findEntryByPath(entries, rootPath);
      if (!rootEntry) {
        throw new Error(`MusicXML root file was not found in archive: ${rootPath}`);
      }
      const xmlBytes = await extractEntryBytes(archiveBytes, rootEntry);
      return new TextDecoder("utf-8").decode(xmlBytes);
    }
  }

  const fallbackEntry = findLikelyMusicXmlEntry(entries);
  if (!fallbackEntry) {
    throw new Error("No MusicXML file (.musicxml or .xml) was found in the MXL archive.");
  }
  const xmlBytes = await extractEntryBytes(archiveBytes, fallbackEntry);
  return new TextDecoder("utf-8").decode(xmlBytes);
};

export const extractTextFromZipByExtensions = async (
  archiveBuffer: ArrayBuffer,
  extensions: string[]
): Promise<string> => {
  const archiveBytes = new Uint8Array(archiveBuffer);
  const entries = readZipEntries(archiveBytes);
  if (!entries.length) {
    throw new Error("The ZIP archive is empty.");
  }
  const entry = findFirstEntryByExtensions(entries, extensions);
  if (!entry) {
    throw new Error(`No matching entry was found for extensions: ${extensions.join(", ")}`);
  }
  const bytes = await extractEntryBytes(archiveBytes, entry);
  return new TextDecoder("utf-8").decode(bytes);
};

export const listZipRootEntryPathsByExtensions = async (
  archiveBuffer: ArrayBuffer,
  extensions: string[]
): Promise<string[]> => {
  const archiveBytes = new Uint8Array(archiveBuffer);
  const entries = readZipEntries(archiveBytes);
  if (!entries.length) {
    throw new Error("The ZIP archive is empty.");
  }
  return listRootEntriesByExtensions(entries, extensions).map((entry) => entry.path);
};

export const extractZipEntryBytesByPath = async (
  archiveBuffer: ArrayBuffer,
  entryPath: string
): Promise<Uint8Array> => {
  const archiveBytes = new Uint8Array(archiveBuffer);
  const entries = readZipEntries(archiveBytes);
  if (!entries.length) {
    throw new Error("The ZIP archive is empty.");
  }
  const entry = findEntryByPath(entries, entryPath);
  if (!entry) {
    throw new Error(`ZIP entry not found: ${entryPath}`);
  }
  return extractEntryBytes(archiveBytes, entry);
};
