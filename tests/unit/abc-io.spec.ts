// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { convertAbcToMusicXml, exportMusicXmlDomToAbc } from "../../src/ts/abc-io";
import { parseMusicXmlDocument } from "../../src/ts/musicxml-io";
import { loadFixture } from "./fixtureLoader";

const BASE_XML = loadFixture("base.musicxml");

describe("ABC I/O compatibility", () => {
  it("roundtrip: exported ABC can be converted back to MusicXML", () => {
    const srcDoc = parseMusicXmlDocument(BASE_XML);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    expect(abc.trim().length).toBeGreaterThan(0);

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
  });

  it("ABC->MusicXML conversion must not emit voice/layer 0", () => {
    const srcDoc = parseMusicXmlDocument(BASE_XML);
    expect(srcDoc).not.toBeNull();
    if (!srcDoc) return;

    const abc = exportMusicXmlDomToAbc(srcDoc);
    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const voices = Array.from(outDoc.querySelectorAll("note > voice")).map((v) =>
      (v.textContent || "").trim()
    );
    expect(voices.length).toBeGreaterThan(0);
    expect(voices.every((v) => /^[1-9]\d*$/.test(v))).toBe(true);
  });
});

