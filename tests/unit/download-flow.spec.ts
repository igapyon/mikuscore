// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  createMuseScoreDownloadPayload,
  createMusicXmlDownloadPayload,
  createVsqxDownloadPayload,
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
});
