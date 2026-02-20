type MuseScoreImportOptions = {
  sourceMetadata?: boolean;
  debugMetadata?: boolean;
};

type MuseScoreWarning = {
  code: "MUSESCORE_IMPORT_WARNING";
  message: string;
};

type ParsedMuseScoreEvent =
  | { kind: "rest"; durationDiv: number }
  | { kind: "chord"; durationDiv: number; pitches: number[] }
  | { kind: "dynamic"; mark: string }
  | { kind: "directionXml"; xml: string };

type ParsedMuseScoreMeasure = {
  index: number;
  beats: number;
  beatType: number;
  fifths: number;
  tempoBpm: number | null;
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
    const payload = `level=warn;code=${warning.code};fmt=mscx;message=${warning.message}`;
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

const parseDurationDiv = (node: Element, divisions: number): number | null => {
  const explicitDuration = firstNumber(node, ":scope > duration");
  if (explicitDuration !== null && explicitDuration > 0) {
    return Math.max(1, Math.round(explicitDuration));
  }
  const durationType = (node.querySelector(":scope > durationType")?.textContent ?? "").trim();
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

const buildDynamicDirectionXml = (mark: string): string => {
  return `<direction><direction-type><dynamics><${mark}/></dynamics></direction-type></direction>`;
};

const buildWordsDirectionXml = (text: string): string => {
  return `<direction><direction-type><words>${xmlEscape(text)}</words></direction-type></direction>`;
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

  const globalBeats = Math.max(1, Math.round(firstNumber(score, ":scope > Staff > Measure TimeSig > sigN") ?? 4));
  const globalBeatType = Math.max(1, Math.round(firstNumber(score, ":scope > Staff > Measure TimeSig > sigD") ?? 4));
  const globalFifths = Math.max(-7, Math.min(7, Math.round(firstNumber(score, ":scope > Staff > Measure KeySig > accidental") ?? 0)));

  const staffNodes = Array.from(score.querySelectorAll(":scope > Staff")).filter(
    (staff) => staff.querySelector(":scope > Measure") !== null
  );
  const warnings: MuseScoreWarning[] = [];
  const unknownTagSet = new Set<string>();
  if (!staffNodes.length) {
    warnings.push({
      code: "MUSESCORE_IMPORT_WARNING",
      message: "No readable staff content found; created an empty placeholder score.",
    });
  }

  const partList: string[] = [];
  const parsedByPart: Array<{ partId: string; measures: ParsedMuseScoreMeasure[] }> = [];

  const sourceMetadata = options.sourceMetadata !== false;
  const debugMetadata = options.debugMetadata !== false;

  const staffs = staffNodes.length ? staffNodes : [doc.createElement("Staff")];
  for (let staffIndex = 0; staffIndex < staffs.length; staffIndex += 1) {
    const staff = staffs[staffIndex];
    const partId = `P${staffIndex + 1}`;
    partList.push(`<score-part id="${partId}"><part-name>${partId}</part-name></score-part>`);
    const measures = Array.from(staff.querySelectorAll(":scope > Measure"));
    if (!measures.length) {
      parsedByPart.push({
        partId,
        measures: [{
          index: 1,
          beats: globalBeats,
          beatType: globalBeatType,
          fifths: globalFifths,
          tempoBpm: null,
          repeatForward: false,
          repeatBackward: false,
          events: [{ kind: "rest", durationDiv: Math.max(1, Math.round((divisions * 4 * globalBeats) / Math.max(1, globalBeatType))) }],
        }],
      });
      continue;
    }

    let currentBeats = globalBeats;
    let currentBeatType = globalBeatType;
    let currentFifths = globalFifths;
    const parsedMeasures: ParsedMuseScoreMeasure[] = [];
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
      const fifthsRaw = firstNumber(measure, ":scope > KeySig > accidental")
        ?? firstNumber(measure, ":scope > voice > KeySig > accidental")
        ?? firstNumber(measure, ":scope > voice > keysig > accidental");
      const fifths = fifthsRaw === null ? currentFifths : Math.max(-7, Math.min(7, Math.round(fifthsRaw)));
      const tempoQps = firstNumber(measure, ":scope > Tempo > tempo")
        ?? firstNumber(measure, ":scope > voice > Tempo > tempo")
        ?? firstNumber(measure, ":scope > voice > tempo > tempo");
      const tempoBpm = tempoQps !== null && tempoQps > 0 ? Math.max(20, Math.min(300, Math.round(tempoQps * 60))) : null;
      const repeatForward = parseTruthyFlag(measure.getAttribute("startRepeat"))
        || measure.querySelector(":scope > startRepeat, :scope > voice > startRepeat") !== null;
      const repeatBackward = parseTruthyFlag(measure.getAttribute("endRepeat"))
        || measure.querySelector(":scope > endRepeat, :scope > voice > endRepeat") !== null;

      const events: ParsedMuseScoreEvent[] = [];
      const voiceNodes = Array.from(measure.querySelectorAll(":scope > voice"));
      const eventHolders = voiceNodes.length ? voiceNodes : [measure];
      for (const holder of eventHolders) {
        const children = Array.from(holder.children);
        for (const event of children) {
          const tag = event.tagName.toLowerCase();
          if (tag === "rest") {
            const durationDiv = parseDurationDiv(event, divisions);
            if (!durationDiv) {
              warnings.push({ code: "MUSESCORE_IMPORT_WARNING", message: `measure ${mi + 1}: dropped rest with unknown duration.` });
              continue;
            }
            events.push({ kind: "rest", durationDiv });
            continue;
          }
          if (tag === "chord") {
            const durationDiv = parseDurationDiv(event, divisions);
            if (!durationDiv) {
              warnings.push({ code: "MUSESCORE_IMPORT_WARNING", message: `measure ${mi + 1}: dropped chord with unknown duration.` });
              continue;
            }
            const pitchNodes = Array.from(event.querySelectorAll(":scope > Note > pitch"));
            const pitches = pitchNodes
              .map((p) => Number.parseInt((p.textContent ?? "").trim(), 10))
              .filter((midi) => Number.isFinite(midi));
            if (!pitches.length) {
              warnings.push({ code: "MUSESCORE_IMPORT_WARNING", message: `measure ${mi + 1}: dropped chord without pitch.` });
              continue;
            }
            events.push({ kind: "chord", durationDiv, pitches });
            continue;
          }
          if (tag === "dynamic") {
            const mark = parseMuseDynamicMark(
              (event.querySelector(":scope > subtype")?.textContent ?? event.textContent ?? "").trim()
            );
            if (mark) {
              events.push({ kind: "dynamic", mark });
            } else {
              warnings.push({ code: "MUSESCORE_IMPORT_WARNING", message: `measure ${mi + 1}: unsupported dynamic skipped.` });
            }
            continue;
          }
          if (tag === "marker") {
            const directionXml = parseMarkerDirectionXml(event);
            if (directionXml) {
              events.push({ kind: "directionXml", xml: directionXml });
            } else {
              warnings.push({ code: "MUSESCORE_IMPORT_WARNING", message: `measure ${mi + 1}: unsupported marker skipped.` });
            }
            continue;
          }
          if (tag === "jump") {
            const parsed = parseJumpDirectionXml(event);
            if (!parsed) {
              warnings.push({ code: "MUSESCORE_IMPORT_WARNING", message: `measure ${mi + 1}: unsupported jump skipped.` });
            } else {
              events.push({ kind: "directionXml", xml: parsed.xml });
              if (!parsed.mapped) {
                warnings.push({
                  code: "MUSESCORE_IMPORT_WARNING",
                  message: `measure ${mi + 1}: jump mapped as text only; playback semantics may be incomplete.`,
                });
              }
            }
            continue;
          }
          if (tag === "timesig" || tag === "keysig" || tag === "tempo" || tag === "layoutbreak" || tag === "clef") {
            continue;
          }
          unknownTagSet.add(tag);
        }
      }

      const capacity = Math.max(1, Math.round((divisions * 4 * beats) / Math.max(1, beatType)));
      const occupied = events
        .filter((event): event is Extract<ParsedMuseScoreEvent, { durationDiv: number }> => "durationDiv" in event)
        .reduce((sum, event) => sum + Math.max(0, Math.round(event.durationDiv)), 0);
      if (occupied > capacity) {
        warnings.push({
          code: "MUSESCORE_IMPORT_WARNING",
          message: `measure ${mi + 1}: overfull content (${occupied} > ${capacity}); tail events are clamped.`,
        });
      }

      parsedMeasures.push({
        index: mi + 1,
        beats,
        beatType,
        fifths,
        tempoBpm,
        repeatForward,
        repeatBackward,
        events,
      });
      currentBeats = beats;
      currentBeatType = beatType;
      currentFifths = fifths;
    }
    parsedByPart.push({ partId, measures: parsedMeasures });
  }

  if (unknownTagSet.size > 0) {
    warnings.push({
      code: "MUSESCORE_IMPORT_WARNING",
      message: `unsupported MuseScore elements skipped: ${Array.from(unknownTagSet).sort().join(", ")}`,
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
  const partXml: string[] = [];
  for (const part of parsedByPart) {
    const measuresXml: string[] = [];
    let prevBeats = globalBeats;
    let prevBeatType = globalBeatType;
    let prevFifths = globalFifths;
    for (let mi = 0; mi < part.measures.length; mi += 1) {
      const measure = part.measures[mi];
      const capacity = Math.max(1, Math.round((divisions * 4 * measure.beats) / Math.max(1, measure.beatType)));
      let body = "";
      const needsAttributes =
        mi === 0
        || measure.beats !== prevBeats
        || measure.beatType !== prevBeatType
        || measure.fifths !== prevFifths;
      if (needsAttributes) {
        body += `<attributes><divisions>${divisions}</divisions><key><fifths>${measure.fifths}</fifths><mode>major</mode></key><time><beats>${measure.beats}</beats><beat-type>${measure.beatType}</beat-type></time><clef><sign>G</sign><line>2</line></clef>${mi === 0 && miscXml ? `<miscellaneous>${miscXml}</miscellaneous>` : ""}</attributes>`;
      }
      if (measure.repeatForward) {
        body += `<barline location="left"><repeat direction="forward"/></barline>`;
      }
      if (measure.tempoBpm !== null) {
        body += `<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${measure.tempoBpm}</per-minute></metronome></direction-type><sound tempo="${measure.tempoBpm}"/></direction>`;
      }
      let occupied = 0;
      for (const event of measure.events) {
        if (event.kind === "dynamic") {
          body += buildDynamicDirectionXml(event.mark);
          continue;
        }
        if (event.kind === "directionXml") {
          body += event.xml;
          continue;
        }
        if (occupied + event.durationDiv > capacity) break;
        occupied += event.durationDiv;
        const info = divisionToTypeAndDots(divisions, event.durationDiv);
        if (event.kind === "rest") {
          body += `<note><rest/><duration>${event.durationDiv}</duration><voice>1</voice><type>${info.type}</type>${"<dot/>".repeat(info.dots)}</note>`;
          continue;
        }
        for (let ni = 0; ni < event.pitches.length; ni += 1) {
          const pitch = midiToPitch(event.pitches[ni]);
          body += `<note>${ni > 0 ? "<chord/>" : ""}<pitch><step>${pitch.step}</step>${pitch.alter !== 0 ? `<alter>${pitch.alter}</alter>` : ""}<octave>${pitch.octave}</octave></pitch><duration>${event.durationDiv}</duration><voice>1</voice><type>${info.type}</type>${"<dot/>".repeat(info.dots)}</note>`;
        }
      }
      if (occupied < capacity) {
        const restDiv = capacity - occupied;
        const info = divisionToTypeAndDots(divisions, restDiv);
        body += `<note><rest/><duration>${restDiv}</duration><voice>1</voice><type>${info.type}</type>${"<dot/>".repeat(info.dots)}</note>`;
      }
      if (measure.repeatBackward) {
        body += `<barline location="right"><repeat direction="backward"/></barline>`;
      }
      measuresXml.push(`<measure number="${measure.index}">${body}</measure>`);
      prevBeats = measure.beats;
      prevBeatType = measure.beatType;
      prevFifths = measure.fifths;
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

export const exportMusicXmlDomToMuseScore = (doc: Document): string => {
  const score = doc.querySelector("score-partwise");
  if (!score) throw new Error("MusicXML score-partwise root was not found.");
  const title =
    (score.querySelector("work > work-title")?.textContent ?? "").trim()
    || (score.querySelector("movement-title")?.textContent ?? "").trim()
    || "mikuscore export";
  const divisions = firstNumberInDoc(score, ["part > measure > attributes > divisions"], 480);
  const partNodes = Array.from(score.querySelectorAll(":scope > part"));

  let scoreXml = `<?xml version="1.0" encoding="UTF-8"?><museScore version="4.0"><Score>`;
  scoreXml += `<metaTag name="workTitle">${xmlEscape(title)}</metaTag>`;
  scoreXml += `<Division>${divisions}</Division>`;

  if (!partNodes.length) {
    const capacity = Math.max(1, Math.round((divisions * 4 * 4) / 4));
    scoreXml += `<Staff id="1"><Measure><voice>${makeMuseRestXml(capacity, divisions)}</voice></Measure></Staff>`;
    scoreXml += "</Score></museScore>";
    return scoreXml;
  }

  for (let pi = 0; pi < partNodes.length; pi += 1) {
    const part = partNodes[pi];
    const staffId = pi + 1;
    scoreXml += `<Staff id="${staffId}">`;
    const measures = Array.from(part.querySelectorAll(":scope > measure"));
    let currentBeats = 4;
    let currentBeatType = 4;
    let currentFifths = 0;

    for (const measure of measures) {
      scoreXml += "<Measure><voice>";
      const beats = firstNumber(measure, ":scope > attributes > time > beats");
      const beatType = firstNumber(measure, ":scope > attributes > time > beat-type");
      if (beats !== null && beatType !== null && (Math.round(beats) !== currentBeats || Math.round(beatType) !== currentBeatType)) {
        currentBeats = Math.max(1, Math.round(beats));
        currentBeatType = Math.max(1, Math.round(beatType));
        scoreXml += `<TimeSig><sigN>${currentBeats}</sigN><sigD>${currentBeatType}</sigD></TimeSig>`;
      }
      const fifths = firstNumber(measure, ":scope > attributes > key > fifths");
      if (fifths !== null && Math.round(fifths) !== currentFifths) {
        currentFifths = Math.max(-7, Math.min(7, Math.round(fifths)));
        scoreXml += `<KeySig><accidental>${currentFifths}</accidental></KeySig>`;
      }
      const tempo = firstAttrNumber(measure, ":scope > direction > sound[tempo]", "tempo");
      if (tempo !== null && tempo > 0) {
        scoreXml += `<Tempo><tempo>${(tempo / 60).toFixed(6)}</tempo></Tempo>`;
      }
      const mfNodes = Array.from(measure.querySelectorAll(":scope > direction > direction-type > dynamics > *"));
      for (const node of mfNodes) {
        const tag = node.tagName.toLowerCase();
        scoreXml += `<Dynamic><subtype>${xmlEscape(tag)}</subtype></Dynamic>`;
      }
      if (measure.querySelector(':scope > barline[location="left"] > repeat[direction="forward"]')) {
        scoreXml += "<startRepeat/>";
      }

      const children = Array.from(measure.children);
      let pendingChord: { durationDiv: number; pitches: number[] } | null = null;
      for (const child of children) {
        if (child.tagName !== "note") continue;
        const isRest = child.querySelector(":scope > rest") !== null;
        const durationDiv = Math.max(1, Math.round(firstNumber(child, ":scope > duration") ?? divisions));
        if (isRest) {
          if (pendingChord) {
            scoreXml += makeMuseChordXml(pendingChord.durationDiv, divisions, pendingChord.pitches);
            pendingChord = null;
          }
          scoreXml += makeMuseRestXml(durationDiv, divisions);
          continue;
        }
        const step = (child.querySelector(":scope > pitch > step")?.textContent ?? "").trim();
        const octave = firstNumber(child, ":scope > pitch > octave");
        if (!step || octave === null) continue;
        const alter = Math.round(firstNumber(child, ":scope > pitch > alter") ?? 0);
        const midi = (() => {
          const map: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
          if (map[step] === undefined) return null;
          return map[step] + alter + (Math.round(octave) + 1) * 12;
        })();
        if (midi === null) continue;
        const isChordFollow = child.querySelector(":scope > chord") !== null;
        if (!isChordFollow) {
          if (pendingChord) {
            scoreXml += makeMuseChordXml(pendingChord.durationDiv, divisions, pendingChord.pitches);
          }
          pendingChord = { durationDiv, pitches: [midi] };
        } else if (pendingChord) {
          pendingChord.pitches.push(midi);
        } else {
          pendingChord = { durationDiv, pitches: [midi] };
        }
      }
      if (pendingChord) {
        scoreXml += makeMuseChordXml(pendingChord.durationDiv, divisions, pendingChord.pitches);
      }
      if (measure.querySelector(':scope > barline[location="right"] > repeat[direction="backward"]')) {
        scoreXml += "<endRepeat/>";
      }
      scoreXml += "</voice></Measure>";
    }
    scoreXml += "</Staff>";
  }

  scoreXml += "</Score></museScore>";
  return scoreXml;
};
