// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ScoreCore } from "../../core/ScoreCore";
import type { CoreCommand, Pitch } from "../../core/interfaces";
import { loadFixture } from "../unit/fixtureLoader";

const BASE_XML = loadFixture("base.musicxml");
const XML_WITH_UNKNOWN = loadFixture("with_unknown.musicxml");
const XML_WITH_BEAM = loadFixture("with_beam.musicxml");
const XML_WITH_BACKUP_SAFE = loadFixture("with_backup_safe.musicxml");

class Lcg {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state;
  }

  pick<T>(arr: T[]): T {
    return arr[this.next() % arr.length];
  }

  int(min: number, max: number): number {
    return min + (this.next() % (max - min + 1));
  }

  chance(percent: number): boolean {
    return this.int(1, 100) <= percent;
  }
}

const makePitch = (rng: Lcg): Pitch => ({
  step: rng.pick(["A", "B", "C", "D", "E", "F", "G"]),
  octave: rng.int(2, 6),
  ...(rng.chance(50) ? { alter: rng.pick([-2, -1, 0, 1, 2]) } : {}),
});

const makeCommand = (rng: Lcg, nodeIds: string[]): CoreCommand => {
  if (nodeIds.length === 0 || rng.chance(10)) {
    return { type: "ui_noop", reason: "cursor_move" };
  }

  const target = rng.pick(nodeIds);
  const type = rng.pick(["change_to_pitch", "change_duration", "insert_note_after", "delete_note"]);

  if (type === "change_to_pitch") {
    return {
      type,
      targetNodeId: target,
      voice: rng.chance(85) ? "1" : "2",
      pitch: makePitch(rng),
    };
  }

  if (type === "change_duration") {
    return {
      type,
      targetNodeId: target,
      voice: rng.chance(85) ? "1" : "2",
      duration: rng.chance(95) ? rng.int(1, 4) : 0,
    };
  }

  if (type === "insert_note_after") {
    return {
      type,
      anchorNodeId: target,
      voice: rng.chance(85) ? "1" : "2",
      note: {
        duration: rng.chance(95) ? rng.int(1, 2) : 0,
        pitch: makePitch(rng),
      },
    };
  }

  return {
    type,
    targetNodeId: target,
    voice: rng.chance(85) ? "1" : "2",
  };
};

const makeNonStructuralCommand = (rng: Lcg, nodeIds: string[]): CoreCommand => {
  if (nodeIds.length === 0 || rng.chance(15)) {
    return { type: "ui_noop", reason: "cursor_move" };
  }
  const target = rng.pick(nodeIds);
  const type = rng.pick(["change_to_pitch", "change_duration"]);
  if (type === "change_to_pitch") {
    return {
      type,
      targetNodeId: target,
      voice: rng.chance(90) ? "1" : "2",
      pitch: makePitch(rng),
    };
  }
  return {
    type,
    targetNodeId: target,
    voice: rng.chance(90) ? "1" : "2",
    duration: rng.chance(95) ? rng.int(1, 4) : 0,
  };
};

describe("ScoreCore properties", () => {
  it("reject path keeps state unchanged and changedNodeIds empty", () => {
    for (const seed of [1, 7, 17, 31, 97]) {
      const rng = new Lcg(seed);
      const core = new ScoreCore();
      core.load(BASE_XML);

      for (let i = 0; i < 120; i += 1) {
        const before = core.save();
        const command = makeCommand(rng, core.listNoteNodeIds());
        const result = core.dispatch(command);

        if (!result.ok) {
          expect(result.changedNodeIds).toEqual([]);
          const after = core.save();
          expect(after.ok).toBe(before.ok);
          expect(after.mode).toBe(before.mode);
          expect(after.xml).toBe(before.xml);
        }
      }
    }
  });

  it("preserves unknown elements, existing beam, and backup/forward across random edits", () => {
    const fixtures = [
      { xml: XML_WITH_UNKNOWN, marker: "<unknown-tag foo=\"bar\">x</unknown-tag>" },
      { xml: XML_WITH_BEAM, marker: "<beam number=\"1\">begin</beam>" },
      { xml: XML_WITH_BACKUP_SAFE, marker: "<backup><duration>1</duration></backup>" },
    ];

    for (const { xml, marker } of fixtures) {
      const rng = new Lcg(marker.length * 13 + 11);
      const core = new ScoreCore();
      core.load(xml);

      for (let i = 0; i < 80; i += 1) {
        const command = makeNonStructuralCommand(rng, core.listNoteNodeIds());
        core.dispatch(command);
        const saved = core.save();
        if (saved.ok) {
          expect(saved.xml).toContain(marker);
        }
      }
    }
  });
});
