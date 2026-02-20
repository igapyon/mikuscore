import { prettyPrintMusicXmlText } from "./musicxml-io";

type StaffSlot = {
  partId: string;
  localStaff: number;
  globalStaff: number;
  label: string;
};

export type MeiImportOptions = {
  debugMetadata?: boolean;
  sourceMetadata?: boolean;
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

const buildSimplePitchNote = (note: Element): string => {
  const typeText = note.querySelector(":scope > type")?.textContent?.trim() ?? "quarter";
  const dur = noteTypeToDur(typeText);
  const dots = note.querySelectorAll(":scope > dot").length;
  const step = note.querySelector(":scope > pitch > step")?.textContent?.trim() ?? "C";
  const octaveText = note.querySelector(":scope > pitch > octave")?.textContent?.trim() ?? "4";
  const alterText = note.querySelector(":scope > pitch > alter")?.textContent ?? null;
  const accid = alterToAccid(alterText);
  const attrs = [
    `pname="${esc(toPname(step))}"`,
    `oct="${esc(octaveText)}"`,
    `dur="${esc(dur)}"`,
  ];
  if (dots > 0) attrs.push(`dots="${dots}"`);
  if (accid) attrs.push(`accid="${accid}"`);
  return `<note ${attrs.join(" ")}/>`;
};

const buildSimpleRest = (note: Element): string => {
  const typeText = note.querySelector(":scope > type")?.textContent?.trim() ?? "quarter";
  const dur = noteTypeToDur(typeText);
  const dots = note.querySelectorAll(":scope > dot").length;
  const attrs = [`dur="${esc(dur)}"`];
  if (dots > 0) attrs.push(`dots="${dots}"`);
  return `<rest ${attrs.join(" ")}/>`;
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

const buildLayerContent = (notes: Element[]): string => {
  const out: string[] = [];
  for (let i = 0; i < notes.length; i += 1) {
    const note = notes[i];
    const isRest = Boolean(note.querySelector(":scope > rest"));
    const hasChordFlag = Boolean(note.querySelector(":scope > chord"));
    if (isRest || hasChordFlag) {
      if (isRest) out.push(buildSimpleRest(note));
      else out.push(buildSimplePitchNote(note));
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
      out.push(buildSimplePitchNote(note));
      continue;
    }

    const typeText = note.querySelector(":scope > type")?.textContent?.trim() ?? "quarter";
    const dur = noteTypeToDur(typeText);
    const dots = note.querySelectorAll(":scope > dot").length;
    const chordAttrs = [`dur="${esc(dur)}"`];
    if (dots > 0) chordAttrs.push(`dots="${dots}"`);
    const members = chordNotes.map((n) => {
      const step = n.querySelector(":scope > pitch > step")?.textContent?.trim() ?? "C";
      const octaveText = n.querySelector(":scope > pitch > octave")?.textContent?.trim() ?? "4";
      const alterText = n.querySelector(":scope > pitch > alter")?.textContent ?? null;
      const accid = alterToAccid(alterText);
      const noteAttrs = [
        `pname="${esc(toPname(step))}"`,
        `oct="${esc(octaveText)}"`,
      ];
      if (accid) noteAttrs.push(`accid="${accid}"`);
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

export const exportMusicXmlDomToMei = (doc: Document): string => {
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
    scoreDefLines.push(
      `<staffDef n="${slot.globalStaff}" label="${esc(slot.label)}" lines="5" clef.shape="${esc(clef.shape)}" clef.line="${clef.line}"/>`
    );
  }
  scoreDefLines.push("</staffGrp>");
  scoreDefLines.push("</scoreDef>");

  const measuresOut: string[] = [];
  const measureNumbers = gatherMeasureNumbers(parts);
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
      for (const voice of Array.from(voiceMap.keys()).sort(voiceSort)) {
        const notes = voiceMap.get(voice) ?? [];
        const layer = buildLayerContent(notes);
        measureLines.push(`<layer n="${esc(voice)}">${layer}</layer>`);
      }
      measureLines.push("</staff>");
    }

    measureLines.push("</measure>");
    measuresOut.push(measureLines.join(""));
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="4.0.1">`,
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

const parseMeiKeySigToFifths = (value: string): number => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "0") return 0;
  const num = Number.parseInt(normalized, 10);
  if (!Number.isFinite(num)) return 0;
  if (normalized.endsWith("s")) return Math.max(-7, Math.min(7, num));
  if (normalized.endsWith("f")) return Math.max(-7, Math.min(7, -Math.abs(num)));
  return Math.max(-7, Math.min(7, num));
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
    }
  | {
      kind: "rest";
      durationTicks: number;
      xml: string;
    }
  | {
      kind: "chord";
      durationTicks: number;
      xml: string;
    };

const buildMusicXmlNoteFromMeiNote = (
  meiNote: Element,
  durationTicks: number,
  typeText: string,
  dots: number,
  voice: string
): string => {
  const pname = (meiNote.getAttribute("pname") || "c").trim().toUpperCase();
  const octave = parseIntSafe(meiNote.getAttribute("oct"), 4);
  const alter = accidToAlter(meiNote.getAttribute("accid") || "");
  const alterXml = alter === null ? "" : `<alter>${alter}</alter>`;
  const dotXml = Array.from({ length: dots }, () => "<dot/>").join("");
  return `<note><pitch><step>${xmlEscape(pname)}</step>${alterXml}<octave>${octave}</octave></pitch><duration>${durationTicks}</duration><voice>${xmlEscape(
    voice
  )}</voice><type>${xmlEscape(typeText)}</type>${dotXml}</note>`;
};

const parseLayerEvents = (layer: Element, divisions: number, voice: string): ParsedMeiEvent[] => {
  const events: ParsedMeiEvent[] = [];
  for (const child of Array.from(layer.children)) {
    const name = localNameOf(child);
    if (name === "note") {
      const durAttr = child.getAttribute("dur") || "4";
      const dots = parseIntSafe(child.getAttribute("dots"), 0);
      const typeText = meiDurToMusicXmlType(durAttr);
      const ticks = Math.max(1, Math.round(meiDurToQuarterLength(durAttr) * dotsMultiplier(dots) * divisions));
      events.push({
        kind: "note",
        durationTicks: ticks,
        xml: buildMusicXmlNoteFromMeiNote(child, ticks, typeText, dots, voice),
      });
      continue;
    }
    if (name === "rest") {
      const durAttr = child.getAttribute("dur") || "4";
      const dots = parseIntSafe(child.getAttribute("dots"), 0);
      const typeText = meiDurToMusicXmlType(durAttr);
      const ticks = Math.max(1, Math.round(meiDurToQuarterLength(durAttr) * dotsMultiplier(dots) * divisions));
      const dotXml = Array.from({ length: dots }, () => "<dot/>").join("");
      events.push({
        kind: "rest",
        durationTicks: ticks,
        xml: `<note><rest/><duration>${ticks}</duration><voice>${xmlEscape(voice)}</voice><type>${xmlEscape(
          typeText
        )}</type>${dotXml}</note>`,
      });
      continue;
    }
    if (name === "chord") {
      const durAttr = child.getAttribute("dur") || "4";
      const dots = parseIntSafe(child.getAttribute("dots"), 0);
      const typeText = meiDurToMusicXmlType(durAttr);
      const ticks = Math.max(1, Math.round(meiDurToQuarterLength(durAttr) * dotsMultiplier(dots) * divisions));
      const noteChildren = childElementsByName(child, "note");
      if (noteChildren.length === 0) continue;
      const dotXml = Array.from({ length: dots }, () => "<dot/>").join("");
      const noteXml = noteChildren
        .map((note, index) => {
          const pname = (note.getAttribute("pname") || "c").trim().toUpperCase();
          const octave = parseIntSafe(note.getAttribute("oct"), 4);
          const alter = accidToAlter(note.getAttribute("accid") || "");
          const alterXml = alter === null ? "" : `<alter>${alter}</alter>`;
          const chordXml = index > 0 ? "<chord/>" : "";
          return `<note>${chordXml}<pitch><step>${xmlEscape(pname)}</step>${alterXml}<octave>${octave}</octave></pitch><duration>${ticks}</duration><voice>${xmlEscape(
            voice
          )}</voice><type>${xmlEscape(typeText)}</type>${dotXml}</note>`;
        })
        .join("");
      events.push({ kind: "chord", durationTicks: ticks, xml: noteXml });
      continue;
    }
  }
  return events;
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
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(meiSource || ""), "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Invalid MEI XML.");
  }

  const meiRoot = doc.documentElement;
  if (!meiRoot || localNameOf(meiRoot) !== "mei") {
    throw new Error("MEI root must be <mei>.");
  }

  const title = firstDescendantText(doc, "title") || "mikuscore";
  const scoreDef = Array.from(doc.querySelectorAll("*")).find(
    (node) => node instanceof Element && localNameOf(node) === "scoreDef"
  ) as Element | undefined;
  const meterCount = parseIntSafe(scoreDef?.getAttribute("meter.count"), 4);
  const meterUnit = parseIntSafe(scoreDef?.getAttribute("meter.unit"), 4);
  const fifths = parseMeiKeySigToFifths(scoreDef?.getAttribute("key.sig") || "0");
  const divisions = 480;
  const measureTicks = Math.max(1, Math.round((meterCount * 4 * divisions) / Math.max(1, meterUnit)));

  const staffDefs = Array.from(doc.querySelectorAll("*")).filter(
    (node): node is Element => node instanceof Element && localNameOf(node) === "staffDef"
  );
  const staffMeta = new Map<
    string,
    { label: string; clefSign: string; clefLine: number }
  >();
  for (const staffDef of staffDefs) {
    const n = staffDef.getAttribute("n")?.trim();
    if (!n) continue;
    staffMeta.set(n, {
      label: staffDef.getAttribute("label")?.trim() || `Staff ${n}`,
      clefSign: (staffDef.getAttribute("clef.shape")?.trim().toUpperCase() || "G"),
      clefLine: parseIntSafe(staffDef.getAttribute("clef.line"), 2),
    });
  }

  const measureNodes = Array.from(doc.querySelectorAll("*")).filter(
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
      const measuresXml = measureNodes
        .map((measureNode, measureIndex) => {
          const measureNo = measureNode.getAttribute("n")?.trim() || String(measureIndex + 1);
          const targetStaff = childElementsByName(measureNode, "staff").find(
            (staff) => (staff.getAttribute("n")?.trim() || "") === staffNo
          );
          if (!targetStaff) {
            return `<measure number="${xmlEscape(measureNo)}"></measure>`;
          }

          const layerNodes = childElementsByName(targetStaff, "layer");
          const layers = layerNodes
            .map((layer, i) => {
              const voice = layer.getAttribute("n")?.trim() || String(i + 1);
              const events = parseLayerEvents(layer, divisions, voice);
              const totalTicks = events.reduce((sum, event) => sum + event.durationTicks, 0);
              return {
                voice,
                xml: events.map((event) => event.xml).join(""),
                totalTicks,
              };
            })
            .filter((layer) => layer.xml.length > 0);

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
          const allFields = [...miscFields, ...meiDebugFields];
          const miscellaneousXml =
            allFields.length > 0
              ? `<miscellaneous>${allFields
                  .map(
                    (field) =>
                      `<miscellaneous-field name="${xmlEscape(field.name)}">${xmlEscape(field.value)}</miscellaneous-field>`
                  )
                  .join("")}</miscellaneous>`
              : "";
          const attributesXml =
            measureIndex === 0
              ? `<attributes><divisions>${divisions}</divisions><key><fifths>${fifths}</fifths></key><time><beats>${meterCount}</beats><beat-type>${meterUnit}</beat-type></time><clef><sign>${xmlEscape(
                  clef.clefSign
                )}</sign><line>${clef.clefLine}</line></clef>${miscellaneousXml}</attributes>`
              : miscellaneousXml
                ? `<attributes>${miscellaneousXml}</attributes>`
                : "";
          return `<measure number="${xmlEscape(measureNo)}">${attributesXml}${body}</measure>`;
        })
        .join("");
      return `<part id="${partId}">${measuresXml}</part>`;
    })
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><work><work-title>${xmlEscape(
    title
  )}</work-title></work><part-list>${partListXml}</part-list>${partsXml}</score-partwise>`;
  return prettyPrintMusicXmlText(xml);
};
