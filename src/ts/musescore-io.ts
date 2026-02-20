type MuseScoreImportOptions = {
  sourceMetadata?: boolean;
  debugMetadata?: boolean;
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
  | { kind: "dynamic"; mark: string; voice: number; atDiv: number }
  | { kind: "directionXml"; xml: string; voice: number; atDiv: number };

type ParsedMuseScoreChordNote = {
  midi: number;
  accidentalText: string | null;
  tieStart: boolean;
  tieStop: boolean;
};

type ParsedMuseScoreMeasure = {
  index: number;
  beats: number;
  beatType: number;
  capacityDiv: number;
  implicit: boolean;
  fifths: number;
  mode: "major" | "minor";
  tempoBpm: number | null;
  tempoText: string | null;
  repeatForward: boolean;
  repeatBackward: boolean;
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

const midiToPitch = (midiNumber: number): { step: string; alter: number; octave: number } => {
  const n = Math.max(0, Math.min(127, Math.round(midiNumber)));
  const octave = Math.floor(n / 12) - 1;
  const semitone = n % 12;
  const table: Array<{ step: string; alter: number }> = [
    { step: "C", alter: 0 },
    { step: "C", alter: 1 },
    { step: "D", alter: 0 },
    { step: "D", alter: 1 },
    { step: "E", alter: 0 },
    { step: "F", alter: 0 },
    { step: "F", alter: 1 },
    { step: "G", alter: 0 },
    { step: "G", alter: 1 },
    { step: "A", alter: 0 },
    { step: "A", alter: 1 },
    { step: "B", alter: 0 },
  ];
  const mapped = table[semitone] ?? { step: "C", alter: 0 };
  return { step: mapped.step, alter: mapped.alter, octave };
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
  if (v.includes("staccatissimo")) return { group: "articulations", tag: "staccatissimo" };
  if (v.includes("staccato")) return { group: "articulations", tag: "staccato" };
  if (v.includes("tenuto")) return { group: "articulations", tag: "tenuto" };
  if (v.includes("accent")) return { group: "articulations", tag: "accent" };
  if (v.includes("marcato")) return { group: "articulations", tag: "strong-accent" };
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

const buildDynamicDirectionXml = (mark: string): string => {
  return `<direction><direction-type><dynamics><${mark}/></dynamics></direction-type></direction>`;
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
  options?: { placement?: "above" | "below"; soundTempo?: number | null }
): string => {
  const placementAttr = options?.placement ? ` placement="${options.placement}"` : "";
  const soundTempo = options?.soundTempo ?? null;
  const soundXml = soundTempo !== null ? `<sound tempo="${soundTempo}"/>` : "";
  return `<direction${placementAttr}><direction-type><words>${xmlEscape(text)}</words></direction-type>${soundXml}</direction>`;
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
  const isBeamableTimedEvent = (ev: ParsedMuseScoreEvent | undefined): boolean => {
    if (!ev) return false;
    if (ev.kind !== "chord" && ev.kind !== "rest") return false;
    if (ev.kind === "chord" && ev.grace) return false;
    const info = divisionToTypeAndDots(divisions, ev.displayDurationDiv ?? ev.durationDiv);
    return beamLevelFromType(info.type) > 0;
  };
  const flushGroup = (indices: number[]): void => {
    const chordIndices = indices.filter((idx) => {
      const ev = voiceEvents[idx];
      return ev?.kind === "chord" && !ev.grace;
    });
    if (chordIndices.length < 2) return;
    for (let gi = 0; gi < chordIndices.length; gi += 1) {
      const idx = chordIndices[gi];
      const ev = voiceEvents[idx];
      if (!ev || ev.kind !== "chord") continue;
      const info = divisionToTypeAndDots(divisions, ev.displayDurationDiv ?? ev.durationDiv);
      const levels = beamLevelFromType(info.type);
      if (levels <= 0) continue;
      const state = gi === 0 ? "begin" : (gi === chordIndices.length - 1 ? "end" : "continue");
      let xml = "";
      for (let level = 1; level <= levels; level += 1) {
        xml += `<beam number="${level}">${state}</beam>`;
      }
      if (xml) beamXmlByIndex.set(idx, xml);
    }
  };

  const hasExplicitBeamMode = voiceEvents.some(
    (ev) =>
      (ev.kind === "chord" || ev.kind === "rest")
      && ev.beamMode !== undefined
      && (ev.beamMode === "begin" || ev.beamMode === "mid")
  );
  if (!hasExplicitBeamMode) {
    let currentGroup: number[] = [];
    for (let i = 0; i < voiceEvents.length; i += 1) {
      const ev = voiceEvents[i];
      if (ev.kind !== "chord") {
        flushGroup(currentGroup);
        currentGroup = [];
        continue;
      }
      const info = divisionToTypeAndDots(divisions, ev.displayDurationDiv ?? ev.durationDiv);
      const beamable = beamLevelFromType(info.type) > 0;
      if (!beamable) {
        flushGroup(currentGroup);
        currentGroup = [];
        continue;
      }
      currentGroup.push(i);
    }
    flushGroup(currentGroup);
    return beamXmlByIndex;
  }

  let activeGroup: number[] = [];
  let cursorDiv = 0;
  const resolvedBeatDiv = Math.max(1, Math.round(beatDiv));
  for (let i = 0; i < voiceEvents.length; i += 1) {
    const ev = voiceEvents[i];
    if (ev.kind !== "chord" && ev.kind !== "rest") {
      flushGroup(activeGroup);
      activeGroup = [];
      continue;
    }
    const startsAtBeatBoundary = cursorDiv > 0 && cursorDiv % resolvedBeatDiv === 0;
    if (startsAtBeatBoundary) {
      flushGroup(activeGroup);
      activeGroup = [];
    }
    if (ev.kind === "chord" && ev.grace) {
      flushGroup(activeGroup);
      activeGroup = [];
      continue;
    }
    const beamable = isBeamableTimedEvent(ev);
    if (!beamable) {
      flushGroup(activeGroup);
      activeGroup = [];
      continue;
    }
    if (ev.beamMode === "begin") {
      flushGroup(activeGroup);
      activeGroup = [i];
      cursorDiv += Math.max(0, ev.durationDiv);
      continue;
    }
    if (ev.beamMode === "mid") {
      if (!activeGroup.length) {
        const prev = i > 0 ? voiceEvents[i - 1] : undefined;
        if (isBeamableTimedEvent(prev)) {
          activeGroup = [i - 1, i];
        } else {
          activeGroup = [i];
        }
      } else {
        activeGroup.push(i);
      }
      cursorDiv += Math.max(0, ev.durationDiv);
      continue;
    }
    if (activeGroup.length) activeGroup.push(i);
    else activeGroup = [i];
    cursorDiv += Math.max(0, ev.durationDiv);
  }
  flushGroup(activeGroup);
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
            capacityDiv: Math.max(1, Math.round((divisions * 4 * globalBeats) / Math.max(1, globalBeatType))),
            implicit: false,
            fifths: globalFifths,
            mode: globalMode,
            tempoBpm: null,
            tempoText: null,
            repeatForward: false,
            repeatBackward: false,
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
      let currentFifths = globalFifths;
      let currentMode = globalMode;
      const parsedMeasures: ParsedMuseScoreMeasure[] = [];
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
      const nominalCapacityDiv = Math.max(1, Math.round((divisions * 4 * beats) / Math.max(1, beatType)));
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
      const tempoQps = firstNumber(measure, ":scope > Tempo > tempo")
        ?? firstNumber(measure, ":scope > voice > Tempo > tempo")
        ?? firstNumber(measure, ":scope > voice > tempo > tempo");
      const tempoBpm = tempoQps !== null && tempoQps > 0 ? Math.max(20, Math.min(300, Math.round(tempoQps * 60))) : null;
      const tempoText = (
        measure.querySelector(":scope > Tempo > text")?.textContent
        ?? measure.querySelector(":scope > voice > Tempo > text")?.textContent
        ?? measure.querySelector(":scope > voice > tempo > text")?.textContent
        ?? ""
      ).trim() || null;
      const repeatForward = parseTruthyFlag(measure.getAttribute("startRepeat"))
        || measure.querySelector(":scope > startRepeat, :scope > voice > startRepeat") !== null;
      const repeatBackward = parseTruthyFlag(measure.getAttribute("endRepeat"))
        || measure.querySelector(":scope > endRepeat, :scope > voice > endRepeat") !== null;

      const events: ParsedMuseScoreEvent[] = [];
      const voiceNodes = Array.from(measure.querySelectorAll(":scope > voice"));
      const eventHolders = voiceNodes.length ? voiceNodes : [measure];
      for (let holderIndex = 0; holderIndex < eventHolders.length; holderIndex += 1) {
        const holder = eventHolders[holderIndex];
        const voiceNo = holderIndex + 1;
        let voicePosDiv = 0;
        let slurState = slurStateByVoice.get(voiceNo);
        if (!slurState) {
          slurState = {
            activeSlurNumbers: [],
            nextSlurNumber: 1,
            slurKeyToNumber: new Map<string, number>(),
          };
          slurStateByVoice.set(voiceNo, slurState);
        }
        let ottavaState = ottavaStateByVoice.get(voiceNo);
        if (!ottavaState) {
          ottavaState = {
            activeOttavaStates: [],
            nextOttavaNumber: 1,
          };
          ottavaStateByVoice.set(voiceNo, ottavaState);
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
            const durationDiv = parsed === null ? null : Math.max(1, Math.round(parsed * currentTupletScale()));
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
            const starts = consumeTupletStarts();
            const currentTuplet = tupletStateStack[tupletStateStack.length - 1];
            const beamModeRaw = (event.querySelector(":scope > BeamMode")?.textContent ?? "").trim().toLowerCase();
            const beamMode = beamModeRaw === "begin" || beamModeRaw === "mid" ? beamModeRaw : undefined;
            events.push({
              kind: "rest",
              durationDiv,
              displayDurationDiv: resolvedDisplayDurationDiv,
              voice: voiceNo,
              beamMode,
              tupletTimeModification: currentTuplet
                ? { actualNotes: currentTuplet.actualNotes, normalNotes: currentTuplet.normalNotes }
                : undefined,
              tupletStarts: starts.length ? starts : undefined,
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
            const durationDiv = isGrace
              ? 0
              : (parsed === null ? null : Math.max(1, Math.round(parsed * currentTupletScale())));
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
            const resolvedDurationDiv = durationDiv ?? 0;
            const resolvedDisplayDurationDiv = displayDurationDiv
              ?? (durationDiv && durationDiv > 0 ? durationDiv : Math.max(1, Math.round(divisions / 4)));
            const noteNodes = Array.from(event.querySelectorAll(":scope > Note"));
            const ottavaDisplayShift = activeOttavaStates.reduce(
              (sum, state) => sum + semitoneShiftForOttavaDisplay(state),
              0
            );
            const slurTransitions = parseChordSlurTransitions(event, slurState);
            const articulationMappings = Array.from(event.querySelectorAll(":scope > Articulation > subtype"))
              .map((node) => museArticulationSubtypeToMusicXmlTag(node.textContent))
              .filter((mapped): mapped is { group: "articulations" | "technical"; tag: string } => mapped !== null);
            const articulationTags = articulationMappings
              .filter((mapped) => mapped.group === "articulations")
              .map((mapped) => mapped.tag);
            const technicalTags = articulationMappings
              .filter((mapped) => mapped.group === "technical")
              .map((mapped) => mapped.tag);
            const notes = noteNodes
              .map((noteNode) => {
                const midi = Number.parseInt((noteNode.querySelector(":scope > pitch")?.textContent ?? "").trim(), 10);
                if (!Number.isFinite(midi)) return null;
                const accidentalText = museAccidentalSubtypeToMusicXml(
                  noteNode.querySelector(":scope > Accidental > subtype")?.textContent
                );
                const tieFlags = parseMuseTieFlags(noteNode);
                return {
                  midi: Math.max(0, Math.min(127, Math.round(midi + ottavaDisplayShift))),
                  accidentalText,
                  tieStart: tieFlags.tieStart,
                  tieStop: tieFlags.tieStop,
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
            const currentTuplet = tupletStateStack[tupletStateStack.length - 1];
            const beamModeRaw = (event.querySelector(":scope > BeamMode")?.textContent ?? "").trim().toLowerCase();
            const beamMode = beamModeRaw === "begin" || beamModeRaw === "mid" ? beamModeRaw : undefined;
            events.push({
              kind: "chord",
              durationDiv: resolvedDurationDiv,
              displayDurationDiv: resolvedDisplayDurationDiv,
              notes,
              voice: voiceNo,
              beamMode,
              tupletTimeModification: !isGrace && currentTuplet
                ? { actualNotes: currentTuplet.actualNotes, normalNotes: currentTuplet.normalNotes }
                : undefined,
              tupletStarts: !isGrace && starts.length ? starts : undefined,
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
            const mark = parseMuseDynamicMark(
              (event.querySelector(":scope > subtype")?.textContent ?? event.textContent ?? "").trim()
            );
            if (mark) {
              events.push({ kind: "dynamic", mark, voice: voiceNo, atDiv: voicePosDiv });
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
          if (tag === "marker") {
            const directionXml = parseMarkerDirectionXml(event);
            if (directionXml) {
              events.push({ kind: "directionXml", xml: directionXml, voice: voiceNo, atDiv: voicePosDiv });
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
              events.push({ kind: "directionXml", xml: parsed.xml, voice: voiceNo, atDiv: voicePosDiv });
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
            || tag === "tempo"
            || tag === "layoutbreak"
            || tag === "clef"
            || tag === "beam"
          ) {
            continue;
          }
          unknownTagSet.add(tag);
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
        beats,
        beatType,
        capacityDiv,
        implicit,
        fifths,
        mode,
        tempoBpm,
        tempoText,
        repeatForward,
        repeatBackward,
        events,
      });
        currentBeats = beats;
        currentBeatType = beatType;
        currentFifths = fifths;
        currentMode = mode;
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
    let prevFifths = globalFifths;
    let prevMode = globalMode;
    const measureCount = Math.max(1, ...part.staffs.map((staff) => staff.measures.length));
    const startsWithPickup = (part.staffs[0]?.measures[0]?.implicit ?? false) === true;
    for (let mi = 0; mi < measureCount; mi += 1) {
      const primaryMeasure = part.staffs[0]?.measures[mi] ?? {
        index: mi + 1,
        beats: prevBeats,
        beatType: prevBeatType,
        capacityDiv: Math.max(1, Math.round((divisions * 4 * prevBeats) / Math.max(1, prevBeatType))),
        implicit: false,
        fifths: prevFifths,
        mode: prevMode,
        tempoBpm: null,
        tempoText: null,
        repeatForward: false,
        repeatBackward: false,
        events: [] as ParsedMuseScoreEvent[],
      };
      const capacity = Math.max(1, Math.round(primaryMeasure.capacityDiv));
      let body = "";
      const needsAttributes =
        mi === 0
        || primaryMeasure.beats !== prevBeats
        || primaryMeasure.beatType !== prevBeatType
        || primaryMeasure.fifths !== prevFifths
        || primaryMeasure.mode !== prevMode;
      if (needsAttributes) {
        body += `<attributes><divisions>${divisions}</divisions><key><fifths>${primaryMeasure.fifths}</fifths><mode>${primaryMeasure.mode}</mode></key><time><beats>${primaryMeasure.beats}</beats><beat-type>${primaryMeasure.beatType}</beat-type></time>`;
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
        const measure = part.staffs[si]?.measures[mi] ?? {
          index: mi + 1,
          beats: primaryMeasure.beats,
          beatType: primaryMeasure.beatType,
          capacityDiv: primaryMeasure.capacityDiv,
          implicit: primaryMeasure.implicit,
          fifths: primaryMeasure.fifths,
          mode: primaryMeasure.mode,
          tempoBpm: null,
          tempoText: null,
          repeatForward: false,
          repeatBackward: false,
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
          if (vi > 0) {
            body += `<backup><duration>${capacity}</duration></backup>`;
          }
          let occupied = 0;
          const voiceEvents = measure.events.filter((event) => Math.max(1, Math.round(event.voice)) === voiceNo);
          const tupletTolerance = tupletRoundingToleranceByVoiceEvents(voiceEvents);
          const beatDiv = Math.max(1, Math.round(measure.capacityDiv / Math.max(1, measure.beats)));
          const beamXmlByEventIndex = buildBeamXmlByVoiceEvents(voiceEvents, divisions, beatDiv);
          for (const event of voiceEvents) {
            if (event.kind === "dynamic") {
              const lead = Math.max(0, Math.round(event.atDiv) - occupied);
              if (lead > 0) {
                body += `<forward><duration>${lead}</duration><voice>${partVoiceNo}</voice><staff>${staffNo}</staff></forward>`;
                occupied += lead;
              }
              body += withDirectionPlacement(buildDynamicDirectionXml(event.mark), staffNo, partVoiceNo);
              continue;
            }
          if (event.kind === "directionXml") {
              const lead = Math.max(0, Math.round(event.atDiv) - occupied);
              if (lead > 0) {
                body += `<forward><duration>${lead}</duration><voice>${partVoiceNo}</voice><staff>${staffNo}</staff></forward>`;
                occupied += lead;
              }
              body += withDirectionPlacement(event.xml, staffNo, partVoiceNo);
              continue;
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
              body += `<note><rest/><duration>${event.durationDiv}</duration><voice>${partVoiceNo}</voice><type>${info.type}</type>${"<dot/>".repeat(info.dots)}${tupletXml.timeModificationXml}${beamXml}<staff>${staffNo}</staff>${notationsXml}</note>`;
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
              const pitch = midiToPitch(note.midi);
              const accidentalXml = note.accidentalText
                ? `<accidental>${note.accidentalText}</accidental>`
                : "";
              const timeModificationXml = ni === 0 && !event.grace ? tupletXml.timeModificationXml : "";
              const tieXml = `${note.tieStart ? '<tie type="start"/>' : ""}${note.tieStop ? '<tie type="stop"/>' : ""}`;
              const tiedItems = `${note.tieStart ? '<tied type="start"/>' : ""}${note.tieStop ? '<tied type="stop"/>' : ""}`;
              const articulationXml = ni === 0 && (event.articulationTags?.length ?? 0) > 0
                ? `<articulations>${(event.articulationTags ?? []).map((tag) => `<${tag}/>`).join("")}</articulations>`
                : "";
              const technicalXml = ni === 0 && (event.technicalTags?.length ?? 0) > 0
                ? `<technical>${(event.technicalTags ?? []).map((tag) => `<${tag}/>`).join("")}</technical>`
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
              body += `<note>${ni > 0 ? "<chord/>" : ""}${graceXml}<pitch><step>${pitch.step}</step>${pitch.alter !== 0 ? `<alter>${pitch.alter}</alter>` : ""}<octave>${pitch.octave}</octave></pitch>${tieXml}${durationXml}<voice>${partVoiceNo}</voice><type>${info.type}</type>${"<dot/>".repeat(info.dots)}${timeModificationXml}${accidentalXml}${beamXmlForNote}<staff>${staffNo}</staff>${notationsXml}</note>`;
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

const makeMuseChordXml = (durationDiv: number, divisions: number, pitches: number[]): string => {
  const duration = divisionsToMuseDurationType(divisions, durationDiv);
  let xml = "<Chord>";
  xml += `<durationType>${duration.durationType}</durationType>`;
  if (duration.dots > 0) xml += `<dots>${duration.dots}</dots>`;
  for (const pitch of pitches) {
    xml += `<Note><pitch>${Math.max(0, Math.min(127, Math.round(pitch)))}</pitch></Note>`;
  }
  xml += "</Chord>";
  return xml;
};

const makeMuseRestXml = (durationDiv: number, divisions: number): string => {
  const duration = divisionsToMuseDurationType(divisions, durationDiv);
  let xml = "<Rest>";
  xml += `<durationType>${duration.durationType}</durationType>`;
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

type MuseVoiceEvent = {
  atDiv: number;
  durationDiv: number;
  pitches: number[] | null;
};

const buildMuseVoiceEventsByStaff = (
  measure: Element,
  divisions: number
): Map<number, Map<number, MuseVoiceEvent[]>> => {
  const byStaff = new Map<number, Map<number, MuseVoiceEvent[]>>();
  let cursorDiv = 0;

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
    if (tag !== "note") continue;

    const staffNo = getNoteStaffNo(child);
    const voiceNo = Math.max(1, Math.round(firstNumber(child, ":scope > voice") ?? 1));
    const durationDiv = Math.max(1, Math.round(firstNumber(child, ":scope > duration") ?? divisions));
    const isChordFollow = child.querySelector(":scope > chord") !== null;
    const isRest = child.querySelector(":scope > rest") !== null;

    const byVoice = byStaff.get(staffNo) ?? new Map<number, MuseVoiceEvent[]>();
    byStaff.set(staffNo, byVoice);
    const events = byVoice.get(voiceNo) ?? [];
    byVoice.set(voiceNo, events);

    if (isChordFollow && !isRest && events.length > 0) {
      const prev = events[events.length - 1];
      if (prev.pitches !== null && prev.atDiv === cursorDiv) {
        const step = (child.querySelector(":scope > pitch > step")?.textContent ?? "").trim();
        const octave = firstNumber(child, ":scope > pitch > octave");
        if (step && octave !== null) {
          const alter = Math.round(firstNumber(child, ":scope > pitch > alter") ?? 0);
          const map: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
          const base = map[step];
          if (base !== undefined) prev.pitches.push(base + alter + (Math.round(octave) + 1) * 12);
        }
      }
    } else if (isRest) {
      events.push({ atDiv: cursorDiv, durationDiv, pitches: null });
    } else {
      const step = (child.querySelector(":scope > pitch > step")?.textContent ?? "").trim();
      const octave = firstNumber(child, ":scope > pitch > octave");
      if (step && octave !== null) {
        const alter = Math.round(firstNumber(child, ":scope > pitch > alter") ?? 0);
        const map: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
        const base = map[step];
        if (base !== undefined) {
          events.push({
            atDiv: cursorDiv,
            durationDiv,
            pitches: [base + alter + (Math.round(octave) + 1) * 12],
          });
        }
      }
    }

    if (!isChordFollow) {
      cursorDiv += durationDiv;
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

export const exportMusicXmlDomToMuseScore = (doc: Document): string => {
  const score = doc.querySelector("score-partwise");
  if (!score) throw new Error("MusicXML score-partwise root was not found.");
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
    scoreXml += `<Staff id="1"><Measure><voice>${makeMuseRestXml(capacity, divisions)}</voice></Measure></Staff>`;
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
    let currentFifths = Math.max(-7, Math.min(7, Math.round(firstNumber(part, ":scope > measure > attributes > key > fifths") ?? 0)));

    const staffXmlByLane = Array.from({ length: laneCount }, (_unused, laneIndex) => {
      const staffNo = laneIndex + 1;
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
        const measureFifths = Math.max(
          -7,
          Math.min(7, Math.round(firstNumber(measure, ":scope > attributes > key > fifths") ?? currentFifths))
        );
        const capacityDiv = Math.max(1, Math.round((divisions * 4 * measureBeats) / Math.max(1, measureBeatType)));
        const tempo = firstAttrNumber(measure, ":scope > direction > sound[tempo]", "tempo");
        const dynamics: string[] = [];
        for (const direction of Array.from(measure.querySelectorAll(":scope > direction"))) {
          if (Math.max(1, Math.round(firstNumber(direction, ":scope > staff") ?? 1)) !== staffNo) continue;
          for (const node of Array.from(direction.querySelectorAll(":scope > direction-type > dynamics > *"))) {
            dynamics.push(node.tagName.toLowerCase());
          }
        }

        const voiceNos = Array.from(byVoice.keys()).sort((a, b) => a - b);
        if (!voiceNos.length) voiceNos.push(1);
        let measureXml = "<Measure>";
        for (let vi = 0; vi < voiceNos.length; vi += 1) {
          const voiceNo = voiceNos[vi];
          let voiceXml = "<voice>";
          if (vi === 0) {
            const shouldWriteTime = mi === 0 || measureBeats !== currentBeats || measureBeatType !== currentBeatType;
            const shouldWriteKey = mi === 0 || measureFifths !== currentFifths;
            if (shouldWriteTime) {
              voiceXml += `<TimeSig><sigN>${measureBeats}</sigN><sigD>${measureBeatType}</sigD></TimeSig>`;
            }
            if (shouldWriteKey) {
              voiceXml += `<KeySig><accidental>${measureFifths}</accidental></KeySig>`;
            }
            if (tempo !== null && tempo > 0) {
              voiceXml += `<Tempo><tempo>${(tempo / 60).toFixed(6)}</tempo></Tempo>`;
            }
            for (const dyn of dynamics) {
              voiceXml += `<Dynamic><subtype>${xmlEscape(dyn)}</subtype></Dynamic>`;
            }
            if (measure.querySelector(':scope > barline[location="left"] > repeat[direction="forward"]')) {
              voiceXml += "<startRepeat/>";
            }
          }

          const events = (byVoice.get(voiceNo) ?? []).slice().sort((a, b) => a.atDiv - b.atDiv);
          let cursorDiv = 0;
          for (const event of events) {
            if (event.atDiv > cursorDiv) {
              voiceXml += makeMuseRestXml(event.atDiv - cursorDiv, divisions);
              cursorDiv = event.atDiv;
            }
            if (event.pitches === null) {
              voiceXml += makeMuseRestXml(event.durationDiv, divisions);
            } else {
              voiceXml += makeMuseChordXml(event.durationDiv, divisions, event.pitches);
            }
            cursorDiv += event.durationDiv;
          }
          if (cursorDiv < capacityDiv) {
            voiceXml += makeMuseRestXml(capacityDiv - cursorDiv, divisions);
          }
          if (vi === 0 && measure.querySelector(':scope > barline[location="right"] > repeat[direction="backward"]')) {
            voiceXml += "<endRepeat/>";
          }
          voiceXml += "</voice>";
          measureXml += voiceXml;
        }

        measureXml += "</Measure>";
        staffXml += measureXml;
        currentBeats = measureBeats;
        currentBeatType = measureBeatType;
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
