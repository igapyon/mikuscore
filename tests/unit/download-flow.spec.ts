/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  createAbcDownloadPayload,
  createJsonDownloadPayload,
  createLilyPondDownloadPayload,
  createMuseScoreDownloadPayload,
  createMusicXmlDownloadPayload,
  createSvgDownloadPayload,
  createVsqxDownloadPayload,
} from "../../src/ts/download-flow";
import {
  extractMusicXmlTextFromMxl,
  extractTextFromZipByExtensions,
  extractZipEntryBytesByPath,
  listZipRootEntryPathsByExtensions,
} from "../../src/ts/mxl-io";
import { bytesToArrayBuffer, makeZipBytes } from "../../src/ts/zip-io";

const encodeUtf8 = (text: string): Uint8Array => {
  return new TextEncoder().encode(text);
};

const readBlobAsArrayBuffer = async (blob: Blob): Promise<ArrayBuffer> => {
  const reader = new FileReader();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read blob."));
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) {
        resolve(result);
        return;
      }
      reject(new Error("Blob read did not produce ArrayBuffer."));
    };
    reader.readAsArrayBuffer(blob);
  });
};

const readBlobAsText = async (blob: Blob): Promise<string> => {
  const ab = await readBlobAsArrayBuffer(blob);
  return new TextDecoder().decode(new Uint8Array(ab));
};

describe("download-flow compressed export", () => {
  it("uses .musicxml for plain MusicXML export by default", async () => {
    const xml = `<score-partwise version="4.0"><part-list/></score-partwise>`;
    const payload = await createMusicXmlDownloadPayload(xml);
    expect(payload.fileName.endsWith(".musicxml")).toBe(true);
  });

  it("uses .xml for plain MusicXML export when xml extension option is enabled", async () => {
    const xml = `<score-partwise version="4.0"><part-list/></score-partwise>`;
    const payload = await createMusicXmlDownloadPayload(xml, { useXmlExtension: true });
    expect(payload.fileName.endsWith(".xml")).toBe(true);
  });

  it("creates .mxl payload when MusicXML compression is enabled", async () => {
    const xml = `<score-partwise version="4.0"><part-list/></score-partwise>`;
    const payload = await createMusicXmlDownloadPayload(xml, { compressed: true });
    expect(payload.fileName.endsWith(".mxl")).toBe(true);
    const ab = await readBlobAsArrayBuffer(payload.blob);
    const extracted = await extractMusicXmlTextFromMxl(ab);
    expect(extracted).toContain("<score-partwise");
  });

  it("creates .mscz payload when MuseScore compression is enabled", async () => {
    const xml = `<score-partwise version="4.0"><part-list/></score-partwise>`;
    const payload = await createMuseScoreDownloadPayload(
      xml,
      () => `<?xml version="1.0" encoding="UTF-8"?><museScore version="4.0"><Score/></museScore>`,
      { compressed: true }
    );
    expect(payload).not.toBeNull();
    if (!payload) return;
    expect(payload.fileName.endsWith(".mscz")).toBe(true);
    const ab = await readBlobAsArrayBuffer(payload.blob);
    const extracted = await extractTextFromZipByExtensions(ab, [".mscx"]);
    expect(extracted).toContain("<museScore");
    expect(extracted).toContain("\n  <Score");
  });

  it("formats plain .mscx output with 2-space indentation", async () => {
    const xml = `<score-partwise version="4.0"><part-list/></score-partwise>`;
    const payload = await createMuseScoreDownloadPayload(
      xml,
      () => `<?xml version="1.0" encoding="UTF-8"?><museScore version="4.0"><Score><Staff id="1"/></Score></museScore>`
    );
    expect(payload).not.toBeNull();
    if (!payload) return;
    expect(payload.fileName.endsWith(".mscx")).toBe(true);
    const text = await readBlobAsText(payload.blob);
    expect(text).toContain("\n  <Score>");
    expect(text).toContain("\n    <Staff id=\"1\"/>");
  });

  it("formats .vsqx output with 2-space indentation", async () => {
    const payload = createVsqxDownloadPayload(
      `<?xml version="1.0" encoding="UTF-8"?><vsq4><vVoiceTable><vVoice/></vVoiceTable></vsq4>`
    );
    expect(payload.fileName.endsWith(".vsqx")).toBe(true);
    const text = await readBlobAsText(payload.blob);
    expect(text).toContain("\n  <vVoiceTable>");
    expect(text).toContain("\n    <vVoice/>");
  });

  it("sets stable MIME types for direct SVG and JSON downloads", () => {
    const svgPayload = createSvgDownloadPayload("<svg/>");
    const jsonPayload = createJsonDownloadPayload("{\"ok\":true}");

    expect(svgPayload.fileName.endsWith(".svg")).toBe(true);
    expect(svgPayload.blob.type).toBe("image/svg+xml;charset=utf-8");
    expect(jsonPayload.fileName.endsWith(".json")).toBe(true);
    expect(jsonPayload.blob.type).toBe("application/json;charset=utf-8");
  });

  it("lists only ZIP root entries by extension", async () => {
    const payload = await createMusicXmlDownloadPayload(
      `<score-partwise version="4.0"><part-list/></score-partwise>`,
      { compressed: true }
    );
    const archiveBuffer = await readBlobAsArrayBuffer(payload.blob);
    const rootEntries = await listZipRootEntryPathsByExtensions(archiveBuffer, [".xml", ".musicxml"]);
    expect(rootEntries.some((entry) => entry.toLowerCase() === "meta-inf/container.xml")).toBe(false);
    expect(rootEntries.length).toBeGreaterThan(0);
  });

  it("extracts ZIP entry bytes by exact path", async () => {
    const payload = await createMuseScoreDownloadPayload(
      `<score-partwise version="4.0"><part-list/></score-partwise>`,
      () => `<?xml version="1.0" encoding="UTF-8"?><museScore version="4.0"><Score/></museScore>`,
      { compressed: true }
    );
    expect(payload).not.toBeNull();
    if (!payload) return;
    const archiveBuffer = await readBlobAsArrayBuffer(payload.blob);
    const rootEntries = await listZipRootEntryPathsByExtensions(archiveBuffer, [".mscx"]);
    expect(rootEntries.length).toBe(1);
    const extracted = await extractZipEntryBytesByPath(archiveBuffer, rootEntries[0]);
    const extractedText = new TextDecoder().decode(extracted);
    expect(extractedText).toContain("<museScore");
  });

  it("rejects archives without a ZIP end of central directory", async () => {
    await expect(
      extractTextFromZipByExtensions(bytesToArrayBuffer(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), [".xml"])
    ).rejects.toThrow("Invalid ZIP: end of central directory was not found.");
  });

  it("rejects empty ZIP archives for extension extraction", async () => {
    const archiveBytes = await makeZipBytes([], false);

    await expect(
      extractTextFromZipByExtensions(bytesToArrayBuffer(archiveBytes), [".xml"])
    ).rejects.toThrow("The ZIP archive is empty.");
  });

  it("ignores directory entries when listing ZIP root entries", async () => {
    const archiveBytes = await makeZipBytes([
      { path: "score.musicxml", bytes: encodeUtf8("<score-partwise/>") },
      { path: "nested/score.musicxml", bytes: encodeUtf8("<score-partwise/>") },
      { path: "nested/", bytes: new Uint8Array() },
    ], false);

    const rootEntries = await listZipRootEntryPathsByExtensions(bytesToArrayBuffer(archiveBytes), [".musicxml"]);

    expect(rootEntries).toEqual(["score.musicxml"]);
  });

  it("falls back to a likely MusicXML entry when MXL has no container rootfile", async () => {
    const archiveBytes = await makeZipBytes([
      { path: "score.xml", bytes: encodeUtf8("<score-partwise><part-list/></score-partwise>") },
    ], false);

    const extracted = await extractMusicXmlTextFromMxl(bytesToArrayBuffer(archiveBytes));

    expect(extracted).toContain("<score-partwise>");
  });

  it("rejects exact ZIP entry extraction when the path does not exist", async () => {
    const archiveBytes = await makeZipBytes([
      { path: "score.musicxml", bytes: encodeUtf8("<score-partwise/>") },
    ], false);

    await expect(
      extractZipEntryBytesByPath(bytesToArrayBuffer(archiveBytes), "missing.musicxml")
    ).rejects.toThrow("ZIP entry not found: missing.musicxml");
  });

  it("rejects extension extraction when no ZIP entry matches", async () => {
    const archiveBytes = await makeZipBytes([
      { path: "score.musicxml", bytes: encodeUtf8("<score-partwise/>") },
    ], false);

    await expect(
      extractTextFromZipByExtensions(bytesToArrayBuffer(archiveBytes), [".mscx"])
    ).rejects.toThrow("No matching entry was found for extensions: .mscx");
  });

  it("rejects MXL when container rootfile points to a missing entry", async () => {
    const containerXml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">` +
      `<rootfiles><rootfile full-path="missing.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles>` +
      `</container>`;
    const archiveBytes = await makeZipBytes([
      { path: "META-INF/container.xml", bytes: encodeUtf8(containerXml) },
      { path: "score.musicxml", bytes: encodeUtf8("<score-partwise/>") },
    ], false);

    await expect(
      extractMusicXmlTextFromMxl(bytesToArrayBuffer(archiveBytes))
    ).rejects.toThrow("MusicXML root file was not found in archive: missing.musicxml");
  });

  it("returns null when text-format conversion throws", () => {
    const xml = `<score-partwise version="4.0"><part-list/></score-partwise>`;

    const abcPayload = createAbcDownloadPayload(xml, () => {
      throw new Error("ABC export failed");
    });
    const lilyPayload = createLilyPondDownloadPayload(xml, () => {
      throw new Error("LilyPond export failed");
    });

    expect(abcPayload).toBeNull();
    expect(lilyPayload).toBeNull();
  });

  it("returns null when MuseScore export receives invalid MusicXML", async () => {
    const payload = await createMuseScoreDownloadPayload(`<not-musicxml`, () => "<museScore/>");
    expect(payload).toBeNull();
  });
});
