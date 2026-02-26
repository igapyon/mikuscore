import {
  midiToPitch,
  resolveAccidentalTextForPitch,
} from "../../core/accidentalSpelling";
import {
  computeBeamAssignments,
} from "./beam-common";

type MuseScoreImportOptions = {
  sourceMetadata?: boolean;
  debugMetadata?: boolean;
  normalizeCutTimeToTwoTwo?: boolean;
};

type MuseScoreWarning = {
  code: "MUSESCORE_IMPORT_WARNING";
  message: string;
  measure?: number;
  staff?: number;
  voice?: number;
  atDiv?: number;
  action?: string;
  reason?: string;
  tag?: string;
  occupiedDiv?: number;
  capacityDiv?: number;
};

type ParsedMuseScoreEvent =
  | {
    kind: "rest";
    durationDiv: number;
    displayDurationDiv: number;
    voice: number;
    staffNo?: number;
    atDiv?: number;
    beamMode?: "begin" | "mid";
    tupletTimeModification?: { actualNotes: number; normalNotes: number };
    tupletStarts?: Array<{
      actualNotes: number;
      normalNotes: number;
      number: number;
      showNumber?: "actual" | "none";
      bracket?: "yes" | "no";
    }>;
    tupletStops?: number[];
    slurStarts?: number[];
    slurStops?: number[];
    trillStarts?: number[];
    trillStops?: number[];
  }
  | {
    kind: "chord";
    durationDiv: number;
    displayDurationDiv: number;
    notes: ParsedMuseScoreChordNote[];
    voice: number;
    staffNo?: number;
    atDiv?: number;
    beamMode?: "begin" | "mid";
    tupletTimeModification?: { actualNotes: number; normalNotes: number };
    tupletStarts?: Array<{
      actualNotes: number;
      normalNotes: number;
      number: number;
      showNumber?: "actual" | "none";
      bracket?: "yes" | "no";
    }>;
    tupletStops?: number[];
    slurStarts?: number[];
    slurStops?: number[];
    trillStarts?: number[];
    trillStops?: number[];
    articulationTags?: string[];
    technicalTags?: string[];
    grace?: boolean;
    graceSlash?: boolean;
  }
  | { kind: "dynamic"; mark: string; voice: number; staffNo?: number; atDiv: number; soundDynamics?: number }
  | { kind: "directionXml"; xml: string; voice: number; staffNo?: number; atDiv: number };

type ParsedMuseScoreChordNote = {
  midi: number;
  accidentalText: string | null;
  tieStart: boolean;
  tieStop: boolean;
  fingeringText: string | undefined;
  stringNumber: number | undefined;
};

type ParsedMuseScoreMeasure = {
  index: number;
  beats: number;
  beatType: number;
  timeSymbol: "cut" | null;
  explicitTimeSig: boolean;
  capacityDiv: number;
  implicit: boolean;
  fifths: number;
  mode: "major" | "minor";
  tempoBpm: number | null;
  tempoText: string | null;
  repeatForward: boolean;
  repeatBackward: boolean;
  leftDoubleBarline: boolean;
  events: ParsedMuseScoreEvent[];
};

const xmlEscape = (value: string): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const firstNumber = (scope: ParentNode, selector: string): number | null => {
  const text = (scope.querySelector(selector)?.textContent ?? "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

const firstAttrNumber = (scope: ParentNode, selector: string, attrName: string): number | null => {
  const raw = (scope.querySelector(selector)?.getAttribute(attrName) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const durationTypeToDivisions = (durationType: string, divisions: number): number | null => {
  const base = Math.max(1, Math.round(divisions));
  switch (String(durationType || "").trim().toLowerCase()) {
    case "whole":
      return base * 4;
    case "half":
      return base * 2;
    case "quarter":
      return base;
    case "eighth":
      return Math.round(base / 2);
    case "16th":
      return Math.round(base / 4);
    case "32nd":
      return Math.round(base / 8);
    case "64th":
      return Math.round(base / 16);
    default:
      return null;
  }
};

const durationWithDots = (baseDiv: number, dots: number): number => {
  let out = Math.max(1, Math.round(baseDiv));
  let extra = out;
  for (let i = 0; i < Math.max(0, Math.round(dots)); i += 1) {
    extra = Math.max(1, Math.round(extra / 2));
    out += extra;
  }
  return out;
};

const divisionToTypeAndDots = (divisions: number, durationDiv: number): { type: string; dots: number } => {
  const base = Math.max(1, Math.round(divisions));
  const candidates: Array<{ type: string; div: number }> = [
    { type: "whole", div: base * 4 },
    { type: "half", div: base * 2 },
    { type: "quarter", div: base },
    { type: "eighth", div: Math.max(1, Math.round(base / 2)) },
    { type: "16th", div: Math.max(1, Math.round(base / 4)) },
    { type: "32nd", div: Math.max(1, Math.round(base / 8)) },
    { type: "64th", div: Math.max(1, Math.round(base / 16)) },
  ];
  for (const c of candidates) {
    if (durationWithDots(c.div, 0) === durationDiv) return { type: c.type, dots: 0 };
    if (durationWithDots(c.div, 1) === durationDiv) return { type: c.type, dots: 1 };
    if (durationWithDots(c.div, 2) === durationDiv) return { type: c.type, dots: 2 };
  }
  let nearest = candidates[0];
  let best = Math.abs(nearest.div - durationDiv);
  for (const c of candidates) {
    const d = Math.abs(c.div - durationDiv);
    if (d < best) {
      best = d;
      nearest = c;
    }
  }
  return { type: nearest.type, dots: 0 };
};

const chunkString = (value: string, maxChunk: number): string[] => {
  const out: string[] = [];
  const size = Math.max(1, Math.round(maxChunk));
  for (let i = 0; i < value.length; i += size) out.push(value.slice(i, i + size));
  return out;
};

const buildWarningMiscXml = (warnings: MuseScoreWarning[]): string => {
  if (!warnings.length) return "";
  const maxEntries = Math.min(256, warnings.length);
  let xml = `<miscellaneous-field name="diag:count">${maxEntries}</miscellaneous-field>`;
  for (let i = 0; i < maxEntries; i += 1) {
    const warning = warnings[i];
    const attrs: string[] = [
      "level=warn",
      `code=${warning.code}`,
      "fmt=mscx",
      `message=${warning.message}`,
    ];
    if (warning.measure !== undefined) attrs.push(`measure=${warning.measure}`);
    if (warning.staff !== undefined) attrs.push(`staff=${warning.staff}`);
    if (warning.voice !== undefined) attrs.push(`voice=${warning.voice}`);
    if (warning.atDiv !== undefined) attrs.push(`atDiv=${warning.atDiv}`);
    if (warning.action) attrs.push(`action=${warning.action}`);
    if (warning.reason) attrs.push(`reason=${warning.reason}`);
    if (warning.tag) attrs.push(`tag=${warning.tag}`);
    if (warning.occupiedDiv !== undefined) attrs.push(`occupiedDiv=${warning.occupiedDiv}`);
    if (warning.capacityDiv !== undefined) attrs.push(`capacityDiv=${warning.capacityDiv}`);
    const payload = attrs.join(";");
    xml += `<miscellaneous-field name="diag:${String(i + 1).padStart(4, "0")}">${xmlEscape(payload)}</miscellaneous-field>`;
  }
  return xml;
};

const buildSourceMiscXml = (source: string): string => {
  const encoded = encodeURIComponent(source);
  const chunks = chunkString(encoded, 800);
  let xml = "";
  xml += '<miscellaneous-field name="src:musescore:raw-encoding">uri-v1</miscellaneous-field>';
  xml += `<miscellaneous-field name="src:musescore:raw-length">${source.length}</miscellaneous-field>`;
  xml += `<miscellaneous-field name="src:musescore:raw-encoded-length">${encoded.length}</miscellaneous-field>`;
  xml += `<miscellaneous-field name="src:musescore:raw-chunks">${chunks.length}</miscellaneous-field>`;
  for (let i = 0; i < chunks.length; i += 1) {
    xml += `<miscellaneous-field name="src:musescore:raw-${String(i + 1).padStart(4, "0")}">${xmlEscape(chunks[i])}</miscellaneous-field>`;
  }
  return xml;
};

const parseDurationDiv = (
  node: Element,
  divisions: number,
  measureCapacityDiv: number | null = null
): number | null => {
  const explicitDuration = firstNumber(node, ":scope > duration");
  if (explicitDuration !== null && explicitDuration > 0) {
    return Math.max(1, Math.round(explicitDuration));
  }
  const durationType = (node.querySelector(":scope > durationType")?.textContent ?? "").trim();
  if (durationType.toLowerCase() === "measure" && measureCapacityDiv !== null) {
    return Math.max(1, Math.round(measureCapacityDiv));
  }
  const base = durationTypeToDivisions(durationType, divisions);
  if (base === null) return null;
  const dots = firstNumber(node, ":scope > dots") ?? 0;
  return durationWithDots(base, dots);
};

const parseTruthyFlag = (value: string | null): boolean => {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
};

const parseMuseDynamicMark = (value: string): string | null => {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return null;
  const allow = new Set(["pppp", "ppp", "pp", "p", "mp", "mf", "f", "ff", "fff", "ffff", "sf", "sfz", "rfz"]);
  return allow.has(v) ? v : null;
};

const parseMuseDynamicSoundValue = (dynamicEl: Element): number | null => {
  const velocity = firstNumber(dynamicEl, ":scope > velocity");
  if (velocity === null || velocity <= 0) return null;
  // MuseScore dynamic velocity uses a MIDI-like scale where 90 ~= 100%.
  return (velocity / 90) * 100;
};

const isMuseElementVisible = (el: Element): boolean => {
  const visible = firstNumber(el, ":scope > visible");
  if (visible === null) return true;
  return visible !== 0;
};

const museArticulationSubtypeToMusicXmlTag = (
  raw: string | null | undefined
): { group: "articulations" | "technical"; tag: string } | null => {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;
  // MuseScore left-hand pizzicato (+) variants.
  if ((v.includes("left") || v.includes("lh")) && v.includes("pizz")) {
    return { group: "technical", tag: "stopped" };
  }
  if (v.includes("stopped")) return { group: "technical", tag: "stopped" };
  if (v.includes("snap") && v.includes("pizz")) return { group: "technical", tag: "snap-pizzicato" };
  if (v.includes("upbow") || (v.includes("up") && v.includes("bow"))) return { group: "technical", tag: "up-bow" };
  if (v.includes("downbow") || (v.includes("down") && v.includes("bow"))) return { group: "technical", tag: "down-bow" };
  if (v.includes("open") && v.includes("string")) return { group: "technical", tag: "open-string" };
  if (v.includes("harmonic")) return { group: "technical", tag: "harmonic" };
  if (v.includes("staccatissimo")) return { group: "articulations", tag: "staccatissimo" };
  if (v.includes("staccato")) return { group: "articulations", tag: "staccato" };
  if (v.includes("tenuto")) return { group: "articulations", tag: "tenuto" };
  if (v.includes("accent")) return { group: "articulations", tag: "accent" };
  if (v.includes("marcato")) return { group: "articulations", tag: "strong-accent" };
  return null;
};

const museOrnamentSubtypeToMusicXmlTag = (
  raw: string | null | undefined
): { group: "articulations" | "technical"; tag: string } | null => {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;
  // MuseScore uses brassMuteClosed ornament for left-hand pizzicato in some scores.
  if (v === "brassmuteclosed" || (v.includes("brass") && v.includes("mute") && v.includes("closed"))) {
    return { group: "technical", tag: "stopped" };
  }
  return null;
};

const normalizeKeyMode = (raw: string | null | undefined): "major" | "minor" | null => {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v === "major" || v === "maj") return "major";
  if (v === "minor" || v === "min") return "minor";
  if (v === "0") return "major";
  if (v === "1") return "minor";
  return null;
};

const inferKeyModeFromText = (raw: string | null | undefined): "major" | "minor" | null => {
  const v = String(raw ?? "");
  if (!v) return null;
  if (/\bminor\b/i.test(v) || /短調/.test(v)) return "minor";
  if (/\bmajor\b/i.test(v) || /長調/.test(v)) return "major";
  return null;
};

const readGlobalMuseKeyMode = (score: Element): "major" | "minor" => {
  const explicit =
    normalizeKeyMode(score.querySelector(":scope > Staff > Measure > KeySig > mode")?.textContent)
    || normalizeKeyMode(score.querySelector(":scope > Staff > Measure > voice > KeySig > mode")?.textContent)
    || normalizeKeyMode(score.querySelector(":scope > Staff > Measure > voice > keysig > mode")?.textContent);
  if (explicit) return explicit;
  const inferred =
    inferKeyModeFromText(score.querySelector(':scope > metaTag[name="workTitle"]')?.textContent)
    || inferKeyModeFromText(score.querySelector(':scope > metaTag[name="movementTitle"]')?.textContent)
    || inferKeyModeFromText(score.querySelector(":scope > Staff > VBox > Text > text")?.textContent);
  return inferred || "major";
};

const buildDynamicDirectionXml = (mark: string, options?: { soundDynamics?: number }): string => {
  const value = options?.soundDynamics;
  const soundXml = Number.isFinite(value) ? `<sound dynamics="${Number(value).toFixed(2)}"/>` : "";
  return `<direction><direction-type><dynamics><${mark}/></dynamics></direction-type>${soundXml}</direction>`;
};

const museAccidentalSubtypeToMusicXml = (raw: string | null | undefined): string | null => {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v === "accidentalsharp") return "sharp";
  if (v === "accidentalflat") return "flat";
  if (v === "accidentalnatural") return "natural";
  if (v === "accidentaldoublesharp") return "double-sharp";
  if (v === "accidentaldoubleflat") return "flat-flat";
  return null;
};

const buildWordsDirectionXml = (
  text: string,
  options?: { placement?: "above" | "below"; soundTempo?: number | null; fontStyle?: "italic" | "normal" }
): string => {
  const placementAttr = options?.placement ? ` placement="${options.placement}"` : "";
  const fontStyleAttr = options?.fontStyle ? ` font-style="${options.fontStyle}"` : "";
  const soundTempo = options?.soundTempo ?? null;
  const soundXml = soundTempo !== null ? `<sound tempo="${soundTempo}"/>` : "";
  return `<direction${placementAttr}><direction-type><words${fontStyleAttr}>${xmlEscape(text)}</words></direction-type>${soundXml}</direction>`;
};

const buildSegnoDirectionXml = (): string => {
  return "<direction><direction-type><segno/></direction-type></direction>";
};

const buildCodaDirectionXml = (): string => {
  return "<direction><direction-type><coda/></direction-type></direction>";
};

const parseMarkerDirectionXml = (marker: Element): string | null => {
  const subtype = (marker.querySelector(":scope > subtype")?.textContent ?? "").trim().toLowerCase();
  const label = (marker.querySelector(":scope > label")?.textContent ?? "").trim();
  if (subtype.includes("segno")) return buildSegnoDirectionXml();
  if (subtype.includes("coda")) return buildCodaDirectionXml();
  if (subtype.includes("fine")) return buildWordsDirectionXml(label || "Fine");
  if (label) return buildWordsDirectionXml(label);
  return null;
};

const parseJumpDirectionXml = (jump: Element): { xml: string; mapped: boolean } | null => {
  const jumpTo = (jump.querySelector(":scope > jumpTo")?.textContent ?? "").trim();
  const playUntil = (jump.querySelector(":scope > playUntil")?.textContent ?? "").trim();
  const continueAt = (jump.querySelector(":scope > continueAt")?.textContent ?? "").trim();
  const text = (jump.querySelector(":scope > text")?.textContent ?? "").trim();
  const subtype = (jump.querySelector(":scope > subtype")?.textContent ?? "").trim().toLowerCase();
  const words = text || subtype || [jumpTo, playUntil, continueAt].filter((v) => v.length > 0).join(" / ");
  if (!words) return null;
  const attrs: string[] = [];
  if (jumpTo.toLowerCase().includes("segno")) attrs.push('dalsegno="segno"');
  if (jumpTo.toLowerCase().includes("coda")) attrs.push('dacapo="yes"');
  if (playUntil.toLowerCase().includes("fine")) attrs.push('fine="fine"');
  if (playUntil.toLowerCase().includes("coda") || continueAt.toLowerCase().includes("coda")) attrs.push('tocoda="coda"');
  const soundXml = attrs.length ? `<sound ${attrs.join(" ")}/>` : "";
  return {
    xml: `<direction><direction-type><words>${xmlEscape(words)}</words></direction-type>${soundXml}</direction>`,
    mapped: attrs.length > 0,
  };
};

const parseExpressionDirectionXml = (expression: Element): string | null => {
  const textNode = expression.querySelector(":scope > text");
  const text = (textNode?.textContent ?? expression.textContent ?? "").trim();
  if (!text) return null;
  const hasItalic = textNode?.querySelector(":scope > i") !== null;
  return buildWordsDirectionXml(text, { fontStyle: hasItalic ? "italic" : undefined });
};

const parseTempoDirectionXml = (tempoEl: Element): string | null => {
  const qps = firstNumber(tempoEl, ":scope > tempo");
  const bpm = qps !== null && qps > 0 ? Math.max(20, Math.min(300, Math.round(qps * 60))) : null;
  const text = (tempoEl.querySelector(":scope > text")?.textContent ?? "").trim();
  if (text) {
    return buildWordsDirectionXml(text, { placement: "above", soundTempo: bpm });
  }
  if (bpm !== null) {
    return `<direction><sound tempo="${bpm}"/></direction>`;
  }
  return null;
};

const parseMeasureValue = (measure: Element, selectors: string[], fallback: number): number => {
  for (const selector of selectors) {
    const n = firstNumber(measure, selector);
    if (n !== null && Number.isFinite(n) && n > 0) return Math.max(1, Math.round(n));
  }
  return fallback;
};

const parseMeasureLenToDivisions = (measure: Element, divisions: number): number | null => {
  const raw = (measure.getAttribute("len") ?? "").trim();
  if (!raw) return null;
  const m = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!m) return null;
  const num = Number(m[1]);
  const den = Number(m[2]);
  if (!Number.isFinite(num) || !Number.isFinite(den) || num <= 0 || den <= 0) return null;
  const div = (Math.max(1, Math.round(divisions)) * 4 * num) / den;
  if (!Number.isFinite(div) || div <= 0) return null;
  return Math.max(1, Math.round(div));
};

const gcdPositive = (a: number, b: number): number => {
  let x = Math.max(1, Math.abs(Math.round(a)));
  let y = Math.max(1, Math.abs(Math.round(b)));
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return Math.max(1, x);
};

const formatMeasureLenFromDivisions = (measureLenDiv: number, divisions: number): string | null => {
  const numRaw = Math.max(1, Math.round(measureLenDiv));
  const denRaw = Math.max(1, Math.round(divisions)) * 4;
  if (!Number.isFinite(numRaw) || !Number.isFinite(denRaw) || numRaw <= 0 || denRaw <= 0) return null;
  const g = gcdPositive(numRaw, denRaw);
  return `${Math.max(1, Math.round(numRaw / g))}/${Math.max(1, Math.round(denRaw / g))}`;
};

type ParsedMuseScoreStaff = {
  sourceStaffId: string;
  clefSign: "G" | "F";
  clefLine: number;
  measures: ParsedMuseScoreMeasure[];
};

type ParsedMuseScorePart = {
  partId: string;
  partName: string;
  staffs: ParsedMuseScoreStaff[];
};

const readPartNameFromMusePart = (part: Element, fallback: string): string => {
  const candidate =
    (part.querySelector(":scope > trackName")?.textContent ?? "").trim()
    || (part.querySelector(":scope > Instrument > longName")?.textContent ?? "").trim()
    || (part.querySelector(":scope > Instrument > trackName")?.textContent ?? "").trim()
    || (part.querySelector(":scope > Instrument > shortName")?.textContent ?? "").trim()
    || (part.querySelector(":scope > Instrument > instrumentId")?.textContent ?? "").trim();
  return candidate || fallback;
};

const readClefForMuseStaff = (staff: Element): { sign: "G" | "F"; line: number } => {
  const clefTypeText =
    (staff.querySelector(":scope > Measure > voice > Clef > concertClefType")?.textContent ?? "").trim()
    || (staff.querySelector(":scope > Measure > voice > Clef > subtype")?.textContent ?? "").trim()
    || (staff.querySelector(":scope > Measure > Clef > concertClefType")?.textContent ?? "").trim()
    || (staff.querySelector(":scope > Measure > Clef > subtype")?.textContent ?? "").trim()
    || (staff.querySelector(":scope > Clef > concertClefType")?.textContent ?? "").trim()
    || (staff.querySelector(":scope > Clef > subtype")?.textContent ?? "").trim();
  const lower = clefTypeText.toLowerCase();
  if (lower.includes("f")) return { sign: "F", line: 4 };
  return { sign: "G", line: 2 };
};

const readStaffClefOverridesFromMusePart = (part: Element): Map<string, { sign: "G" | "F"; line: number }> => {
  const overrides = new Map<string, { sign: "G" | "F"; line: number }>();
  for (const staffDef of Array.from(part.querySelectorAll(":scope > Staff[id]"))) {
    const staffId = (staffDef.getAttribute("id") ?? "").trim();
    if (!staffId) continue;
    const defaultClef = (staffDef.querySelector(":scope > defaultClef")?.textContent ?? "").trim().toUpperCase();
    if (defaultClef.includes("F")) {
      overrides.set(staffId, { sign: "F", line: 4 });
      continue;
    }
    if (defaultClef.includes("G")) {
      overrides.set(staffId, { sign: "G", line: 2 });
      continue;
    }
  }
  for (const clefDef of Array.from(part.querySelectorAll(":scope > Instrument > clef[staff]"))) {
    const staffId = (clefDef.getAttribute("staff") ?? "").trim();
    if (!staffId) continue;
    const clef = (clefDef.textContent ?? "").trim().toUpperCase();
    if (clef.includes("F")) {
      overrides.set(staffId, { sign: "F", line: 4 });
      continue;
    }
    if (clef.includes("G")) {
      overrides.set(staffId, { sign: "G", line: 2 });
      continue;
    }
  }
  return overrides;
};

const withDirectionStaff = (directionXml: string, staffNo: number): string => {
  if (/<staff>\d+<\/staff>/.test(directionXml)) return directionXml;
  if (!directionXml.includes("</direction>")) return directionXml;
  return directionXml.replace(/<\/direction>\s*$/, `<staff>${staffNo}</staff></direction>`);
};

const withDirectionPlacement = (
  directionXml: string,
  staffNo: number,
  voiceNo: number
): string => {
  let out = withDirectionStaff(directionXml, staffNo);
  // octave-shift is staff-scoped; adding <voice> can suppress rendering in some engravers.
  if (out.includes("<octave-shift")) return out;
  if (!/<voice>\d+<\/voice>/.test(out) && out.includes("</direction>")) {
    out = out.replace(/<\/direction>\s*$/, `<voice>${voiceNo}</voice></direction>`);
  }
  return out;
};

const buildTupletMusicXml = (
  event: Extract<ParsedMuseScoreEvent, { kind: "rest" | "chord" }>
): { timeModificationXml: string; notationItems: string[] } => {
  const timeModification = event.tupletTimeModification;
  const starts = event.tupletStarts ?? [];
  const stops = event.tupletStops ?? [];
  const timeModificationXml = timeModification
    ? `<time-modification><actual-notes>${timeModification.actualNotes}</actual-notes><normal-notes>${timeModification.normalNotes}</normal-notes></time-modification>`
    : "";
  const tupletNotations: string[] = [];
  for (const start of starts) {
    const attrs: string[] = [
      `type="start"`,
      `number="${Math.max(1, Math.round(start.number))}"`,
    ];
    if (start.bracket) attrs.push(`bracket="${start.bracket}"`);
    if (start.showNumber) attrs.push(`show-number="${start.showNumber}"`);
    tupletNotations.push(
      `<tuplet ${attrs.join(" ")}/>`
    );
  }
  for (const stop of stops) {
    tupletNotations.push(
      `<tuplet type="stop" number="${Math.max(1, Math.round(stop))}"/>`
    );
  }
  return { timeModificationXml, notationItems: tupletNotations };
};

const tupletRoundingToleranceByVoiceEvents = (voiceEvents: ParsedMuseScoreEvent[]): number => {
  let tupletCount = 0;
  for (const ev of voiceEvents) {
    if ((ev.kind !== "rest" && ev.kind !== "chord") || (ev.durationDiv ?? 0) <= 0) continue;
    if (ev.kind === "chord" && ev.grace) continue;
    if (!ev.tupletTimeModification) continue;
    tupletCount += 1;
  }
  if (tupletCount <= 0) return 0;
  return Math.floor(tupletCount / 2);
};

const beamLevelFromType = (typeText: string): number => {
  switch (String(typeText || "").trim().toLowerCase()) {
    case "eighth":
      return 1;
    case "16th":
      return 2;
    case "32nd":
      return 3;
    case "64th":
      return 4;
    default:
      return 0;
  }
};

const parseChordSlurTransitions = (
  chordEl: Element,
  state: { activeSlurNumbers: number[]; nextSlurNumber: number; slurKeyToNumber: Map<string, number> }
): { starts: number[]; stops: number[] } => {
  const starts: number[] = [];
  const stops: number[] = [];
  const resolveSlurNumber = (rawId: string): number => {
    const key = rawId.trim();
    if (!key) {
      const num = state.nextSlurNumber;
      state.nextSlurNumber += 1;
      return num;
    }
    const direct = Number.parseInt(key, 10);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const mapped = state.slurKeyToNumber.get(key);
    if (mapped) return mapped;
    const num = state.nextSlurNumber;
    state.nextSlurNumber += 1;
    state.slurKeyToNumber.set(key, num);
    return num;
  };
  for (const slurEl of Array.from(chordEl.querySelectorAll(":scope > Slur[type], :scope > slur[type]"))) {
    const type = (slurEl.getAttribute("type") ?? "").trim().toLowerCase();
    const num = resolveSlurNumber(slurEl.getAttribute("id") ?? "");
    if (type === "start") {
      starts.push(num);
      if (!state.activeSlurNumbers.includes(num)) state.activeSlurNumbers.push(num);
      continue;
    }
    if (type === "stop") {
      stops.push(num);
      state.activeSlurNumbers = state.activeSlurNumbers.filter((active) => active !== num);
    }
  }
  const spanners = Array.from(chordEl.querySelectorAll(":scope > Spanner"));
  for (const spanner of spanners) {
    const type = (spanner.getAttribute("type") ?? "").trim().toLowerCase();
    if (type !== "slur") continue;
    const hasStop = spanner.querySelector(":scope > prev") !== null;
    const hasStart = spanner.querySelector(":scope > Slur, :scope > next") !== null;
    if (hasStop) {
      const num = state.activeSlurNumbers.length ? (state.activeSlurNumbers.pop() as number) : 1;
      stops.push(num);
    }
    if (hasStart) {
      const num = state.nextSlurNumber;
      state.nextSlurNumber += 1;
      state.activeSlurNumbers.push(num);
      starts.push(num);
    }
  }
  return { starts, stops };
};

const parseMuseTieFlags = (noteEl: Element): { tieStart: boolean; tieStop: boolean } => {
  const tieEl = noteEl.querySelector(":scope > Tie, :scope > tie, :scope > Spanner[type=\"Tie\"], :scope > Spanner[type=\"tie\"]");
  const hasEndSpanner = noteEl.querySelector(":scope > endSpanner") !== null;
  const tieHasPrev = tieEl?.querySelector(":scope > prev") !== null;
  const tieHasNext = tieEl?.querySelector(":scope > next") !== null;
  const tieStart = tieEl !== null && (tieHasNext || !tieHasPrev);
  const tieStop = hasEndSpanner || (tieEl !== null && tieHasPrev);
  return { tieStart, tieStop };
};

const parseMuseStringText = (noteNode: Element, tag: "Fingering" | "String"): string | null => {
  const container = noteNode.querySelector(`:scope > ${tag}`);
  if (!container) return null;
  const text = (container.querySelector(":scope > text")?.textContent ?? container.textContent ?? "").trim();
  return text || null;
};

const parseTrillSpannerTransition = (spannerEl: Element): { start: boolean; stop: boolean } => {
  const type = (spannerEl.getAttribute("type") ?? "").trim().toLowerCase();
  if (type !== "trill") return { start: false, stop: false };
  const start = spannerEl.querySelector(":scope > Trill, :scope > trill, :scope > next") !== null;
  const stop = spannerEl.querySelector(":scope > prev") !== null;
  return { start, stop };
};

type MuseOttavaState = {
  number: number;
  size: 8 | 15;
  shiftType: "up" | "down";
};

const parseOttavaSubtype = (raw: string | null | undefined): { size: 8 | 15; shiftType: "up" | "down" } => {
  const v = String(raw ?? "").trim().toLowerCase();
  const size: 8 | 15 = v.includes("15") ? 15 : 8;
  const shiftType: "up" | "down" =
    v.includes("8vb") || v.includes("15mb") || v.includes("bassa")
      ? "down"
      : "up";
  return { size, shiftType };
};

const buildOctaveShiftDirectionXml = (
  type: "start" | "stop",
  state: MuseOttavaState
): string => {
  const placement = state.shiftType === "down" ? "below" : "above";
  return `<direction placement="${placement}"><direction-type><octave-shift type="${type}" size="${state.size}" number="${state.number}"/></direction-type></direction>`;
};

const semitoneShiftForOttavaDisplay = (state: MuseOttavaState): number => {
  const amount = state.size === 15 ? 24 : 12;
  return state.shiftType === "up" ? amount : -amount;
};

const buildBeamXmlByVoiceEvents = (
  voiceEvents: ParsedMuseScoreEvent[],
  divisions: number,
  beatDiv: number
): Map<number, string> => {
  const beamXmlByIndex = new Map<number, string>();
  const assignments = computeBeamAssignments(voiceEvents, beatDiv, (ev) => {
    const isTimed = ev.kind === "chord" || ev.kind === "rest";
    const info = isTimed ? divisionToTypeAndDots(divisions, ev.displayDurationDiv ?? ev.durationDiv) : null;
    const levels = info ? beamLevelFromType(info.type) : 0;
    return {
      timed: isTimed,
      chord: ev.kind === "chord",
      grace: ev.kind === "chord" && Boolean(ev.grace),
      durationDiv: isTimed ? Math.max(0, ev.durationDiv) : 0,
      levels,
      explicitMode: isTimed ? ev.beamMode : undefined,
    };
  });
  for (const [idx, assignment] of assignments.entries()) {
    let xml = "";
    for (let level = 1; level <= assignment.levels; level += 1) {
      xml += `<beam number="${level}">${assignment.state}</beam>`;
    }
    if (xml) beamXmlByIndex.set(idx, xml);
  }
  return beamXmlByIndex;
};

export const convertMuseScoreToMusicXml = (
  mscxSource: string,
  options: MuseScoreImportOptions = {}
): string => {
  const doc = new DOMParser().parseFromString(mscxSource, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("MuseScore XML parse error.");
  }
  const score = doc.querySelector("museScore > Score, Score");
  if (!score) {
    throw new Error("MuseScore Score root was not found.");
  }
  const divisions = Math.max(1, Math.round(firstNumber(score, ":scope > Division") ?? 480));
  const sourceVersion = (doc.querySelector("museScore")?.getAttribute("version") ?? "").trim();
  const workTitle =
    (score.querySelector(':scope > metaTag[name="workTitle"]')?.textContent ?? "").trim() || "Imported MuseScore";

  const globalBeats = Math.max(1, Math.round(firstNumber(score, ":scope > Staff > Measure > TimeSig > sigN") ?? 4));
  const globalBeatType = Math.max(1, Math.round(firstNumber(score, ":scope > Staff > Measure > TimeSig > sigD") ?? 4));
  const globalFifths = Math.max(
    -7,
    Math.min(7, Math.round(firstNumber(score, ":scope > Staff > Measure > KeySig > accidental") ?? 0))
  );
  const globalMode = readGlobalMuseKeyMode(score);

  const staffNodes = Array.from(score.querySelectorAll(":scope > Staff")).filter((staff) => {
    if ((staff.parentElement?.tagName ?? "").toLowerCase() !== "score") return false;
    return staff.querySelector(":scope > Measure") !== null;
  });
  const staffById = new Map<string, Element>();
  staffNodes.forEach((staff, index) => {
    const id = (staff.getAttribute("id") ?? "").trim() || String(index + 1);
    staffById.set(id, staff);
  });
  const warnings: MuseScoreWarning[] = [];
  const pushWarning = (warning: MuseScoreWarning): void => {
    warnings.push(warning);
  };
  const unknownTagSet = new Set<string>();
  if (!staffNodes.length) {
    pushWarning({
      code: "MUSESCORE_IMPORT_WARNING",
      message: "No readable staff content found; created an empty placeholder score.",
      action: "placeholder-created",
    });
  }

  const parsedByPart: ParsedMuseScorePart[] = [];

  const sourceMetadata = options.sourceMetadata !== false;
  const debugMetadata = options.debugMetadata !== false;
  const normalizeCutTimeToTwoTwo = options.normalizeCutTimeToTwoTwo === true;

  const usedStaffIds = new Set<string>();
  const partNodes = Array.from(score.querySelectorAll(":scope > Part")).filter(
    (part) => (part.parentElement?.tagName ?? "").toLowerCase() === "score"
  );
  const groupedStaffIds: Array<{ partName: string; staffIds: string[]; partEl: Element | null }> = [];
  for (let partIndex = 0; partIndex < partNodes.length; partIndex += 1) {
    const part = partNodes[partIndex];
    const partName = readPartNameFromMusePart(part, `P${partIndex + 1}`);
    const staffIds = Array.from(part.querySelectorAll(":scope > Staff"))
      .map((staffEl) => (staffEl.getAttribute("id") ?? "").trim())
      .filter((id) => id.length > 0 && staffById.has(id));
    if (!staffIds.length) continue;
    groupedStaffIds.push({ partName, staffIds, partEl: part });
    for (const id of staffIds) usedStaffIds.add(id);
  }
  for (const [id] of staffById) {
    if (usedStaffIds.has(id)) continue;
    groupedStaffIds.push({ partName: `P${groupedStaffIds.length + 1}`, staffIds: [id], partEl: null });
  }
  if (!groupedStaffIds.length) {
    groupedStaffIds.push({ partName: "P1", staffIds: [], partEl: null });
  }

  for (let partIndex = 0; partIndex < groupedStaffIds.length; partIndex += 1) {
    const group = groupedStaffIds[partIndex];
    const partId = `P${partIndex + 1}`;
    const parsedStaffs: ParsedMuseScoreStaff[] = [];
    const partClefOverrides = group.partEl
      ? readStaffClefOverridesFromMusePart(group.partEl)
      : new Map<string, { sign: "G" | "F"; line: number }>();

    for (let localStaffIndex = 0; localStaffIndex < Math.max(1, group.staffIds.length); localStaffIndex += 1) {
      const sourceStaffId = group.staffIds[localStaffIndex] ?? `${localStaffIndex + 1}`;
      const staff = staffById.get(sourceStaffId) ?? doc.createElement("Staff");
      const clef = partClefOverrides.get(sourceStaffId) ?? readClefForMuseStaff(staff);

      const measures = Array.from(staff.querySelectorAll(":scope > Measure"));
      if (!measures.length) {
        parsedStaffs.push({
          sourceStaffId,
          clefSign: clef.sign,
          clefLine: clef.line,
          measures: [{
            index: 1,
            beats: globalBeats,
            beatType: globalBeatType,
            timeSymbol: null,
            explicitTimeSig: true,
            capacityDiv: Math.max(1, Math.round((divisions * 4 * globalBeats) / Math.max(1, globalBeatType))),
            implicit: false,
            fifths: globalFifths,
            mode: globalMode,
            tempoBpm: null,
            tempoText: null,
            repeatForward: false,
            repeatBackward: false,
            leftDoubleBarline: false,
            events: [{
              kind: "rest",
              durationDiv: Math.max(1, Math.round((divisions * 4 * globalBeats) / Math.max(1, globalBeatType))),
              displayDurationDiv: Math.max(1, Math.round((divisions * 4 * globalBeats) / Math.max(1, globalBeatType))),
              voice: 1,
            }],
          }],
        });
        continue;
      }

      let currentBeats = globalBeats;
      let currentBeatType = globalBeatType;
      let currentTimeSymbol: "cut" | null = null;
      let currentFifths = globalFifths;
      let currentMode = globalMode;
      const parsedMeasures: ParsedMuseScoreMeasure[] = [];
      let absoluteDivCursor = 0;
      const slurStateByVoice = new Map<number, {
        activeSlurNumbers: number[];
        nextSlurNumber: number;
        slurKeyToNumber: Map<string, number>;
      }>();
      const ottavaStateByVoice = new Map<number, {
        activeOttavaStates: MuseOttavaState[];
        nextOttavaNumber: number;
      }>();
      for (let mi = 0; mi < measures.length; mi += 1) {
        const measure = measures[mi];
      const measureStartDiv = absoluteDivCursor;
      const beats = parseMeasureValue(
        measure,
        [":scope > TimeSig > sigN", ":scope > voice > TimeSig > sigN", ":scope > voice > timesig > sigN"],
        currentBeats
      );
      const beatType = parseMeasureValue(
        measure,
        [":scope > TimeSig > sigD", ":scope > voice > TimeSig > sigD", ":scope > voice > timesig > sigD"],
        currentBeatType
      );
      const timeSigSubtype = firstNumber(
        measure,
        ":scope > TimeSig > subtype, :scope > voice > TimeSig > subtype, :scope > voice > timesig > subtype"
      );
      const explicitTimeSig = measure.querySelector(":scope > TimeSig, :scope > voice > TimeSig, :scope > voice > timesig") !== null;
      const rawTimeSymbol: "cut" | null = timeSigSubtype !== null && Math.round(timeSigSubtype) === 2 ? "cut" : null;
      const timeSymbol: "cut" | null = rawTimeSymbol ?? currentTimeSymbol;
      const shouldNormalizeCut = normalizeCutTimeToTwoTwo && timeSymbol === "cut" && beats === 4 && beatType === 4;
      const effectiveBeats = shouldNormalizeCut ? 2 : beats;
      const effectiveBeatType = shouldNormalizeCut ? 2 : beatType;
      const nominalCapacityDiv = Math.max(
        1,
        Math.round((divisions * 4 * effectiveBeats) / Math.max(1, effectiveBeatType))
      );
      const measureLenDiv = parseMeasureLenToDivisions(measure, divisions);
      const capacityDiv = measureLenDiv ?? nominalCapacityDiv;
      const implicit = measureLenDiv !== null && measureLenDiv < nominalCapacityDiv;
      const fifthsRaw = firstNumber(measure, ":scope > KeySig > accidental")
        ?? firstNumber(measure, ":scope > voice > KeySig > accidental")
        ?? firstNumber(measure, ":scope > voice > keysig > accidental");
      const fifths = fifthsRaw === null ? currentFifths : Math.max(-7, Math.min(7, Math.round(fifthsRaw)));
      const modeRaw = normalizeKeyMode(
        measure.querySelector(":scope > KeySig > mode")?.textContent
        ?? measure.querySelector(":scope > voice > KeySig > mode")?.textContent
        ?? measure.querySelector(":scope > voice > keysig > mode")?.textContent
      );
      const mode = modeRaw ?? currentMode;
      const tempoBpm = null;
      const tempoText = null;
      const repeatForward = parseTruthyFlag(measure.getAttribute("startRepeat"))
        || measure.querySelector(":scope > startRepeat, :scope > voice > startRepeat") !== null;
      const repeatBackward = parseTruthyFlag(measure.getAttribute("endRepeat"))
        || measure.querySelector(":scope > endRepeat, :scope > voice > endRepeat") !== null;
      const leftDoubleBarline = (() => {
        const subtype = (
          measure.querySelector(":scope > BarLine > subtype, :scope > voice > BarLine > subtype")?.textContent ?? ""
        ).trim().toLowerCase();
        return subtype === "double";
      })();

      const events: ParsedMuseScoreEvent[] = [];
      const voiceNodes = Array.from(measure.querySelectorAll(":scope > voice"));
      const eventHolders = voiceNodes.length ? voiceNodes : [measure];
      for (let holderIndex = 0; holderIndex < eventHolders.length; holderIndex += 1) {
        const holder = eventHolders[holderIndex];
        const defaultVoiceNo = holderIndex + 1;
        let voicePosDiv = 0;
        let slurState = slurStateByVoice.get(defaultVoiceNo);
        if (!slurState) {
          slurState = {
            activeSlurNumbers: [],
            nextSlurNumber: 1,
            slurKeyToNumber: new Map<string, number>(),
          };
          slurStateByVoice.set(defaultVoiceNo, slurState);
        }
        let ottavaState = ottavaStateByVoice.get(defaultVoiceNo);
        if (!ottavaState) {
          ottavaState = {
            activeOttavaStates: [],
            nextOttavaNumber: 1,
          };
          ottavaStateByVoice.set(defaultVoiceNo, ottavaState);
        }
        const tupletScaleStack: number[] = [];
        const activeOttavaStates = ottavaState.activeOttavaStates;
        const activeTrillNumbers: number[] = [];
        let nextTrillNumber = 1;
        const pendingTrillStarts: number[] = [];
        const pendingTrillStops: number[] = [];
        const tupletStateStack: Array<{
          actualNotes: number;
          normalNotes: number;
          number: number;
          showNumber?: "actual" | "none";
          bracket?: "yes" | "no";
          startPending: boolean;
        }> = [];
        const tupletDefinitionById = new Map<string, {
          actualNotes: number;
          normalNotes: number;
          showNumber?: "actual" | "none";
          bracket?: "yes" | "no";
        }>();
        const tupletNumberById = new Map<string, number>();
        let activeTupletRefId: string | null = null;
        let nextTupletNumber = 1;
        const currentTupletScale = (): number =>
          tupletScaleStack.reduce((acc, value) => acc * value, 1);
        const consumeTupletStarts = (): Array<{
          actualNotes: number;
          normalNotes: number;
          number: number;
          showNumber?: "actual" | "none";
          bracket?: "yes" | "no";
        }> => {
          const starts = tupletStateStack
            .filter((state) => state.startPending)
            .map((state) => ({
              actualNotes: state.actualNotes,
              normalNotes: state.normalNotes,
              number: state.number,
              showNumber: state.showNumber,
              bracket: state.bracket,
            }));
          for (const state of tupletStateStack) state.startPending = false;
          return starts;
        };
        const appendTupletStopToLastTimedEvent = (tupletNumber: number): void => {
          for (let i = events.length - 1; i >= 0; i -= 1) {
            const ev = events[i];
            if (ev.kind !== "rest" && ev.kind !== "chord") continue;
            const stops = ev.tupletStops ?? [];
            stops.push(tupletNumber);
            ev.tupletStops = stops;
            return;
          }
        };
        const resolveTupletNumberById = (id: string): number => {
          const existing = tupletNumberById.get(id);
          if (existing !== undefined) return existing;
          const assigned = nextTupletNumber;
          nextTupletNumber += 1;
          tupletNumberById.set(id, assigned);
          return assigned;
        };
        const consumePendingTrillStarts = (): number[] => {
          const out = pendingTrillStarts.splice(0, pendingTrillStarts.length);
          return out;
        };
        const consumePendingTrillStops = (): number[] => {
          const out = pendingTrillStops.splice(0, pendingTrillStops.length);
          return out;
        };
        const children = Array.from(holder.children);
        for (const event of children) {
          const tag = event.tagName.toLowerCase();
          const trackNo = Math.round(firstNumber(event, ":scope > track") ?? NaN);
          const voiceNo = Number.isFinite(trackNo)
            ? Math.max(1, Math.min(4, (Math.max(0, trackNo) % 4) + 1))
            : defaultVoiceNo;
          const moveRaw = Math.round(firstNumber(event, ":scope > move") ?? NaN);
          const movedStaffNo = Number.isFinite(moveRaw)
            ? Math.max(1, localStaffIndex + 1 + Math.round(moveRaw))
            : (localStaffIndex + 1);
          if (tag === "tick") {
            const tickAbs = Math.max(0, Math.round(Number((event.textContent ?? "").trim() || 0)));
            voicePosDiv = Math.max(0, tickAbs - measureStartDiv);
            continue;
          }
          if (tag === "tuplet") {
            const normalNotes = Math.round(firstNumber(event, ":scope > normalNotes") ?? 0);
            const actualNotes = Math.round(firstNumber(event, ":scope > actualNotes") ?? 0);
            const numberType = Math.round(firstNumber(event, ":scope > numberType") ?? NaN);
            const bracketType = Math.round(firstNumber(event, ":scope > bracketType") ?? NaN);
            const showNumber = Number.isFinite(numberType)
              ? (numberType === 2 ? "none" as const : "actual" as const)
              : undefined;
            const bracket = Number.isFinite(bracketType)
              ? (bracketType === 2 ? "no" as const : "yes" as const)
              : ("yes" as const);
            const id = (event.getAttribute("id") ?? "").trim();
            if (id && normalNotes > 0 && actualNotes > 0) {
              tupletDefinitionById.set(id, {
                actualNotes,
                normalNotes,
                showNumber,
                bracket,
              });
              continue;
            }
            if (normalNotes > 0 && actualNotes > 0) {
              tupletScaleStack.push(normalNotes / actualNotes);
              tupletStateStack.push({
                actualNotes,
                normalNotes,
                number: nextTupletNumber,
                showNumber,
                bracket,
                startPending: true,
              });
              nextTupletNumber += 1;
            } else {
              pushWarning({
                code: "MUSESCORE_IMPORT_WARNING",
                message: `measure ${mi + 1}: unsupported tuplet skipped.`,
                measure: mi + 1,
                staff: localStaffIndex + 1,
                voice: voiceNo,
                atDiv: voicePosDiv,
                action: "skipped",
                reason: "unsupported",
                tag: "Tuplet",
              });
            }
            continue;
          }
          if (tag === "endtuplet") {
            if (tupletScaleStack.length > 0) tupletScaleStack.pop();
            const ended = tupletStateStack.pop();
            if (ended) appendTupletStopToLastTimedEvent(ended.number);
            continue;
          }
          if (tag === "rest") {
            const parsed = parseDurationDiv(event, divisions, capacityDiv);
            const displayDurationDiv = parsed === null ? null : Math.max(1, Math.round(parsed));
            const tupletRefId = (event.querySelector(":scope > Tuplet")?.textContent ?? "").trim() || null;
            const tupletRef = tupletRefId ? tupletDefinitionById.get(tupletRefId) : undefined;
            const tupletScale = tupletRef
              ? (tupletRef.normalNotes / tupletRef.actualNotes)
              : currentTupletScale();
            const durationDiv = parsed === null ? null : Math.max(1, Math.round(parsed * tupletScale));
            if (!durationDiv) {
              pushWarning({
                code: "MUSESCORE_IMPORT_WARNING",
                message: `measure ${mi + 1}: dropped rest with unknown duration.`,
                measure: mi + 1,
                staff: localStaffIndex + 1,
                voice: voiceNo,
                atDiv: voicePosDiv,
                action: "dropped",
                reason: "unknown-duration",
                tag: "Rest",
              });
              continue;
            }
            const resolvedDisplayDurationDiv = displayDurationDiv ?? durationDiv;
            if (activeTupletRefId && activeTupletRefId !== tupletRefId) {
              const endedNo = tupletNumberById.get(activeTupletRefId);
              if (endedNo !== undefined) appendTupletStopToLastTimedEvent(endedNo);
              activeTupletRefId = null;
            }
            const starts = consumeTupletStarts();
            const currentTuplet = tupletRef ?? tupletStateStack[tupletStateStack.length - 1];
            const startsWithRef = [...starts];
            if (tupletRefId && tupletRef && activeTupletRefId !== tupletRefId) {
              startsWithRef.push({
                actualNotes: tupletRef.actualNotes,
                normalNotes: tupletRef.normalNotes,
                number: resolveTupletNumberById(tupletRefId),
                showNumber: tupletRef.showNumber,
                bracket: tupletRef.bracket,
              });
              activeTupletRefId = tupletRefId;
            }
            const beamModeRaw = (event.querySelector(":scope > BeamMode")?.textContent ?? "").trim().toLowerCase();
            const beamMode = beamModeRaw === "begin" || beamModeRaw === "mid" ? beamModeRaw : undefined;
            events.push({
              kind: "rest",
              durationDiv,
              displayDurationDiv: resolvedDisplayDurationDiv,
              voice: voiceNo,
              staffNo: movedStaffNo,
              atDiv: voicePosDiv,
              beamMode,
              tupletTimeModification: currentTuplet
                ? { actualNotes: currentTuplet.actualNotes, normalNotes: currentTuplet.normalNotes }
                : undefined,
              tupletStarts: startsWithRef.length ? startsWithRef : undefined,
              trillStarts: consumePendingTrillStarts(),
              trillStops: consumePendingTrillStops(),
            });
            voicePosDiv += durationDiv;
            continue;
          }
          if (tag === "chord") {
            const isAcciaccatura = event.querySelector(":scope > acciaccatura") !== null;
            const isAppoggiatura = event.querySelector(":scope > appoggiatura") !== null;
            const isGrace = isAcciaccatura || isAppoggiatura || event.querySelector(":scope > grace") !== null;
            const parsed = parseDurationDiv(event, divisions, capacityDiv);
            const displayDurationDiv = parsed === null ? null : Math.max(1, Math.round(parsed));
            const tupletRefId = (event.querySelector(":scope > Tuplet")?.textContent ?? "").trim() || null;
            const tupletRef = tupletRefId ? tupletDefinitionById.get(tupletRefId) : undefined;
            const tupletScale = tupletRef
              ? (tupletRef.normalNotes / tupletRef.actualNotes)
              : currentTupletScale();
            const durationDiv = isGrace
              ? 0
              : (parsed === null ? null : Math.max(1, Math.round(parsed * tupletScale)));
            if (!isGrace && !durationDiv) {
              pushWarning({
                code: "MUSESCORE_IMPORT_WARNING",
                message: `measure ${mi + 1}: dropped chord with unknown duration.`,
                measure: mi + 1,
                staff: localStaffIndex + 1,
                voice: voiceNo,
                atDiv: voicePosDiv,
                action: "dropped",
                reason: "unknown-duration",
                tag: "Chord",
              });
              continue;
            }
            if (!isGrace && activeTupletRefId && activeTupletRefId !== tupletRefId) {
              const endedNo = tupletNumberById.get(activeTupletRefId);
              if (endedNo !== undefined) appendTupletStopToLastTimedEvent(endedNo);
              activeTupletRefId = null;
            }
            const resolvedDurationDiv = durationDiv ?? 0;
            const resolvedDisplayDurationDiv = displayDurationDiv
              ?? (durationDiv && durationDiv > 0 ? durationDiv : Math.max(1, Math.round(divisions / 4)));

            // Handle chord-local spanners produced by MusicXML->MuseScore export path.
            // They should affect the same timing point as this chord.
            for (const spannerEl of Array.from(event.querySelectorAll(":scope > Spanner[type], :scope > spanner[type]"))) {
              const spannerType = (spannerEl.getAttribute("type") ?? "").trim().toLowerCase();
              if (spannerType === "ottava") {
                const hasStop = spannerEl.querySelector(":scope > prev") !== null;
                const hasStart = spannerEl.querySelector(":scope > Ottava, :scope > ottava, :scope > next") !== null;
                if (hasStop) {
                  const state = activeOttavaStates.length
                    ? (activeOttavaStates.pop() as MuseOttavaState)
                    : { number: 1, size: 8 as const, shiftType: "up" as const };
                  events.push({
                    kind: "directionXml",
                    xml: buildOctaveShiftDirectionXml("stop", state),
                    voice: voiceNo,
                    staffNo: movedStaffNo,
                    atDiv: voicePosDiv,
                  });
                }
                if (hasStart) {
                  const parsed = parseOttavaSubtype(
                    spannerEl.querySelector(":scope > Ottava > subtype, :scope > ottava > subtype")?.textContent
                  );
                  const state: MuseOttavaState = {
                    number: ottavaState.nextOttavaNumber,
                    size: parsed.size,
                    shiftType: parsed.shiftType,
                  };
                  ottavaState.nextOttavaNumber += 1;
                  activeOttavaStates.push(state);
                  events.push({
                    kind: "directionXml",
                    xml: buildOctaveShiftDirectionXml("start", state),
                    voice: voiceNo,
                    staffNo: movedStaffNo,
                    atDiv: voicePosDiv,
                  });
                }
                continue;
              }
              const trill = parseTrillSpannerTransition(spannerEl);
              if (trill.stop) {
                const number = activeTrillNumbers.length ? (activeTrillNumbers.pop() as number) : 1;
                pendingTrillStops.push(number);
              }
              if (trill.start) {
                const number = nextTrillNumber;
                nextTrillNumber += 1;
                activeTrillNumbers.push(number);
                pendingTrillStarts.push(number);
              }
            }

            const noteNodes = Array.from(event.querySelectorAll(":scope > Note"));
            const ottavaDisplayShift = activeOttavaStates.reduce(
              (sum, state) => sum + semitoneShiftForOttavaDisplay(state),
              0
            );
            const slurTransitions = parseChordSlurTransitions(event, slurState);
            const articulationMappings = Array.from(event.querySelectorAll(":scope > Articulation > subtype"))
              .map((node) => museArticulationSubtypeToMusicXmlTag(node.textContent))
              .filter((mapped): mapped is { group: "articulations" | "technical"; tag: string } => mapped !== null);
            const ornamentMappings = Array.from(event.querySelectorAll(":scope > Ornament > subtype, :scope > ornament > subtype"))
              .map((node) => museOrnamentSubtypeToMusicXmlTag(node.textContent))
              .filter((mapped): mapped is { group: "articulations" | "technical"; tag: string } => mapped !== null);
            const allMappings = [...articulationMappings, ...ornamentMappings];
            const articulationTags = allMappings
              .filter((mapped) => mapped.group === "articulations")
              .map((mapped) => mapped.tag);
            const technicalTags = allMappings
              .filter((mapped) => mapped.group === "technical")
              .map((mapped) => mapped.tag);
            const notes = noteNodes
              .map((noteNode) => {
                const midi = Number.parseInt((noteNode.querySelector(":scope > pitch")?.textContent ?? "").trim(), 10);
                if (!Number.isFinite(midi)) return null;
                const accidentalText = museAccidentalSubtypeToMusicXml(
                  noteNode.querySelector(":scope > Accidental > subtype")?.textContent
                );
                const fingeringText = parseMuseStringText(noteNode, "Fingering") ?? undefined;
                const stringRaw = parseMuseStringText(noteNode, "String");
                const stringValue = stringRaw !== null ? Number.parseInt(stringRaw, 10) : NaN;
                const tieFlags = parseMuseTieFlags(noteNode);
                return {
                  midi: Math.max(0, Math.min(127, Math.round(midi + ottavaDisplayShift))),
                  accidentalText,
                  tieStart: tieFlags.tieStart,
                  tieStop: tieFlags.tieStop,
                  fingeringText,
                  stringNumber: Number.isFinite(stringValue) && stringValue > 0 ? Math.round(stringValue) : undefined,
                };
              })
              .filter((note): note is ParsedMuseScoreChordNote => note !== null);
            if (!notes.length) {
              pushWarning({
                code: "MUSESCORE_IMPORT_WARNING",
                message: `measure ${mi + 1}: dropped chord without pitch.`,
                measure: mi + 1,
                staff: localStaffIndex + 1,
                voice: voiceNo,
                atDiv: voicePosDiv,
                action: "dropped",
                reason: "missing-pitch",
                tag: "Chord",
              });
              continue;
            }
            const starts = isGrace ? [] : consumeTupletStarts();
            const currentTuplet = tupletRef ?? tupletStateStack[tupletStateStack.length - 1];
            const startsWithRef = [...starts];
            if (!isGrace && tupletRefId && tupletRef && activeTupletRefId !== tupletRefId) {
              startsWithRef.push({
                actualNotes: tupletRef.actualNotes,
                normalNotes: tupletRef.normalNotes,
                number: resolveTupletNumberById(tupletRefId),
                showNumber: tupletRef.showNumber,
                bracket: tupletRef.bracket,
              });
              activeTupletRefId = tupletRefId;
            }
            const beamModeRaw = (event.querySelector(":scope > BeamMode")?.textContent ?? "").trim().toLowerCase();
            const beamMode = beamModeRaw === "begin" || beamModeRaw === "mid" ? beamModeRaw : undefined;
            events.push({
              kind: "chord",
              durationDiv: resolvedDurationDiv,
              displayDurationDiv: resolvedDisplayDurationDiv,
              notes,
              voice: voiceNo,
              staffNo: movedStaffNo,
              atDiv: voicePosDiv,
              beamMode,
              tupletTimeModification: !isGrace && currentTuplet
                ? { actualNotes: currentTuplet.actualNotes, normalNotes: currentTuplet.normalNotes }
                : undefined,
              tupletStarts: !isGrace && startsWithRef.length ? startsWithRef : undefined,
              slurStarts: slurTransitions.starts.length ? slurTransitions.starts : undefined,
              slurStops: slurTransitions.stops.length ? slurTransitions.stops : undefined,
              trillStarts: consumePendingTrillStarts(),
              trillStops: consumePendingTrillStops(),
              articulationTags: articulationTags.length ? Array.from(new Set(articulationTags)) : undefined,
              technicalTags: technicalTags.length ? Array.from(new Set(technicalTags)) : undefined,
              grace: isGrace,
              graceSlash: isAcciaccatura,
            });
            if (!isGrace) voicePosDiv += resolvedDurationDiv;
            continue;
          }
          if (tag === "spanner") {
            const spannerType = (event.getAttribute("type") ?? "").trim().toLowerCase();
            if (spannerType === "ottava") {
              const hasStop = event.querySelector(":scope > prev") !== null;
              const hasStart = event.querySelector(":scope > Ottava, :scope > ottava, :scope > next") !== null;
              if (hasStop) {
                const state = activeOttavaStates.length
                  ? (activeOttavaStates.pop() as MuseOttavaState)
                  : { number: 1, size: 8 as const, shiftType: "up" as const };
                events.push({
                  kind: "directionXml",
                  xml: buildOctaveShiftDirectionXml("stop", state),
                  voice: voiceNo,
                  staffNo: movedStaffNo,
                  atDiv: voicePosDiv,
                });
              }
              if (hasStart) {
                const parsed = parseOttavaSubtype(event.querySelector(":scope > Ottava > subtype, :scope > ottava > subtype")?.textContent);
                const state: MuseOttavaState = {
                  number: ottavaState.nextOttavaNumber,
                  size: parsed.size,
                  shiftType: parsed.shiftType,
                };
                ottavaState.nextOttavaNumber += 1;
                activeOttavaStates.push(state);
                events.push({
                  kind: "directionXml",
                  xml: buildOctaveShiftDirectionXml("start", state),
                  voice: voiceNo,
                  staffNo: movedStaffNo,
                  atDiv: voicePosDiv,
                });
              }
              continue;
            }
            const trill = parseTrillSpannerTransition(event);
            if (trill.stop) {
              const number = activeTrillNumbers.length ? (activeTrillNumbers.pop() as number) : 1;
              pendingTrillStops.push(number);
            }
            if (trill.start) {
              const number = nextTrillNumber;
              nextTrillNumber += 1;
              activeTrillNumbers.push(number);
              pendingTrillStarts.push(number);
            }
            continue;
          }
          if (tag === "dynamic") {
            if (!isMuseElementVisible(event)) continue;
            const mark = parseMuseDynamicMark(
              (event.querySelector(":scope > subtype")?.textContent ?? event.textContent ?? "").trim()
            );
            if (mark) {
              events.push({
                kind: "dynamic",
                mark,
                voice: voiceNo,
                staffNo: movedStaffNo,
                atDiv: voicePosDiv,
                soundDynamics: parseMuseDynamicSoundValue(event) ?? undefined,
              });
            } else {
              pushWarning({
                code: "MUSESCORE_IMPORT_WARNING",
                message: `measure ${mi + 1}: unsupported dynamic skipped.`,
                measure: mi + 1,
                staff: localStaffIndex + 1,
                voice: voiceNo,
                atDiv: voicePosDiv,
                action: "skipped",
                reason: "unsupported",
                tag: "Dynamic",
              });
            }
            continue;
          }
          if (tag === "tempo") {
            const directionXml = parseTempoDirectionXml(event);
            if (directionXml) {
              events.push({ kind: "directionXml", xml: directionXml, voice: voiceNo, staffNo: movedStaffNo, atDiv: voicePosDiv });
            }
            continue;
          }
          if (tag === "expression") {
            const directionXml = parseExpressionDirectionXml(event);
            if (directionXml) {
              events.push({ kind: "directionXml", xml: directionXml, voice: voiceNo, staffNo: movedStaffNo, atDiv: voicePosDiv });
            } else {
              pushWarning({
                code: "MUSESCORE_IMPORT_WARNING",
                message: `measure ${mi + 1}: unsupported expression skipped.`,
                measure: mi + 1,
                staff: localStaffIndex + 1,
                voice: voiceNo,
                atDiv: voicePosDiv,
                action: "skipped",
                reason: "unsupported",
                tag: "Expression",
              });
            }
            continue;
          }
          if (tag === "marker") {
            const directionXml = parseMarkerDirectionXml(event);
            if (directionXml) {
              events.push({ kind: "directionXml", xml: directionXml, voice: voiceNo, staffNo: movedStaffNo, atDiv: voicePosDiv });
            } else {
              pushWarning({
                code: "MUSESCORE_IMPORT_WARNING",
                message: `measure ${mi + 1}: unsupported marker skipped.`,
                measure: mi + 1,
                staff: localStaffIndex + 1,
                voice: voiceNo,
                atDiv: voicePosDiv,
                action: "skipped",
                reason: "unsupported",
                tag: "Marker",
              });
            }
            continue;
          }
          if (tag === "jump") {
            const parsed = parseJumpDirectionXml(event);
            if (!parsed) {
              pushWarning({
                code: "MUSESCORE_IMPORT_WARNING",
                message: `measure ${mi + 1}: unsupported jump skipped.`,
                measure: mi + 1,
                staff: localStaffIndex + 1,
                voice: voiceNo,
                atDiv: voicePosDiv,
                action: "skipped",
                reason: "unsupported",
                tag: "Jump",
              });
            } else {
              events.push({ kind: "directionXml", xml: parsed.xml, voice: voiceNo, staffNo: movedStaffNo, atDiv: voicePosDiv });
              if (!parsed.mapped) {
                pushWarning({
                  code: "MUSESCORE_IMPORT_WARNING",
                  message: `measure ${mi + 1}: jump mapped as text only; playback semantics may be incomplete.`,
                  measure: mi + 1,
                  staff: localStaffIndex + 1,
                  voice: voiceNo,
                  atDiv: voicePosDiv,
                  action: "mapped-with-loss",
                  reason: "playback-semantics-incomplete",
                  tag: "Jump",
                });
              }
            }
            continue;
          }
          if (
            tag === "timesig"
            || tag === "keysig"
            || tag === "layoutbreak"
            || tag === "clef"
            || tag === "beam"
          ) {
            continue;
          }
          unknownTagSet.add(tag);
        }
        if (activeTupletRefId) {
          const endedNo = tupletNumberById.get(activeTupletRefId);
          if (endedNo !== undefined) appendTupletStopToLastTimedEvent(endedNo);
          activeTupletRefId = null;
        }
      }

      const capacity = capacityDiv;
      const occupiedByVoice = new Map<number, number>();
      for (const event of events) {
        if (!("durationDiv" in event)) continue;
        const current = occupiedByVoice.get(event.voice) ?? 0;
        occupiedByVoice.set(event.voice, current + Math.max(0, Math.round(event.durationDiv)));
      }
      for (const [voice, occupied] of occupiedByVoice) {
        if (occupied <= capacity) continue;
        pushWarning({
          code: "MUSESCORE_IMPORT_WARNING",
          message: `measure ${mi + 1} voice ${voice}: overfull content (${occupied} > ${capacity}); tail events are clamped.`,
          measure: mi + 1,
          staff: localStaffIndex + 1,
          voice,
          action: "clamped",
          reason: "overfull",
          occupiedDiv: occupied,
          capacityDiv: capacity,
        });
      }

        parsedMeasures.push({
        index: mi + 1,
        beats: effectiveBeats,
        beatType: effectiveBeatType,
        timeSymbol,
        explicitTimeSig,
        capacityDiv,
        implicit,
        fifths,
        mode,
        tempoBpm,
        tempoText,
        repeatForward,
        repeatBackward,
        leftDoubleBarline,
        events,
      });
        currentBeats = effectiveBeats;
        currentBeatType = effectiveBeatType;
        currentTimeSymbol = timeSymbol;
        currentFifths = fifths;
        currentMode = mode;
        absoluteDivCursor += capacityDiv;
      }
      parsedStaffs.push({
        sourceStaffId,
        clefSign: clef.sign,
        clefLine: clef.line,
        measures: parsedMeasures,
      });
    }
    parsedByPart.push({ partId, partName: group.partName, staffs: parsedStaffs });
  }

  if (unknownTagSet.size > 0) {
    pushWarning({
      code: "MUSESCORE_IMPORT_WARNING",
      message: `unsupported MuseScore elements skipped: ${Array.from(unknownTagSet).sort().join(", ")}`,
      action: "skipped",
      reason: "unsupported-elements",
    });
  }

  let sourceMiscXml = "";
  if (sourceMetadata) {
    sourceMiscXml = buildSourceMiscXml(mscxSource);
    if (sourceVersion) {
      sourceMiscXml += `<miscellaneous-field name="src:musescore:version">${xmlEscape(sourceVersion)}</miscellaneous-field>`;
    }
  }
  const miscXml = `${debugMetadata ? buildWarningMiscXml(warnings) : ""}${sourceMiscXml}`;
  const partList = parsedByPart.map(
    (part) => `<score-part id="${part.partId}"><part-name>${xmlEscape(part.partName)}</part-name></score-part>`
  );
  const partXml: string[] = [];
  for (let partIndex = 0; partIndex < parsedByPart.length; partIndex += 1) {
    const part = parsedByPart[partIndex];
    const measuresXml: string[] = [];
    const voiceIdByStaffLocal = new Map<string, number>();
    let nextVoiceId = 1;
    const resolvePartVoiceId = (staffNo: number, localVoiceNo: number): number => {
      const key = `${staffNo}:${Math.max(1, Math.round(localVoiceNo))}`;
      const existing = voiceIdByStaffLocal.get(key);
      if (existing !== undefined) return existing;
      const assigned = nextVoiceId;
      nextVoiceId += 1;
      voiceIdByStaffLocal.set(key, assigned);
      return assigned;
    };
    for (let si = 0; si < part.staffs.length; si += 1) {
      const staffNo = si + 1;
      const voices = new Set<number>();
      for (const measure of part.staffs[si]?.measures ?? []) {
        for (const event of measure.events) {
          voices.add(Math.max(1, Math.round(event.voice)));
        }
      }
      if (!voices.size) voices.add(1);
      Array.from(voices)
        .sort((a, b) => a - b)
        .forEach((voiceNo) => {
          resolvePartVoiceId(staffNo, voiceNo);
        });
    }
    let prevBeats = globalBeats;
    let prevBeatType = globalBeatType;
    let prevTimeSymbol: "cut" | null = null;
    let prevFifths = globalFifths;
    let prevMode = globalMode;
    const measureCount = Math.max(1, ...part.staffs.map((staff) => staff.measures.length));
    const startsWithPickup = (part.staffs[0]?.measures[0]?.implicit ?? false) === true;
    for (let mi = 0; mi < measureCount; mi += 1) {
      const primaryMeasure: ParsedMuseScoreMeasure = part.staffs[0]?.measures[mi] ?? {
        index: mi + 1,
        beats: prevBeats,
        beatType: prevBeatType,
        timeSymbol: prevTimeSymbol,
        explicitTimeSig: false,
        capacityDiv: Math.max(1, Math.round((divisions * 4 * prevBeats) / Math.max(1, prevBeatType))),
        implicit: false,
        fifths: prevFifths,
        mode: prevMode,
        tempoBpm: null,
        tempoText: null,
        repeatForward: false,
        repeatBackward: false,
        leftDoubleBarline: false,
        events: [] as ParsedMuseScoreEvent[],
      };
      const capacity = Math.max(1, Math.round(primaryMeasure.capacityDiv));
      let body = "";
      const needsAttributes =
        mi === 0
        || primaryMeasure.beats !== prevBeats
        || primaryMeasure.beatType !== prevBeatType
        || primaryMeasure.timeSymbol !== prevTimeSymbol
        || primaryMeasure.explicitTimeSig
        || primaryMeasure.fifths !== prevFifths
        || primaryMeasure.mode !== prevMode;
      if (needsAttributes) {
        const timeSymbolAttr = primaryMeasure.timeSymbol ? ` symbol="${primaryMeasure.timeSymbol}"` : "";
        body += `<attributes><divisions>${divisions}</divisions><key><fifths>${primaryMeasure.fifths}</fifths><mode>${primaryMeasure.mode}</mode></key><time${timeSymbolAttr}><beats>${primaryMeasure.beats}</beats><beat-type>${primaryMeasure.beatType}</beat-type></time>`;
        if (part.staffs.length > 1) {
          body += `<staves>${part.staffs.length}</staves>`;
          for (let si = 0; si < part.staffs.length; si += 1) {
            const staff = part.staffs[si];
            body += `<clef number="${si + 1}"><sign>${staff.clefSign}</sign><line>${staff.clefLine}</line></clef>`;
          }
        } else {
          const staff = part.staffs[0];
          body += `<clef><sign>${staff?.clefSign ?? "G"}</sign><line>${staff?.clefLine ?? 2}</line></clef>`;
        }
        if (mi === 0 && partIndex === 0 && miscXml) {
          body += `<miscellaneous>${miscXml}</miscellaneous>`;
        }
        body += "</attributes>";
      }
      if (primaryMeasure.leftDoubleBarline) {
        body += `<barline location="left"><bar-style>light-light</bar-style></barline>`;
      }
      if (primaryMeasure.repeatForward) {
        body += `<barline location="left"><repeat direction="forward"/></barline>`;
      }
      if (primaryMeasure.tempoText) {
        body += buildWordsDirectionXml(primaryMeasure.tempoText, {
          placement: "above",
          soundTempo: primaryMeasure.tempoBpm,
        });
      } else if (primaryMeasure.tempoBpm !== null) {
        body += `<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${primaryMeasure.tempoBpm}</per-minute></metronome></direction-type><sound tempo="${primaryMeasure.tempoBpm}"/></direction>`;
      }

      for (let si = 0; si < part.staffs.length; si += 1) {
        const staffNo = si + 1;
        const measure: ParsedMuseScoreMeasure = part.staffs[si]?.measures[mi] ?? {
          index: mi + 1,
        beats: primaryMeasure.beats,
        beatType: primaryMeasure.beatType,
        timeSymbol: primaryMeasure.timeSymbol,
        explicitTimeSig: false,
        capacityDiv: primaryMeasure.capacityDiv,
        implicit: primaryMeasure.implicit,
        fifths: primaryMeasure.fifths,
        mode: primaryMeasure.mode,
        tempoBpm: null,
        tempoText: null,
        repeatForward: false,
        repeatBackward: false,
        leftDoubleBarline: false,
        events: [] as ParsedMuseScoreEvent[],
      };
        if (si > 0) {
          body += `<backup><duration>${capacity}</duration></backup>`;
        }
        const voices = Array.from(new Set(measure.events.map((event) => Math.max(1, Math.round(event.voice))))).sort(
          (a, b) => a - b
        );
        if (!voices.length) voices.push(1);
        for (let vi = 0; vi < voices.length; vi += 1) {
          const voiceNo = voices[vi];
          const partVoiceNo = resolvePartVoiceId(staffNo, voiceNo);
          const accidentalStateByPitch = new Map<string, number>();
          if (vi > 0) {
            body += `<backup><duration>${capacity}</duration></backup>`;
          }
          let occupied = 0;
          const voiceEvents = measure.events
            .filter((event) => Math.max(1, Math.round(event.voice)) === voiceNo)
            .slice()
            .sort((a, b) => {
              const aa = Math.max(0, Math.round(("atDiv" in a ? (a.atDiv ?? 0) : 0)));
              const bb = Math.max(0, Math.round(("atDiv" in b ? (b.atDiv ?? 0) : 0)));
              return aa - bb;
            });
          const tupletTolerance = tupletRoundingToleranceByVoiceEvents(voiceEvents);
          const beatDiv = Math.max(1, Math.round(measure.capacityDiv / Math.max(1, measure.beats)));
          const beamXmlByEventIndex = buildBeamXmlByVoiceEvents(voiceEvents, divisions, beatDiv);
          for (const event of voiceEvents) {
            const eventAtDiv = Math.max(0, Math.round(("atDiv" in event ? (event.atDiv ?? occupied) : occupied)));
            const eventStaffNo = ("staffNo" in event && Number.isFinite(event.staffNo))
              ? Math.max(1, Math.round(event.staffNo as number))
              : staffNo;
          if (event.kind === "dynamic") {
              const lead = Math.max(0, eventAtDiv - occupied);
              if (lead > 0) {
                body += `<forward><duration>${lead}</duration><voice>${partVoiceNo}</voice><staff>${eventStaffNo}</staff></forward>`;
                occupied += lead;
              }
              body += withDirectionPlacement(
                buildDynamicDirectionXml(event.mark, { soundDynamics: event.soundDynamics }),
                eventStaffNo,
                partVoiceNo
              );
              continue;
            }
          if (event.kind === "directionXml") {
              const lead = Math.max(0, eventAtDiv - occupied);
              if (lead > 0) {
                body += `<forward><duration>${lead}</duration><voice>${partVoiceNo}</voice><staff>${eventStaffNo}</staff></forward>`;
                occupied += lead;
              }
              body += withDirectionPlacement(event.xml, eventStaffNo, partVoiceNo);
              continue;
            }
            if (eventAtDiv > occupied) {
              const lead = eventAtDiv - occupied;
              body += `<forward><duration>${lead}</duration><voice>${partVoiceNo}</voice><staff>${eventStaffNo}</staff></forward>`;
              occupied += lead;
            }
            const timedDuration = Math.max(0, event.durationDiv);
            if (timedDuration > 0 && occupied + timedDuration > capacity + tupletTolerance) break;
            occupied += timedDuration;
            const info = divisionToTypeAndDots(divisions, event.displayDurationDiv ?? event.durationDiv);
            const eventIndex = voiceEvents.indexOf(event);
            const beamXml = eventIndex >= 0 ? (beamXmlByEventIndex.get(eventIndex) ?? "") : "";
            if (event.kind === "rest") {
              const tupletXml = buildTupletMusicXml(event);
              const notationsXml = tupletXml.notationItems.length
                ? `<notations>${tupletXml.notationItems.join("")}</notations>`
                : "";
              body += `<note><rest/><duration>${event.durationDiv}</duration><voice>${partVoiceNo}</voice><type>${info.type}</type>${"<dot/>".repeat(info.dots)}${tupletXml.timeModificationXml}${beamXml}<staff>${eventStaffNo}</staff>${notationsXml}</note>`;
              continue;
            }
            const tupletXml = buildTupletMusicXml(event);
            const slurItems: string[] = [];
            for (const no of event.slurStarts ?? []) {
              slurItems.push(`<slur type="start" number="${Math.max(1, Math.round(no))}"/>`);
            }
            for (const no of event.slurStops ?? []) {
              slurItems.push(`<slur type="stop" number="${Math.max(1, Math.round(no))}"/>`);
            }
            const trillItems: string[] = [];
            for (const no of event.trillStarts ?? []) {
              trillItems.push(`<ornaments><trill-mark/><wavy-line type="start" number="${Math.max(1, Math.round(no))}"/></ornaments>`);
            }
            for (const no of event.trillStops ?? []) {
              trillItems.push(`<ornaments><wavy-line type="stop" number="${Math.max(1, Math.round(no))}"/></ornaments>`);
            }
            for (let ni = 0; ni < event.notes.length; ni += 1) {
              const note = event.notes[ni];
              const pitch = midiToPitch(note.midi, {
                keyFifths: measure.fifths,
                preferAccidental: note.accidentalText,
              });
              const pitchKey = `${eventStaffNo}:${pitch.octave}:${pitch.step}`;
              const accidentalText = resolveAccidentalTextForPitch(pitch, {
                keyFifths: measure.fifths,
                previousAlterByPitchKey: accidentalStateByPitch,
                pitchKey,
                preferredAccidentalText: note.accidentalText,
              });
              const accidentalXml = accidentalText ? `<accidental>${accidentalText}</accidental>` : "";
              const timeModificationXml = ni === 0 && !event.grace ? tupletXml.timeModificationXml : "";
              const tieXml = `${note.tieStart ? '<tie type="start"/>' : ""}${note.tieStop ? '<tie type="stop"/>' : ""}`;
              const tiedItems = `${note.tieStart ? '<tied type="start"/>' : ""}${note.tieStop ? '<tied type="stop"/>' : ""}`;
              const articulationXml = ni === 0 && (event.articulationTags?.length ?? 0) > 0
                ? `<articulations>${(event.articulationTags ?? []).map((tag) => `<${tag}/>`).join("")}</articulations>`
                : "";
              const noteTechnicalItems: string[] = [];
              if (ni === 0 && (event.technicalTags?.length ?? 0) > 0) {
                noteTechnicalItems.push(...(event.technicalTags ?? []).map((tag) => `<${tag}/>`));
              }
              if (note.fingeringText && note.fingeringText.trim()) {
                noteTechnicalItems.push(`<fingering>${xmlEscape(note.fingeringText.trim())}</fingering>`);
              }
              if (note.stringNumber && note.stringNumber > 0) {
                noteTechnicalItems.push(`<string>${Math.round(note.stringNumber)}</string>`);
              }
              const technicalXml = noteTechnicalItems.length
                ? `<technical>${noteTechnicalItems.join("")}</technical>`
                : "";
              const notationItems = [
                ...(ni === 0 ? tupletXml.notationItems : []),
                ...(ni === 0 ? slurItems : []),
                ...(ni === 0 ? trillItems : []),
                articulationXml,
                technicalXml,
                tiedItems,
              ].filter((item) => item.length > 0);
              const notationsXml = notationItems.length ? `<notations>${notationItems.join("")}</notations>` : "";
              const beamXmlForNote = ni === 0 ? beamXml : "";
              const graceXml = ni === 0 && event.grace
                ? (event.graceSlash ? '<grace slash="yes"/>' : "<grace/>")
                : "";
              const durationXml = event.grace ? "" : `<duration>${event.durationDiv}</duration>`;
              body += `<note>${ni > 0 ? "<chord/>" : ""}${graceXml}<pitch><step>${pitch.step}</step>${pitch.alter !== 0 ? `<alter>${pitch.alter}</alter>` : ""}<octave>${pitch.octave}</octave></pitch>${tieXml}${durationXml}<voice>${partVoiceNo}</voice><type>${info.type}</type>${"<dot/>".repeat(info.dots)}${timeModificationXml}${accidentalXml}${beamXmlForNote}<staff>${eventStaffNo}</staff>${notationsXml}</note>`;
            }
          }
          if (occupied < capacity && capacity - occupied > tupletTolerance) {
            const restDiv = capacity - occupied;
            const info = divisionToTypeAndDots(divisions, restDiv);
            body += `<note><rest/><duration>${restDiv}</duration><voice>${partVoiceNo}</voice><type>${info.type}</type>${"<dot/>".repeat(info.dots)}<staff>${staffNo}</staff></note>`;
          }
        }
      }
      const isLastMeasure = mi === measureCount - 1;
      if (primaryMeasure.repeatBackward || isLastMeasure) {
        body += `<barline location="right">`;
        if (isLastMeasure) {
          body += "<bar-style>light-heavy</bar-style>";
        }
        if (primaryMeasure.repeatBackward) {
          body += `<repeat direction="backward"/>`;
        }
        body += "</barline>";
      }
      const implicitAttr = primaryMeasure.implicit ? ' implicit="yes"' : "";
      const measureNumber = startsWithPickup ? mi : mi + 1;
      measuresXml.push(`<measure number="${measureNumber}"${implicitAttr}>${body}</measure>`);
      prevBeats = primaryMeasure.beats;
      prevBeatType = primaryMeasure.beatType;
      prevTimeSymbol = primaryMeasure.timeSymbol;
      prevFifths = primaryMeasure.fifths;
      prevMode = primaryMeasure.mode;
    }
    partXml.push(`<part id="${part.partId}">${measuresXml.join("")}</part>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>${xmlEscape(workTitle)}</work-title></work><part-list>${partList.join("")}</part-list>${partXml.join("")}</score-partwise>`;
};

const firstNumberInDoc = (scope: ParentNode, selectors: string[], fallback: number): number => {
  for (const selector of selectors) {
    const n = firstNumber(scope, selector);
    if (n !== null && Number.isFinite(n) && n > 0) return Math.max(1, Math.round(n));
  }
  return fallback;
};

const divisionsToMuseDurationType = (divisions: number, durationDiv: number): { durationType: string; dots: number } => {
  const info = divisionToTypeAndDots(divisions, Math.max(1, Math.round(durationDiv)));
  switch (info.type) {
    case "whole":
    case "half":
    case "quarter":
    case "eighth":
    case "16th":
    case "32nd":
    case "64th":
      return { durationType: info.type, dots: info.dots };
    default:
      return { durationType: "quarter", dots: 0 };
  }
};

const makeMuseChordXml = (
  durationDiv: number,
  displayDurationDiv: number,
  divisions: number,
  notes: Array<{
    midi: number;
    tieStart: boolean;
    tieStop: boolean;
    accidentalSubtype: string | null;
    fingeringText?: string;
    stringNumber?: number;
  }>,
  slurStarts?: number[],
  slurStops?: number[],
  articulationSubtypes?: string[],
  trillStarts?: number[],
  trillStops?: number[],
  tupletRefId?: string,
  ottavaStartSubtypes?: string[],
  ottavaStopCount?: number,
  grace?: boolean,
  graceSlash?: boolean
): string => {
  const duration = divisionsToMuseDurationType(
    divisions,
    displayDurationDiv > 0 ? displayDurationDiv : (durationDiv > 0 ? durationDiv : Math.max(1, Math.round(divisions / 4)))
  );
  let xml = "<Chord>";
  if (grace) {
    xml += graceSlash ? "<acciaccatura/>" : "<grace/>";
  }
  xml += `<durationType>${duration.durationType}</durationType>`;
  if (tupletRefId && tupletRefId.trim()) {
    xml += `<Tuplet>${xmlEscape(tupletRefId.trim())}</Tuplet>`;
  }
  if (duration.dots > 0) xml += `<dots>${duration.dots}</dots>`;
  for (const subtype of ottavaStartSubtypes ?? []) {
    xml += `<Spanner type="Ottava"><Ottava><subtype>${xmlEscape(subtype)}</subtype></Ottava><next><location><fractions>1/1</fractions></location></next></Spanner>`;
  }
  for (let i = 0; i < Math.max(0, Math.round(ottavaStopCount ?? 0)); i += 1) {
    xml += `<Spanner type="Ottava"><prev><location><fractions>-1/1</fractions></location></prev></Spanner>`;
  }
  for (const _no of trillStarts ?? []) {
    xml += `<Spanner type="Trill"><Trill><subtype>trill</subtype></Trill><next><location><fractions>1/1</fractions></location></next></Spanner>`;
  }
  for (const _no of trillStops ?? []) {
    xml += `<Spanner type="Trill"><prev><location><fractions>-1/1</fractions></location></prev></Spanner>`;
  }
  for (const no of slurStarts ?? []) {
    xml += `<Slur type="start" id="${Math.max(1, Math.round(no))}"/>`;
  }
  for (const no of slurStops ?? []) {
    xml += `<Slur type="stop" id="${Math.max(1, Math.round(no))}"/>`;
  }
  for (const subtype of articulationSubtypes ?? []) {
    xml += `<Articulation><subtype>${xmlEscape(subtype)}</subtype></Articulation>`;
  }
  for (const note of notes) {
    xml += "<Note>";
    xml += `<pitch>${Math.max(0, Math.min(127, Math.round(note.midi)))}</pitch>`;
    if (note.accidentalSubtype) {
      xml += `<Accidental><subtype>${xmlEscape(note.accidentalSubtype)}</subtype></Accidental>`;
    }
    if (note.fingeringText && note.fingeringText.trim()) {
      xml += `<Fingering>${xmlEscape(note.fingeringText.trim())}</Fingering>`;
    }
    if (note.stringNumber && note.stringNumber > 0) {
      xml += `<String>${Math.round(note.stringNumber)}</String>`;
    }
    if (note.tieStart) xml += "<Tie/>";
    if (note.tieStop) xml += "<endSpanner/>";
    xml += "</Note>";
  }
  xml += "</Chord>";
  return xml;
};

const makeMuseRestXml = (
  durationDiv: number,
  displayDurationDiv: number,
  divisions: number,
  tupletRefId?: string
): string => {
  const duration = divisionsToMuseDurationType(divisions, displayDurationDiv > 0 ? displayDurationDiv : durationDiv);
  let xml = "<Rest>";
  xml += `<durationType>${duration.durationType}</durationType>`;
  if (tupletRefId && tupletRefId.trim()) {
    xml += `<Tuplet>${xmlEscape(tupletRefId.trim())}</Tuplet>`;
  }
  if (duration.dots > 0) xml += `<dots>${duration.dots}</dots>`;
  xml += "</Rest>";
  return xml;
};

const getNoteStaffNo = (note: Element): number => {
  const staff = firstNumber(note, ":scope > staff");
  if (staff === null) return 1;
  return Math.max(1, Math.round(staff));
};

const getMeasureStaffCountFromMusicXml = (measure: Element): number => {
  let maxStaff = Math.max(1, Math.round(firstNumber(measure, ":scope > attributes > staves") ?? 1));
  for (const note of Array.from(measure.querySelectorAll(":scope > note"))) {
    maxStaff = Math.max(maxStaff, getNoteStaffNo(note));
  }
  return maxStaff;
};

const getPartStaffCountFromMusicXml = (part: Element): number => {
  let maxStaff = 1;
  for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
    maxStaff = Math.max(maxStaff, getMeasureStaffCountFromMusicXml(measure));
  }
  return maxStaff;
};

type MuseDirectionSeed =
  | { kind: "tempo"; qps: number; text?: string }
  | { kind: "dynamic"; subtype: string; velocity?: number }
  | { kind: "expression"; text: string; italic?: boolean }
  | { kind: "marker"; subtype: "segno" | "coda" | "fine"; label: string }
  | { kind: "jump"; text: string; jumpTo?: string; playUntil?: string; continueAt?: string };

const dynamicTagToMuseSubtype = (tag: string): string | null => {
  const v = tag.trim().toLowerCase();
  const allow = new Set(["pppp", "ppp", "pp", "p", "mp", "mf", "f", "ff", "fff", "ffff", "sf", "sfz", "rfz"]);
  return allow.has(v) ? v : null;
};

const musicXmlSoundDynamicsToMuseVelocity = (raw: string | null): number | undefined => {
  const n = Number(raw ?? "");
  if (!Number.isFinite(n) || n <= 0) return undefined;
  // Inverse of parseMuseDynamicSoundValue: dynamics(%) ~= velocity / 90 * 100.
  const velocity = Math.round((n * 90) / 100);
  return Math.max(1, Math.min(127, velocity));
};

const collectDirectionSeedsFromMusicXmlMeasure = (measure: Element, staffNo: number): MuseDirectionSeed[] => {
  const out: MuseDirectionSeed[] = [];
  for (const direction of Array.from(measure.querySelectorAll(":scope > direction"))) {
    const directionStaff = Math.max(1, Math.round(firstNumber(direction, ":scope > staff") ?? 1));
    if (directionStaff !== staffNo) continue;
    const tempo = direction.querySelector(":scope > sound")?.getAttribute("tempo") ?? null;
    const tempoNumber = Number(tempo ?? "");
    const hasTempo = Number.isFinite(tempoNumber) && tempoNumber > 0;
    const qps = hasTempo ? tempoNumber / 60 : 0;
    const soundDynamics = direction.querySelector(":scope > sound")?.getAttribute("dynamics") ?? null;
    const soundDalsegno = (direction.querySelector(":scope > sound")?.getAttribute("dalsegno") ?? "").trim();
    const soundDaCapo = (direction.querySelector(":scope > sound")?.getAttribute("dacapo") ?? "").trim().toLowerCase();
    const soundFine = (direction.querySelector(":scope > sound")?.getAttribute("fine") ?? "").trim();
    const soundToCoda = (direction.querySelector(":scope > sound")?.getAttribute("tocoda") ?? "").trim();
    const velocity = musicXmlSoundDynamicsToMuseVelocity(soundDynamics);

    for (const dynNode of Array.from(direction.querySelectorAll(":scope > direction-type > dynamics > *"))) {
      const subtype = dynamicTagToMuseSubtype(dynNode.tagName.toLowerCase());
      if (!subtype) continue;
      out.push({ kind: "dynamic", subtype, velocity });
    }
    if (direction.querySelector(":scope > direction-type > segno") !== null) {
      out.push({ kind: "marker", subtype: "segno", label: "segno" });
    }
    if (direction.querySelector(":scope > direction-type > coda") !== null) {
      out.push({ kind: "marker", subtype: "coda", label: "coda" });
    }
    for (const words of Array.from(direction.querySelectorAll(":scope > direction-type > words"))) {
      const text = (words.textContent ?? "").trim();
      if (!text) continue;
      const italic = (words.getAttribute("font-style") ?? "").trim().toLowerCase() === "italic";
      if (hasTempo) out.push({ kind: "tempo", qps, text });
      else if (text.toLowerCase() === "fine") out.push({ kind: "marker", subtype: "fine", label: "Fine" });
      else out.push({ kind: "expression", text, italic: italic || undefined });
    }
    if (hasTempo && direction.querySelector(":scope > direction-type > words") === null) {
      out.push({ kind: "tempo", qps });
    }
    if (soundDalsegno || soundDaCapo === "yes" || soundFine || soundToCoda) {
      const jump: MuseDirectionSeed = {
        kind: "jump",
        text: soundDaCapo === "yes" ? "D.C." : (soundDalsegno ? "D.S." : "Jump"),
        jumpTo: soundDaCapo === "yes" ? "start" : (soundDalsegno || undefined),
        playUntil: soundFine || (soundToCoda ? "coda" : undefined),
        continueAt: soundToCoda || undefined,
      };
      out.push(jump);
    }
  }
  return out;
};

type MusePendingDirectionMarks = {
  ottavaStartSubtypes: string[];
  ottavaStopCount: number;
};

const parseMusicXmlOctaveShiftSubtype = (octaveShift: Element): string | null => {
  const type = (octaveShift.getAttribute("type") ?? "").trim().toLowerCase();
  if (!type || type === "stop" || type === "continue") return null;
  const size = Number.parseInt((octaveShift.getAttribute("size") ?? "").trim(), 10);
  const resolvedSize = Number.isFinite(size) && size > 8 ? 15 : 8;
  if (type === "down") return resolvedSize === 15 ? "15mb" : "8vb";
  return resolvedSize === 15 ? "15ma" : "8va";
};

type MuseVoiceEvent = {
  atDiv: number;
  durationDiv: number;
  grace?: boolean;
  graceSlash?: boolean;
  tupletTimeModification?: {
    actualNotes: number;
    normalNotes: number;
  };
  tupletStarts?: number[];
  tupletStops?: number[];
  pitches: Array<{
    midi: number;
    tieStart: boolean;
    tieStop: boolean;
    accidentalSubtype: string | null;
    fingeringText?: string;
    stringNumber?: number;
  }> | null;
  slurStarts?: number[];
  slurStops?: number[];
  trillStarts?: number[];
  trillStops?: number[];
  ottavaStartSubtypes?: string[];
  ottavaStopCount?: number;
  articulationSubtypes?: string[];
};

type ClefSign = "G" | "F";

const parseMusicXmlPitchToMidi = (note: Element): number | null => {
  // Prefer pitched notes, but also accept unpitched display position so percussion notes are not dropped.
  const step = (
    note.querySelector(":scope > pitch > step")?.textContent
    ?? note.querySelector(":scope > unpitched > display-step")?.textContent
    ?? ""
  ).trim().toUpperCase();
  const octaveRaw = (
    note.querySelector(":scope > pitch > octave")?.textContent
    ?? note.querySelector(":scope > unpitched > display-octave")?.textContent
    ?? ""
  ).trim();
  if (!step || !octaveRaw) return null;
  const octave = Number(octaveRaw);
  if (!Number.isFinite(octave)) return null;
  const alter = Number(note.querySelector(":scope > pitch > alter")?.textContent?.trim() ?? "0");
  const semitoneBase: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const base = semitoneBase[step];
  if (base === undefined) return null;
  const midi = Math.round((octave + 1) * 12 + base + (Number.isFinite(alter) ? alter : 0));
  if (!Number.isFinite(midi)) return null;
  return Math.max(0, Math.min(127, midi));
};

const parseMusicXmlTieFlags = (note: Element): { tieStart: boolean; tieStop: boolean } => {
  const hasStart =
    note.querySelector(':scope > tie[type="start"]') !== null
    || note.querySelector(':scope > notations > tied[type="start"]') !== null;
  const hasStop =
    note.querySelector(':scope > tie[type="stop"]') !== null
    || note.querySelector(':scope > notations > tied[type="stop"]') !== null;
  return { tieStart: hasStart, tieStop: hasStop };
};

const parseMusicXmlAccidentalSubtype = (note: Element): string | null => {
  const accidental = (note.querySelector(":scope > accidental")?.textContent ?? "").trim().toLowerCase();
  if (!accidental) return null;
  if (accidental === "natural") return "accidentalNatural";
  if (accidental === "sharp") return "accidentalSharp";
  if (accidental === "flat") return "accidentalFlat";
  if (accidental === "double-sharp") return "accidentalDoubleSharp";
  if (accidental === "flat-flat") return "accidentalDoubleFlat";
  return null;
};

const parseMusicXmlSlurNumbers = (note: Element): { starts: number[]; stops: number[] } => {
  const starts: number[] = [];
  const stops: number[] = [];
  for (const slur of Array.from(note.querySelectorAll(":scope > notations > slur[type]"))) {
    const type = (slur.getAttribute("type") ?? "").trim().toLowerCase();
    const rawNumber = (slur.getAttribute("number") ?? "").trim();
    const number = Number(rawNumber);
    const normalized = Number.isFinite(number) && number > 0 ? Math.round(number) : 1;
    if (type === "start") starts.push(normalized);
    if (type === "stop") stops.push(normalized);
  }
  return { starts, stops };
};

const parseMusicXmlTrillNumbers = (note: Element): { starts: number[]; stops: number[] } => {
  const starts: number[] = [];
  const stops: number[] = [];
  for (const node of Array.from(note.querySelectorAll(':scope > notations > ornaments > wavy-line[type]'))) {
    const type = (node.getAttribute("type") ?? "").trim().toLowerCase();
    const rawNumber = (node.getAttribute("number") ?? "").trim();
    const parsed = Number(rawNumber);
    const number = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 1;
    if (type === "start") starts.push(number);
    if (type === "stop") stops.push(number);
  }
  if (
    starts.length === 0
    && note.querySelector(":scope > notations > ornaments > trill-mark") !== null
  ) {
    starts.push(1);
  }
  return { starts, stops };
};

const parseMusicXmlTupletTimeModification = (
  note: Element
): { actualNotes: number; normalNotes: number } | null => {
  const actual = Number.parseInt((note.querySelector(":scope > time-modification > actual-notes")?.textContent ?? "").trim(), 10);
  const normal = Number.parseInt((note.querySelector(":scope > time-modification > normal-notes")?.textContent ?? "").trim(), 10);
  if (!Number.isFinite(actual) || !Number.isFinite(normal) || actual <= 0 || normal <= 0) return null;
  return {
    actualNotes: Math.max(1, Math.round(actual)),
    normalNotes: Math.max(1, Math.round(normal)),
  };
};

const parseMusicXmlTupletNumbers = (note: Element): { starts: number[]; stops: number[] } => {
  const starts: number[] = [];
  const stops: number[] = [];
  for (const tuplet of Array.from(note.querySelectorAll(":scope > notations > tuplet[type]"))) {
    const type = (tuplet.getAttribute("type") ?? "").trim().toLowerCase();
    const rawNumber = (tuplet.getAttribute("number") ?? "").trim();
    const parsed = Number.parseInt(rawNumber, 10);
    const number = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 1;
    if (type === "start") starts.push(number);
    if (type === "stop") stops.push(number);
  }
  return { starts, stops };
};

const mergeUniqueNumbers = (base: number[] | undefined, incoming: number[]): number[] | undefined => {
  if (!incoming.length) return base;
  const merged = new Set<number>(base ?? []);
  for (const no of incoming) merged.add(Math.max(1, Math.round(no)));
  return Array.from(merged.values()).sort((a, b) => a - b);
};

const parseMusicXmlArticulationSubtypes = (note: Element): string[] => {
  const out = new Set<string>();
  for (const node of Array.from(note.querySelectorAll(":scope > notations > articulations > *"))) {
    const tag = node.tagName.toLowerCase();
    if (tag === "staccato") out.add("articStaccatoAbove");
    if (tag === "accent") out.add("articAccentAbove");
    if (tag === "tenuto") out.add("articTenutoAbove");
  }
  for (const node of Array.from(note.querySelectorAll(":scope > notations > technical > *"))) {
    const tag = node.tagName.toLowerCase();
    if (tag === "stopped") out.add("articLhPizzicatoAbove");
    if (tag === "snap-pizzicato") out.add("snapPizzicato");
    if (tag === "up-bow") out.add("articUpBowAbove");
    if (tag === "down-bow") out.add("articDownBowAbove");
    if (tag === "open-string") out.add("articOpenStringAbove");
    if (tag === "harmonic") out.add("articHarmonicAbove");
  }
  return Array.from(out.values());
};

const parseMusicXmlTechnicalFingering = (note: Element): string | null => {
  const text = (note.querySelector(":scope > notations > technical > fingering")?.textContent ?? "").trim();
  return text || null;
};

const parseMusicXmlTechnicalString = (note: Element): number | null => {
  const raw = (note.querySelector(":scope > notations > technical > string")?.textContent ?? "").trim();
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
};

const mergeUniqueStrings = (base: string[] | undefined, incoming: string[]): string[] | undefined => {
  if (!incoming.length) return base;
  const merged = new Set<string>(base ?? []);
  for (const s of incoming) merged.add(s);
  return Array.from(merged.values());
};

const mergeUniqueSubtypes = (base: string[] | undefined, incoming: string[]): string[] | undefined => {
  if (!incoming.length) return base;
  const merged = new Set<string>(base ?? []);
  for (const s of incoming) merged.add(s);
  return Array.from(merged.values());
};

const normalizeMusicXmlClefSign = (raw: string | null | undefined): ClefSign | null => {
  const v = String(raw ?? "").trim().toUpperCase();
  if (!v) return null;
  if (v.includes("F")) return "F";
  if (v.includes("G")) return "G";
  return null;
};

const readMusicXmlMeasureClefSign = (measure: Element, staffNo: number): ClefSign | null => {
  const numbered = measure.querySelector(`:scope > attributes > clef[number="${staffNo}"] > sign`);
  const numberedSign = normalizeMusicXmlClefSign(numbered?.textContent);
  if (numberedSign) return numberedSign;
  if (staffNo === 1) {
    const unnumbered = measure.querySelector(":scope > attributes > clef:not([number]) > sign");
    const unnumberedSign = normalizeMusicXmlClefSign(unnumbered?.textContent);
    if (unnumberedSign) return unnumberedSign;
  }
  return null;
};

const collectMusicXmlPitchesByStaff = (part: Element): Map<number, number[]> => {
  const byStaff = new Map<number, number[]>();
  for (const note of Array.from(part.querySelectorAll(":scope > measure > note"))) {
    if (note.querySelector(":scope > rest")) continue;
    const midi = parseMusicXmlPitchToMidi(note);
    if (midi === null) continue;
    const staffNo = getNoteStaffNo(note);
    const list = byStaff.get(staffNo) ?? [];
    list.push(midi);
    byStaff.set(staffNo, list);
  }
  return byStaff;
};

const inferClefSignFromPitches = (midiList: number[]): ClefSign => {
  if (!midiList.length) return "G";
  const sorted = midiList.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return median < 60 ? "F" : "G";
};

const readFirstExplicitClefInPart = (part: Element, staffNo: number): ClefSign | null => {
  for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
    const clef = readMusicXmlMeasureClefSign(measure, staffNo);
    if (clef) return clef;
  }
  return null;
};

const buildMuseVoiceEventsByStaff = (
  measure: Element,
  divisions: number
): Map<number, Map<number, MuseVoiceEvent[]>> => {
  const byStaff = new Map<number, Map<number, MuseVoiceEvent[]>>();
  let cursorDiv = 0;
  const pendingDirectionMarks: Array<{
    staffNo: number;
    voiceNo: number;
    atDiv: number;
    marks: MusePendingDirectionMarks;
  }> = [];

  const queueDirectionMarks = (
    staffNo: number,
    voiceNo: number,
    atDiv: number,
    marks: Partial<MusePendingDirectionMarks>
  ): void => {
    const prev = pendingDirectionMarks.find(
      (entry) => entry.staffNo === staffNo && entry.voiceNo === voiceNo && entry.atDiv === atDiv
    )?.marks ?? { ottavaStartSubtypes: [], ottavaStopCount: 0 };
    if (marks.ottavaStartSubtypes?.length) {
      prev.ottavaStartSubtypes.push(...marks.ottavaStartSubtypes);
    }
    if (marks.ottavaStopCount) {
      prev.ottavaStopCount += marks.ottavaStopCount;
    }
    const found = pendingDirectionMarks.find(
      (entry) => entry.staffNo === staffNo && entry.voiceNo === voiceNo && entry.atDiv === atDiv
    );
    if (found) {
      found.marks = prev;
      return;
    }
    pendingDirectionMarks.push({ staffNo, voiceNo, atDiv, marks: prev });
  };

  const consumeDirectionMarks = (staffNo: number, voiceNo: number, atDiv: number): MusePendingDirectionMarks | null => {
    const collected: MusePendingDirectionMarks = { ottavaStartSubtypes: [], ottavaStopCount: 0 };
    for (let i = pendingDirectionMarks.length - 1; i >= 0; i -= 1) {
      const entry = pendingDirectionMarks[i];
      if (entry.staffNo !== staffNo || entry.voiceNo !== voiceNo) continue;
      if (entry.atDiv > atDiv) continue;
      if (entry.marks.ottavaStartSubtypes.length) {
        collected.ottavaStartSubtypes.push(...entry.marks.ottavaStartSubtypes);
      }
      if (entry.marks.ottavaStopCount > 0) {
        collected.ottavaStopCount += entry.marks.ottavaStopCount;
      }
      pendingDirectionMarks.splice(i, 1);
    }
    if (!collected.ottavaStartSubtypes.length && collected.ottavaStopCount <= 0) return null;
    return collected;
  };

  const children = Array.from(measure.children);
  for (const child of children) {
    const tag = child.tagName.toLowerCase();
    if (tag === "backup") {
      const duration = Math.max(0, Math.round(firstNumber(child, ":scope > duration") ?? 0));
      cursorDiv = Math.max(0, cursorDiv - duration);
      continue;
    }
    if (tag === "forward") {
      const duration = Math.max(0, Math.round(firstNumber(child, ":scope > duration") ?? 0));
      cursorDiv += duration;
      continue;
    }
    if (tag === "direction") {
      const staffNo = Math.max(1, Math.round(firstNumber(child, ":scope > staff") ?? 1));
      const voiceNo = Math.max(1, Math.round(firstNumber(child, ":scope > voice") ?? 1));
      const startSubtypes: string[] = [];
      let stopCount = 0;
      for (const octaveShift of Array.from(child.querySelectorAll(":scope > direction-type > octave-shift[type]"))) {
        const type = (octaveShift.getAttribute("type") ?? "").trim().toLowerCase();
        if (type === "stop") {
          stopCount += 1;
          continue;
        }
        const subtype = parseMusicXmlOctaveShiftSubtype(octaveShift);
        if (subtype) startSubtypes.push(subtype);
      }
      if (startSubtypes.length || stopCount > 0) {
        queueDirectionMarks(staffNo, voiceNo, cursorDiv, {
          ottavaStartSubtypes: startSubtypes,
          ottavaStopCount: stopCount,
        });
      }
      continue;
    }
    if (tag !== "note") continue;

    const staffNo = getNoteStaffNo(child);
    const voiceNo = Math.max(1, Math.round(firstNumber(child, ":scope > voice") ?? 1));
    const isGrace = child.querySelector(":scope > grace") !== null;
    const isGraceSlash = (child.querySelector(":scope > grace")?.getAttribute("slash") ?? "").trim().toLowerCase() === "yes";
    const durationDiv = isGrace
      ? 0
      : Math.max(1, Math.round(firstNumber(child, ":scope > duration") ?? divisions));
    const isChordFollow = child.querySelector(":scope > chord") !== null;
    const isRest = child.querySelector(":scope > rest") !== null;
    const tupletTimeModification = parseMusicXmlTupletTimeModification(child);
    const tupletNumbers = parseMusicXmlTupletNumbers(child);

    const byVoice = byStaff.get(staffNo) ?? new Map<number, MuseVoiceEvent[]>();
    byStaff.set(staffNo, byVoice);
    const events = byVoice.get(voiceNo) ?? [];
    byVoice.set(voiceNo, events);

    if (isChordFollow && !isRest && events.length > 0) {
      const prev = events[events.length - 1];
      // In MusicXML, <chord/> notes share onset with the previous note.
      // cursorDiv is already advanced past the previous non-chord note, so compare against prev end time.
      if (prev.pitches !== null && prev.atDiv + prev.durationDiv === cursorDiv) {
        const midi = parseMusicXmlPitchToMidi(child);
        if (midi !== null) {
          const tie = parseMusicXmlTieFlags(child);
          const accidentalSubtype = parseMusicXmlAccidentalSubtype(child);
          const slur = parseMusicXmlSlurNumbers(child);
          const trill = parseMusicXmlTrillNumbers(child);
          const articulations = parseMusicXmlArticulationSubtypes(child);
          prev.pitches.push({
            midi,
            tieStart: tie.tieStart,
            tieStop: tie.tieStop,
            accidentalSubtype,
            fingeringText: parseMusicXmlTechnicalFingering(child) ?? undefined,
            stringNumber: parseMusicXmlTechnicalString(child) ?? undefined,
          });
          prev.slurStarts = mergeUniqueNumbers(prev.slurStarts, slur.starts);
          prev.slurStops = mergeUniqueNumbers(prev.slurStops, slur.stops);
          prev.trillStarts = mergeUniqueNumbers(prev.trillStarts, trill.starts);
          prev.trillStops = mergeUniqueNumbers(prev.trillStops, trill.stops);
          prev.tupletStarts = mergeUniqueNumbers(prev.tupletStarts, tupletNumbers.starts);
          prev.tupletStops = mergeUniqueNumbers(prev.tupletStops, tupletNumbers.stops);
          if (!prev.tupletTimeModification && tupletTimeModification) {
            prev.tupletTimeModification = tupletTimeModification;
          }
          prev.articulationSubtypes = mergeUniqueStrings(prev.articulationSubtypes, articulations);
          if (isGrace) {
            prev.grace = true;
            prev.graceSlash = prev.graceSlash || isGraceSlash;
          }
        }
      }
    } else if (isRest) {
      const marks = consumeDirectionMarks(staffNo, voiceNo, cursorDiv);
      events.push({
        atDiv: cursorDiv,
        durationDiv,
        pitches: null,
        tupletTimeModification: tupletTimeModification ?? undefined,
        tupletStarts: tupletNumbers.starts.length ? tupletNumbers.starts : undefined,
        tupletStops: tupletNumbers.stops.length ? tupletNumbers.stops : undefined,
        ottavaStartSubtypes: marks?.ottavaStartSubtypes?.length ? marks.ottavaStartSubtypes : undefined,
        ottavaStopCount: marks?.ottavaStopCount ? marks.ottavaStopCount : undefined,
      });
    } else {
      const midi = parseMusicXmlPitchToMidi(child);
      if (midi !== null) {
        const tie = parseMusicXmlTieFlags(child);
        const accidentalSubtype = parseMusicXmlAccidentalSubtype(child);
        const slur = parseMusicXmlSlurNumbers(child);
        const trill = parseMusicXmlTrillNumbers(child);
        const articulations = parseMusicXmlArticulationSubtypes(child);
        const marks = consumeDirectionMarks(staffNo, voiceNo, cursorDiv);
        events.push({
          atDiv: cursorDiv,
          durationDiv,
          grace: isGrace ? true : undefined,
          graceSlash: isGrace ? isGraceSlash : undefined,
          tupletTimeModification: tupletTimeModification ?? undefined,
          tupletStarts: tupletNumbers.starts.length ? tupletNumbers.starts : undefined,
          tupletStops: tupletNumbers.stops.length ? tupletNumbers.stops : undefined,
          pitches: [{
            midi,
            tieStart: tie.tieStart,
            tieStop: tie.tieStop,
            accidentalSubtype,
            fingeringText: parseMusicXmlTechnicalFingering(child) ?? undefined,
            stringNumber: parseMusicXmlTechnicalString(child) ?? undefined,
          }],
          slurStarts: slur.starts.length ? slur.starts : undefined,
          slurStops: slur.stops.length ? slur.stops : undefined,
          trillStarts: trill.starts.length ? trill.starts : undefined,
          trillStops: trill.stops.length ? trill.stops : undefined,
          ottavaStartSubtypes: marks?.ottavaStartSubtypes?.length ? marks.ottavaStartSubtypes : undefined,
          ottavaStopCount: marks?.ottavaStopCount ? marks.ottavaStopCount : undefined,
          articulationSubtypes: articulations.length ? articulations : undefined,
        });
      }
    }

    if (!isChordFollow && !isGrace) {
      cursorDiv += durationDiv;
    }
  }

  // Attach trailing direction marks (e.g. octave-shift stop at measure end) to the last timed event.
  for (const pending of pendingDirectionMarks) {
    const byVoice = byStaff.get(pending.staffNo);
    if (!byVoice) continue;
    const events = byVoice.get(pending.voiceNo);
    if (!events || !events.length) continue;
    const last = events[events.length - 1];
    last.ottavaStartSubtypes = mergeUniqueSubtypes(last.ottavaStartSubtypes, pending.marks.ottavaStartSubtypes) ?? last.ottavaStartSubtypes;
    if ((pending.marks.ottavaStopCount ?? 0) > 0) {
      last.ottavaStopCount = (last.ottavaStopCount ?? 0) + pending.marks.ottavaStopCount;
    }
  }

  return byStaff;
};

const readPartNameMapFromMusicXml = (score: Element): Map<string, string> => {
  const map = new Map<string, string>();
  for (const sp of Array.from(score.querySelectorAll(":scope > part-list > score-part"))) {
    const id = (sp.getAttribute("id") ?? "").trim();
    if (!id) continue;
    const name = (sp.querySelector(":scope > part-name")?.textContent ?? "").trim() || id;
    map.set(id, name);
  }
  return map;
};

type MuseScoreExportOptions = {
  normalizeCutTimeToTwoTwo?: boolean;
};

export const exportMusicXmlDomToMuseScore = (doc: Document, options: MuseScoreExportOptions = {}): string => {
  const score = doc.querySelector("score-partwise");
  if (!score) throw new Error("MusicXML score-partwise root was not found.");
  const normalizeCutTimeToTwoTwo = options.normalizeCutTimeToTwoTwo === true;
  const title =
    (score.querySelector("work > work-title")?.textContent ?? "").trim()
    || (score.querySelector("movement-title")?.textContent ?? "").trim()
    || "mikuscore export";
  const divisions = firstNumberInDoc(score, ["part > measure > attributes > divisions"], 480);
  const partNodes = Array.from(score.querySelectorAll(":scope > part"));
  const partNameById = readPartNameMapFromMusicXml(score);

  let scoreXml = `<?xml version="1.0" encoding="UTF-8"?><museScore version="4.0"><Score>`;
  scoreXml += `<metaTag name="workTitle">${xmlEscape(title)}</metaTag>`;
  scoreXml += `<Division>${divisions}</Division>`;

  if (!partNodes.length) {
    const capacity = Math.max(1, Math.round((divisions * 4 * 4) / 4));
    scoreXml += `<Part><trackName>P1</trackName><Staff id="1"/></Part>`;
    scoreXml += `<Staff id="1"><Measure><voice>${makeMuseRestXml(capacity, capacity, divisions)}</voice></Measure></Staff>`;
    scoreXml += "</Score></museScore>";
    return scoreXml;
  }

  let nextStaffId = 1;
  const partDefs: string[] = [];
  const staffsXml: string[] = [];

  for (let pi = 0; pi < partNodes.length; pi += 1) {
    const part = partNodes[pi];
    const partId = (part.getAttribute("id") ?? "").trim();
    const partName = partNameById.get(partId) ?? (partId || `P${pi + 1}`);
    const laneCount = getPartStaffCountFromMusicXml(part);
    const pitchByStaff = collectMusicXmlPitchesByStaff(part);
    const initialClefByStaff = new Map<number, ClefSign>();
    for (let staffNo = 1; staffNo <= laneCount; staffNo += 1) {
      const explicit = readFirstExplicitClefInPart(part, staffNo);
      const fallback = inferClefSignFromPitches(pitchByStaff.get(staffNo) ?? []);
      initialClefByStaff.set(staffNo, explicit ?? fallback);
    }
    const staffIds = Array.from({ length: laneCount }, () => nextStaffId++);
    partDefs.push(
      `<Part><trackName>${xmlEscape(partName)}</trackName>${staffIds
        .map((id) => `<Staff id="${id}"/>`)
        .join("")}</Part>`
    );

    const measures = Array.from(part.querySelectorAll(":scope > measure"));
    let currentBeats = Math.max(1, Math.round(firstNumber(part, ":scope > measure > attributes > time > beats") ?? 4));
    let currentBeatType = Math.max(
      1,
      Math.round(firstNumber(part, ":scope > measure > attributes > time > beat-type") ?? 4)
    );
    let currentTimeSymbol: "cut" | null = null;
    let currentFifths = Math.max(-7, Math.min(7, Math.round(firstNumber(part, ":scope > measure > attributes > key > fifths") ?? 0)));

    const staffXmlByLane = Array.from({ length: laneCount }, (_unused, laneIndex) => {
      const staffNo = laneIndex + 1;
      let currentClef: ClefSign = initialClefByStaff.get(staffNo) ?? "G";
      let staffXml = `<Staff id="${staffIds[laneIndex]}">`;

      for (let mi = 0; mi < measures.length; mi += 1) {
        const measure = measures[mi];
        const byStaffVoice = buildMuseVoiceEventsByStaff(measure, divisions);
        const byVoice = byStaffVoice.get(staffNo) ?? new Map<number, MuseVoiceEvent[]>();
        const measureBeats = Math.max(1, Math.round(firstNumber(measure, ":scope > attributes > time > beats") ?? currentBeats));
        const measureBeatType = Math.max(
          1,
          Math.round(firstNumber(measure, ":scope > attributes > time > beat-type") ?? currentBeatType)
        );
        const measureTimeSymbolRaw = (measure.querySelector(":scope > attributes > time")?.getAttribute("symbol") ?? "")
          .trim()
          .toLowerCase();
        const hasExplicitTimeInMusicXml = measure.querySelector(":scope > attributes > time") !== null;
        const measureTimeSymbolFromXml: "cut" | null = measureTimeSymbolRaw === "cut" ? "cut" : null;
        const measureTimeSymbol: "cut" | null = measureTimeSymbolFromXml ?? currentTimeSymbol;
        const shouldNormalizeCut = normalizeCutTimeToTwoTwo
          && measureTimeSymbol === "cut"
          && measureBeats === 4
          && measureBeatType === 4;
        const effectiveMeasureBeats = shouldNormalizeCut ? 2 : measureBeats;
        const effectiveMeasureBeatType = shouldNormalizeCut ? 2 : measureBeatType;
        const measureFifths = Math.max(
          -7,
          Math.min(7, Math.round(firstNumber(measure, ":scope > attributes > key > fifths") ?? currentFifths))
        );
        const capacityDiv = Math.max(
          1,
          Math.round((divisions * 4 * effectiveMeasureBeats) / Math.max(1, effectiveMeasureBeatType))
        );
        const directionSeeds = collectDirectionSeedsFromMusicXmlMeasure(measure, staffNo);

        const voiceNos = Array.from(byVoice.keys()).sort((a, b) => a - b);
        if (!voiceNos.length) voiceNos.push(1);
        const hasLeftDoubleBarlineInMusicXml =
          (measure.querySelector(':scope > barline[location="left"] > bar-style')?.textContent ?? "").trim().toLowerCase() === "light-light";
        const hasPrevRightDoubleBarlineInMusicXml =
          mi > 0
          && ((measures[mi - 1]?.querySelector(':scope > barline[location="right"] > bar-style')?.textContent ?? "")
            .trim()
            .toLowerCase() === "light-light");
        const needsDoubleBarlineAtMeasureStart = hasLeftDoubleBarlineInMusicXml || hasPrevRightDoubleBarlineInMusicXml;
        const hasImplicitMeasureInMusicXml = (measure.getAttribute("implicit") ?? "").trim().toLowerCase() === "yes";
        const usedDiv = Array.from(byVoice.values()).reduce((maxEnd, events) => {
          const laneEnd = events.reduce((laneMax, ev) => {
            const end = ev.grace ? ev.atDiv : ev.atDiv + Math.max(0, Math.round(ev.durationDiv));
            return Math.max(laneMax, end);
          }, 0);
          return Math.max(maxEnd, laneEnd);
        }, 0);
        const implicitLenDiv = hasImplicitMeasureInMusicXml ? Math.max(1, Math.min(capacityDiv, usedDiv)) : null;
        const lenAttr = implicitLenDiv !== null && implicitLenDiv < capacityDiv
          ? formatMeasureLenFromDivisions(implicitLenDiv, divisions)
          : null;
        let measureXml = lenAttr ? `<Measure len="${lenAttr}">` : "<Measure>";
        for (let vi = 0; vi < voiceNos.length; vi += 1) {
          const voiceNo = voiceNos[vi];
          let voiceXml = "<voice>";
          if (vi === 0) {
            const measureClef = readMusicXmlMeasureClefSign(measure, staffNo);
            const targetClef = measureClef ?? currentClef;
            const shouldWriteClef = mi === 0 || targetClef !== currentClef || measureClef !== null;
            const shouldWriteTime = mi === 0
              || effectiveMeasureBeats !== currentBeats
              || effectiveMeasureBeatType !== currentBeatType
              || measureTimeSymbol !== currentTimeSymbol
              || hasExplicitTimeInMusicXml;
            const shouldWriteKey = mi === 0 || measureFifths !== currentFifths;
            if (shouldWriteClef) {
              voiceXml += `<Clef><concertClefType>${targetClef}</concertClefType></Clef>`;
            }
            if (shouldWriteTime) {
              const cutSubtypeXml = measureTimeSymbol === "cut" ? "<subtype>2</subtype>" : "";
              voiceXml += `<TimeSig>${cutSubtypeXml}<sigN>${effectiveMeasureBeats}</sigN><sigD>${effectiveMeasureBeatType}</sigD></TimeSig>`;
            }
            if (shouldWriteKey) {
              voiceXml += `<KeySig><accidental>${measureFifths}</accidental></KeySig>`;
            }
            if (needsDoubleBarlineAtMeasureStart) {
              voiceXml += `<BarLine><subtype>double</subtype></BarLine>`;
            }
            for (const seed of directionSeeds) {
              if (seed.kind === "tempo") {
                voiceXml += `<Tempo><tempo>${seed.qps.toFixed(6)}</tempo>${seed.text ? `<text>${xmlEscape(seed.text)}</text>` : ""}</Tempo>`;
                continue;
              }
              if (seed.kind === "dynamic") {
                voiceXml += `<Dynamic><subtype>${xmlEscape(seed.subtype)}</subtype>${seed.velocity ? `<velocity>${seed.velocity}</velocity>` : ""}</Dynamic>`;
                continue;
              }
              if (seed.kind === "expression") {
                const text = seed.italic ? `<i></i>${xmlEscape(seed.text)}` : xmlEscape(seed.text);
                voiceXml += `<Expression><text>${text}</text></Expression>`;
                continue;
              }
              if (seed.kind === "marker") {
                voiceXml += `<Marker><subtype>${xmlEscape(seed.subtype)}</subtype><label>${xmlEscape(seed.label)}</label></Marker>`;
                continue;
              }
              if (seed.kind === "jump") {
                voiceXml += `<Jump><text>${xmlEscape(seed.text)}</text>${seed.jumpTo ? `<jumpTo>${xmlEscape(seed.jumpTo)}</jumpTo>` : ""}${seed.playUntil ? `<playUntil>${xmlEscape(seed.playUntil)}</playUntil>` : ""}${seed.continueAt ? `<continueAt>${xmlEscape(seed.continueAt)}</continueAt>` : ""}</Jump>`;
              }
            }
            if (measure.querySelector(':scope > barline[location="left"] > repeat[direction="forward"]')) {
              voiceXml += "<startRepeat/>";
            }
            currentClef = targetClef;
          }

          const events = (byVoice.get(voiceNo) ?? []).slice().sort((a, b) => a.atDiv - b.atDiv);
          let cursorDiv = 0;
          let nextTupletRefNo = 1;
          const activeTupletRefByNumber = new Map<number, string>();
          for (const event of events) {
            if (event.atDiv > cursorDiv) {
              voiceXml += makeMuseRestXml(event.atDiv - cursorDiv, event.atDiv - cursorDiv, divisions);
              cursorDiv = event.atDiv;
            }
            const startNumbers = event.tupletStarts ?? [];
            const stopNumbers = event.tupletStops ?? [];
            const hasTupletTiming = Boolean(event.tupletTimeModification);
            for (const number of startNumbers) {
              const normalized = Math.max(1, Math.round(number));
              const refId = `T${nextTupletRefNo}`;
              nextTupletRefNo += 1;
              const tm = event.tupletTimeModification ?? { actualNotes: 3, normalNotes: 2 };
              voiceXml += `<Tuplet id="${refId}"><normalNotes>${tm.normalNotes}</normalNotes><actualNotes>${tm.actualNotes}</actualNotes></Tuplet>`;
              activeTupletRefByNumber.set(normalized, refId);
            }
            if (!hasTupletTiming && startNumbers.length === 0 && stopNumbers.length === 0) {
              activeTupletRefByNumber.clear();
            }
            if (hasTupletTiming && activeTupletRefByNumber.size === 0) {
              const implicitNumber = 1_000_000 + nextTupletRefNo;
              const refId = `T${nextTupletRefNo}`;
              nextTupletRefNo += 1;
              const tm = event.tupletTimeModification ?? { actualNotes: 3, normalNotes: 2 };
              voiceXml += `<Tuplet id="${refId}"><normalNotes>${tm.normalNotes}</normalNotes><actualNotes>${tm.actualNotes}</actualNotes></Tuplet>`;
              activeTupletRefByNumber.set(implicitNumber, refId);
            }
            const activeTupletRefIds = Array.from(activeTupletRefByNumber.entries())
              .sort((a, b) => a[0] - b[0])
              .map((entry) => entry[1]);
            const tupletRefId = hasTupletTiming && activeTupletRefIds.length
              ? activeTupletRefIds[activeTupletRefIds.length - 1]
              : undefined;
            const tupletDisplayDurationDiv = event.tupletTimeModification
              ? Math.max(
                1,
                Math.round(
                  Math.max(1, event.durationDiv) * event.tupletTimeModification.actualNotes
                  / event.tupletTimeModification.normalNotes
                )
              )
              : event.durationDiv;
            if (event.pitches === null) {
              voiceXml += makeMuseRestXml(event.durationDiv, tupletDisplayDurationDiv, divisions, tupletRefId);
            } else {
              voiceXml += makeMuseChordXml(
                event.durationDiv,
                tupletDisplayDurationDiv,
                divisions,
                event.pitches,
                event.slurStarts,
                event.slurStops,
                event.articulationSubtypes,
                event.trillStarts,
                event.trillStops,
                tupletRefId,
                event.ottavaStartSubtypes,
                event.ottavaStopCount,
                event.grace,
                event.graceSlash
              );
            }
            for (const number of stopNumbers) {
              activeTupletRefByNumber.delete(Math.max(1, Math.round(number)));
            }
            cursorDiv += event.durationDiv;
          }
          if (cursorDiv < capacityDiv) {
            voiceXml += makeMuseRestXml(capacityDiv - cursorDiv, capacityDiv - cursorDiv, divisions);
          }
          if (vi === 0 && measure.querySelector(':scope > barline[location="right"] > repeat[direction="backward"]')) {
            voiceXml += "<endRepeat/>";
          }
          voiceXml += "</voice>";
          measureXml += voiceXml;
        }

        measureXml += "</Measure>";
        staffXml += measureXml;
        currentBeats = effectiveMeasureBeats;
        currentBeatType = effectiveMeasureBeatType;
        currentTimeSymbol = measureTimeSymbol;
        currentFifths = measureFifths;
      }
      staffXml += "</Staff>";
      return staffXml;
    });

    staffsXml.push(...staffXmlByLane);
  }

  scoreXml += partDefs.join("");
  scoreXml += staffsXml.join("");
  scoreXml += "</Score></museScore>";
  return scoreXml;
};
