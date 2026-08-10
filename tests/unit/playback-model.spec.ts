/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildPlaybackPlan } from "../../src/ts/playback-model";

const twoMeasureScore = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>Playback boundary</work-title></work>
  <part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>480</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <direction><sound tempo="96"/></direction>
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>whole</type>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch><step>D</step><octave>4</octave></pitch>
        <duration>1920</duration><voice>1</voice><type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>`;

const baseOptions = {
  ticksPerQuarter: 480,
  useMidiLikePlayback: false,
  graceTimingMode: "steal-current" as const,
  metricAccentEnabled: false,
  metricAccentProfile: "classic" as const,
};

describe("value-based playback planning", () => {
  it("builds a synth schedule without Web Audio or UI callbacks", () => {
    const result = buildPlaybackPlan(twoMeasureScore, baseOptions);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe("playback");
    expect(result.eventCount).toBe(2);
    expect(result.schedule.events.map((event) => event.start)).toEqual([0, 1920]);
    expect(result.measureTimeline.map((range) => range.location.measureNumber)).toEqual(["1", "2"]);
    expect(result.midiByteLength).toBeNull();
  });

  it("trims both notes and measure locations when starting from a selected measure", () => {
    const result = buildPlaybackPlan(twoMeasureScore, {
      ...baseOptions,
      startFromMeasure: { partId: "P1", measureNumber: "2" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.eventCount).toBe(1);
    expect(result.schedule.events[0]?.start).toBe(0);
    expect(result.initialLocation).toEqual({ partId: "P1", measureNumber: "2" });
    expect(result.measureTimeline[0]).toMatchObject({
      startTick: 0,
      location: { partId: "P1", measureNumber: "2" },
    });
  });

  it("can validate the MIDI representation while returning the same value schedule", () => {
    const result = buildPlaybackPlan(twoMeasureScore, {
      ...baseOptions,
      useMidiLikePlayback: true,
      includeMidiByteLength: true,
    });

    expect(
      result.ok,
      result.ok ? undefined : `${result.code}: ${result.message}`
    ).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe("midi");
    expect(result.schedule.tempoEvents).toContainEqual({ startTick: 0, bpm: 96 });
    expect(result.midiByteLength).toBeGreaterThan(0);
  });

  it("returns stable failure codes for invalid or silent input", () => {
    const invalid = buildPlaybackPlan("<score-partwise", baseOptions);
    const silent = buildPlaybackPlan(
      '<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Music</part-name></score-part></part-list><part id="P1"><measure number="1"/></part></score-partwise>',
      baseOptions
    );

    expect(invalid).toMatchObject({ ok: false, code: "INVALID_MUSICXML" });
    expect(silent).toMatchObject({ ok: false, code: "NO_PLAYABLE_NOTES" });
  });
});
