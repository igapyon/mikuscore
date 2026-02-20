// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  createMuseScoreDownloadPayload,
  createMusicXmlDownloadPayload,
} from "../../src/ts/download-flow";
import { extractMusicXmlTextFromMxl, extractTextFromZipByExtensions } from "../../src/ts/mxl-io";

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

describe("download-flow compressed export", () => {
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
  });
});
