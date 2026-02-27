import { applyImplicitBeamsToMusicXmlText, prettyPrintMusicXmlText } from "./musicxml-io";

type StaffSlot = {
  partId: string;
  localStaff: number;
  globalStaff: number;
  label: string;
};

export type MeiImportOptions = {
  debugMetadata?: boolean;
  sourceMetadata?: boolean;
  failOnOverfullDrop?: boolean;
  meiCorpusIndex?: number;
};

export type MeiExportOptions = {
  meiVersion?: string;
};

const esc = (value: string): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const parseIntSafe = (value: string | null | undefined, fallback: number): number => {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const noteTypeToDur = (typeText: string): string => {
  const normalized = String(typeText || "").trim().toLowerCase();
  switch (normalized) {
    case "maxima":
      return "maxima";
    case "long":
      return "long";
    case "breve":
      return "breve";
    case "whole":
      return "1";
    case "half":
      return "2";
    case "quarter":
      return "4";
    case "eighth":
      return "8";
    case "16th":
      return "16";
    case "32nd":
      return "32";
    case "64th":
      return "64";
    case "128th":
      return "128";
    default:
      return "4";
  }
};

const alterToAccid = (alterText: string | null): string | null => {
  const alter = Number.parseInt(String(alterText ?? "").trim(), 10);
  if (!Number.isFinite(alter)) return null;
  if (alter <= -2) return "ff";
  if (alter === -1) return "f";
  if (alter === 0) return "n";
  if (alter === 1) return "s";
  if (alter >= 2) return "ss";
  return null;
};

const musicXmlAccidentalToAccid = (accidentalText: string | null): string | null => {
  const normalized = String(accidentalText ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "sharp") return "s";
  if (normalized === "flat") return "f";
  if (normalized === "natural") return "n";
  if (normalized === "double-sharp" || normalized === "sharp-sharp") return "ss";
  if (normalized === "flat-flat" || normalized === "double-flat") return "ff";
  return null;
};

const fifthsToMeiKeySig = (fifths: number): string => {
  if (!Number.isFinite(fifths) || fifths === 0) return "0";
  if (fifths > 0) return `${Math.min(7, Math.round(fifths))}s`;
  return `${Math.min(7, Math.abs(Math.round(fifths)))}f`;
};

const toPname = (stepText: string): string => {
  const step = String(stepText || "").trim().toLowerCase();
  if (/^[a-g]$/.test(step)) return step;
  return "c";
};

const lyricWordposFromSyllabic = (syllabicText: string): string => {
  const v = String(syllabicText || "").trim().toLowerCase();
  if (v === "begin") return "i";
  if (v === "middle") return "m";
  if (v === "end") return "t";
  return "";
};

const lyricSyllabicFromWordpos = (wordposText: string): string => {
  const v = String(wordposText || "").trim().toLowerCase();
  if (v === "i") return "begin";
  if (v === "m") return "middle";
  if (v === "t") return "end";
  return "single";
};

const extractMusicXmlLyric = (note: Element): { text: string; syllabic: string } | null => {
  const lyric = note.querySelector(":scope > lyric");
  if (!lyric) return null;
  const text = lyric.querySelector(":scope > text")?.textContent?.trim() ?? "";
  if (!text) return null;
  const syllabic = lyric.querySelector(":scope > syllabic")?.textContent?.trim() ?? "";
  return { text, syllabic };
};

const extractMeiLyric = (meiNote: Element): { text: string; syllabic: string } | null => {
  const syl = meiNote.querySelector(":scope > verse > syl");
  if (!syl) return null;
  const text = syl.textContent?.trim() ?? "";
  if (!text) return null;
  const syllabic = lyricSyllabicFromWordpos(syl.getAttribute("wordpos") || "");
  return { text, syllabic };
};

const readPartNameMap = (doc: Document): Map<string, string> => {
  const map = new Map<string, string>();
  for (const scorePart of Array.from(doc.querySelectorAll("score-partwise > part-list > score-part"))) {
    const id = scorePart.getAttribute("id")?.trim() ?? "";
    if (!id) continue;
    const name =
      scorePart.querySelector(":scope > part-name")?.textContent?.trim() ||
      scorePart.querySelector(":scope > part-abbreviation")?.textContent?.trim() ||
      id;
    map.set(id, name);
  }
  return map;
};

const detectStaffCountForPart = (part: Element): number => {
  let maxStaff = 1;
  for (const stavesEl of Array.from(part.querySelectorAll(":scope > measure > attributes > staves"))) {
    maxStaff = Math.max(maxStaff, parseIntSafe(stavesEl.textContent, 1));
  }
  for (const staffEl of Array.from(part.querySelectorAll(":scope > measure > note > staff"))) {
    maxStaff = Math.max(maxStaff, parseIntSafe(staffEl.textContent, 1));
  }
  return Math.max(1, maxStaff);
};

const collectStaffSlots = (doc: Document): StaffSlot[] => {
  const partNameMap = readPartNameMap(doc);
  const slots: StaffSlot[] = [];
  let global = 1;
  for (const part of Array.from(doc.querySelectorAll("score-partwise > part"))) {
    const partId = part.getAttribute("id")?.trim() ?? "";
    if (!partId) continue;
    const partName = partNameMap.get(partId) ?? partId;
    const count = detectStaffCountForPart(part);
    for (let staffNo = 1; staffNo <= count; staffNo += 1) {
      slots.push({
        partId,
        localStaff: staffNo,
        globalStaff: global,
        label: count > 1 ? `${partName} (${staffNo})` : partName,
      });
      global += 1;
    }
  }
  return slots;
};

const resolveClefForSlot = (
  part: Element | null,
  localStaff: number
): { shape: string; line: number } => {
  if (!part) return { shape: "G", line: 2 };
  for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
    const clefs = Array.from(measure.querySelectorAll(":scope > attributes > clef"));
    for (const clef of clefs) {
      const numberText = clef.getAttribute("number");
      const applies =
        numberText === null
          ? localStaff === 1
          : parseIntSafe(numberText, 1) === localStaff;
      if (!applies) continue;
      const sign = (clef.querySelector(":scope > sign")?.textContent?.trim() || "G").toUpperCase();
      const line = parseIntSafe(clef.querySelector(":scope > line")?.textContent, 2);
      return { shape: sign, line };
    }
  }
  return { shape: "G", line: 2 };
};

const resolveTransposeForSlot = (
  part: Element | null,
  localStaff: number
): { chromatic?: number; diatonic?: number } | null => {
  if (!part) return null;
  for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
    const attrs = Array.from(measure.querySelectorAll(":scope > attributes"));
    for (const attr of attrs) {
      const transpose = attr.querySelector(":scope > transpose");
      if (!transpose) continue;
      const chromatic = parseIntSafe(transpose.querySelector(":scope > chromatic")?.textContent, NaN);
      const diatonic = parseIntSafe(transpose.querySelector(":scope > diatonic")?.textContent, NaN);
      const out: { chromatic?: number; diatonic?: number } = {};
      if (Number.isFinite(chromatic)) out.chromatic = Math.round(chromatic);
      if (Number.isFinite(diatonic)) out.diatonic = Math.round(diatonic);
      if (Object.keys(out).length > 0) return out;
    }
    if (localStaff === 1) break;
  }
  return null;
};

const toMksDur480 = (durationTicks: number, sourceDivisions: number): number => {
  const base = Math.max(1, Math.round(sourceDivisions));
  return Math.max(1, Math.round((durationTicks * 480) / base));
};

const extractMeiTieFromMusicXmlNote = (note: Element): string => {
  const tieTypes = Array.from(note.querySelectorAll(":scope > tie"))
    .map((node) => (node.getAttribute("type") || "").trim().toLowerCase())
    .filter(Boolean);
  const hasStart = tieTypes.includes("start");
  const hasStop = tieTypes.includes("stop");
  if (hasStart && hasStop) return "m";
  if (hasStart) return "i";
  if (hasStop) return "t";
  return "";
};

const extractMeiSlurFromMusicXmlNote = (note: Element): string => {
  const slurNodes = Array.from(note.querySelectorAll(":scope > notations > slur"));
  if (slurNodes.length === 0) return "";
  const tokens: string[] = [];
  for (const slur of slurNodes) {
    const type = (slur.getAttribute("type") || "").trim().toLowerCase();
    const number = Math.max(1, parseIntSafe(slur.getAttribute("number"), 1));
    if (type === "start") tokens.push(`i${number}`);
    if (type === "stop") tokens.push(`t${number}`);
  }
  return tokens.join(" ");
};

const buildSimplePitchNote = (note: Element, sourceDivisions: number, includeGraceAttr = true): string => {
  const typeText = note.querySelector(":scope > type")?.textContent?.trim() ?? "quarter";
  const dur = noteTypeToDur(typeText);
  const dots = note.querySelectorAll(":scope > dot").length;
  const step = note.querySelector(":scope > pitch > step")?.textContent?.trim() ?? "C";
  const octaveText = note.querySelector(":scope > pitch > octave")?.textContent?.trim() ?? "4";
  const alterText = note.querySelector(":scope > pitch > alter")?.textContent ?? null;
  const explicitAccid = musicXmlAccidentalToAccid(
    note.querySelector(":scope > accidental")?.textContent ?? null
  );
  const accid = explicitAccid ?? alterToAccid(alterText);
  const attrs = [
    `pname="${esc(toPname(step))}"`,
    `oct="${esc(octaveText)}"`,
    `dur="${esc(dur)}"`,
  ];
  const durationTicks = parseIntSafe(note.querySelector(":scope > duration")?.textContent, NaN);
  if (Number.isFinite(durationTicks) && durationTicks > 0) {
    attrs.push(`mks-dur-480="${toMksDur480(durationTicks, sourceDivisions)}"`);
    attrs.push(`mks-dur-div="${Math.max(1, Math.round(sourceDivisions))}"`);
    attrs.push(`mks-dur-ticks="${Math.round(durationTicks)}"`);
  }
  const actual = parseIntSafe(note.querySelector(":scope > time-modification > actual-notes")?.textContent, NaN);
  const normal = parseIntSafe(note.querySelector(":scope > time-modification > normal-notes")?.textContent, NaN);
  const hasTupletStart = note.querySelector(':scope > notations > tuplet[type="start"]') !== null;
  const hasTupletStop = note.querySelector(':scope > notations > tuplet[type="stop"]') !== null;
  const arts: string[] = [];
  if (note.querySelector(":scope > notations > articulations > staccato")) arts.push("stacc");
  if (note.querySelector(":scope > notations > articulations > accent")) arts.push("acc");
  if (dots > 0) attrs.push(`dots="${dots}"`);
  if (accid) attrs.push(`accid="${accid}"`);
  if (Number.isFinite(actual) && Number.isFinite(normal) && actual > 0 && normal > 0) {
    attrs.push(`num="${Math.round(actual)}"`);
    attrs.push(`numbase="${Math.round(normal)}"`);
  }
  if (hasTupletStart) attrs.push('mks-tuplet-start="1"');
  if (hasTupletStop) attrs.push('mks-tuplet-stop="1"');
  if (includeGraceAttr && note.querySelector(":scope > grace")) {
    const slash = (note.querySelector(":scope > grace")?.getAttribute("slash") ?? "").trim().toLowerCase() === "yes";
    attrs.push(`grace="${slash ? "acc" : "unacc"}"`);
  }
  const tieAttr = extractMeiTieFromMusicXmlNote(note);
  if (tieAttr) attrs.push(`tie="${esc(tieAttr)}"`);
  const slurAttr = extractMeiSlurFromMusicXmlNote(note);
  if (slurAttr) attrs.push(`slur="${esc(slurAttr)}"`);
  if (arts.length) attrs.push(`artic="${esc(arts.join(" "))}"`);
  const lyric = extractMusicXmlLyric(note);
  if (lyric) {
    const wordpos = lyricWordposFromSyllabic(lyric.syllabic);
    const wordposAttr = wordpos ? ` wordpos="${esc(wordpos)}"` : "";
    return `<note ${attrs.join(" ")}><verse n="1"><syl${wordposAttr}>${esc(lyric.text)}</syl></verse></note>`;
  }
  return `<note ${attrs.join(" ")}/>`;
};

const buildSimpleRest = (note: Element, sourceDivisions: number): string => {
  const typeText = note.querySelector(":scope > type")?.textContent?.trim() ?? "quarter";
  const dur = noteTypeToDur(typeText);
  const dots = note.querySelectorAll(":scope > dot").length;
  const attrs = [`dur="${esc(dur)}"`];
  const durationTicks = parseIntSafe(note.querySelector(":scope > duration")?.textContent, NaN);
  if (Number.isFinite(durationTicks) && durationTicks > 0) {
    attrs.push(`mks-dur-480="${toMksDur480(durationTicks, sourceDivisions)}"`);
    attrs.push(`mks-dur-div="${Math.max(1, Math.round(sourceDivisions))}"`);
    attrs.push(`mks-dur-ticks="${Math.round(durationTicks)}"`);
  }
  if (dots > 0) attrs.push(`dots="${dots}"`);
  const isInvisible = (note.getAttribute("print-object") || "").trim().toLowerCase() === "no";
  return `<${isInvisible ? "space" : "rest"} ${attrs.join(" ")}/>`;
};

const gatherMeasureNumbers = (parts: Element[]): string[] => {
  const out: string[] = [];
  for (const part of parts) {
    for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
      const number = measure.getAttribute("number")?.trim() || String(out.length + 1);
      if (!out.includes(number)) out.push(number);
    }
  }
  return out;
};

const voiceSort = (a: string, b: string): number => {
  const ai = Number.parseInt(a, 10);
  const bi = Number.parseInt(b, 10);
  if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;
  return a.localeCompare(b);
};

const buildLayerContent = (notes: Element[], sourceDivisions: number, measureTicks: number): string => {
  const pitchNotes = notes.filter((n) => !n.querySelector(":scope > rest"));
  const simpleRests = notes.filter((n) => n.querySelector(":scope > rest"));
  if (pitchNotes.length === 0 && simpleRests.length === 1 && notes.length === 1) {
    const only = simpleRests[0];
    const isGrace = only.querySelector(":scope > grace") !== null;
    const durationTicks = parseIntSafe(only.querySelector(":scope > duration")?.textContent, 0);
    if (!isGrace && durationTicks === measureTicks && measureTicks > 0) {
      const isInvisible = (only.getAttribute("print-object") || "").trim().toLowerCase() === "no";
      const tagName = isInvisible ? "mSpace" : "mRest";
      const inferred = inferMeiDurAndDotsFromTicks(measureTicks, sourceDivisions);
      const dotsAttr = inferred.dots > 0 ? ` dots="${inferred.dots}"` : "";
      return `<${tagName} dur="${inferred.dur}"${dotsAttr} mks-dur-480="${toMksDur480(measureTicks, sourceDivisions)}" mks-dur-div="${Math.max(
        1,
        Math.round(sourceDivisions)
      )}" mks-dur-ticks="${Math.round(measureTicks)}"/>`;
    }
  }
  const out: string[] = [];
  for (let i = 0; i < notes.length; i += 1) {
    const note = notes[i];
    const isRest = Boolean(note.querySelector(":scope > rest"));
    const hasChordFlag = Boolean(note.querySelector(":scope > chord"));
    const isGracePitchNote = !isRest && !hasChordFlag && note.querySelector(":scope > grace") !== null;
    if (isGracePitchNote) {
      const graceGroup: Element[] = [note];
      let hasSlash = (note.querySelector(":scope > grace")?.getAttribute("slash") ?? "").trim().toLowerCase() === "yes";
      for (let j = i + 1; j < notes.length; j += 1) {
        const next = notes[j];
        const nextIsRest = Boolean(next.querySelector(":scope > rest"));
        const nextHasChordFlag = Boolean(next.querySelector(":scope > chord"));
        const nextIsGracePitch = !nextIsRest && !nextHasChordFlag && next.querySelector(":scope > grace") !== null;
        if (!nextIsGracePitch) break;
        graceGroup.push(next);
        hasSlash = hasSlash || (next.querySelector(":scope > grace")?.getAttribute("slash") ?? "").trim().toLowerCase() === "yes";
        i = j;
      }
      const members = graceGroup.map((g) => buildSimplePitchNote(g, sourceDivisions, false)).join("");
      out.push(`<graceGrp slash="${hasSlash ? "yes" : "no"}">${members}</graceGrp>`);
      continue;
    }
    if (isRest || hasChordFlag) {
      if (isRest) out.push(buildSimpleRest(note, sourceDivisions));
      else out.push(buildSimplePitchNote(note, sourceDivisions));
      continue;
    }

    const chordNotes: Element[] = [note];
    for (let j = i + 1; j < notes.length; j += 1) {
      const next = notes[j];
      if (!next.querySelector(":scope > chord")) break;
      chordNotes.push(next);
      i = j;
    }
    if (chordNotes.length === 1) {
      out.push(buildSimplePitchNote(note, sourceDivisions));
      continue;
    }

    const typeText = note.querySelector(":scope > type")?.textContent?.trim() ?? "quarter";
    const dur = noteTypeToDur(typeText);
    const dots = note.querySelectorAll(":scope > dot").length;
    const chordAttrs = [`dur="${esc(dur)}"`];
    const chordDurationTicks = parseIntSafe(note.querySelector(":scope > duration")?.textContent, NaN);
    if (Number.isFinite(chordDurationTicks) && chordDurationTicks > 0) {
      chordAttrs.push(`mks-dur-480="${toMksDur480(chordDurationTicks, sourceDivisions)}"`);
      chordAttrs.push(`mks-dur-div="${Math.max(1, Math.round(sourceDivisions))}"`);
      chordAttrs.push(`mks-dur-ticks="${Math.round(chordDurationTicks)}"`);
    }
    if (dots > 0) chordAttrs.push(`dots="${dots}"`);
    const members = chordNotes.map((n) => {
      const step = n.querySelector(":scope > pitch > step")?.textContent?.trim() ?? "C";
      const octaveText = n.querySelector(":scope > pitch > octave")?.textContent?.trim() ?? "4";
      const alterText = n.querySelector(":scope > pitch > alter")?.textContent ?? null;
      const explicitAccid = musicXmlAccidentalToAccid(
        n.querySelector(":scope > accidental")?.textContent ?? null
      );
      const accid = explicitAccid ?? alterToAccid(alterText);
      const noteAttrs = [
        `pname="${esc(toPname(step))}"`,
        `oct="${esc(octaveText)}"`,
      ];
      if (accid) noteAttrs.push(`accid="${accid}"`);
      const tieAttr = extractMeiTieFromMusicXmlNote(n);
      if (tieAttr) noteAttrs.push(`tie="${esc(tieAttr)}"`);
      const slurAttr = extractMeiSlurFromMusicXmlNote(n);
      if (slurAttr) noteAttrs.push(`slur="${esc(slurAttr)}"`);
      const lyric = extractMusicXmlLyric(n);
      if (lyric) {
        const wordpos = lyricWordposFromSyllabic(lyric.syllabic);
        const wordposAttr = wordpos ? ` wordpos="${esc(wordpos)}"` : "";
        return `<note ${noteAttrs.join(" ")}><verse n="1"><syl${wordposAttr}>${esc(lyric.text)}</syl></verse></note>`;
      }
      return `<note ${noteAttrs.join(" ")}/>`;
    });
    out.push(`<chord ${chordAttrs.join(" ")}>${members.join("")}</chord>`);
  }
  return out.join("");
};

const extractMiscellaneousFieldsFromMeasure = (measure: Element): Array<{ name: string; value: string }> => {
  const out: Array<{ name: string; value: string }> = [];
  const fields = Array.from(
    measure.querySelectorAll(":scope > attributes > miscellaneous > miscellaneous-field")
  );
  for (const field of fields) {
    const name = field.getAttribute("name")?.trim() ?? "";
    if (!name) continue;
    out.push({
      name,
      value: field.textContent?.trim() ?? "",
    });
  }
  return out;
};

const encodeMeasureMetaForMei = (measure: Element): string | null => {
  const rawNo = (measure.getAttribute("number") ?? "").trim();
  const implicitRaw = (measure.getAttribute("implicit") ?? "").trim().toLowerCase();
  const isImplicit = implicitRaw === "yes" || implicitRaw === "true" || implicitRaw === "1";
  const leftRepeat = measure.querySelector(':scope > barline[location="left"] > repeat[direction="forward"]');
  const rightRepeat = measure.querySelector(':scope > barline[location="right"] > repeat[direction="backward"]');
  const repeat = rightRepeat ? "backward" : (leftRepeat ? "forward" : "");
  const times = Number.parseInt(
    measure.querySelector(':scope > barline[location="right"] > ending[type="stop"]')?.getAttribute("number") ?? "",
    10
  );
  const explicitTime = measure.querySelector(":scope > attributes > time") !== null;
  const beats = parseIntSafe(measure.querySelector(":scope > attributes > time > beats")?.textContent, NaN);
  const beatType = parseIntSafe(measure.querySelector(":scope > attributes > time > beat-type")?.textContent, NaN);
  const hasLeftDouble = ((measure.querySelector(':scope > barline[location="left"] > bar-style')?.textContent ?? "")
    .trim()
    .toLowerCase()) === "light-light";
  const hasRightDouble = ((measure.querySelector(':scope > barline[location="right"] > bar-style')?.textContent ?? "")
    .trim()
    .toLowerCase()) === "light-light";
  const doubleBar = hasLeftDouble && hasRightDouble ? "both" : hasLeftDouble ? "left" : hasRightDouble ? "right" : "";

  const parts: string[] = [];
  if (rawNo) parts.push(`number=${rawNo}`);
  if (isImplicit) parts.push("implicit=1");
  if (repeat) parts.push(`repeat=${repeat}`);
  if (Number.isFinite(times) && times > 1) parts.push(`times=${Math.round(times)}`);
  if (explicitTime) {
    parts.push("explicitTime=1");
    if (Number.isFinite(beats) && beats > 0) parts.push(`beats=${Math.round(beats)}`);
    if (Number.isFinite(beatType) && beatType > 0) parts.push(`beatType=${Math.round(beatType)}`);
  }
  if (doubleBar) parts.push(`doubleBar=${doubleBar}`);
  return parts.length ? parts.join(";") : null;
};

const accidentalTextFromAlter = (alter: number): string => {
  if (!Number.isFinite(alter) || alter === 0) return "";
  if (alter === 1) return "#";
  if (alter === -1) return "b";
  if (alter === 2) return "##";
  if (alter === -2) return "bb";
  return "";
};

const suffixFromHarmonyKind = (kindNode: Element | null): { suffix: string; fromText: boolean } => {
  if (!kindNode) return { suffix: "", fromText: false };
  const textAttr = (kindNode.getAttribute("text") || "").trim();
  if (textAttr) return { suffix: textAttr, fromText: true };
  const kind = (kindNode.textContent || "").trim().toLowerCase();
  if (kind === "major") return { suffix: "", fromText: false };
  if (kind === "minor") return { suffix: "m", fromText: false };
  if (kind === "dominant") return { suffix: "7", fromText: false };
  if (kind === "major-seventh") return { suffix: "maj7", fromText: false };
  if (kind === "minor-seventh") return { suffix: "m7", fromText: false };
  if (kind === "diminished") return { suffix: "dim", fromText: false };
  if (kind === "augmented") return { suffix: "aug", fromText: false };
  return { suffix: kind && kind !== "other" ? kind : "", fromText: false };
};

const degreeSuffixFromHarmony = (harmony: Element): string => {
  const out: string[] = [];
  for (const degree of Array.from(harmony.querySelectorAll(":scope > degree"))) {
    const value = Number.parseInt(degree.querySelector(":scope > degree-value")?.textContent || "", 10);
    const alter = Number.parseInt(degree.querySelector(":scope > degree-alter")?.textContent || "", 10);
    if (!Number.isFinite(value) || !Number.isFinite(alter) || alter === 0) continue;
    out.push(`${accidentalTextFromAlter(alter)}${Math.round(value)}`);
  }
  return out.join("");
};

const offsetTicksToTstamp = (offsetTicks: number, divisions: number, beatType: number): string => {
  const ticksPerBeat = Math.max(1, (4 * Math.max(1, divisions)) / Math.max(1, beatType));
  const beatPos = 1 + (Math.max(0, offsetTicks) / ticksPerBeat);
  const rounded = Math.round(beatPos * 1000) / 1000;
  return String(rounded).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
};

const buildMeiHarmFromMusicXmlHarmony = (
  harmony: Element,
  sourceDivisions: number,
  beatType: number
): string | null => {
  const rootStep = (harmony.querySelector(":scope > root > root-step")?.textContent || "").trim().toUpperCase();
  if (!/^[A-G]$/.test(rootStep)) return null;
  const rootAlter = Number.parseInt(harmony.querySelector(":scope > root > root-alter")?.textContent || "0", 10);
  const kindNode = harmony.querySelector(":scope > kind");
  const kindSuffix = suffixFromHarmonyKind(kindNode);
  const suffix = `${kindSuffix.suffix}${kindSuffix.fromText ? "" : degreeSuffixFromHarmony(harmony)}`;
  const bassStep = (harmony.querySelector(":scope > bass > bass-step")?.textContent || "").trim().toUpperCase();
  const bassAlter = Number.parseInt(harmony.querySelector(":scope > bass > bass-alter")?.textContent || "0", 10);
  const chordText =
    `${rootStep}${accidentalTextFromAlter(rootAlter)}${suffix}${/^[A-G]$/.test(bassStep) ? `/${bassStep}${accidentalTextFromAlter(bassAlter)}` : ""}`;
  if (!chordText) return null;
  const offsetTicks = parseIntSafe(harmony.querySelector(":scope > offset")?.textContent, 0);
  const tstamp = offsetTicks > 0 ? offsetTicksToTstamp(offsetTicks, sourceDivisions, beatType) : "1";
  return `<harm tstamp="${esc(tstamp)}">${esc(chordText)}</harm>`;
};

const collectMeiHarmsForStaff = (measure: Element, localStaff: number, sourceDivisions: number, beatType: number): string[] => {
  const out: string[] = [];
  for (const harmony of Array.from(measure.querySelectorAll(":scope > harmony"))) {
    const staffNo = parseIntSafe(harmony.querySelector(":scope > staff")?.textContent, 1);
    if (staffNo !== localStaff) continue;
    const harm = buildMeiHarmFromMusicXmlHarmony(harmony, sourceDivisions, beatType);
    if (harm) out.push(harm);
  }
  return out;
};

const directionOffsetTicks = (direction: Element): number => {
  return Math.max(0, parseIntSafe(direction.querySelector(":scope > offset")?.textContent, 0));
};

const directionTstamp = (direction: Element, divisions: number, beatType: number): string => {
  return offsetTicksToTstamp(directionOffsetTicks(direction), divisions, beatType);
};

const directionStaffMatches = (direction: Element, localStaff: number): boolean => {
  const staffNo = parseIntSafe(direction.querySelector(":scope > staff")?.textContent, 1);
  return staffNo === localStaff;
};

const collectMeiDirectionControlsForStaff = (
  measure: Element,
  localStaff: number,
  sourceDivisions: number,
  beatType: number
): string[] => {
  const out: string[] = [];
  const directions = Array.from(measure.querySelectorAll(":scope > direction")).filter((direction) =>
    directionStaffMatches(direction, localStaff)
  );

  for (const direction of directions) {
    const placement = (direction.getAttribute("placement") || "").trim().toLowerCase();
    const placeAttr = placement === "above" || placement === "below" ? ` place="${esc(placement)}"` : "";
    const tstamp = directionTstamp(direction, sourceDivisions, beatType);
    const dynamicsNode = direction.querySelector(":scope > direction-type > dynamics");
    if (dynamicsNode) {
      const symbol = Array.from(dynamicsNode.children)
        .map((child) => localNameOf(child))
        .find((name) => !!name);
      if (symbol) {
        out.push(`<dynam tstamp="${esc(tstamp)}"${placeAttr}>${esc(symbol)}</dynam>`);
        continue;
      }
    }
    const words = (direction.querySelector(":scope > direction-type > words")?.textContent || "").trim();
    if (words) {
      out.push(`<dynam tstamp="${esc(tstamp)}"${placeAttr}>${esc(words)}</dynam>`);
    }
  }

  type PendingWedge = { tstamp: string; form: "cres" | "dim"; placeAttr: string };
  const pendingByNumber = new Map<string, PendingWedge>();
  for (const direction of directions) {
    const wedge = direction.querySelector(":scope > direction-type > wedge");
    if (!wedge) continue;
    const type = (wedge.getAttribute("type") || "").trim().toLowerCase();
    const number = (wedge.getAttribute("number") || "1").trim() || "1";
    const tstamp = directionTstamp(direction, sourceDivisions, beatType);
    const placement = (direction.getAttribute("placement") || "").trim().toLowerCase();
    const placeAttr = placement === "above" || placement === "below" ? ` place="${esc(placement)}"` : "";
    if (type === "crescendo" || type === "diminuendo") {
      pendingByNumber.set(number, { tstamp, form: type === "diminuendo" ? "dim" : "cres", placeAttr });
      continue;
    }
    if (type === "stop") {
      const pending = pendingByNumber.get(number);
      if (!pending) continue;
      out.push(
        `<hairpin form="${pending.form}" tstamp="${esc(pending.tstamp)}" tstamp2="${esc(tstamp)}"${pending.placeAttr}/>`
      );
      pendingByNumber.delete(number);
    }
  }
  for (const pending of pendingByNumber.values()) {
    out.push(`<hairpin form="${pending.form}" tstamp="${esc(pending.tstamp)}"${pending.placeAttr}/>`);
  }

  type PendingPedal = { tstamp: string; placeAttr: string };
  const pendingPedalByNumber = new Map<string, PendingPedal>();
  for (const direction of directions) {
    const pedal = direction.querySelector(":scope > direction-type > pedal");
    if (!pedal) continue;
    const type = (pedal.getAttribute("type") || "").trim().toLowerCase();
    const number = (pedal.getAttribute("number") || "1").trim() || "1";
    const tstamp = directionTstamp(direction, sourceDivisions, beatType);
    const placement = (direction.getAttribute("placement") || "").trim().toLowerCase();
    const placeAttr = placement === "above" || placement === "below" ? ` place="${esc(placement)}"` : "";
    if (type === "start" || type === "resume" || type === "change") {
      pendingPedalByNumber.set(number, { tstamp, placeAttr });
      continue;
    }
    if (type === "stop" || type === "discontinue") {
      const pending = pendingPedalByNumber.get(number);
      if (pending) {
        out.push(`<pedal tstamp="${esc(pending.tstamp)}" tstamp2="${esc(tstamp)}"${pending.placeAttr}/>`);
        pendingPedalByNumber.delete(number);
      } else {
        out.push(`<pedal tstamp="${esc(tstamp)}" type="stop"${placeAttr}/>`);
      }
    }
  }
  for (const pending of pendingPedalByNumber.values()) {
    out.push(`<pedal tstamp="${esc(pending.tstamp)}"${pending.placeAttr}/>`);
  }

  type PendingOctave = { tstamp: string; dis: number; disPlace: "above" | "below"; placeAttr: string };
  const pendingOctaveByNumber = new Map<string, PendingOctave>();
  for (const direction of directions) {
    const octave = direction.querySelector(":scope > direction-type > octave-shift");
    if (!octave) continue;
    const type = (octave.getAttribute("type") || "").trim().toLowerCase();
    const number = (octave.getAttribute("number") || "1").trim() || "1";
    const size = parseIntSafe(octave.getAttribute("size"), 8);
    const dis = Math.max(1, Math.round(size));
    const disPlace: "above" | "below" = type === "down" ? "below" : "above";
    const tstamp = directionTstamp(direction, sourceDivisions, beatType);
    const placement = (direction.getAttribute("placement") || "").trim().toLowerCase();
    const placeAttr = placement === "above" || placement === "below" ? ` place="${esc(placement)}"` : "";
    if (type === "up" || type === "down") {
      pendingOctaveByNumber.set(number, { tstamp, dis, disPlace, placeAttr });
      continue;
    }
    if (type === "stop" || type === "continue") {
      const pending = pendingOctaveByNumber.get(number);
      if (pending) {
        out.push(
          `<octave dis="${pending.dis}" dis.place="${pending.disPlace}" tstamp="${esc(pending.tstamp)}" tstamp2="${esc(tstamp)}"${pending.placeAttr}/>`
        );
        pendingOctaveByNumber.delete(number);
      } else {
        out.push(`<octave dis="${dis}" tstamp="${esc(tstamp)}" type="stop"${placeAttr}/>`);
      }
    }
  }
  for (const pending of pendingOctaveByNumber.values()) {
    out.push(
      `<octave dis="${pending.dis}" dis.place="${pending.disPlace}" tstamp="${esc(pending.tstamp)}"${pending.placeAttr}/>`
    );
  }

  for (const direction of directions) {
    const tstamp = directionTstamp(direction, sourceDivisions, beatType);
    const placement = (direction.getAttribute("placement") || "").trim().toLowerCase();
    const placeAttr = placement === "above" || placement === "below" ? ` place="${esc(placement)}"` : "";
    const segno = direction.querySelector(":scope > direction-type > segno");
    if (segno) {
      out.push(`<repeatMark tstamp="${esc(tstamp)}"${placeAttr}>segno</repeatMark>`);
      continue;
    }
    const coda = direction.querySelector(":scope > direction-type > coda");
    if (coda) {
      out.push(`<repeatMark tstamp="${esc(tstamp)}"${placeAttr}>coda</repeatMark>`);
      continue;
    }
    const words = (direction.querySelector(":scope > direction-type > words")?.textContent || "").trim();
    if (!words) continue;
    const lowered = words.toLowerCase();
    if (
      lowered === "fine"
      || lowered === "d.c."
      || lowered === "da capo"
      || lowered === "d.s."
      || lowered === "dal segno"
    ) {
      out.push(`<repeatMark tstamp="${esc(tstamp)}"${placeAttr}>${esc(words)}</repeatMark>`);
    }
  }
  return out;
};

const collectStaffTimelineForExport = (
  measure: Element,
  localStaff: number,
  divisions: number
): Array<{ note: Element; onset: number }> => {
  const out: Array<{ note: Element; onset: number }> = [];
  let cursor = 0;
  for (const child of Array.from(measure.children)) {
    const name = localNameOf(child);
    if (name === "backup") {
      const dur = parseIntSafe(child.querySelector(":scope > duration")?.textContent, 0);
      cursor = Math.max(0, cursor - Math.max(0, dur));
      continue;
    }
    if (name === "forward") {
      const dur = parseIntSafe(child.querySelector(":scope > duration")?.textContent, 0);
      cursor += Math.max(0, dur);
      continue;
    }
    if (name !== "note") continue;
    const note = child;
    const staffNo = parseIntSafe(note.querySelector(":scope > staff")?.textContent, 1);
    const isChordContinuation = note.querySelector(":scope > chord") !== null;
    const dur = parseIntSafe(note.querySelector(":scope > duration")?.textContent, 0);
    if (staffNo === localStaff) {
      out.push({ note, onset: cursor });
    }
    if (!isChordContinuation) {
      cursor += Math.max(0, dur);
    }
  }
  return out;
};

const collectMeiGlissSlideControlsForStaff = (
  measure: Element,
  localStaff: number,
  divisions: number,
  beatType: number
): string[] => {
  const out: string[] = [];
  const timeline = collectStaffTimelineForExport(measure, localStaff, divisions);
  type Pending = { kind: "gliss" | "slide"; tstamp: string };
  const pendingByKey = new Map<string, Pending>();
  for (const item of timeline) {
    const note = item.note;
    const tstamp = offsetTicksToTstamp(item.onset, divisions, beatType);
    const notations = note.querySelectorAll(":scope > notations > glissando, :scope > notations > slide");
    for (const node of Array.from(notations)) {
      const kind = localNameOf(node) === "slide" ? "slide" : "gliss";
      const type = (node.getAttribute("type") || "").trim().toLowerCase();
      const number = (node.getAttribute("number") || "1").trim() || "1";
      const key = `${kind}:${number}`;
      if (type === "start") {
        pendingByKey.set(key, { kind, tstamp });
      } else if (type === "stop") {
        const pending = pendingByKey.get(key);
        if (pending) {
          out.push(`<${pending.kind} tstamp="${esc(pending.tstamp)}" tstamp2="${esc(tstamp)}"/>`);
          pendingByKey.delete(key);
        } else {
          out.push(`<${kind} tstamp="${esc(tstamp)}"/>`);
        }
      }
    }
  }
  for (const pending of pendingByKey.values()) {
    out.push(`<${pending.kind} tstamp="${esc(pending.tstamp)}"/>`);
  }
  return out;
};

const tiePitchKeyFromMusicXmlNote = (note: Element): string | null => {
  const pitch = note.querySelector(":scope > pitch");
  if (!pitch) return null;
  const step = (pitch.querySelector(":scope > step")?.textContent || "").trim().toUpperCase();
  const octave = (pitch.querySelector(":scope > octave")?.textContent || "").trim();
  const alter = (pitch.querySelector(":scope > alter")?.textContent || "0").trim();
  if (!/^[A-G]$/.test(step) || !/^-?\d+$/.test(octave)) return null;
  const voice = (note.querySelector(":scope > voice")?.textContent || "1").trim() || "1";
  return `${step}:${alter}:${octave}:v${voice}`;
};

const collectMeiTieSlurControlsForStaff = (
  measure: Element,
  localStaff: number,
  divisions: number,
  beatType: number
): string[] => {
  const out: string[] = [];
  const timeline = collectStaffTimelineForExport(measure, localStaff, divisions);

  const pendingSlurByNumber = new Map<string, { tstamp: string }>();
  const pendingTieByPitch = new Map<string, { tstamp: string }>();

  for (const item of timeline) {
    const note = item.note;
    const tstamp = offsetTicksToTstamp(item.onset, divisions, beatType);

    const slurs = Array.from(note.querySelectorAll(":scope > notations > slur"));
    for (const slur of slurs) {
      const type = (slur.getAttribute("type") || "").trim().toLowerCase();
      const number = String(Math.max(1, parseIntSafe(slur.getAttribute("number"), 1)));
      if (type === "start") {
        pendingSlurByNumber.set(number, { tstamp });
        continue;
      }
      if (type === "stop") {
        const pending = pendingSlurByNumber.get(number);
        if (pending) {
          out.push(`<slur tstamp="${esc(pending.tstamp)}" tstamp2="${esc(tstamp)}"/>`);
          pendingSlurByNumber.delete(number);
        }
      }
    }

    const tieTypes = Array.from(note.querySelectorAll(":scope > tie"))
      .map((n) => (n.getAttribute("type") || "").trim().toLowerCase())
      .filter(Boolean);
    if (tieTypes.length > 0) {
      const pitchKey = tiePitchKeyFromMusicXmlNote(note);
      if (pitchKey) {
        const hasStop = tieTypes.includes("stop");
        const hasStart = tieTypes.includes("start");
        if (hasStop) {
          const pending = pendingTieByPitch.get(pitchKey);
          if (pending) {
            out.push(`<tie tstamp="${esc(pending.tstamp)}" tstamp2="${esc(tstamp)}"/>`);
            pendingTieByPitch.delete(pitchKey);
          }
        }
        if (hasStart) {
          pendingTieByPitch.set(pitchKey, { tstamp });
        }
      }
    }
  }

  return out;
};

const collectMeiOrnamentAndBreathControlsForStaff = (
  measure: Element,
  localStaff: number,
  divisions: number,
  beatType: number
): string[] => {
  const out: string[] = [];
  const timeline = collectStaffTimelineForExport(measure, localStaff, divisions);
  for (const item of timeline) {
    const note = item.note;
    const tstamp = offsetTicksToTstamp(item.onset, divisions, beatType);
    const notePitch = note.querySelector(":scope > pitch");
    if (!notePitch) continue;
    const notations = note.querySelector(":scope > notations");
    if (!notations) continue;

    if (notations.querySelector(":scope > ornaments > trill-mark")) {
      out.push(`<trill tstamp="${esc(tstamp)}"/>`);
    }
    if (notations.querySelector(":scope > ornaments > turn")) {
      out.push(`<turn tstamp="${esc(tstamp)}" type="upper"/>`);
    }
    if (notations.querySelector(":scope > ornaments > inverted-turn")) {
      out.push(`<turn tstamp="${esc(tstamp)}" type="inverted"/>`);
    }
    if (notations.querySelector(":scope > ornaments > mordent")) {
      out.push(`<mordent tstamp="${esc(tstamp)}" type="upper"/>`);
    }
    if (notations.querySelector(":scope > ornaments > inverted-mordent")) {
      out.push(`<mordent tstamp="${esc(tstamp)}" type="inverted"/>`);
    }
    const fermata = notations.querySelector(":scope > fermata");
    if (fermata) {
      const type = (fermata.getAttribute("type") || "").trim().toLowerCase();
      const placeAttr = type === "inverted" ? ` place="below"` : "";
      out.push(`<fermata tstamp="${esc(tstamp)}"${placeAttr}/>`);
    }
    if (notations.querySelector(":scope > articulations > breath-mark")) {
      out.push(`<breath tstamp="${esc(tstamp)}"/>`);
    }
    if (notations.querySelector(":scope > articulations > caesura")) {
      out.push(`<caesura tstamp="${esc(tstamp)}"/>`);
    }
  }
  return out;
};

const normalizeMeiVersion = (raw: string | undefined): string => {
  const v = String(raw ?? "").trim();
  if (/^\d+\.\d+(\.\d+)?$/.test(v)) return v;
  return "5.1";
};

export const exportMusicXmlDomToMei = (doc: Document, options: MeiExportOptions = {}): string => {
  const meiVersion = normalizeMeiVersion(options.meiVersion);
  const parts = Array.from(doc.querySelectorAll("score-partwise > part"));
  if (parts.length === 0) {
    throw new Error("MusicXML part is missing.");
  }

  const title =
    doc.querySelector("score-partwise > work > work-title")?.textContent?.trim() ||
    doc.querySelector("score-partwise > movement-title")?.textContent?.trim() ||
    "mikuscore";
  const scoreDefSource = doc.querySelector("score-partwise > part > measure > attributes");
  const meterCount = parseIntSafe(scoreDefSource?.querySelector(":scope > time > beats")?.textContent, 4);
  const meterUnit = parseIntSafe(scoreDefSource?.querySelector(":scope > time > beat-type")?.textContent, 4);
  const keySig = fifthsToMeiKeySig(
    parseIntSafe(scoreDefSource?.querySelector(":scope > key > fifths")?.textContent, 0)
  );

  const slots = collectStaffSlots(doc);
  const slotByPartStaff = new Map<string, StaffSlot>();
  for (const slot of slots) {
    slotByPartStaff.set(`${slot.partId}:${slot.localStaff}`, slot);
  }

  const scoreDefLines: string[] = [];
  scoreDefLines.push(
    `<scoreDef meter.count="${meterCount}" meter.unit="${meterUnit}" key.sig="${esc(keySig)}">`
  );
  scoreDefLines.push("<staffGrp>");
  for (const slot of slots) {
    const partEl = parts.find((part) => (part.getAttribute("id") ?? "") === slot.partId) ?? null;
    const clef = resolveClefForSlot(partEl, slot.localStaff);
    const transpose = resolveTransposeForSlot(partEl, slot.localStaff);
    const transposeAttrs = [
      Number.isFinite(transpose?.diatonic) ? ` trans.diat="${Math.round(Number(transpose?.diatonic))}"` : "",
      Number.isFinite(transpose?.chromatic) ? ` trans.semi="${Math.round(Number(transpose?.chromatic))}"` : "",
    ].join("");
    scoreDefLines.push(
      `<staffDef n="${slot.globalStaff}" label="${esc(slot.label)}" lines="5" clef.shape="${esc(clef.shape)}" clef.line="${clef.line}"${transposeAttrs}/>`
    );
  }
  scoreDefLines.push("</staffGrp>");
  scoreDefLines.push("</scoreDef>");

  const measuresOut: string[] = [];
  const measureNumbers = gatherMeasureNumbers(parts);
  const currentDivisionsByPart = new Map<string, number>();
  for (const part of parts) {
    const partId = (part.getAttribute("id") ?? "").trim();
    if (!partId) continue;
    const firstDivisions = parseIntSafe(
      part.querySelector(":scope > measure > attributes > divisions")?.textContent,
      1
    );
    currentDivisionsByPart.set(partId, Math.max(1, firstDivisions));
  }
  for (const number of measureNumbers) {
    const measureLines: string[] = [];
    measureLines.push(`<measure n="${esc(number)}">`);

    for (const slot of slots) {
      const part = parts.find((candidate) => (candidate.getAttribute("id") ?? "") === slot.partId);
      if (!part) continue;
      const measure = Array.from(part.querySelectorAll(":scope > measure")).find(
        (m) => (m.getAttribute("number")?.trim() || "") === number
      );
      if (!measure) continue;
      const partId = (part.getAttribute("id") ?? "").trim();
      const measureDivisions = parseIntSafe(
        measure.querySelector(":scope > attributes > divisions")?.textContent,
        NaN
      );
      if (Number.isFinite(measureDivisions) && measureDivisions > 0 && partId) {
        currentDivisionsByPart.set(partId, Math.round(measureDivisions));
      }
      const sourceDivisions = Math.max(
        1,
        Math.round(currentDivisionsByPart.get(partId) ?? 1)
      );
      const beatType = parseIntSafe(
        measure.querySelector(":scope > attributes > time > beat-type")?.textContent,
        meterUnit
      );

      const voiceMap = new Map<string, Element[]>();
      for (const note of Array.from(measure.querySelectorAll(":scope > note"))) {
        const localStaff = parseIntSafe(note.querySelector(":scope > staff")?.textContent, 1);
        if (localStaff !== slot.localStaff) continue;
        const voice = note.querySelector(":scope > voice")?.textContent?.trim() || "1";
        if (!voiceMap.has(voice)) voiceMap.set(voice, []);
        voiceMap.get(voice)?.push(note);
      }
      if (voiceMap.size === 0) continue;

      measureLines.push(`<staff n="${slot.globalStaff}">`);
      const miscFields = extractMiscellaneousFieldsFromMeasure(measure);
      for (const field of miscFields) {
        measureLines.push(
          `<annot type="musicxml-misc-field" label="${esc(field.name)}">${esc(field.value)}</annot>`
        );
      }
      const measureMeta = encodeMeasureMetaForMei(measure);
      if (measureMeta) {
        measureLines.push(
          `<annot type="musicxml-measure-meta" label="mks:measure-meta">${esc(measureMeta)}</annot>`
        );
      }
      const controlNodes = collectMeiDirectionControlsForStaff(measure, slot.localStaff, sourceDivisions, beatType);
      for (const controlNode of controlNodes) {
        measureLines.push(controlNode);
      }
      const glissSlideNodes = collectMeiGlissSlideControlsForStaff(measure, slot.localStaff, sourceDivisions, beatType);
      for (const node of glissSlideNodes) {
        measureLines.push(node);
      }
      const tieSlurNodes = collectMeiTieSlurControlsForStaff(measure, slot.localStaff, sourceDivisions, beatType);
      for (const node of tieSlurNodes) {
        measureLines.push(node);
      }
      const ornamentNodes = collectMeiOrnamentAndBreathControlsForStaff(measure, slot.localStaff, sourceDivisions, beatType);
      for (const node of ornamentNodes) {
        measureLines.push(node);
      }
      const harmNodes = collectMeiHarmsForStaff(measure, slot.localStaff, sourceDivisions, beatType);
      for (const harmNode of harmNodes) {
        measureLines.push(harmNode);
      }
      for (const voice of Array.from(voiceMap.keys()).sort(voiceSort)) {
        const notes = voiceMap.get(voice) ?? [];
        const measureBeats = parseIntSafe(
          measure.querySelector(":scope > attributes > time > beats")?.textContent,
          meterCount
        );
        const measureTicks = Math.max(1, Math.round((measureBeats * 4 * sourceDivisions) / Math.max(1, beatType)));
        const layer = buildLayerContent(notes, sourceDivisions, measureTicks);
        measureLines.push(`<layer n="${esc(voice)}">${layer}</layer>`);
      }
      measureLines.push("</staff>");
    }

    measureLines.push("</measure>");
    measuresOut.push(measureLines.join(""));
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="${esc(meiVersion)}">`,
    `<meiHead><fileDesc><titleStmt><title>${esc(title)}</title></titleStmt><pubStmt><p>Generated by mikuscore</p></pubStmt></fileDesc></meiHead>`,
    `<music><body><mdiv><score>`,
    scoreDefLines.join(""),
    `<section>${measuresOut.join("")}</section>`,
    `</score></mdiv></body></music>`,
    `</mei>`,
  ].join("");
};

const xmlEscape = (value: string): string =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const localNameOf = (node: Element): string => {
  const raw = node.localName || node.tagName || "";
  return raw.includes(":") ? raw.split(":").pop() ?? raw : raw;
};

const childElementsByName = (parent: Element, name: string): Element[] => {
  return Array.from(parent.children).filter((child) => localNameOf(child) === name);
};

const firstDescendantText = (root: ParentNode, name: string): string => {
  const all = Array.from(root.querySelectorAll("*"));
  for (const node of all) {
    if (!(node instanceof Element)) continue;
    if (localNameOf(node) !== name) continue;
    const text = node.textContent?.trim();
    if (text) return text;
  }
  return "";
};

const meiDurToMusicXmlType = (dur: string): string => {
  const normalized = String(dur || "").trim().toLowerCase();
  switch (normalized) {
    case "maxima":
      return "maxima";
    case "long":
      return "long";
    case "breve":
      return "breve";
    case "1":
      return "whole";
    case "2":
      return "half";
    case "4":
      return "quarter";
    case "8":
      return "eighth";
    case "16":
      return "16th";
    case "32":
      return "32nd";
    case "64":
      return "64th";
    case "128":
      return "128th";
    default:
      return "quarter";
  }
};

const meiDurToQuarterLength = (dur: string): number => {
  const normalized = String(dur || "").trim().toLowerCase();
  if (normalized === "maxima") return 32;
  if (normalized === "long") return 16;
  if (normalized === "breve") return 8;
  const denom = Number.parseInt(normalized, 10);
  if (!Number.isFinite(denom) || denom <= 0) return 1;
  return 4 / denom;
};

const meiDurToBeamDepth = (dur: string): number => {
  const normalized = String(dur || "").trim().toLowerCase();
  const denom = Number.parseInt(normalized, 10);
  if (!Number.isFinite(denom) || denom < 8) return 0;
  let depth = 0;
  let value = denom;
  while (value >= 8 && Number.isFinite(value)) {
    depth += 1;
    value /= 2;
    if (!Number.isFinite(value) || value <= 0) break;
  }
  return Math.max(0, depth);
};

const dotsMultiplier = (dots: number): number => {
  const safeDots = Math.max(0, Math.min(4, Math.floor(dots)));
  let sum = 1;
  let add = 0.5;
  for (let i = 0; i < safeDots; i += 1) {
    sum += add;
    add /= 2;
  }
  return sum;
};

const inferMeiDurAndDotsFromTicks = (
  ticks: number,
  divisions: number
): { dur: string; dots: number } => {
  const safeTicks = Math.max(1, Math.round(ticks));
  const safeDiv = Math.max(1, Math.round(divisions));
  const candidates = ["1", "2", "4", "8", "16", "32", "64", "128"];
  let best = { dur: "4", dots: 0, diff: Number.POSITIVE_INFINITY };
  for (const dur of candidates) {
    const base = meiDurToQuarterLength(dur) * safeDiv;
    for (let dots = 0; dots <= 3; dots += 1) {
      const candidate = Math.max(1, Math.round(base * dotsMultiplier(dots)));
      const diff = Math.abs(candidate - safeTicks);
      if (diff < best.diff) best = { dur, dots, diff };
      if (diff === 0) return { dur, dots };
    }
  }
  return { dur: best.dur, dots: best.dots };
};

const accidToAlter = (accid: string): number | null => {
  const normalized = String(accid || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "s" || normalized === "#") return 1;
  if (normalized === "ss" || normalized === "x") return 2;
  if (normalized === "f" || normalized === "b") return -1;
  if (normalized === "ff" || normalized === "bb") return -2;
  if (normalized === "n") return 0;
  return null;
};

const accidToMusicXmlAccidental = (accid: string): string | null => {
  const normalized = String(accid || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "s" || normalized === "#") return "sharp";
  if (normalized === "f" || normalized === "b") return "flat";
  if (normalized === "n") return "natural";
  if (normalized === "ss" || normalized === "x") return "double-sharp";
  if (normalized === "ff" || normalized === "bb") return "flat-flat";
  return null;
};

const readMeiSoundingAccid = (node: Element): { visualAccid: string; soundingAccid: string } => {
  const visualAccid = (node.getAttribute("accid") || "").trim();
  const gesturalAccid = (node.getAttribute("accid.ges") || node.getAttribute("accid-ges") || "").trim();
  const soundingAccid = visualAccid || gesturalAccid;
  return { visualAccid, soundingAccid };
};

const accidToPitchAlterXml = (accid: string): string => {
  const alter = accidToAlter(accid);
  // Prefer omitting <alter>0</alter>; keep explicit accidental display separately.
  if (alter === null || alter === 0) return "";
  return `<alter>${alter}</alter>`;
};

const impliedAlterFromFifths = (step: string, fifths: number): number => {
  const normalizedStep = String(step || "").trim().toUpperCase();
  if (!/^[A-G]$/.test(normalizedStep)) return 0;
  const n = Math.max(-7, Math.min(7, Math.round(Number(fifths) || 0)));
  if (n === 0) return 0;
  const sharpOrder = ["F", "C", "G", "D", "A", "E", "B"];
  const flatOrder = ["B", "E", "A", "D", "G", "C", "F"];
  if (n > 0) return sharpOrder.slice(0, n).includes(normalizedStep) ? 1 : 0;
  return flatOrder.slice(0, Math.abs(n)).includes(normalizedStep) ? -1 : 0;
};

const parseMeiKeySigToFifths = (value: string): number => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "0") return 0;
  const num = Number.parseInt(normalized, 10);
  if (!Number.isFinite(num)) return 0;
  if (normalized.endsWith("s")) return Math.max(-7, Math.min(7, num));
  if (normalized.endsWith("f")) return Math.max(-7, Math.min(7, -Math.abs(num)));
  return Math.max(-7, Math.min(7, num));
};

const readMeiKeySigAttr = (element: Element | null | undefined): string => {
  if (!element) return "";
  return (element.getAttribute("key.sig") || element.getAttribute("keysig") || "").trim();
};

const parseMeiKeyAccidToAlter = (value: string): number => {
  const v = String(value || "").trim().toLowerCase();
  if (!v || v === "n") return 0;
  if (v === "s" || v === "#") return 1;
  if (v === "ss" || v === "x" || v === "##") return 2;
  if (v === "f" || v === "b" || v === "♭") return -1;
  if (v === "ff" || v === "bb") return -2;
  return 0;
};

const tonicToFifths = (pname: string, accid: string, mode: string): number | null => {
  const step = String(pname || "").trim().toUpperCase();
  if (!/^[A-G]$/.test(step)) return null;
  const alter = parseMeiKeyAccidToAlter(accid);
  const normalizedMode = String(mode || "").trim().toLowerCase();
  const tonic = `${step}${alter > 0 ? "#".repeat(alter) : alter < 0 ? "b".repeat(Math.abs(alter)) : ""}`;
  const majorMap: Record<string, number> = {
    C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, "F#": 6, "C#": 7,
    F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
  };
  const minorMap: Record<string, number> = {
    A: 0, E: 1, B: 2, "F#": 3, "C#": 4, "G#": 5, "D#": 6, "A#": 7,
    D: -1, G: -2, C: -3, F: -4, Bb: -5, Eb: -6, Ab: -7,
  };
  if (normalizedMode === "minor") return minorMap[tonic] ?? null;
  return majorMap[tonic] ?? null;
};

const parseMeiKeyFifthsFromElement = (element: Element | null | undefined): number | null => {
  if (!element) return null;
  const keySig = readMeiKeySigAttr(element);
  if (keySig) return parseMeiKeySigToFifths(keySig);
  const keyPname = element.getAttribute("key.pname") || "";
  const keyAccid = element.getAttribute("key.accid") || "";
  const keyMode = element.getAttribute("key.mode") || "major";
  return tonicToFifths(keyPname, keyAccid, keyMode);
};

const toHex = (value: number, width = 2): string => {
  const safe = Math.max(0, Math.round(Number(value) || 0));
  return `0x${safe.toString(16).toUpperCase().padStart(width, "0")}`;
};

type ParsedMeiEvent =
  | {
      kind: "note";
      durationTicks: number;
      xml: string;
      beamDepth?: number;
      breaksecAfter?: number | null;
    }
  | {
      kind: "rest";
      durationTicks: number;
      xml: string;
      beamDepth?: number;
      breaksecAfter?: number | null;
    }
  | {
      kind: "chord";
      durationTicks: number;
      xml: string;
      beamDepth?: number;
      breaksecAfter?: number | null;
    };

type ParsedMeiLayer = {
  events: ParsedMeiEvent[];
  idToEventIndex: Map<string, number>;
  tieCarryOut: Map<string, number>;
};

const resolveDurTicksFromMetadata = (
  source: Element,
  fallbackTicks: number,
  targetDivisions: number
): number => {
  const dur480 = parseIntSafe(source.getAttribute("mks-dur-480"), NaN);
  if (Number.isFinite(dur480) && dur480 > 0) return Math.round(dur480);
  const legacyTicks = parseIntSafe(source.getAttribute("mks-dur-ticks"), NaN);
  if (!Number.isFinite(legacyTicks) || legacyTicks <= 0) return fallbackTicks;
  const legacyDivisions = parseIntSafe(source.getAttribute("mks-dur-div"), NaN);
  if (Number.isFinite(legacyDivisions) && legacyDivisions > 0) {
    return Math.max(1, Math.round((legacyTicks * targetDivisions) / legacyDivisions));
  }
  // Legacy MEI without source divisions should keep semantic duration from dur/dots.
  return fallbackTicks;
};

const parseMeiTieFlags = (raw: string): { start: boolean; stop: boolean } => {
  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized) return { start: false, stop: false };
  const hasMiddle = normalized.includes("m");
  const start = hasMiddle || normalized.includes("i");
  const stop = hasMiddle || normalized.includes("t");
  return { start, stop };
};

const parseMeiSlurNotations = (raw: string): Array<{ type: "start" | "stop"; number: number }> => {
  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized) return [];
  const out: Array<{ type: "start" | "stop"; number: number }> = [];
  const rx = /([imt])\s*(\d+)?|(\d+)\s*([imt])/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(normalized)) !== null) {
    const kind = (m[1] || m[4] || "").toLowerCase();
    const nRaw = m[2] || m[3] || "1";
    const number = Math.max(1, parseIntSafe(nRaw, 1));
    if (kind === "i" || kind === "m") out.push({ type: "start", number });
    if (kind === "t" || kind === "m") out.push({ type: "stop", number });
  }
  return out;
};

const buildMusicXmlNoteFromMeiNote = (
  meiNote: Element,
  durationTicks: number,
  typeText: string,
  dots: number,
  voice: string,
  measureFifths: number
): string => {
  const pname = (meiNote.getAttribute("pname") || "c").trim().toUpperCase();
  const octave = parseIntSafe(meiNote.getAttribute("oct"), 4);
  const { visualAccid, soundingAccid } = readMeiSoundingAccid(meiNote);
  const explicitAlterXml = accidToPitchAlterXml(soundingAccid);
  const impliedAlter = impliedAlterFromFifths(pname, measureFifths);
  const alterXml = explicitAlterXml || (impliedAlter !== 0 ? `<alter>${impliedAlter}</alter>` : "");
  const accidentalText = accidToMusicXmlAccidental(visualAccid);
  const accidentalXml = accidentalText ? `<accidental>${xmlEscape(accidentalText)}</accidental>` : "";
  const dotXml = Array.from({ length: dots }, () => "<dot/>").join("");
  const actual = parseIntSafe(meiNote.getAttribute("num"), NaN);
  const normal = parseIntSafe(meiNote.getAttribute("numbase"), NaN);
  const hasTimeModification = Number.isFinite(actual) && Number.isFinite(normal) && actual > 0 && normal > 0;
  const timeModificationXml = hasTimeModification
    ? `<time-modification><actual-notes>${Math.round(actual)}</actual-notes><normal-notes>${Math.round(normal)}</normal-notes></time-modification>`
    : "";
  const hasTupletStart =
    (meiNote.getAttribute("mks-tuplet-start") ?? "").trim() === "1";
  const hasTupletStop =
    (meiNote.getAttribute("mks-tuplet-stop") ?? "").trim() === "1";
  const articRaw = (meiNote.getAttribute("artic") || "").trim().toLowerCase();
  const articTokens = articRaw.split(/\s+/).filter(Boolean);
  const arts: string[] = [];
  if (articTokens.includes("stacc")) arts.push("<staccato/>");
  if (articTokens.includes("acc")) arts.push("<accent/>");
  const tieFlags = parseMeiTieFlags(meiNote.getAttribute("tie") || "");
  const tieXml = `${tieFlags.start ? '<tie type="start"/>' : ""}${tieFlags.stop ? '<tie type="stop"/>' : ""}`;
  const tiedXml = `${tieFlags.start ? '<tied type="start"/>' : ""}${tieFlags.stop ? '<tied type="stop"/>' : ""}`;
  const slurXml = parseMeiSlurNotations(meiNote.getAttribute("slur") || "")
    .map((entry) => `<slur type="${entry.type}" number="${entry.number}"/>`)
    .join("");
  const tupletXml = `${hasTupletStart ? '<tuplet type="start"/>' : ""}${hasTupletStop ? '<tuplet type="stop"/>' : ""}`;
  const hasNotations = arts.length > 0 || tupletXml.length > 0 || tiedXml.length > 0 || slurXml.length > 0;
  const notationsXml = hasNotations
    ? `<notations>${arts.length ? `<articulations>${arts.join("")}</articulations>` : ""}${tupletXml}${tiedXml}${slurXml}</notations>`
    : "";
  const graceAttr = (meiNote.getAttribute("grace") || "").trim().toLowerCase();
  const isGrace = graceAttr === "acc" || graceAttr === "unacc";
  const stemMod = (meiNote.getAttribute("stem.mod") || "").trim().toLowerCase();
  const hasStemSlash = stemMod.includes("slash");
  const graceXml = isGrace ? `<grace${graceAttr === "acc" || hasStemSlash ? ' slash="yes"' : ""}/>` : "";
  const durationXml = isGrace ? "" : `<duration>${durationTicks}</duration>`;
  const stemDir = (meiNote.getAttribute("stem.dir") || "").trim().toLowerCase();
  const stemXml = stemDir === "up" || stemDir === "down" ? `<stem>${xmlEscape(stemDir)}</stem>` : "";
  const lyric = extractMeiLyric(meiNote);
  const lyricXml = lyric
    ? `<lyric>${lyric.syllabic ? `<syllabic>${xmlEscape(lyric.syllabic)}</syllabic>` : ""}<text>${xmlEscape(lyric.text)}</text></lyric>`
    : "";
  return `<note>${graceXml}<pitch><step>${xmlEscape(pname)}</step>${alterXml}<octave>${octave}</octave></pitch>${tieXml}${durationXml}<voice>${xmlEscape(
    voice
  )}</voice><type>${xmlEscape(typeText)}</type>${dotXml}${stemXml}${accidentalXml}${timeModificationXml}${notationsXml}${lyricXml}</note>`;
};

const parseLayerEvents = (
  layer: Element,
  divisions: number,
  voice: string,
  measureTicks: number,
  measureFifths: number,
  tieCarryIn: Map<string, number> = new Map()
): ParsedMeiLayer => {
  const events: ParsedMeiEvent[] = [];
  const idToEventIndex = new Map<string, number>();
  const tieCarryByPitch = new Map<string, number>(tieCarryIn);
  const measureAccidentalByPitch = new Map<string, number>();
  const tiePitchKey = (pname: string, octave: number): string =>
    `${String(pname || "").trim().toUpperCase()}:${Math.round(Number(octave) || 0)}`;
  const breaksecFromNode = (node: Element): number | null => {
    const raw = parseIntSafe(node.getAttribute("breaksec"), NaN);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return Math.round(raw);
  };
  const pushNoteEvent = (node: Element, forcedTuplet: { num: number; numbase: number } | null = null) => {
    let effectiveNode = node;
    if (
      forcedTuplet
      && !effectiveNode.getAttribute("num")
      && !effectiveNode.getAttribute("numbase")
    ) {
      effectiveNode = node.cloneNode(true) as Element;
      effectiveNode.setAttribute("num", String(Math.round(forcedTuplet.num)));
      effectiveNode.setAttribute("numbase", String(Math.round(forcedTuplet.numbase)));
    }
    const durAttr = effectiveNode.getAttribute("dur") || "4";
    const dots = parseIntSafe(node.getAttribute("dots"), 0);
    const typeText = meiDurToMusicXmlType(durAttr);
    const graceAttr = (effectiveNode.getAttribute("grace") || "").trim().toLowerCase();
    const isGrace = graceAttr === "acc" || graceAttr === "unacc";
    const actual = parseIntSafe(effectiveNode.getAttribute("num"), NaN);
    const normal = parseIntSafe(effectiveNode.getAttribute("numbase"), NaN);
    const tupletRatio =
      Number.isFinite(actual) && Number.isFinite(normal) && actual > 0 && normal > 0
        ? Math.max(0.0001, Math.round(normal) / Math.round(actual))
        : 1;
    const ticks = isGrace
      ? 0
      : Math.max(1, Math.round(meiDurToQuarterLength(durAttr) * dotsMultiplier(dots) * divisions * tupletRatio));
    const resolvedTicks = isGrace
      ? 0
      : resolveDurTicksFromMetadata(node, ticks, divisions);
    const eventIndex = events.length;
    const pname = (effectiveNode.getAttribute("pname") || "c").trim().toUpperCase();
    const octave = parseIntSafe(effectiveNode.getAttribute("oct"), 4);
    const tieFlags = parseMeiTieFlags(effectiveNode.getAttribute("tie") || "");
    const { visualAccid, soundingAccid } = readMeiSoundingAccid(effectiveNode);
    const explicitAlter = accidToAlter(soundingAccid);
    const impliedAlter = impliedAlterFromFifths(pname, measureFifths);
    const pitchKey = tiePitchKey(pname, octave);
    const carriedAlter =
      tieFlags.stop && explicitAlter === null
        ? tieCarryByPitch.get(pitchKey)
        : undefined;
    const measureCarriedAlter =
      explicitAlter === null
        ? measureAccidentalByPitch.get(pitchKey)
        : undefined;
    const resolvedAlter =
      explicitAlter !== null
        ? explicitAlter
        : Number.isFinite(carriedAlter as number)
          ? Math.round(Number(carriedAlter))
          : Number.isFinite(measureCarriedAlter as number)
            ? Math.round(Number(measureCarriedAlter))
          : impliedAlter;
    const alterXml = resolvedAlter !== 0 ? `<alter>${resolvedAlter}</alter>` : "";
    const accidentalText = accidToMusicXmlAccidental(visualAccid);
    const accidentalXml = accidentalText ? `<accidental>${xmlEscape(accidentalText)}</accidental>` : "";
    const tiedXml = `${tieFlags.start ? '<tied type="start"/>' : ""}${tieFlags.stop ? '<tied type="stop"/>' : ""}`;
    const tieXml = `${tieFlags.start ? '<tie type="start"/>' : ""}${tieFlags.stop ? '<tie type="stop"/>' : ""}`;
    const slurXml = parseMeiSlurNotations(effectiveNode.getAttribute("slur") || "")
      .map((entry) => `<slur type="${entry.type}" number="${entry.number}"/>`)
      .join("");
    const hasNotations = tiedXml.length > 0 || slurXml.length > 0;
    const notationsXml = hasNotations ? `<notations>${tiedXml}${slurXml}</notations>` : "";
    events.push({
      kind: "note",
      durationTicks: resolvedTicks,
      xml: (() => {
        const graceAttr = (effectiveNode.getAttribute("grace") || "").trim().toLowerCase();
        const isGrace = graceAttr === "acc" || graceAttr === "unacc";
        const stemMod = (effectiveNode.getAttribute("stem.mod") || "").trim().toLowerCase();
        const hasStemSlash = stemMod.includes("slash");
        const graceXml = isGrace ? `<grace${graceAttr === "acc" || hasStemSlash ? ' slash="yes"' : ""}/>` : "";
        const durationXml = isGrace ? "" : `<duration>${resolvedTicks}</duration>`;
        const dotXml = Array.from({ length: dots }, () => "<dot/>").join("");
        const stemDir = (effectiveNode.getAttribute("stem.dir") || "").trim().toLowerCase();
        const stemXml = stemDir === "up" || stemDir === "down" ? `<stem>${xmlEscape(stemDir)}</stem>` : "";
        const lyric = extractMeiLyric(effectiveNode);
        const lyricXml = lyric
          ? `<lyric>${lyric.syllabic ? `<syllabic>${xmlEscape(lyric.syllabic)}</syllabic>` : ""}<text>${xmlEscape(lyric.text)}</text></lyric>`
          : "";
        const actual = parseIntSafe(effectiveNode.getAttribute("num"), NaN);
        const normal = parseIntSafe(effectiveNode.getAttribute("numbase"), NaN);
        const hasTimeModification = Number.isFinite(actual) && Number.isFinite(normal) && actual > 0 && normal > 0;
        const timeModificationXml = hasTimeModification
          ? `<time-modification><actual-notes>${Math.round(actual)}</actual-notes><normal-notes>${Math.round(normal)}</normal-notes></time-modification>`
          : "";
        const articRaw = (effectiveNode.getAttribute("artic") || "").trim().toLowerCase();
        const articTokens = articRaw.split(/\s+/).filter(Boolean);
        const arts: string[] = [];
        if (articTokens.includes("stacc")) arts.push("<staccato/>");
        if (articTokens.includes("acc")) arts.push("<accent/>");
        const tupletStart = (effectiveNode.getAttribute("mks-tuplet-start") ?? "").trim() === "1";
        const tupletStop = (effectiveNode.getAttribute("mks-tuplet-stop") ?? "").trim() === "1";
        const tupletXml = `${tupletStart ? '<tuplet type="start"/>' : ""}${tupletStop ? '<tuplet type="stop"/>' : ""}`;
        const fullNotationsXml = arts.length > 0 || tupletXml.length > 0 || tiedXml.length > 0 || slurXml.length > 0
          ? `<notations>${arts.length ? `<articulations>${arts.join("")}</articulations>` : ""}${tupletXml}${tiedXml}${slurXml}</notations>`
          : "";
        return `<note>${graceXml}<pitch><step>${xmlEscape(pname)}</step>${alterXml}<octave>${octave}</octave></pitch>${tieXml}${durationXml}<voice>${xmlEscape(
          voice
        )}</voice><type>${xmlEscape(typeText)}</type>${dotXml}${stemXml}${accidentalXml}${timeModificationXml}${fullNotationsXml}${lyricXml}</note>`;
      })(),
      beamDepth: meiDurToBeamDepth(durAttr),
      breaksecAfter: breaksecFromNode(effectiveNode),
    });
    if (tieFlags.start) {
      tieCarryByPitch.set(pitchKey, resolvedAlter);
    } else if (tieFlags.stop) {
      tieCarryByPitch.delete(pitchKey);
    }
    if (explicitAlter !== null) {
      measureAccidentalByPitch.set(pitchKey, resolvedAlter);
    }
    const xmlId = (effectiveNode.getAttribute("xml:id") || effectiveNode.getAttribute("id") || "").trim();
    if (xmlId) idToEventIndex.set(xmlId, eventIndex);
  };

  const pushRestEvent = (node: Element, forcedTuplet: { num: number; numbase: number } | null = null) => {
    let effectiveNode = node;
    if (
      forcedTuplet
      && !effectiveNode.getAttribute("num")
      && !effectiveNode.getAttribute("numbase")
    ) {
      effectiveNode = node.cloneNode(true) as Element;
      effectiveNode.setAttribute("num", String(Math.round(forcedTuplet.num)));
      effectiveNode.setAttribute("numbase", String(Math.round(forcedTuplet.numbase)));
    }
    const graceAttr = (effectiveNode.getAttribute("grace") || "").trim().toLowerCase();
    const isGrace = graceAttr === "acc" || graceAttr === "unacc";
    if (isGrace) return;
    const durAttr = effectiveNode.getAttribute("dur") || "4";
    const dots = parseIntSafe(effectiveNode.getAttribute("dots"), 0);
    const actual = parseIntSafe(effectiveNode.getAttribute("num"), NaN);
    const normal = parseIntSafe(effectiveNode.getAttribute("numbase"), NaN);
    const tupletRatio =
      Number.isFinite(actual) && Number.isFinite(normal) && actual > 0 && normal > 0
        ? Math.max(0.0001, Math.round(normal) / Math.round(actual))
        : 1;
    const typeText = meiDurToMusicXmlType(durAttr);
    const ticks = Math.max(1, Math.round(meiDurToQuarterLength(durAttr) * dotsMultiplier(dots) * divisions * tupletRatio));
    const resolvedTicks = resolveDurTicksFromMetadata(effectiveNode, ticks, divisions);
    const dotXml = Array.from({ length: dots }, () => "<dot/>").join("");
    events.push({
      kind: "rest",
      durationTicks: resolvedTicks,
      xml: `<note><rest/><duration>${resolvedTicks}</duration><voice>${xmlEscape(voice)}</voice><type>${xmlEscape(
        typeText
      )}</type>${dotXml}</note>`,
      beamDepth: meiDurToBeamDepth(durAttr),
      breaksecAfter: null,
    });
  };

  const pushChordEvent = (node: Element, forcedTuplet: { num: number; numbase: number } | null = null) => {
    let effectiveNode = node;
    if (
      forcedTuplet
      && !effectiveNode.getAttribute("num")
      && !effectiveNode.getAttribute("numbase")
    ) {
      effectiveNode = node.cloneNode(true) as Element;
      effectiveNode.setAttribute("num", String(Math.round(forcedTuplet.num)));
      effectiveNode.setAttribute("numbase", String(Math.round(forcedTuplet.numbase)));
    }
    const durAttr = effectiveNode.getAttribute("dur") || "4";
    const dots = parseIntSafe(effectiveNode.getAttribute("dots"), 0);
    const typeText = meiDurToMusicXmlType(durAttr);
    const graceAttr = (effectiveNode.getAttribute("grace") || "").trim().toLowerCase();
    const isGrace = graceAttr === "acc" || graceAttr === "unacc";
    const actual = parseIntSafe(effectiveNode.getAttribute("num"), NaN);
    const normal = parseIntSafe(effectiveNode.getAttribute("numbase"), NaN);
    const tupletRatio =
      Number.isFinite(actual) && Number.isFinite(normal) && actual > 0 && normal > 0
        ? Math.max(0.0001, Math.round(normal) / Math.round(actual))
        : 1;
    const ticks = isGrace ? 0 : Math.max(1, Math.round(meiDurToQuarterLength(durAttr) * dotsMultiplier(dots) * divisions * tupletRatio));
    const resolvedTicks = isGrace ? 0 : resolveDurTicksFromMetadata(effectiveNode, ticks, divisions);
    const noteChildren = childElementsByName(effectiveNode, "note");
    if (noteChildren.length === 0) return;
    const dotXml = Array.from({ length: dots }, () => "<dot/>").join("");
    const chordTupletStart = (effectiveNode.getAttribute("mks-tuplet-start") ?? "").trim() === "1";
    const chordTupletStop = (effectiveNode.getAttribute("mks-tuplet-stop") ?? "").trim() === "1";
    const timeModificationXml =
      Number.isFinite(actual) && Number.isFinite(normal) && actual > 0 && normal > 0
        ? `<time-modification><actual-notes>${Math.round(actual)}</actual-notes><normal-notes>${Math.round(normal)}</normal-notes></time-modification>`
        : "";
    const chordArticRaw = (effectiveNode.getAttribute("artic") || "").trim().toLowerCase();
    const graceXml = isGrace ? `<grace${graceAttr === "acc" ? ' slash="yes"' : ""}/>` : "";
    const durationXml = isGrace ? "" : `<duration>${resolvedTicks}</duration>`;
    const noteXml = noteChildren
      .map((note, index) => {
        const pname = (note.getAttribute("pname") || "c").trim().toUpperCase();
        const octave = parseIntSafe(note.getAttribute("oct"), 4);
        const { visualAccid, soundingAccid } = readMeiSoundingAccid(note);
        const explicitAlter = accidToAlter(soundingAccid);
        const impliedAlter = impliedAlterFromFifths(pname, measureFifths);
        const tieFlags = parseMeiTieFlags(note.getAttribute("tie") || "");
        const pitchKey = tiePitchKey(pname, octave);
        const carriedAlter =
          tieFlags.stop && explicitAlter === null
            ? tieCarryByPitch.get(pitchKey)
            : undefined;
        const measureCarriedAlter =
          explicitAlter === null
            ? measureAccidentalByPitch.get(pitchKey)
            : undefined;
        const resolvedAlter =
          explicitAlter !== null
            ? explicitAlter
            : Number.isFinite(carriedAlter as number)
              ? Math.round(Number(carriedAlter))
              : Number.isFinite(measureCarriedAlter as number)
                ? Math.round(Number(measureCarriedAlter))
              : impliedAlter;
        const alterXml = resolvedAlter !== 0 ? `<alter>${resolvedAlter}</alter>` : "";
        const accidentalText = accidToMusicXmlAccidental(visualAccid);
        const accidentalXml = accidentalText ? `<accidental>${xmlEscape(accidentalText)}</accidental>` : "";
        const chordXml = index > 0 ? "<chord/>" : "";
        const mergedArticRaw = `${chordArticRaw} ${(note.getAttribute("artic") || "").trim().toLowerCase()}`.trim();
        const articTokens = mergedArticRaw.split(/\s+/).filter(Boolean);
        const arts: string[] = [];
        if (articTokens.includes("stacc")) arts.push("<staccato/>");
        if (articTokens.includes("acc")) arts.push("<accent/>");
        const tieXml = `${tieFlags.start ? '<tie type="start"/>' : ""}${tieFlags.stop ? '<tie type="stop"/>' : ""}`;
        const tiedXml = `${tieFlags.start ? '<tied type="start"/>' : ""}${tieFlags.stop ? '<tied type="stop"/>' : ""}`;
        const slurXml = parseMeiSlurNotations(note.getAttribute("slur") || "")
          .map((entry) => `<slur type="${entry.type}" number="${entry.number}"/>`)
          .join("");
        const tupletXml = index === 0
          ? `${chordTupletStart ? '<tuplet type="start"/>' : ""}${chordTupletStop ? '<tuplet type="stop"/>' : ""}`
          : "";
        const notationsXml = (index === 0 && (arts.length > 0 || tupletXml.length > 0)) || tiedXml.length > 0 || slurXml.length > 0
          ? `<notations>${index === 0 && arts.length ? `<articulations>${arts.join("")}</articulations>` : ""}${index === 0 ? tupletXml : ""}${tiedXml}${slurXml}</notations>`
          : "";
        const lyric = extractMeiLyric(note);
        const lyricXml = lyric
          ? `<lyric>${lyric.syllabic ? `<syllabic>${xmlEscape(lyric.syllabic)}</syllabic>` : ""}<text>${xmlEscape(lyric.text)}</text></lyric>`
          : "";
        if (tieFlags.start) {
          tieCarryByPitch.set(pitchKey, resolvedAlter);
        } else if (tieFlags.stop) {
          tieCarryByPitch.delete(pitchKey);
        }
        if (explicitAlter !== null) {
          measureAccidentalByPitch.set(pitchKey, resolvedAlter);
        }
        return `<note>${chordXml}${graceXml}<pitch><step>${xmlEscape(pname)}</step>${alterXml}<octave>${octave}</octave></pitch>${tieXml}${durationXml}<voice>${xmlEscape(
          voice
        )}</voice><type>${xmlEscape(typeText)}</type>${dotXml}${accidentalXml}${timeModificationXml}${notationsXml}${lyricXml}</note>`;
      })
      .join("");
    const eventIndex = events.length;
    events.push({ kind: "chord", durationTicks: resolvedTicks, xml: noteXml });
    events[eventIndex] = {
      ...events[eventIndex],
      beamDepth: meiDurToBeamDepth(durAttr),
      breaksecAfter: breaksecFromNode(effectiveNode),
    };
    const xmlId = (effectiveNode.getAttribute("xml:id") || effectiveNode.getAttribute("id") || "").trim();
    if (xmlId) idToEventIndex.set(xmlId, eventIndex);
    for (const chordNote of noteChildren) {
      const noteId = (chordNote.getAttribute("xml:id") || chordNote.getAttribute("id") || "").trim();
      if (noteId && !idToEventIndex.has(noteId)) {
        idToEventIndex.set(noteId, eventIndex);
      }
    }
  };

  const processElement = (
    node: Element,
    forcedGrace: "acc" | "unacc" | null = null,
    forcedTuplet: { num: number; numbase: number } | null = null
  ) => {
    const name = localNameOf(node);
    if (name === "beam") {
      const startIndex = events.length;
      for (const child of Array.from(node.children)) {
        if (child instanceof Element) processElement(child, forcedGrace, forcedTuplet);
      }
      const endIndex = events.length;
      const pitchedIndexes: number[] = [];
      for (let i = startIndex; i < endIndex; i += 1) {
        if (events[i].kind !== "rest") pitchedIndexes.push(i);
      }
      if (pitchedIndexes.length >= 2) {
        const depths = pitchedIndexes.map((idx) => Math.max(1, events[idx].beamDepth || 1));
        const breaksecs = pitchedIndexes.map((idx) => events[idx].breaksecAfter ?? null);
        const maxDepth = Math.max(1, ...depths);
        const canConnect = (leftIdx: number, level: number): boolean => {
          if (leftIdx < 0 || leftIdx >= pitchedIndexes.length - 1) return false;
          if (depths[leftIdx] < level) return false;
          if (depths[leftIdx + 1] < level) return false;
          const keep = breaksecs[leftIdx];
          if (Number.isFinite(keep as number) && (keep as number) < level) return false;
          return true;
        };
        for (let level = 1; level <= maxDepth; level += 1) {
          for (let i = 0; i < pitchedIndexes.length; i += 1) {
            if (depths[i] < level) continue;
            const prev = canConnect(i - 1, level);
            const next = canConnect(i, level);
            if (!prev && !next) continue;
            const value: "begin" | "continue" | "end" =
              !prev && next ? "begin" : prev && !next ? "end" : "continue";
            const eventIndex = pitchedIndexes[i];
            events[eventIndex].xml = addBeamToEventXml(events[eventIndex].xml, value, level);
          }
        }
      }
      return;
    }
    if (name === "tuplet") {
      const num = parseIntSafe(node.getAttribute("num"), NaN);
      const numbase = parseIntSafe(node.getAttribute("numbase"), NaN);
      const nextTuplet =
        Number.isFinite(num) && Number.isFinite(numbase) && num > 0 && numbase > 0
          ? { num: Math.round(num), numbase: Math.round(numbase) }
          : forcedTuplet;
      for (const child of Array.from(node.children)) {
        if (child instanceof Element) processElement(child, forcedGrace, nextTuplet);
      }
      return;
    }
    if (name === "graceGrp") {
      const raw = (node.getAttribute("grace") || "").trim().toLowerCase();
      const slash = (node.getAttribute("slash") || "").trim().toLowerCase() === "yes";
      const groupGrace: "acc" | "unacc" =
        raw === "acc" || raw === "unacc"
          ? (raw as "acc" | "unacc")
          : (slash ? "acc" : "unacc");
      for (const child of Array.from(node.children)) {
        if (child instanceof Element) processElement(child, forcedGrace ?? groupGrace, forcedTuplet);
      }
      return;
    }

    let effectiveNode = node;
    if (forcedGrace && !effectiveNode.getAttribute("grace") && (name === "note" || name === "chord" || name === "rest")) {
      effectiveNode = node.cloneNode(true) as Element;
      effectiveNode.setAttribute("grace", forcedGrace);
    }

    if (name === "note") {
      pushNoteEvent(effectiveNode, forcedTuplet);
      return;
    }
    if (name === "rest" || name === "space" || name === "mSpace" || name === "mRest") {
      if ((name === "mSpace" || name === "mRest") && !effectiveNode.getAttribute("mks-dur-ticks")) {
        const inferred = inferMeiDurAndDotsFromTicks(measureTicks, divisions);
        effectiveNode = effectiveNode.cloneNode(true) as Element;
        effectiveNode.setAttribute("dur", inferred.dur);
        if (inferred.dots > 0) effectiveNode.setAttribute("dots", String(inferred.dots));
        effectiveNode.setAttribute("mks-dur-div", String(Math.max(1, Math.round(divisions))));
        effectiveNode.setAttribute("mks-dur-480", String(toMksDur480(measureTicks, divisions)));
        effectiveNode.setAttribute("mks-dur-ticks", String(Math.max(1, Math.round(measureTicks))));
      }
      pushRestEvent(effectiveNode, forcedTuplet);
      return;
    }
    if (name === "chord") {
      pushChordEvent(effectiveNode, forcedTuplet);
    }
  };

  for (const child of Array.from(layer.children)) {
    if (child instanceof Element) processElement(child, null, null);
  }
  return { events, idToEventIndex, tieCarryOut: new Map(tieCarryByPitch) };
};

const addSlurNotationToSingleNoteXml = (noteXml: string, type: "start" | "stop", number: number): string => {
  const slurXml = `<slur type="${type}" number="${number}"/>`;
  if (noteXml.includes("<notations>")) {
    return noteXml.replace("</notations>", `${slurXml}</notations>`);
  }
  return noteXml.replace("</note>", `<notations>${slurXml}</notations></note>`);
};

const addTieToSingleNoteXml = (noteXml: string, type: "start" | "stop"): string => {
  const tieXml = `<tie type="${type}"/>`;
  const tiedXml = `<tied type="${type}"/>`;
  const withTie =
    noteXml.includes("<duration>")
      ? noteXml.replace("<duration>", `${tieXml}<duration>`)
      : noteXml.replace("</note>", `${tieXml}</note>`);
  if (withTie.includes("<notations>")) {
    return withTie.replace("</notations>", `${tiedXml}</notations>`);
  }
  return withTie.replace("</note>", `<notations>${tiedXml}</notations></note>`);
};

const addNotationXmlToSingleNoteXml = (noteXml: string, notationXml: string): string => {
  if (noteXml.includes("<notations>")) {
    return noteXml.replace("</notations>", `${notationXml}</notations>`);
  }
  return noteXml.replace("</note>", `<notations>${notationXml}</notations></note>`);
};

const addOrnamentXmlToSingleNoteXml = (noteXml: string, ornamentXml: string): string => {
  if (noteXml.includes("<ornaments>")) {
    return noteXml.replace("</ornaments>", `${ornamentXml}</ornaments>`);
  }
  return addNotationXmlToSingleNoteXml(noteXml, `<ornaments>${ornamentXml}</ornaments>`);
};

const addArticulationXmlToSingleNoteXml = (noteXml: string, articulationXml: string): string => {
  if (noteXml.includes("<articulations>")) {
    return noteXml.replace("</articulations>", `${articulationXml}</articulations>`);
  }
  return addNotationXmlToSingleNoteXml(noteXml, `<articulations>${articulationXml}</articulations>`);
};

const addSlurNotationToEventXml = (eventXml: string, type: "start" | "stop", number: number): string => {
  const firstNoteStart = eventXml.indexOf("<note>");
  if (firstNoteStart < 0) return eventXml;
  const firstNoteEnd = eventXml.indexOf("</note>", firstNoteStart);
  if (firstNoteEnd < 0) return eventXml;
  const before = eventXml.slice(0, firstNoteStart);
  const noteBlock = eventXml.slice(firstNoteStart, firstNoteEnd + "</note>".length);
  const after = eventXml.slice(firstNoteEnd + "</note>".length);
  return before + addSlurNotationToSingleNoteXml(noteBlock, type, number) + after;
};

const addTieNotationToEventXml = (eventXml: string, type: "start" | "stop"): string => {
  const firstNoteStart = eventXml.indexOf("<note>");
  if (firstNoteStart < 0) return eventXml;
  const firstNoteEnd = eventXml.indexOf("</note>", firstNoteStart);
  if (firstNoteEnd < 0) return eventXml;
  const before = eventXml.slice(0, firstNoteStart);
  const noteBlock = eventXml.slice(firstNoteStart, firstNoteEnd + "</note>".length);
  const after = eventXml.slice(firstNoteEnd + "</note>".length);
  return before + addTieToSingleNoteXml(noteBlock, type) + after;
};

const addTrillNotationToEventXml = (eventXml: string): string => {
  const firstNoteStart = eventXml.indexOf("<note>");
  if (firstNoteStart < 0) return eventXml;
  const firstNoteEnd = eventXml.indexOf("</note>", firstNoteStart);
  if (firstNoteEnd < 0) return eventXml;
  const before = eventXml.slice(0, firstNoteStart);
  const noteBlock = eventXml.slice(firstNoteStart, firstNoteEnd + "</note>".length);
  const after = eventXml.slice(firstNoteEnd + "</note>".length);
  return before + addOrnamentXmlToSingleNoteXml(noteBlock, "<trill-mark/>") + after;
};

const addFermataNotationToEventXml = (eventXml: string, isBelow: boolean): string => {
  const firstNoteStart = eventXml.indexOf("<note>");
  if (firstNoteStart < 0) return eventXml;
  const firstNoteEnd = eventXml.indexOf("</note>", firstNoteStart);
  if (firstNoteEnd < 0) return eventXml;
  const before = eventXml.slice(0, firstNoteStart);
  const noteBlock = eventXml.slice(firstNoteStart, firstNoteEnd + "</note>".length);
  const after = eventXml.slice(firstNoteEnd + "</note>".length);
  const typeAttr = isBelow ? ' type="inverted"' : "";
  return before + addNotationXmlToSingleNoteXml(noteBlock, `<fermata${typeAttr}/>`)+ after;
};

const addGlissNotationToEventXml = (eventXml: string, type: "start" | "stop", number: number): string => {
  const firstNoteStart = eventXml.indexOf("<note>");
  if (firstNoteStart < 0) return eventXml;
  const firstNoteEnd = eventXml.indexOf("</note>", firstNoteStart);
  if (firstNoteEnd < 0) return eventXml;
  const before = eventXml.slice(0, firstNoteStart);
  const noteBlock = eventXml.slice(firstNoteStart, firstNoteEnd + "</note>".length);
  const after = eventXml.slice(firstNoteEnd + "</note>".length);
  return before + addNotationXmlToSingleNoteXml(noteBlock, `<glissando type="${type}" number="${number}"/>`) + after;
};

const addSlideNotationToEventXml = (eventXml: string, type: "start" | "stop", number: number): string => {
  const firstNoteStart = eventXml.indexOf("<note>");
  if (firstNoteStart < 0) return eventXml;
  const firstNoteEnd = eventXml.indexOf("</note>", firstNoteStart);
  if (firstNoteEnd < 0) return eventXml;
  const before = eventXml.slice(0, firstNoteStart);
  const noteBlock = eventXml.slice(firstNoteStart, firstNoteEnd + "</note>".length);
  const after = eventXml.slice(firstNoteEnd + "</note>".length);
  return before + addNotationXmlToSingleNoteXml(noteBlock, `<slide type="${type}" number="${number}"/>`) + after;
};

const addTurnNotationToEventXml = (eventXml: string, isInverted: boolean): string => {
  const firstNoteStart = eventXml.indexOf("<note>");
  if (firstNoteStart < 0) return eventXml;
  const firstNoteEnd = eventXml.indexOf("</note>", firstNoteStart);
  if (firstNoteEnd < 0) return eventXml;
  const before = eventXml.slice(0, firstNoteStart);
  const noteBlock = eventXml.slice(firstNoteStart, firstNoteEnd + "</note>".length);
  const after = eventXml.slice(firstNoteEnd + "</note>".length);
  return before + addOrnamentXmlToSingleNoteXml(noteBlock, isInverted ? "<inverted-turn/>" : "<turn/>") + after;
};

const addMordentNotationToEventXml = (eventXml: string, isInverted: boolean): string => {
  const firstNoteStart = eventXml.indexOf("<note>");
  if (firstNoteStart < 0) return eventXml;
  const firstNoteEnd = eventXml.indexOf("</note>", firstNoteStart);
  if (firstNoteEnd < 0) return eventXml;
  const before = eventXml.slice(0, firstNoteStart);
  const noteBlock = eventXml.slice(firstNoteStart, firstNoteEnd + "</note>".length);
  const after = eventXml.slice(firstNoteEnd + "</note>".length);
  return before + addOrnamentXmlToSingleNoteXml(noteBlock, isInverted ? "<inverted-mordent/>" : "<mordent/>") + after;
};

const addBreathNotationToEventXml = (eventXml: string): string => {
  const firstNoteStart = eventXml.indexOf("<note>");
  if (firstNoteStart < 0) return eventXml;
  const firstNoteEnd = eventXml.indexOf("</note>", firstNoteStart);
  if (firstNoteEnd < 0) return eventXml;
  const before = eventXml.slice(0, firstNoteStart);
  const noteBlock = eventXml.slice(firstNoteStart, firstNoteEnd + "</note>".length);
  const after = eventXml.slice(firstNoteEnd + "</note>".length);
  return before + addArticulationXmlToSingleNoteXml(noteBlock, "<breath-mark/>") + after;
};

const addCaesuraNotationToEventXml = (eventXml: string): string => {
  const firstNoteStart = eventXml.indexOf("<note>");
  if (firstNoteStart < 0) return eventXml;
  const firstNoteEnd = eventXml.indexOf("</note>", firstNoteStart);
  if (firstNoteEnd < 0) return eventXml;
  const before = eventXml.slice(0, firstNoteStart);
  const noteBlock = eventXml.slice(firstNoteStart, firstNoteEnd + "</note>".length);
  const after = eventXml.slice(firstNoteEnd + "</note>".length);
  return before + addArticulationXmlToSingleNoteXml(noteBlock, "<caesura/>") + after;
};

const addTupletNotationToEventXml = (eventXml: string, type: "start" | "stop", number: number): string => {
  const firstNoteStart = eventXml.indexOf("<note>");
  if (firstNoteStart < 0) return eventXml;
  const firstNoteEnd = eventXml.indexOf("</note>", firstNoteStart);
  if (firstNoteEnd < 0) return eventXml;
  const before = eventXml.slice(0, firstNoteStart);
  const noteBlock = eventXml.slice(firstNoteStart, firstNoteEnd + "</note>".length);
  const after = eventXml.slice(firstNoteEnd + "</note>".length);
  return before + addNotationXmlToSingleNoteXml(noteBlock, `<tuplet type="${type}" number="${number}"/>`) + after;
};

const addBeamToSingleNoteXml = (noteXml: string, value: "begin" | "continue" | "end", number = 1): string => {
  if (noteXml.includes(`<beam number="${number}">`)) return noteXml;
  return noteXml.replace("</note>", `<beam number="${number}">${value}</beam></note>`);
};

const addBeamToEventXml = (eventXml: string, value: "begin" | "continue" | "end", number = 1): string => {
  const firstNoteStart = eventXml.indexOf("<note>");
  if (firstNoteStart < 0) return eventXml;
  const firstNoteEnd = eventXml.indexOf("</note>", firstNoteStart);
  if (firstNoteEnd < 0) return eventXml;
  const before = eventXml.slice(0, firstNoteStart);
  const noteBlock = eventXml.slice(firstNoteStart, firstNoteEnd + "</note>".length);
  const after = eventXml.slice(firstNoteEnd + "</note>".length);
  return before + addBeamToSingleNoteXml(noteBlock, value, number) + after;
};

const parseMeiTstampToTicks = (
  tstamp: string | null,
  divisions: number,
  beatType: number
): number | null => {
  const raw = String(tstamp || "").trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const beatPos = Number.parseFloat(raw);
  if (!Number.isFinite(beatPos) || beatPos < 1) return null;
  const ticksPerBeat = Math.max(1, (4 * divisions) / Math.max(1, beatType));
  return Math.max(0, Math.round((beatPos - 1) * ticksPerBeat));
};

const resolveEventIndexByTstamp = (events: ParsedMeiEvent[], targetTick: number): number | null => {
  if (!Number.isFinite(targetTick) || targetTick < 0) return null;
  let cursor = 0;
  let lastPitchedIndex: number | null = null;
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (event.kind !== "rest") {
      lastPitchedIndex = i;
      if (cursor >= targetTick) return i;
    }
    cursor += Math.max(0, event.durationTicks);
  }
  return lastPitchedIndex;
};

const resolveEventStartTickByIndex = (events: ParsedMeiEvent[], eventIndex: number): number | null => {
  if (!Number.isInteger(eventIndex) || eventIndex < 0 || eventIndex >= events.length) return null;
  let cursor = 0;
  for (let i = 0; i < events.length; i += 1) {
    if (i === eventIndex) return cursor;
    cursor += Math.max(0, events[i].durationTicks);
  }
  return null;
};

const resolveControlEventEndpointIndex = (
  rawId: string,
  tstamp: string | null,
  idToEventIndex: Map<string, number>,
  events: ParsedMeiEvent[],
  divisions: number,
  beatType: number,
  rawPlist?: string | null,
  idToEventTick?: Map<string, number>
): number | null => {
  const id = rawId.startsWith("#") ? rawId.slice(1) : "";
  if (id) {
    const idx = idToEventIndex.get(id);
    if (Number.isInteger(idx)) return idx as number;
    const tick = idToEventTick?.get(id);
    if (Number.isFinite(tick)) {
      const byTick = resolveEventIndexByTstamp(events, Math.max(0, Math.round(tick as number)));
      if (Number.isInteger(byTick)) return byTick as number;
    }
  }
  const plist = String(rawPlist || "").trim();
  if (plist) {
    const candidates = plist
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) => (token.startsWith("#") ? token.slice(1) : token));
    for (const candidate of candidates) {
      const idx = idToEventIndex.get(candidate);
      if (Number.isInteger(idx)) return idx as number;
      const tick = idToEventTick?.get(candidate);
      if (Number.isFinite(tick)) {
        const byTick = resolveEventIndexByTstamp(events, Math.max(0, Math.round(tick as number)));
        if (Number.isInteger(byTick)) return byTick as number;
      }
    }
  }
  const ticks = parseMeiTstampToTicks(tstamp, divisions, beatType);
  if (ticks === null) return null;
  return resolveEventIndexByTstamp(events, ticks);
};

const DYNAMICS_TAGS = new Set([
  "pppp", "ppp", "pp", "p", "mp", "mf", "f", "ff", "fff", "ffff", "fp", "sf", "sfz", "sffz", "rfz", "rf", "fz",
]);

const parseHarmonyAlter = (token: string): number => {
  const v = token.trim();
  if (v === "#" || v === "♯") return 1;
  if (v === "b" || v === "♭") return -1;
  if (v === "x" || v === "##") return 2;
  return 0;
};

const collectScoreDefsInDocOrder = (root: Element): Element[] =>
  Array.from(root.querySelectorAll("*")).filter(
    (node): node is Element => node instanceof Element && localNameOf(node) === "scoreDef"
  );

const collectStaffDefsInDocOrder = (root: Element): Element[] =>
  Array.from(root.querySelectorAll("*")).filter(
    (node): node is Element => node instanceof Element && localNameOf(node) === "staffDef"
  );

const findEffectiveScoreDefForNode = (node: Element, scoreDefs: Element[]): Element | null => {
  let out: Element | null = null;
  for (const scoreDef of scoreDefs) {
    const relation = scoreDef.compareDocumentPosition(node);
    if ((relation & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 || scoreDef === node) {
      out = scoreDef;
      continue;
    }
    if ((relation & Node.DOCUMENT_POSITION_PRECEDING) !== 0) {
      break;
    }
  }
  return out;
};

const findEffectiveStaffDefForNode = (
  node: Element,
  staffNo: string,
  staffDefs: Element[]
): Element | null => {
  let out: Element | null = null;
  for (const staffDef of staffDefs) {
    const relation = staffDef.compareDocumentPosition(node);
    if ((relation & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 || staffDef === node) {
      const n = (staffDef.getAttribute("n") || "").trim();
      if (!n || n === staffNo) out = staffDef;
      continue;
    }
    if ((relation & Node.DOCUMENT_POSITION_PRECEDING) !== 0) {
      break;
    }
  }
  return out;
};

const parseTransposeFromStaffDefElement = (
  staffDef: Element | null | undefined
): { chromatic?: number; diatonic?: number } | null => {
  if (!staffDef) return null;
  const out: { chromatic?: number; diatonic?: number } = {};
  const diatonic = parseIntSafe(staffDef.getAttribute("trans.diat"), NaN);
  const chromatic = parseIntSafe(staffDef.getAttribute("trans.semi"), NaN);
  if (Number.isFinite(chromatic)) out.chromatic = Math.round(chromatic);
  if (Number.isFinite(diatonic)) out.diatonic = Math.round(diatonic);
  return Object.keys(out).length ? out : null;
};

const parseClefFromScoreDefForStaff = (
  scoreDef: Element | null,
  staffNo: string
): { clefSign: string; clefLine: number } | null => {
  if (!scoreDef) return null;
  const staffDefs = Array.from(scoreDef.querySelectorAll("*")).filter(
    (node): node is Element => node instanceof Element && localNameOf(node) === "staffDef"
  );
  const matched =
    staffDefs.find((staffDef) => (staffDef.getAttribute("n")?.trim() || "") === staffNo)
    ?? staffDefs.find((staffDef) => !staffDef.getAttribute("n"));
  if (!matched) return null;
  const clefFromDef = parseClefFromStaffDefElement(matched);
  if (!clefFromDef) return null;
  const clefSign = clefFromDef.clefSign;
  const clefLine = clefFromDef.clefLine;
  if (!clefSign || !Number.isFinite(clefLine)) return null;
  return { clefSign, clefLine: Math.max(1, Math.round(clefLine)) };
};

const parseClefFromStaffDefElement = (
  staffDef: Element | null | undefined
): { clefSign: string; clefLine: number } | null => {
  if (!staffDef) return null;
  const attrSign = (staffDef.getAttribute("clef.shape")?.trim().toUpperCase() || "").trim();
  const attrLine = parseIntSafe(staffDef.getAttribute("clef.line"), NaN);
  if (attrSign && Number.isFinite(attrLine)) {
    return { clefSign: attrSign, clefLine: Math.max(1, Math.round(attrLine)) };
  }
  const clefChild = childElementsByName(staffDef, "clef")[0];
  if (!clefChild) return null;
  const childSign = (
    clefChild.getAttribute("shape")
    || clefChild.getAttribute("clef.shape")
    || ""
  ).trim().toUpperCase();
  const childLine = parseIntSafe(
    clefChild.getAttribute("line") || clefChild.getAttribute("clef.line"),
    NaN
  );
  if (!childSign || !Number.isFinite(childLine)) return null;
  return { clefSign: childSign, clefLine: Math.max(1, Math.round(childLine)) };
};

const parseKeySigFromScoreDefForStaff = (
  scoreDef: Element | null,
  staffNo: string,
  fallbackFifths: number
): number => {
  if (!scoreDef) return fallbackFifths;
  const staffDefs = Array.from(scoreDef.querySelectorAll("*")).filter(
    (node): node is Element => node instanceof Element && localNameOf(node) === "staffDef"
  );
  const matched =
    staffDefs.find((staffDef) => (staffDef.getAttribute("n")?.trim() || "") === staffNo)
    ?? staffDefs.find((staffDef) => !staffDef.getAttribute("n"));
  const staffFifths = parseMeiKeyFifthsFromElement(matched);
  if (staffFifths !== null) return staffFifths;
  const scoreFifths = parseMeiKeyFifthsFromElement(scoreDef);
  if (scoreFifths !== null) return scoreFifths;
  return fallbackFifths;
};

const parseTransposeFromScoreDefForStaff = (
  scoreDef: Element | null,
  staffNo: string
): { chromatic?: number; diatonic?: number } | null => {
  if (!scoreDef) return null;
  const staffDefs = Array.from(scoreDef.querySelectorAll("*")).filter(
    (node): node is Element => node instanceof Element && localNameOf(node) === "staffDef"
  );
  const matched =
    staffDefs.find((staffDef) => (staffDef.getAttribute("n")?.trim() || "") === staffNo)
    ?? staffDefs.find((staffDef) => !staffDef.getAttribute("n"));
  const out: { chromatic?: number; diatonic?: number } = {};
  const matchedDiatonic = parseIntSafe(matched?.getAttribute("trans.diat"), NaN);
  const matchedChromatic = parseIntSafe(matched?.getAttribute("trans.semi"), NaN);
  if (Number.isFinite(matchedChromatic)) out.chromatic = Math.round(matchedChromatic);
  if (Number.isFinite(matchedDiatonic)) out.diatonic = Math.round(matchedDiatonic);
  if (Object.keys(out).length) return out;
  const scoreDiatonic = parseIntSafe(scoreDef.getAttribute("trans.diat"), NaN);
  const scoreChromatic = parseIntSafe(scoreDef.getAttribute("trans.semi"), NaN);
  if (Number.isFinite(scoreChromatic)) out.chromatic = Math.round(scoreChromatic);
  if (Number.isFinite(scoreDiatonic)) out.diatonic = Math.round(scoreDiatonic);
  return Object.keys(out).length ? out : null;
};

const buildTransposeXml = (transpose: { chromatic?: number; diatonic?: number } | null): string => {
  if (!transpose) return "";
  const chromatic = Number.isFinite(transpose.chromatic) ? Math.round(Number(transpose.chromatic)) : null;
  const diatonic = Number.isFinite(transpose.diatonic) ? Math.round(Number(transpose.diatonic)) : null;
  if (chromatic === null && diatonic === null) return "";
  return `<transpose>${diatonic !== null ? `<diatonic>${diatonic}</diatonic>` : ""}${chromatic !== null ? `<chromatic>${chromatic}</chromatic>` : ""}</transpose>`;
};

const parseMeiHarmText = (
  text: string
): {
  rootStep: string;
  rootAlter?: number;
  kind: string;
  kindText?: string;
  bassStep?: string;
  bassAlter?: number;
  degrees: Array<{ value: number; alter: number }>;
} | null => {
  const raw = text.trim();
  const m = raw.match(/^([A-Ga-g])([#bx♭♯]?)([^/]*)(?:\/([A-Ga-g])([#bx♭♯]?))?$/);
  if (!m) return null;
  const rootStep = m[1].toUpperCase();
  const rootAlter = parseHarmonyAlter(m[2] || "");
  const suffix = (m[3] || "").trim();
  const bassStep = m[4] ? m[4].toUpperCase() : undefined;
  const bassAlter = parseHarmonyAlter(m[5] || "");

  const suffixLower = suffix.toLowerCase();
  let kind = "major";
  let kindText = "";
  if (!suffix) {
    kind = "major";
  } else if (suffixLower === "m" || suffixLower === "min" || suffixLower === "-") {
    kind = "minor";
  } else if (suffixLower === "7") {
    kind = "dominant";
  } else if (suffixLower === "maj7" || suffixLower === "m7+" || suffixLower === "Δ7".toLowerCase()) {
    kind = "major-seventh";
  } else if (suffixLower === "m7" || suffixLower === "min7" || suffixLower === "-7") {
    kind = "minor-seventh";
  } else if (suffixLower === "dim" || suffixLower === "o") {
    kind = "diminished";
  } else if (suffixLower === "aug" || suffixLower === "+") {
    kind = "augmented";
  } else {
    kind = "other";
    kindText = suffix;
  }

  const degrees: Array<{ value: number; alter: number }> = [];
  const degreeRe = /([#b♯♭x]|##)\s*(\d{1,2})/g;
  let dm: RegExpExecArray | null = degreeRe.exec(suffix);
  while (dm) {
    const alter = parseHarmonyAlter(dm[1] || "");
    const value = Number.parseInt(dm[2] || "", 10);
    if (Number.isFinite(value) && value > 0 && alter !== 0) {
      degrees.push({ value: Math.round(value), alter });
    }
    dm = degreeRe.exec(suffix);
  }

  return {
    rootStep,
    rootAlter: rootAlter !== 0 ? rootAlter : undefined,
    kind,
    kindText: kindText || undefined,
    bassStep,
    bassAlter: bassStep && bassAlter !== 0 ? bassAlter : undefined,
    degrees,
  };
};

const buildMusicXmlDirectionFromMeiDynam = (
  dynam: Element,
  divisions: number,
  beatType: number,
  voice: string,
  staffNo: string
): string | null => {
  const rawText = (dynam.textContent || "").trim();
  if (!rawText) return null;
  const normalized = rawText.toLowerCase();
  const placement = (dynam.getAttribute("place") || dynam.getAttribute("placement") || "").trim().toLowerCase();
  const placementAttr = placement === "above" || placement === "below" ? ` placement="${placement}"` : "";
  const offsetTicks = parseMeiTstampToTicks(dynam.getAttribute("tstamp"), divisions, beatType);
  const offsetXml = Number.isFinite(offsetTicks) && (offsetTicks as number) > 0
    ? `<offset>${Math.round(offsetTicks as number)}</offset>`
    : "";
  const directionType = DYNAMICS_TAGS.has(normalized)
    ? `<dynamics><${normalized}/></dynamics>`
    : `<words>${xmlEscape(rawText)}</words>`;
  return `<direction${placementAttr}><direction-type>${directionType}</direction-type>${offsetXml}<voice>${xmlEscape(
    voice
  )}</voice><staff>${xmlEscape(staffNo)}</staff></direction>`;
};

const buildMusicXmlDirectionsFromMeiHairpin = (
  hairpin: Element,
  divisions: number,
  beatType: number,
  voice: string,
  staffNo: string,
  events: ParsedMeiEvent[],
  idToEventIndex: Map<string, number>,
  idToEventTick: Map<string, number>
): string => {
  const formRaw = (hairpin.getAttribute("form") || hairpin.getAttribute("type") || "").trim().toLowerCase();
  const wedgeType = formRaw.includes("dim") || formRaw.includes("decresc") ? "diminuendo" : "crescendo";
  const placement = (hairpin.getAttribute("place") || hairpin.getAttribute("placement") || "").trim().toLowerCase();
  const placementAttr = placement === "above" || placement === "below" ? ` placement="${placement}"` : "";
  const startIndex = resolveControlEventEndpointIndex(
    (hairpin.getAttribute("startid") || "").trim(),
    hairpin.getAttribute("tstamp"),
    idToEventIndex,
    events,
    divisions,
    beatType,
    hairpin.getAttribute("plist"),
    idToEventTick
  );
  const endIndex = resolveControlEventEndpointIndex(
    (hairpin.getAttribute("endid") || "").trim(),
    hairpin.getAttribute("tstamp2"),
    idToEventIndex,
    events,
    divisions,
    beatType,
    undefined,
    idToEventTick
  );
  const startTick = Number.isInteger(startIndex) ? resolveEventStartTickByIndex(events, startIndex as number) : null;
  const endTick = Number.isInteger(endIndex) ? resolveEventStartTickByIndex(events, endIndex as number) : null;
  const startOffsetXml = Number.isFinite(startTick) && (startTick as number) > 0
    ? `<offset>${Math.round(startTick as number)}</offset>`
    : "";
  const endOffsetXml = Number.isFinite(endTick) && (endTick as number) > 0
    ? `<offset>${Math.round(endTick as number)}</offset>`
    : "";
  const startDir = `<direction${placementAttr}><direction-type><wedge type="${wedgeType}"/></direction-type>${startOffsetXml}<voice>${xmlEscape(
    voice
  )}</voice><staff>${xmlEscape(staffNo)}</staff></direction>`;
  const stopDir = `<direction${placementAttr}><direction-type><wedge type="stop"/></direction-type>${endOffsetXml}<voice>${xmlEscape(
    voice
  )}</voice><staff>${xmlEscape(staffNo)}</staff></direction>`;
  return `${startDir}${stopDir}`;
};

const buildMusicXmlDirectionsFromMeiPedal = (
  pedal: Element,
  divisions: number,
  beatType: number,
  voice: string,
  staffNo: string,
  events: ParsedMeiEvent[],
  idToEventIndex: Map<string, number>,
  idToEventTick: Map<string, number>
): string => {
  const placement = (pedal.getAttribute("place") || pedal.getAttribute("placement") || "").trim().toLowerCase();
  const placementAttr = placement === "above" || placement === "below" ? ` placement="${placement}"` : "";
  const semanticRaw = (
    pedal.getAttribute("type")
    || pedal.getAttribute("state")
    || pedal.getAttribute("func")
    || pedal.getAttribute("val")
    || ""
  ).trim().toLowerCase();
  const isExplicitStop =
    semanticRaw.includes("stop")
    || semanticRaw.includes("end")
    || semanticRaw.includes("off")
    || semanticRaw.includes("up")
    || semanticRaw.includes("release");
  const startIndex = resolveControlEventEndpointIndex(
    (pedal.getAttribute("startid") || "").trim(),
    pedal.getAttribute("tstamp"),
    idToEventIndex,
    events,
    divisions,
    beatType,
    pedal.getAttribute("plist"),
    idToEventTick
  );
  const endIndex = resolveControlEventEndpointIndex(
    (pedal.getAttribute("endid") || "").trim(),
    pedal.getAttribute("tstamp2"),
    idToEventIndex,
    events,
    divisions,
    beatType,
    undefined,
    idToEventTick
  );
  const startTick = Number.isInteger(startIndex) ? resolveEventStartTickByIndex(events, startIndex as number) : null;
  const endTick = Number.isInteger(endIndex) ? resolveEventStartTickByIndex(events, endIndex as number) : null;
  const startOffsetXml = Number.isFinite(startTick) && (startTick as number) > 0
    ? `<offset>${Math.round(startTick as number)}</offset>`
    : "";
  const endOffsetXml = Number.isFinite(endTick) && (endTick as number) > 0
    ? `<offset>${Math.round(endTick as number)}</offset>`
    : "";

  if (Number.isInteger(endIndex)) {
    const startDir = `<direction${placementAttr}><direction-type><pedal type="start" number="1" line="yes"/></direction-type>${startOffsetXml}<voice>${xmlEscape(
      voice
    )}</voice><staff>${xmlEscape(staffNo)}</staff></direction>`;
    const stopDir = `<direction${placementAttr}><direction-type><pedal type="stop" number="1" line="yes"/></direction-type>${endOffsetXml}<voice>${xmlEscape(
      voice
    )}</voice><staff>${xmlEscape(staffNo)}</staff></direction>`;
    return `${startDir}${stopDir}`;
  }

  const singleType = isExplicitStop ? "stop" : "start";
  return `<direction${placementAttr}><direction-type><pedal type="${singleType}" number="1" line="yes"/></direction-type>${startOffsetXml}<voice>${xmlEscape(
    voice
  )}</voice><staff>${xmlEscape(staffNo)}</staff></direction>`;
};

const buildMusicXmlDirectionsFromMeiOctave = (
  octave: Element,
  divisions: number,
  beatType: number,
  voice: string,
  staffNo: string,
  events: ParsedMeiEvent[],
  idToEventIndex: Map<string, number>,
  idToEventTick: Map<string, number>
): string => {
  const placement = (octave.getAttribute("place") || octave.getAttribute("placement") || "").trim().toLowerCase();
  const placementAttr = placement === "above" || placement === "below" ? ` placement="${placement}"` : "";
  const semanticRaw = (
    octave.getAttribute("type")
    || octave.getAttribute("state")
    || octave.getAttribute("func")
    || octave.getAttribute("val")
    || ""
  ).trim().toLowerCase();
  const isExplicitStop =
    semanticRaw.includes("stop")
    || semanticRaw.includes("end")
    || semanticRaw.includes("off");
  const disRaw = (octave.getAttribute("dis") || octave.getAttribute("size") || "").trim();
  const dis = Number.parseInt(disRaw, 10);
  const size = Number.isFinite(dis) && dis > 0 ? Math.round(dis) : 8;
  const disPlace = (octave.getAttribute("dis.place") || placement).trim().toLowerCase();
  const shiftType = disPlace === "below" ? "down" : "up";
  const startIndex = resolveControlEventEndpointIndex(
    (octave.getAttribute("startid") || "").trim(),
    octave.getAttribute("tstamp"),
    idToEventIndex,
    events,
    divisions,
    beatType,
    octave.getAttribute("plist"),
    idToEventTick
  );
  const endIndex = resolveControlEventEndpointIndex(
    (octave.getAttribute("endid") || "").trim(),
    octave.getAttribute("tstamp2"),
    idToEventIndex,
    events,
    divisions,
    beatType,
    undefined,
    idToEventTick
  );
  const startTick = Number.isInteger(startIndex) ? resolveEventStartTickByIndex(events, startIndex as number) : null;
  const endTick = Number.isInteger(endIndex) ? resolveEventStartTickByIndex(events, endIndex as number) : null;
  const startOffsetXml = Number.isFinite(startTick) && (startTick as number) > 0
    ? `<offset>${Math.round(startTick as number)}</offset>`
    : "";
  const endOffsetXml = Number.isFinite(endTick) && (endTick as number) > 0
    ? `<offset>${Math.round(endTick as number)}</offset>`
    : "";

  if (Number.isInteger(endIndex)) {
    const startDir = `<direction${placementAttr}><direction-type><octave-shift type="${shiftType}" size="${size}" number="1"/></direction-type>${startOffsetXml}<voice>${xmlEscape(
      voice
    )}</voice><staff>${xmlEscape(staffNo)}</staff></direction>`;
    const stopDir = `<direction${placementAttr}><direction-type><octave-shift type="stop" size="${size}" number="1"/></direction-type>${endOffsetXml}<voice>${xmlEscape(
      voice
    )}</voice><staff>${xmlEscape(staffNo)}</staff></direction>`;
    return `${startDir}${stopDir}`;
  }

  const singleType = isExplicitStop ? "stop" : shiftType;
  return `<direction${placementAttr}><direction-type><octave-shift type="${singleType}" size="${size}" number="1"/></direction-type>${startOffsetXml}<voice>${xmlEscape(
    voice
  )}</voice><staff>${xmlEscape(staffNo)}</staff></direction>`;
};

const buildMusicXmlDirectionFromMeiRepeatMark = (
  repeatMark: Element,
  divisions: number,
  beatType: number,
  voice: string,
  staffNo: string,
  events: ParsedMeiEvent[],
  idToEventIndex: Map<string, number>,
  idToEventTick: Map<string, number>
): string | null => {
  const textRaw = (
    repeatMark.getAttribute("func")
    || repeatMark.getAttribute("type")
    || repeatMark.getAttribute("label")
    || repeatMark.textContent
    || ""
  ).trim();
  if (!textRaw) return null;
  const normalized = textRaw.toLowerCase();
  const placement = (repeatMark.getAttribute("place") || repeatMark.getAttribute("placement") || "").trim().toLowerCase();
  const placementAttr = placement === "above" || placement === "below" ? ` placement="${placement}"` : "";
  const startIndex = resolveControlEventEndpointIndex(
    (repeatMark.getAttribute("startid") || "").trim(),
    repeatMark.getAttribute("tstamp"),
    idToEventIndex,
    events,
    divisions,
    beatType,
    repeatMark.getAttribute("plist"),
    idToEventTick
  );
  const startTick = Number.isInteger(startIndex) ? resolveEventStartTickByIndex(events, startIndex as number) : null;
  const offsetXml = Number.isFinite(startTick) && (startTick as number) > 0
    ? `<offset>${Math.round(startTick as number)}</offset>`
    : "";

  let directionType = `<words>${xmlEscape(textRaw)}</words>`;
  if (normalized.includes("segno")) directionType = "<segno/>";
  else if (normalized.includes("coda")) directionType = "<coda/>";
  else if (normalized.includes("fine")) directionType = "<words>Fine</words>";
  else if (normalized.includes("dacapo") || normalized.includes("da capo") || normalized.includes("d.c.")) directionType = "<words>D.C.</words>";
  else if (normalized.includes("dalsegno") || normalized.includes("dal segno") || normalized.includes("d.s.")) directionType = "<words>D.S.</words>";

  return `<direction${placementAttr}><direction-type>${directionType}</direction-type>${offsetXml}<voice>${xmlEscape(
    voice
  )}</voice><staff>${xmlEscape(staffNo)}</staff></direction>`;
};

const buildMusicXmlHarmonyFromMeiHarm = (
  harm: Element,
  divisions: number,
  beatType: number,
  staffNo: string,
  events: ParsedMeiEvent[],
  idToEventIndex: Map<string, number>,
  idToEventTick: Map<string, number>
): string | null => {
  const raw = (harm.textContent || harm.getAttribute("type") || harm.getAttribute("label") || "").trim();
  if (!raw) return null;
  const parsed = parseMeiHarmText(raw);
  if (!parsed) {
    return `<harmony><kind text="${xmlEscape(raw)}">other</kind><staff>${xmlEscape(staffNo)}</staff></harmony>`;
  }
  const rootXml = `<root><root-step>${xmlEscape(parsed.rootStep)}</root-step>${Number.isFinite(parsed.rootAlter) ? `<root-alter>${Math.round(parsed.rootAlter as number)}</root-alter>` : ""}</root>`;
  const kindXml = parsed.kindText
    ? `<kind text="${xmlEscape(parsed.kindText)}">${xmlEscape(parsed.kind)}</kind>`
    : `<kind>${xmlEscape(parsed.kind)}</kind>`;
  const bassXml = parsed.bassStep
    ? `<bass><bass-step>${xmlEscape(parsed.bassStep)}</bass-step>${Number.isFinite(parsed.bassAlter) ? `<bass-alter>${Math.round(parsed.bassAlter as number)}</bass-alter>` : ""}</bass>`
    : "";
  const degreeXml = parsed.degrees
    .map((deg) => `<degree><degree-value>${deg.value}</degree-value><degree-alter>${deg.alter}</degree-alter><degree-type>add</degree-type></degree>`)
    .join("");
  const startIndex = resolveControlEventEndpointIndex(
    (harm.getAttribute("startid") || "").trim(),
    harm.getAttribute("tstamp"),
    idToEventIndex,
    events,
    divisions,
    beatType,
    harm.getAttribute("plist"),
    idToEventTick
  );
  const startTick = Number.isInteger(startIndex) ? resolveEventStartTickByIndex(events, startIndex as number) : null;
  const offsetXml = Number.isFinite(startTick) && (startTick as number) > 0
    ? `<offset>${Math.round(startTick as number)}</offset>`
    : "";
  return `<harmony>${rootXml}${kindXml}${bassXml}${degreeXml}${offsetXml}<staff>${xmlEscape(staffNo)}</staff></harmony>`;
};

const collectLayerHarmonyXml = (
  staff: Element,
  layer: Element,
  divisions: number,
  beatType: number,
  events: ParsedMeiEvent[],
  idToEventIndex: Map<string, number>,
  idToEventTick: Map<string, number>
): string => {
  const staffNo = (staff.getAttribute("n") || "1").trim() || "1";
  const harms = [...childElementsByName(layer, "harm"), ...childElementsByName(staff, "harm")];
  const out: string[] = [];
  for (const harm of harms) {
    const xml = buildMusicXmlHarmonyFromMeiHarm(harm, divisions, beatType, staffNo, events, idToEventIndex, idToEventTick);
    if (xml) out.push(xml);
  }
  return out.join("");
};

const parseMeiTargetList = (raw: string): string[] => {
  const value = String(raw || "").trim();
  if (!value) return [];
  return value
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
};

const controlEventAppliesToLayer = (
  control: Element,
  staffNo: string,
  layerNo: string,
  primaryLayerNo: string
): boolean => {
  const staffTargets = parseMeiTargetList(control.getAttribute("staff") || "");
  if (staffTargets.length > 0 && !staffTargets.includes(staffNo)) return false;

  const layerTargets = parseMeiTargetList(control.getAttribute("layer") || "");
  if (layerTargets.length > 0) return layerTargets.includes(layerNo);

  // Unscoped staff/measure-level controls should be emitted once (primary layer only).
  const parent = control.parentElement;
  const parentName = parent ? localNameOf(parent) : "";
  if (parentName === "staff" || parentName === "measure") {
    return layerNo === primaryLayerNo;
  }
  return true;
};

const collectControlEventsForLayer = (
  name: string,
  staff: Element,
  layer: Element,
  staffNo: string,
  layerNo: string,
  primaryLayerNo: string
): Element[] => {
  const measure = staff.parentElement && localNameOf(staff.parentElement) === "measure" ? staff.parentElement : null;
  const controls = [
    ...childElementsByName(layer, name),
    ...childElementsByName(staff, name),
    ...(measure ? childElementsByName(measure, name) : []),
  ];
  return controls.filter((control) => controlEventAppliesToLayer(control, staffNo, layerNo, primaryLayerNo));
};

const collectLayerDirectionXml = (
  staff: Element,
  layer: Element,
  divisions: number,
  beatType: number,
  voice: string,
  events: ParsedMeiEvent[],
  idToEventIndex: Map<string, number>,
  idToEventTick: Map<string, number>
): string => {
  const staffNo = (staff.getAttribute("n") || "1").trim() || "1";
  const layerNo = (layer.getAttribute("n") || "1").trim() || "1";
  const primaryLayerNo = (childElementsByName(staff, "layer")[0]?.getAttribute("n") || "1").trim() || "1";
  const dyns = collectControlEventsForLayer("dynam", staff, layer, staffNo, layerNo, primaryLayerNo);
  const hairpins = collectControlEventsForLayer("hairpin", staff, layer, staffNo, layerNo, primaryLayerNo);
  const pedals = collectControlEventsForLayer("pedal", staff, layer, staffNo, layerNo, primaryLayerNo);
  const octaves = collectControlEventsForLayer("octave", staff, layer, staffNo, layerNo, primaryLayerNo);
  const repeatMarks = collectControlEventsForLayer("repeatMark", staff, layer, staffNo, layerNo, primaryLayerNo);
  const out: string[] = [];
  for (const dynam of dyns) {
    const xml = buildMusicXmlDirectionFromMeiDynam(dynam, divisions, beatType, voice, staffNo);
    if (xml) out.push(xml);
  }
  for (const hairpin of hairpins) {
    const xml = buildMusicXmlDirectionsFromMeiHairpin(
      hairpin,
      divisions,
      beatType,
      voice,
      staffNo,
      events,
      idToEventIndex,
      idToEventTick
    );
    if (xml) out.push(xml);
  }
  for (const pedal of pedals) {
    const xml = buildMusicXmlDirectionsFromMeiPedal(
      pedal,
      divisions,
      beatType,
      voice,
      staffNo,
      events,
      idToEventIndex,
      idToEventTick
    );
    if (xml) out.push(xml);
  }
  for (const octave of octaves) {
    const xml = buildMusicXmlDirectionsFromMeiOctave(
      octave,
      divisions,
      beatType,
      voice,
      staffNo,
      events,
      idToEventIndex,
      idToEventTick
    );
    if (xml) out.push(xml);
  }
  for (const repeatMark of repeatMarks) {
    const xml = buildMusicXmlDirectionFromMeiRepeatMark(
      repeatMark,
      divisions,
      beatType,
      voice,
      staffNo,
      events,
      idToEventIndex,
      idToEventTick
    );
    if (xml) out.push(xml);
  }
  return out.join("");
};

const applyStaffSlurControlEvents = (
  staff: Element,
  layer: Element,
  layerEvents: ParsedMeiEvent[],
  idToEventIndex: Map<string, number>,
  idToEventTick: Map<string, number>,
  divisions: number,
  beatType: number
): ParsedMeiEvent[] => {
  if (layerEvents.length === 0) return layerEvents;
  const out = layerEvents.slice();
  const slurs = [...childElementsByName(layer, "slur"), ...childElementsByName(staff, "slur")];
  let slurNumber = 1;
  for (const slur of slurs) {
    const startIdRaw = (slur.getAttribute("startid") || "").trim();
    const endIdRaw = (slur.getAttribute("endid") || "").trim();
    const startIndex = resolveControlEventEndpointIndex(
      startIdRaw,
      slur.getAttribute("tstamp"),
      idToEventIndex,
      out,
      divisions,
      beatType,
      slur.getAttribute("plist"),
      idToEventTick
    );
    const endIndex = resolveControlEventEndpointIndex(
      endIdRaw,
      slur.getAttribute("tstamp2"),
      idToEventIndex,
      out,
      divisions,
      beatType,
      undefined,
      idToEventTick
    );
    if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) continue;
    if (startIndex! < 0 || endIndex! < 0 || startIndex! >= out.length || endIndex! >= out.length) continue;
    const startEvent = out[startIndex!];
    const endEvent = out[endIndex!];
    if (startEvent.kind !== "rest") {
      out[startIndex!] = { ...startEvent, xml: addSlurNotationToEventXml(startEvent.xml, "start", slurNumber) };
    }
    if (endEvent.kind !== "rest") {
      out[endIndex!] = { ...endEvent, xml: addSlurNotationToEventXml(endEvent.xml, "stop", slurNumber) };
    }
    slurNumber += 1;
  }
  const ties = [...childElementsByName(layer, "tie"), ...childElementsByName(staff, "tie")];
  for (const tie of ties) {
    const startIdRaw = (tie.getAttribute("startid") || "").trim();
    const endIdRaw = (tie.getAttribute("endid") || "").trim();
    const startIndex = resolveControlEventEndpointIndex(
      startIdRaw,
      tie.getAttribute("tstamp"),
      idToEventIndex,
      out,
      divisions,
      beatType,
      tie.getAttribute("plist"),
      idToEventTick
    );
    const endIndex = resolveControlEventEndpointIndex(
      endIdRaw,
      tie.getAttribute("tstamp2"),
      idToEventIndex,
      out,
      divisions,
      beatType,
      undefined,
      idToEventTick
    );
    if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) continue;
    if (startIndex! < 0 || endIndex! < 0 || startIndex! >= out.length || endIndex! >= out.length) continue;
    const startEvent = out[startIndex!];
    const endEvent = out[endIndex!];
    if (startEvent.kind !== "rest") {
      out[startIndex!] = { ...startEvent, xml: addTieNotationToEventXml(startEvent.xml, "start") };
    }
    if (endEvent.kind !== "rest") {
      out[endIndex!] = { ...endEvent, xml: addTieNotationToEventXml(endEvent.xml, "stop") };
    }
  }
  const trills = [...childElementsByName(layer, "trill"), ...childElementsByName(staff, "trill")];
  for (const trill of trills) {
    const startIndex = resolveControlEventEndpointIndex(
      (trill.getAttribute("startid") || "").trim(),
      trill.getAttribute("tstamp"),
      idToEventIndex,
      out,
      divisions,
      beatType,
      trill.getAttribute("plist"),
      idToEventTick
    );
    if (!Number.isInteger(startIndex)) continue;
    if (startIndex! < 0 || startIndex! >= out.length) continue;
    const startEvent = out[startIndex!];
    if (startEvent.kind !== "rest") {
      out[startIndex!] = { ...startEvent, xml: addTrillNotationToEventXml(startEvent.xml) };
    }
  }
  const fermatas = [...childElementsByName(layer, "fermata"), ...childElementsByName(staff, "fermata")];
  for (const fermata of fermatas) {
    const startIndex = resolveControlEventEndpointIndex(
      (fermata.getAttribute("startid") || "").trim(),
      fermata.getAttribute("tstamp"),
      idToEventIndex,
      out,
      divisions,
      beatType,
      fermata.getAttribute("plist"),
      idToEventTick
    );
    if (!Number.isInteger(startIndex)) continue;
    if (startIndex! < 0 || startIndex! >= out.length) continue;
    const startEvent = out[startIndex!];
    const placement = (fermata.getAttribute("place") || fermata.getAttribute("placement") || "").trim().toLowerCase();
    if (startEvent.kind !== "rest") {
      out[startIndex!] = {
        ...startEvent,
        xml: addFermataNotationToEventXml(startEvent.xml, placement === "below"),
      };
    }
  }
  const turns = [...childElementsByName(layer, "turn"), ...childElementsByName(staff, "turn")];
  for (const turn of turns) {
    const startIndex = resolveControlEventEndpointIndex(
      (turn.getAttribute("startid") || "").trim(),
      turn.getAttribute("tstamp"),
      idToEventIndex,
      out,
      divisions,
      beatType,
      turn.getAttribute("plist"),
      idToEventTick
    );
    if (!Number.isInteger(startIndex)) continue;
    if (startIndex! < 0 || startIndex! >= out.length) continue;
    const startEvent = out[startIndex!];
    const turnType = (turn.getAttribute("type") || turn.getAttribute("form") || "").trim().toLowerCase();
    const isInverted = turnType.includes("inv") || turnType.includes("lower") || turnType.includes("down");
    if (startEvent.kind !== "rest") {
      out[startIndex!] = { ...startEvent, xml: addTurnNotationToEventXml(startEvent.xml, isInverted) };
    }
  }
  const mordents = [...childElementsByName(layer, "mordent"), ...childElementsByName(staff, "mordent")];
  for (const mordent of mordents) {
    const startIndex = resolveControlEventEndpointIndex(
      (mordent.getAttribute("startid") || "").trim(),
      mordent.getAttribute("tstamp"),
      idToEventIndex,
      out,
      divisions,
      beatType,
      mordent.getAttribute("plist"),
      idToEventTick
    );
    if (!Number.isInteger(startIndex)) continue;
    if (startIndex! < 0 || startIndex! >= out.length) continue;
    const startEvent = out[startIndex!];
    const mordentType = (mordent.getAttribute("type") || mordent.getAttribute("form") || "").trim().toLowerCase();
    const isInverted = mordentType.includes("inv") || mordentType.includes("lower") || mordentType.includes("down");
    if (startEvent.kind !== "rest") {
      out[startIndex!] = { ...startEvent, xml: addMordentNotationToEventXml(startEvent.xml, isInverted) };
    }
  }
  const breaths = [...childElementsByName(layer, "breath"), ...childElementsByName(staff, "breath")];
  for (const breath of breaths) {
    const startIndex = resolveControlEventEndpointIndex(
      (breath.getAttribute("startid") || "").trim(),
      breath.getAttribute("tstamp"),
      idToEventIndex,
      out,
      divisions,
      beatType,
      breath.getAttribute("plist"),
      idToEventTick
    );
    if (!Number.isInteger(startIndex)) continue;
    if (startIndex! < 0 || startIndex! >= out.length) continue;
    const startEvent = out[startIndex!];
    if (startEvent.kind !== "rest") {
      out[startIndex!] = { ...startEvent, xml: addBreathNotationToEventXml(startEvent.xml) };
    }
  }
  const caesuras = [...childElementsByName(layer, "caesura"), ...childElementsByName(staff, "caesura")];
  for (const caesura of caesuras) {
    const startIndex = resolveControlEventEndpointIndex(
      (caesura.getAttribute("startid") || "").trim(),
      caesura.getAttribute("tstamp"),
      idToEventIndex,
      out,
      divisions,
      beatType,
      caesura.getAttribute("plist"),
      idToEventTick
    );
    if (!Number.isInteger(startIndex)) continue;
    if (startIndex! < 0 || startIndex! >= out.length) continue;
    const startEvent = out[startIndex!];
    if (startEvent.kind !== "rest") {
      out[startIndex!] = { ...startEvent, xml: addCaesuraNotationToEventXml(startEvent.xml) };
    }
  }
  const tupletSpans = [...childElementsByName(layer, "tupletSpan"), ...childElementsByName(staff, "tupletSpan")];
  let tupletNumber = 1;
  const beamSpans = [...childElementsByName(layer, "beamSpan"), ...childElementsByName(staff, "beamSpan")];
  for (const beamSpan of beamSpans) {
    const startIndex = resolveControlEventEndpointIndex(
      (beamSpan.getAttribute("startid") || "").trim(),
      beamSpan.getAttribute("tstamp"),
      idToEventIndex,
      out,
      divisions,
      beatType,
      beamSpan.getAttribute("plist")
    );
    const endIndex = resolveControlEventEndpointIndex(
      (beamSpan.getAttribute("endid") || "").trim(),
      beamSpan.getAttribute("tstamp2"),
      idToEventIndex,
      out,
      divisions,
      beatType
    );
    if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) continue;
    if (startIndex! < 0 || endIndex! < 0 || startIndex! >= out.length || endIndex! >= out.length) continue;

    const plistRaw = String(beamSpan.getAttribute("plist") || "").trim();
    const plistIndexes = plistRaw
      ? plistRaw
          .split(/\s+/)
          .map((token) => token.trim())
          .filter(Boolean)
          .map((token) => (token.startsWith("#") ? token.slice(1) : token))
          .map((id) => idToEventIndex.get(id))
          .filter((idx): idx is number => Number.isInteger(idx))
      : [];

    const spanIndexes = plistIndexes.length > 0
      ? plistIndexes
      : (() => {
          const from = Math.min(startIndex as number, endIndex as number);
          const to = Math.max(startIndex as number, endIndex as number);
          const arr: number[] = [];
          for (let i = from; i <= to; i += 1) arr.push(i);
          return arr;
        })();

    const pitchedIndexes = spanIndexes.filter((idx) => idx >= 0 && idx < out.length && out[idx].kind !== "rest");
    if (pitchedIndexes.length < 2) continue;

    for (let i = 0; i < pitchedIndexes.length; i += 1) {
      const idx = pitchedIndexes[i];
      const value: "begin" | "continue" | "end" =
        i === 0 ? "begin" : i === pitchedIndexes.length - 1 ? "end" : "continue";
      out[idx] = { ...out[idx], xml: addBeamToEventXml(out[idx].xml, value, 1) };
    }
  }

  for (const tupletSpan of tupletSpans) {
    const startIndex = resolveControlEventEndpointIndex(
      (tupletSpan.getAttribute("startid") || "").trim(),
      tupletSpan.getAttribute("tstamp"),
      idToEventIndex,
      out,
      divisions,
      beatType,
      tupletSpan.getAttribute("plist"),
      idToEventTick
    );
    const endIndex = resolveControlEventEndpointIndex(
      (tupletSpan.getAttribute("endid") || "").trim(),
      tupletSpan.getAttribute("tstamp2"),
      idToEventIndex,
      out,
      divisions,
      beatType,
      undefined,
      idToEventTick
    );
    if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) continue;
    if (startIndex! < 0 || endIndex! < 0 || startIndex! >= out.length || endIndex! >= out.length) continue;
    const startEvent = out[startIndex!];
    const endEvent = out[endIndex!];
    if (startEvent.kind !== "rest") {
      out[startIndex!] = { ...startEvent, xml: addTupletNotationToEventXml(startEvent.xml, "start", tupletNumber) };
    }
    if (endEvent.kind !== "rest") {
      out[endIndex!] = { ...endEvent, xml: addTupletNotationToEventXml(endEvent.xml, "stop", tupletNumber) };
    }
    tupletNumber += 1;
  }
  const glissandi = [...childElementsByName(layer, "gliss"), ...childElementsByName(staff, "gliss")];
  let glissNumber = 1;
  for (const gliss of glissandi) {
    const startIndex = resolveControlEventEndpointIndex(
      (gliss.getAttribute("startid") || "").trim(),
      gliss.getAttribute("tstamp"),
      idToEventIndex,
      out,
      divisions,
      beatType,
      gliss.getAttribute("plist"),
      idToEventTick
    );
    const endIndex = resolveControlEventEndpointIndex(
      (gliss.getAttribute("endid") || "").trim(),
      gliss.getAttribute("tstamp2"),
      idToEventIndex,
      out,
      divisions,
      beatType,
      undefined,
      idToEventTick
    );
    if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) continue;
    if (startIndex! < 0 || endIndex! < 0 || startIndex! >= out.length || endIndex! >= out.length) continue;
    const startEvent = out[startIndex!];
    const endEvent = out[endIndex!];
    if (startEvent.kind !== "rest") {
      out[startIndex!] = { ...startEvent, xml: addGlissNotationToEventXml(startEvent.xml, "start", glissNumber) };
    }
    if (endEvent.kind !== "rest") {
      out[endIndex!] = { ...endEvent, xml: addGlissNotationToEventXml(endEvent.xml, "stop", glissNumber) };
    }
    glissNumber += 1;
  }
  const slides = [...childElementsByName(layer, "slide"), ...childElementsByName(staff, "slide")];
  let slideNumber = 1;
  for (const slide of slides) {
    const startIndex = resolveControlEventEndpointIndex(
      (slide.getAttribute("startid") || "").trim(),
      slide.getAttribute("tstamp"),
      idToEventIndex,
      out,
      divisions,
      beatType,
      slide.getAttribute("plist"),
      idToEventTick
    );
    const endIndex = resolveControlEventEndpointIndex(
      (slide.getAttribute("endid") || "").trim(),
      slide.getAttribute("tstamp2"),
      idToEventIndex,
      out,
      divisions,
      beatType,
      undefined,
      idToEventTick
    );
    if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)) continue;
    if (startIndex! < 0 || endIndex! < 0 || startIndex! >= out.length || endIndex! >= out.length) continue;
    const startEvent = out[startIndex!];
    const endEvent = out[endIndex!];
    if (startEvent.kind !== "rest") {
      out[startIndex!] = { ...startEvent, xml: addSlideNotationToEventXml(startEvent.xml, "start", slideNumber) };
    }
    if (endEvent.kind !== "rest") {
      out[endIndex!] = { ...endEvent, xml: addSlideNotationToEventXml(endEvent.xml, "stop", slideNumber) };
    }
    slideNumber += 1;
  }
  return out;
};

const applyTieCarryAccidentalsForLayerEvents = (
  events: ParsedMeiEvent[],
  tieCarryIn: Map<string, number>
): { events: ParsedMeiEvent[]; tieCarryOut: Map<string, number> } => {
  if (events.length === 0) {
    return { events, tieCarryOut: new Map(tieCarryIn) };
  }
  const tieCarryByPitch = new Map<string, number>(tieCarryIn);
  const tiePitchKey = (pname: string, octave: number): string =>
    `${String(pname || "").trim().toUpperCase()}:${Math.round(Number(octave) || 0)}`;

  const out = events.map((event) => {
    if (event.kind === "rest") return event;
    if (!event.xml.includes("<note>")) return event;

    const wrapped = `<root>${event.xml}</root>`;
    const parsed = new DOMParser().parseFromString(wrapped, "application/xml");
    const root = parsed.documentElement;
    if (!root || localNameOf(root) !== "root") return event;
    const noteNodes = Array.from(root.querySelectorAll(":scope > note"));
    if (noteNodes.length === 0) return event;

    let changed = false;
    for (const noteNode of noteNodes) {
      const step = (noteNode.querySelector(":scope > pitch > step")?.textContent || "").trim().toUpperCase();
      const octave = parseIntSafe(noteNode.querySelector(":scope > pitch > octave")?.textContent, NaN);
      if (!/^[A-G]$/.test(step) || !Number.isFinite(octave)) continue;
      const pitchKey = tiePitchKey(step, octave);
      const pitchNode = noteNode.querySelector(":scope > pitch");
      if (!pitchNode) continue;

      const tieTypes = Array.from(noteNode.querySelectorAll(":scope > tie"))
        .map((tie) => (tie.getAttribute("type") || "").trim().toLowerCase());
      const hasStart = tieTypes.includes("start");
      const hasStop = tieTypes.includes("stop");

      let alterNode = noteNode.querySelector(":scope > pitch > alter");
      const alterMissing = alterNode === null;
      if (hasStop && alterMissing) {
        const carryAlter = tieCarryByPitch.get(pitchKey);
        if (Number.isFinite(carryAlter)) {
          const newAlter = parsed.createElement("alter");
          newAlter.textContent = String(Math.round(carryAlter as number));
          const octaveNode = noteNode.querySelector(":scope > pitch > octave");
          if (octaveNode) {
            pitchNode.insertBefore(newAlter, octaveNode);
          } else {
            pitchNode.appendChild(newAlter);
          }
          alterNode = newAlter;
          changed = true;
        }
      }

      const resolvedAlter = parseIntSafe(alterNode?.textContent, 0);
      if (hasStart) {
        tieCarryByPitch.set(pitchKey, resolvedAlter);
      } else if (hasStop) {
        tieCarryByPitch.delete(pitchKey);
      }
    }

    if (!changed) return event;
    const serialized = new XMLSerializer().serializeToString(root);
    const xml = serialized.replace(/^<root>/, "").replace(/<\/root>$/, "");
    return { ...event, xml };
  });

  return { events: out, tieCarryOut: tieCarryByPitch };
};

const trimLayerEventsToMeasureCapacity = (
  events: ParsedMeiEvent[],
  measureTicks: number
): {
  events: ParsedMeiEvent[];
  totalTicks: number;
  droppedCount: number;
  droppedTicks: number;
  trimmedCount: number;
  trimmedTicks: number;
} => {
  const kept: ParsedMeiEvent[] = [];
  let totalTicks = 0;
  let droppedCount = 0;
  let droppedTicks = 0;
  let trimmedCount = 0;
  let trimmedTicks = 0;
  for (const event of events) {
    const nextTotal = totalTicks + event.durationTicks;
    if (nextTotal <= measureTicks) {
      kept.push(event);
      totalTicks += event.durationTicks;
      continue;
    }
    const overflow = nextTotal - measureTicks;
    const isMinorOverflow = overflow > 0 && overflow <= Math.max(12, Math.round(event.durationTicks * 0.1));
    if (isMinorOverflow) {
      // Keep tiny overflow as-is to avoid silent note loss from rounding drift
      // (common around tuplet-heavy imported sources).
      kept.push(event);
      totalTicks = nextTotal;
      trimmedCount += 1;
      trimmedTicks += overflow;
      continue;
    }
    droppedCount += 1;
    droppedTicks += event.durationTicks;
  }
  return { events: kept, totalTicks, droppedCount, droppedTicks, trimmedCount, trimmedTicks };
};

const extractMiscFieldsFromMeiStaff = (staff: Element): Array<{ name: string; value: string }> => {
  const out: Array<{ name: string; value: string }> = [];
  const normalizeName = (rawName: string): string => {
    const name = rawName.trim();
    if (!name) return "";
    if (name.startsWith("mks:")) return name;
    if (name.startsWith("src:")) return name;
    return `src:mei:${name}`;
  };
  for (const child of Array.from(staff.children)) {
    if (localNameOf(child) !== "annot") continue;
    if ((child.getAttribute("type") || "").trim() !== "musicxml-misc-field") continue;
    const name = normalizeName(child.getAttribute("label") ?? "");
    if (!name) continue;
    out.push({
      name,
      value: child.textContent?.trim() ?? "",
    });
  }
  return out;
};

const parseMeasureMetaFromMeiStaff = (staff: Element): {
  number?: string;
  implicit?: boolean;
  repeat?: "forward" | "backward";
  times?: number;
  explicitTime?: boolean;
  beats?: number;
  beatType?: number;
  doubleBar?: "left" | "right" | "both";
} | null => {
  const metaAnnot = childElementsByName(staff, "annot").find((annot) => {
    const type = (annot.getAttribute("type") ?? "").trim().toLowerCase();
    const label = (annot.getAttribute("label") ?? "").trim().toLowerCase();
    return type === "musicxml-measure-meta" || label === "mks:measure-meta";
  });
  if (!metaAnnot) return null;
  const text = (metaAnnot.textContent ?? "").trim();
  if (!text) return null;
  const out: {
    number?: string;
    implicit?: boolean;
    repeat?: "forward" | "backward";
    times?: number;
    explicitTime?: boolean;
    beats?: number;
    beatType?: number;
    doubleBar?: "left" | "right" | "both";
  } = {};
  for (const token of text.split(";")) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim().toLowerCase();
    const v = trimmed.slice(eq + 1).trim();
    if (!k) continue;
    if (k === "number" && v) out.number = v;
    if (k === "implicit") out.implicit = v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
    if (k === "repeat" && (v === "forward" || v === "backward")) out.repeat = v;
    if (k === "times") {
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n) && n > 1) out.times = Math.round(n);
    }
    if (k === "explicittime") out.explicitTime = v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes";
    if (k === "beats") {
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n) && n > 0) out.beats = Math.max(1, Math.round(n));
    }
    if (k === "beattype") {
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n) && n > 0) out.beatType = Math.max(1, Math.round(n));
    }
    if (k === "doublebar" && (v === "left" || v === "right" || v === "both")) out.doubleBar = v;
  }
  return out;
};

const buildMeiDebugFieldsFromStaff = (
  staff: Element,
  measureNo: string,
  divisions: number
): Array<{ name: string; value: string }> => {
  const entries: string[] = [];
  const layerNodes = childElementsByName(staff, "layer");
  for (let layerIndex = 0; layerIndex < layerNodes.length; layerIndex += 1) {
    const layer = layerNodes[layerIndex];
    const voice = layer.getAttribute("n")?.trim() || String(layerIndex + 1);
    let entryIndexInLayer = 0;
    for (const child of Array.from(layer.children)) {
      const kind = localNameOf(child);
      if (kind !== "note" && kind !== "rest" && kind !== "chord") continue;
      const durAttr = child.getAttribute("dur") || "4";
      const dots = parseIntSafe(child.getAttribute("dots"), 0);
      const ticks = Math.max(1, Math.round(meiDurToQuarterLength(durAttr) * dotsMultiplier(dots) * divisions));
      const base = [
        `idx=${toHex(entries.length, 4)}`,
        `m=${xmlEscape(measureNo)}`,
        `stf=${xmlEscape(staff.getAttribute("n")?.trim() || "1")}`,
        `ly=${xmlEscape(voice)}`,
        `li=${toHex(entryIndexInLayer, 4)}`,
        `k=${kind}`,
        `du=${xmlEscape(durAttr)}`,
        `dt=${toHex(ticks, 4)}`,
      ];

      if (kind === "note") {
        base.push(`pn=${xmlEscape((child.getAttribute("pname") || "c").toUpperCase())}`);
        base.push(`oc=${xmlEscape(child.getAttribute("oct") || "4")}`);
        const accid = child.getAttribute("accid");
        if (accid) base.push(`ac=${xmlEscape(accid)}`);
      } else if (kind === "chord") {
        const chordNotes = childElementsByName(child, "note");
        base.push(`cn=${toHex(chordNotes.length, 2)}`);
      }
      entries.push(base.join(";"));
      entryIndexInLayer += 1;
    }
  }

  if (entries.length === 0) return [];
  const fields: Array<{ name: string; value: string }> = [
    { name: "mks:mei-debug-count", value: toHex(entries.length, 4) },
  ];
  for (let i = 0; i < entries.length; i += 1) {
    fields.push({
      name: `mks:mei-debug-${String(i + 1).padStart(4, "0")}`,
      value: entries[i],
    });
  }
  return fields;
};

export const convertMeiToMusicXml = (meiSource: string, options: MeiImportOptions = {}): string => {
  const debugMetadata = options.debugMetadata ?? true;
  const sourceMetadata = options.sourceMetadata ?? true;
  const failOnOverfullDrop = options.failOnOverfullDrop ?? false;
  const meiCorpusIndex = Number.isFinite(options.meiCorpusIndex)
    ? Math.max(0, Math.floor(options.meiCorpusIndex as number))
    : null;
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(meiSource || ""), "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Invalid MEI XML.");
  }

  const meiRoot = doc.documentElement;
  if (!meiRoot) {
    throw new Error("MEI root is missing.");
  }
  let meiImportRoot: Element | null = null;
  const rootName = localNameOf(meiRoot);
  if (rootName === "mei") {
    meiImportRoot = meiRoot;
  } else if (rootName === "meiCorpus") {
    const meiNodes = Array.from(meiRoot.children).filter(
      (node): node is Element => node instanceof Element && localNameOf(node) === "mei"
    );
    if (meiCorpusIndex !== null) {
      meiImportRoot = meiNodes[meiCorpusIndex] ?? null;
      if (!meiImportRoot) {
        throw new Error(`MEI corpus index out of range: ${meiCorpusIndex} (size=${meiNodes.length}).`);
      }
    } else {
      meiImportRoot =
        meiNodes.find((node) => node.querySelector("measure") !== null)
        ?? meiNodes[0]
        ?? null;
    }
    if (!meiImportRoot) {
      throw new Error("MEI corpus has no child <mei>.");
    }
  } else {
    throw new Error("MEI root must be <mei> or <meiCorpus>.");
  }

  const title = firstDescendantText(meiImportRoot, "title") || "mikuscore";
  const scoreDefs = collectScoreDefsInDocOrder(meiImportRoot);
  const staffDefsInDocOrder = collectStaffDefsInDocOrder(meiImportRoot);
  const scoreDef = scoreDefs[0];
  const meterCount = parseIntSafe(scoreDef?.getAttribute("meter.count"), 4);
  const meterUnit = parseIntSafe(scoreDef?.getAttribute("meter.unit"), 4);
  const fifths = parseMeiKeyFifthsFromElement(scoreDef) ?? 0;
  const divisions = 480;

  const staffDefs = Array.from(meiImportRoot.querySelectorAll("*")).filter(
    (node): node is Element => node instanceof Element && localNameOf(node) === "staffDef"
  );
  const staffMeta = new Map<
    string,
    { label: string; clefSign: string; clefLine: number }
  >();
  for (const staffDef of staffDefs) {
    const n = staffDef.getAttribute("n")?.trim();
    if (!n) continue;
    const parsedClef = parseClefFromStaffDefElement(staffDef);
    const prev = staffMeta.get(n);
    staffMeta.set(n, {
      label: staffDef.getAttribute("label")?.trim() || prev?.label || `Staff ${n}`,
      clefSign: parsedClef?.clefSign || prev?.clefSign || "G",
      clefLine: parsedClef?.clefLine || prev?.clefLine || 2,
    });
  }

  const measureNodes = Array.from(meiImportRoot.querySelectorAll("*")).filter(
    (node): node is Element => node instanceof Element && localNameOf(node) === "measure"
  );
  if (measureNodes.length === 0) {
    throw new Error("MEI has no <measure>.");
  }

  const staffNumbers = new Set<string>();
  for (const measure of measureNodes) {
    for (const staff of childElementsByName(measure, "staff")) {
      const n = staff.getAttribute("n")?.trim();
      if (n) staffNumbers.add(n);
    }
  }
  if (staffNumbers.size === 0) {
    throw new Error("MEI has no <staff> content.");
  }
  const sortedStaffNumbers = Array.from(staffNumbers).sort((a, b) => parseIntSafe(a, 0) - parseIntSafe(b, 0));

  const partListXml = sortedStaffNumbers
    .map((staffNo, idx) => {
      const partId = `P${idx + 1}`;
      const partName = staffMeta.get(staffNo)?.label || `Staff ${staffNo}`;
      return `<score-part id="${partId}"><part-name>${xmlEscape(partName)}</part-name></score-part>`;
    })
    .join("");

  const partsXml = sortedStaffNumbers
    .map((staffNo, idx) => {
      const partId = `P${idx + 1}`;
      const clef = staffMeta.get(staffNo) || { label: `Staff ${staffNo}`, clefSign: "G", clefLine: 2 };
      let currentBeats = Math.max(1, Math.round(meterCount));
      let currentBeatType = Math.max(1, Math.round(meterUnit));
      let currentFifths = fifths;
      let currentClefSign = clef.clefSign;
      let currentClefLine = clef.clefLine;
      let currentTranspose = parseTransposeFromScoreDefForStaff(scoreDef, staffNo);
      let hasEmittedInitialAttributes = false;
      const tieCarryByVoice = new Map<string, Map<string, number>>();
      const measuresXml = measureNodes
        .map((measureNode, measureIndex) => {
          const sourceMeasureNo = measureNode.getAttribute("n")?.trim() || String(measureIndex + 1);
          const targetStaff = childElementsByName(measureNode, "staff").find(
            (staff) => (staff.getAttribute("n")?.trim() || "") === staffNo
          );
          if (!targetStaff) {
            return `<measure number="${xmlEscape(sourceMeasureNo)}"></measure>`;
          }
          const effectiveScoreDef = findEffectiveScoreDefForNode(targetStaff, scoreDefs);
          const effectiveStaffDef = findEffectiveStaffDefForNode(targetStaff, staffNo, staffDefsInDocOrder);
          const measureMeta = parseMeasureMetaFromMeiStaff(targetStaff);
          const measureNo = (measureMeta?.number ?? sourceMeasureNo).trim() || sourceMeasureNo;
          const implicitFromMeta = Boolean(measureMeta?.implicit);
          const scoreDefBeats = parseIntSafe(effectiveScoreDef?.getAttribute("meter.count"), currentBeats);
          const scoreDefBeatType = parseIntSafe(effectiveScoreDef?.getAttribute("meter.unit"), currentBeatType);
          const scoreDefFifths = parseKeySigFromScoreDefForStaff(effectiveScoreDef, staffNo, currentFifths);
          const scoreDefClef = parseClefFromScoreDefForStaff(effectiveScoreDef, staffNo);
          const scoreDefTranspose = parseTransposeFromScoreDefForStaff(effectiveScoreDef, staffNo);
          const staffDefFifths = parseMeiKeyFifthsFromElement(effectiveStaffDef);
          const staffDefClef = parseClefFromStaffDefElement(effectiveStaffDef);
          const staffDefTranspose = parseTransposeFromStaffDefElement(effectiveStaffDef);
          const measureBeats = Math.max(1, Math.round(measureMeta?.beats ?? scoreDefBeats));
          const measureBeatType = Math.max(1, Math.round(measureMeta?.beatType ?? scoreDefBeatType));
          const measureFifths = Number.isFinite(staffDefFifths)
            ? Math.round(staffDefFifths as number)
            : Number.isFinite(scoreDefFifths)
              ? Math.round(scoreDefFifths)
              : currentFifths;
          const measureClefSign = staffDefClef?.clefSign || scoreDefClef?.clefSign || currentClefSign;
          const measureClefLine = staffDefClef?.clefLine || scoreDefClef?.clefLine || currentClefLine;
          const measureTranspose = staffDefTranspose ?? scoreDefTranspose ?? currentTranspose;
          const measureTicks = Math.max(1, Math.round((measureBeats * 4 * divisions) / Math.max(1, measureBeatType)));
          const shouldEmitTime =
            measureIndex === 0
            || measureMeta?.explicitTime === true
            || measureBeats !== currentBeats
            || measureBeatType !== currentBeatType;
          const shouldEmitKey = measureIndex === 0 || measureFifths !== currentFifths;
          const shouldEmitClef =
            measureIndex === 0
            || measureClefSign !== currentClefSign
            || measureClefLine !== currentClefLine;
          const currentChromatic = Number.isFinite(currentTranspose?.chromatic) ? Math.round(Number(currentTranspose?.chromatic)) : null;
          const currentDiatonic = Number.isFinite(currentTranspose?.diatonic) ? Math.round(Number(currentTranspose?.diatonic)) : null;
          const measureChromatic = Number.isFinite(measureTranspose?.chromatic) ? Math.round(Number(measureTranspose?.chromatic)) : null;
          const measureDiatonic = Number.isFinite(measureTranspose?.diatonic) ? Math.round(Number(measureTranspose?.diatonic)) : null;
          const shouldEmitTranspose =
            measureIndex === 0 || measureChromatic !== currentChromatic || measureDiatonic !== currentDiatonic;

          const layerNodes = childElementsByName(targetStaff, "layer");
          const parsedLayers = layerNodes.map((layer, i) => {
            const voice = layer.getAttribute("n")?.trim() || String(i + 1);
            const tieCarryIn = tieCarryByVoice.get(voice) ?? new Map();
            const parsedLayer = parseLayerEvents(
              layer,
              divisions,
              voice,
              measureTicks,
              measureFifths,
              tieCarryIn
            );
            return { layer, voice, parsedLayer, tieCarryIn };
          });
          const staffIdToEventTick = new Map<string, number>();
          for (const entry of parsedLayers) {
            for (const [id, idx] of entry.parsedLayer.idToEventIndex.entries()) {
              const tick = resolveEventStartTickByIndex(entry.parsedLayer.events, idx);
              if (Number.isFinite(tick)) staffIdToEventTick.set(id, Math.max(0, Math.round(tick as number)));
            }
          }
          const layers = parsedLayers
            .map(({ layer, voice, parsedLayer, tieCarryIn }) => {
              const slurAppliedEvents = applyStaffSlurControlEvents(
                targetStaff,
                layer,
                parsedLayer.events,
                parsedLayer.idToEventIndex,
                staffIdToEventTick,
                divisions,
                measureBeatType
              );
              const tieApplied = applyTieCarryAccidentalsForLayerEvents(slurAppliedEvents, tieCarryIn);
              tieCarryByVoice.set(voice, tieApplied.tieCarryOut);
              const directionXml = collectLayerDirectionXml(
                targetStaff,
                layer,
                divisions,
                measureBeatType,
                voice,
                tieApplied.events,
                parsedLayer.idToEventIndex,
                staffIdToEventTick
              );
              const harmonyXml = collectLayerHarmonyXml(
                targetStaff,
                layer,
                divisions,
                measureBeatType,
                tieApplied.events,
                parsedLayer.idToEventIndex,
                staffIdToEventTick
              );
              const sourceTotalTicks = tieApplied.events.reduce((sum, event) => sum + event.durationTicks, 0);
              const trimmed = trimLayerEventsToMeasureCapacity(tieApplied.events, measureTicks);
              return {
                voice,
                xml: `${harmonyXml}${directionXml}${trimmed.events.map((event) => event.xml).join("")}`,
                totalTicks: trimmed.totalTicks,
                sourceTotalTicks,
                droppedCount: trimmed.droppedCount,
                droppedTicks: trimmed.droppedTicks,
                trimmedCount: trimmed.trimmedCount,
                trimmedTicks: trimmed.trimmedTicks,
              };
            })
            .filter((layer) => layer.xml.length > 0);

          const maxLayerTicks = layers.reduce((max, layer) => Math.max(max, layer.totalTicks), 0);
          const isLikelyPickupMeasure =
            !implicitFromMeta &&
            measureIndex === 0 &&
            maxLayerTicks > 0 &&
            maxLayerTicks < measureTicks;
          const implicitAttr = implicitFromMeta || isLikelyPickupMeasure ? ' implicit="yes"' : "";

          let body = "";
          if (layers.length > 0) {
            body += layers[0].xml;
            const backupTicks = Math.max(measureTicks, layers[0].totalTicks);
            for (let i = 1; i < layers.length; i += 1) {
              body += `<backup><duration>${backupTicks}</duration></backup>`;
              body += layers[i].xml;
            }
          }

          const miscFields = sourceMetadata ? extractMiscFieldsFromMeiStaff(targetStaff) : [];
          const meiDebugFields = debugMetadata
            ? buildMeiDebugFieldsFromStaff(targetStaff, measureNo, divisions)
            : [];
          const droppedEvents = layers.reduce((sum, layer) => sum + layer.droppedCount, 0);
          const droppedTicks = layers.reduce((sum, layer) => sum + layer.droppedTicks, 0);
          const trimmedEvents = layers.reduce((sum, layer) => sum + layer.trimmedCount, 0);
          const trimmedTicks = layers.reduce((sum, layer) => sum + layer.trimmedTicks, 0);
          const sourceTotalTicks = layers.reduce((sum, layer) => sum + layer.sourceTotalTicks, 0);
          const overfullDetected = layers.some((layer) => layer.sourceTotalTicks > measureTicks);
          if (failOnOverfullDrop && droppedEvents > 0) {
            throw new Error(
              `MEI overfull would drop events (measure=${measureNo}, staff=${staffNo}, droppedEvents=${droppedEvents}, droppedTicks=${droppedTicks}).`
            );
          }
          const overflowFields: Array<{ name: string; value: string }> =
            overfullDetected
              ? [
                  { name: "diag:count", value: "1" },
                  {
                    name: "diag:0001",
                    value: `level=warn;code=OVERFULL_CLAMPED;fmt=mei;measure=${measureNo};staff=${staffNo};action=clamped;sourceTicks=${sourceTotalTicks};capacityTicks=${measureTicks};droppedEvents=${droppedEvents};droppedTicks=${droppedTicks};trimmedEvents=${trimmedEvents};trimmedTicks=${trimmedTicks}`,
                  },
                ]
              : [];
          const allFields = [...miscFields, ...meiDebugFields, ...overflowFields];
          const miscellaneousXml =
            allFields.length > 0
              ? `<miscellaneous>${allFields
                  .map(
                    (field) =>
                      `<miscellaneous-field name="${xmlEscape(field.name)}">${xmlEscape(field.value)}</miscellaneous-field>`
                  )
                  .join("")}</miscellaneous>`
              : "";
          let attributesXml = "";
          if (!hasEmittedInitialAttributes) {
            attributesXml =
              `<attributes><divisions>${divisions}</divisions><key><fifths>${measureFifths}</fifths></key>` +
              `<time><beats>${measureBeats}</beats><beat-type>${measureBeatType}</beat-type></time>` +
              `${buildTransposeXml(measureTranspose)}` +
              `<clef><sign>${xmlEscape(measureClefSign)}</sign><line>${measureClefLine}</line></clef>` +
              `${miscellaneousXml}</attributes>`;
          } else if (shouldEmitTime || shouldEmitKey || shouldEmitTranspose || shouldEmitClef || miscellaneousXml) {
            attributesXml =
              `<attributes>${
                shouldEmitKey ? `<key><fifths>${measureFifths}</fifths></key>` : ""
              }${
                shouldEmitTime ? `<time><beats>${measureBeats}</beats><beat-type>${measureBeatType}</beat-type></time>` : ""
              }${
                shouldEmitTranspose ? `${buildTransposeXml(measureTranspose)}` : ""
              }${
                shouldEmitClef ? `<clef><sign>${xmlEscape(measureClefSign)}</sign><line>${measureClefLine}</line></clef>` : ""
              }${miscellaneousXml}</attributes>`;
          }
          let leftBarlineXml = "";
          let rightBarlineXml = "";
          if (measureMeta?.doubleBar === "left" || measureMeta?.doubleBar === "both") {
            leftBarlineXml += `<barline location="left"><bar-style>light-light</bar-style></barline>`;
          }
          if (measureMeta?.repeat === "forward") {
            leftBarlineXml += `<barline location="left"><repeat direction="forward"/></barline>`;
          }
          if (measureMeta?.repeat === "backward") {
            const repeatInner =
              Number.isFinite(measureMeta.times) && (measureMeta.times as number) > 1
                ? `<bar-style>light-heavy</bar-style><repeat direction="backward"/><ending number="${Math.round(measureMeta.times as number)}" type="stop"/>`
                : `<repeat direction="backward"/>`;
            rightBarlineXml += `<barline location="right">${repeatInner}</barline>`;
          }
          if (measureMeta?.doubleBar === "right" || measureMeta?.doubleBar === "both") {
            rightBarlineXml += `<barline location="right"><bar-style>light-light</bar-style></barline>`;
          }
          currentBeats = measureBeats;
          currentBeatType = measureBeatType;
          currentFifths = measureFifths;
          currentClefSign = measureClefSign;
          currentClefLine = measureClefLine;
          currentTranspose = measureTranspose;
          hasEmittedInitialAttributes = true;
          return `<measure number="${xmlEscape(measureNo)}"${implicitAttr}>${attributesXml}${leftBarlineXml}${body}${rightBarlineXml}</measure>`;
        })
        .join("");
      return `<part id="${partId}">${measuresXml}</part>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>${xmlEscape(
    title
  )}</work-title></work><part-list>${partListXml}</part-list>${partsXml}</score-partwise>`;
  return prettyPrintMusicXmlText(applyImplicitBeamsToMusicXmlText(xml));
};
