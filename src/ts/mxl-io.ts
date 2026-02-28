type ZipEntry = {
  path: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  dataOffset: number;
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
  // EOCD is within the last 65,557 bytes by ZIP spec.
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
    throw new Error("DecompressionStream is not available in this browser.");
  }

  const copied = new Uint8Array(compressed.length);
  copied.set(compressed);
  const stream = new Blob([copied.buffer]).stream().pipeThrough(new DS("deflate-raw") as never);
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
    if (entry.uncompressedSize > 0 && inflated.length !== entry.uncompressedSize) {
      // Keep going: some archives are inconsistent here, but data is often still valid.
    }
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
