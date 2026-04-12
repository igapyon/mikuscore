// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { convertAbcToMusicXml } from "../../src/ts/abc-io";
import { parseMusicXmlDocument } from "../../src/ts/musicxml-io";

describe("ABC inline voice switching across lines", () => {
  it("keeps standalone [V:...] lines as the active voice for following body lines", () => {
    const abc = `X:1
T:April Window
C:Codex
M:3/4
L:1/8
Q:1/4=96
K:Dm
V:1 clef=treble name="Melody"
V:2 clef=bass name="Accompaniment"

[V:1]
A2 d2 f2 | e2 d2 A2 |

[V:2]
D,2 A,2 d2 | C2 G,2 c2 |`;

    const xml = convertAbcToMusicXml(abc);
    const outDoc = parseMusicXmlDocument(xml);
    expect(outDoc).not.toBeNull();
    if (!outDoc) return;

    const upperSteps = Array.from(outDoc.querySelectorAll('part[id="P1"] > measure > note > pitch > step')).map((node) =>
      node.textContent?.trim()
    );
    const lowerSteps = Array.from(outDoc.querySelectorAll('part[id="P2"] > measure > note > pitch > step')).map((node) =>
      node.textContent?.trim()
    );
    const upperRests = outDoc.querySelectorAll('part[id="P1"] > measure > note > rest');
    const lowerRests = outDoc.querySelectorAll('part[id="P2"] > measure > note > rest');

    expect(upperSteps).toEqual(["A", "D", "F", "E", "D", "A"]);
    expect(lowerSteps).toEqual(["D", "A", "D", "C", "G", "C"]);
    expect(upperRests.length).toBe(0);
    expect(lowerRests.length).toBe(0);
  });
});
