import type { RawMidiRetriggerPolicy } from "./midi-io";

export type MidiExportProfile = "safe" | "musescore_parity";
export type MidiExportEventBuildPolicy = "safe_midi" | "musescore_parity_tuned";

export const MUSESCORE_PARITY_TICKS_PER_QUARTER = 480;

export const normalizeMidiExportProfile = (value: unknown): MidiExportProfile => {
  return value === "musescore_parity" ? "musescore_parity" : "safe";
};

export const resolveMidiExportRuntimeOptions = (
  profileValue: unknown,
  baseTicksPerQuarter: number
): {
  profile: MidiExportProfile;
  ticksPerQuarter: number;
  normalizeForParity: boolean;
  eventBuildPolicy: MidiExportEventBuildPolicy;
  includeGraceInPlaybackLikeMode: boolean;
  includeOrnamentInPlaybackLikeMode: boolean;
  includeTieInPlaybackLikeMode: boolean;
  rawWriter: boolean;
  rawRetriggerPolicy: RawMidiRetriggerPolicy;
} => {
  const profile = normalizeMidiExportProfile(profileValue);
  const normalizedBaseTicks =
    Number.isFinite(baseTicksPerQuarter) && Math.round(baseTicksPerQuarter) > 0
      ? Math.round(baseTicksPerQuarter)
      : 480;
  if (profile === "musescore_parity") {
    return {
      profile,
      ticksPerQuarter: MUSESCORE_PARITY_TICKS_PER_QUARTER,
      normalizeForParity: true,
      eventBuildPolicy: "musescore_parity_tuned",
      includeGraceInPlaybackLikeMode: true,
      includeOrnamentInPlaybackLikeMode: true,
      includeTieInPlaybackLikeMode: true,
      rawWriter: true,
      rawRetriggerPolicy: "off_before_on",
    };
  }
  return {
    profile,
    ticksPerQuarter: normalizedBaseTicks,
    normalizeForParity: false,
    eventBuildPolicy: "safe_midi",
    includeGraceInPlaybackLikeMode: false,
    includeOrnamentInPlaybackLikeMode: false,
    includeTieInPlaybackLikeMode: false,
    rawWriter: false,
    rawRetriggerPolicy: "off_before_on",
  };
};

export const resolvePlaybackBuildModeForMidiExport = (
  policy: MidiExportEventBuildPolicy
): "midi" | "playback" => {
  if (policy === "musescore_parity_tuned") {
    // IMPORTANT:
    // This is not "quick playback mode" semantics.
    // We intentionally reuse the playback-style event shaping because it currently
    // matches MuseScore-exported MIDI closer in parity measurements.
    return "playback";
  }
  return "midi";
};
