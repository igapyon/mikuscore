import { ScoreCore } from "../../core/ScoreCore";
import { getMeasureCapacity, getOccupiedTime } from "../../core/timeIndex";
import type {
  ChangeDurationCommand,
  ChangePitchCommand,
  CoreCommand,
  DeleteNoteCommand,
  DispatchResult,
  InsertNoteAfterCommand,
  Pitch,
  SaveResult,
} from "../../core/interfaces";
import { AbcCommon } from "./abc-io";
import { AbcCompatParser } from "./abc-io";
import { buildMidiBytesForPlayback, buildPlaybackEventsFromMusicXmlDoc } from "./midi-io";
import {
  buildRenderDocWithNodeIds,
  extractMeasureEditorDocument,
  parseMusicXmlDocument,
  replaceMeasureInMainDocument,
  serializeMusicXmlDocument,
} from "./musicxml-io";
import { sampleXml } from "./sampleXml";
import { renderMusicXmlDomToSvg } from "./verovio-out";

type UiState = {
  loaded: boolean;
  selectedNodeId: string | null;
  noteNodeIds: string[];
  lastDispatchResult: DispatchResult | null;
  lastSaveResult: SaveResult | null;
  lastSuccessfulSaveXml: string;
};

type NoteLocation = {
  partId: string;
  measureNumber: string;
};

const EDITABLE_VOICE = "1";

const q = <T extends Element>(selector: string): T => {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el as T;
};

const inputTypeXml = q<HTMLInputElement>("#inputTypeXml");
const inputTypeAbc = q<HTMLInputElement>("#inputTypeAbc");
const inputTypeNew = q<HTMLInputElement>("#inputTypeNew");
const inputModeFile = q<HTMLInputElement>("#inputModeFile");
const inputModeSource = q<HTMLInputElement>("#inputModeSource");
const inputSectionDetails = q<HTMLDetailsElement>("#inputSectionDetails");
const newInputBlock = q<HTMLDivElement>("#newInputBlock");
const newPartCountInput = q<HTMLInputElement>("#newPartCount");
const newKeyFifthsSelect = q<HTMLSelectElement>("#newKeyFifths");
const newTimeBeatsInput = q<HTMLInputElement>("#newTimeBeats");
const newTimeBeatTypeSelect = q<HTMLSelectElement>("#newTimeBeatType");
const newPartClefList = q<HTMLDivElement>("#newPartClefList");
const fileInputBlock = q<HTMLDivElement>("#fileInputBlock");
const sourceXmlInputBlock = q<HTMLDivElement>("#sourceXmlInputBlock");
const abcInputBlock = q<HTMLDivElement>("#abcInputBlock");
const xmlInput = q<HTMLTextAreaElement>("#xmlInput");
const abcInput = q<HTMLTextAreaElement>("#abcInput");
const fileSelectBtn = q<HTMLButtonElement>("#fileSelectBtn");
const fileInput = q<HTMLInputElement>("#fileInput");
const fileNameText = q<HTMLSpanElement>("#fileNameText");
const loadBtn = q<HTMLButtonElement>("#loadBtn");
const noteSelect = q<HTMLSelectElement>("#noteSelect");
const statusText = q<HTMLParagraphElement>("#statusText");
const pitchStep = q<HTMLInputElement>("#pitchStep");
const pitchStepValue = q<HTMLSpanElement>("#pitchStepValue");
const pitchStepDownBtn = q<HTMLButtonElement>("#pitchStepDownBtn");
const pitchStepUpBtn = q<HTMLButtonElement>("#pitchStepUpBtn");
const pitchAlter = q<HTMLInputElement>("#pitchAlter");
const pitchAlterBtns = Array.from(document.querySelectorAll<HTMLButtonElement>(".ms-alter-btn"));
const pitchOctave = q<HTMLInputElement>("#pitchOctave");
const durationPreset = q<HTMLSelectElement>("#durationPreset");
const splitNoteBtn = q<HTMLButtonElement>("#splitNoteBtn");
const convertRestBtn = q<HTMLButtonElement>("#convertRestBtn");
const deleteBtn = q<HTMLButtonElement>("#deleteBtn");
const playBtn = q<HTMLButtonElement>("#playBtn");
const stopBtn = q<HTMLButtonElement>("#stopBtn");
const downloadBtn = q<HTMLButtonElement>("#downloadBtn");
const downloadMidiBtn = q<HTMLButtonElement>("#downloadMidiBtn");
const downloadAbcBtn = q<HTMLButtonElement>("#downloadAbcBtn");
const saveModeText = q<HTMLSpanElement>("#saveModeText");
const playbackText = q<HTMLParagraphElement>("#playbackText");
const outputXml = q<HTMLTextAreaElement>("#outputXml");
const diagArea = q<HTMLDivElement>("#diagArea");
const debugScoreMeta = q<HTMLParagraphElement>("#debugScoreMeta");
const debugScoreArea = q<HTMLDivElement>("#debugScoreArea");
const uiMessage = q<HTMLDivElement>("#uiMessage");
const measurePartNameText = q<HTMLParagraphElement>("#measurePartNameText");
const measureSelectionText = q<HTMLParagraphElement>("#measureSelectionText");
const measureEditorWrap = q<HTMLDivElement>("#measureEditorWrap");
const measureEditorArea = q<HTMLDivElement>("#measureEditorArea");
const measureApplyBtn = q<HTMLButtonElement>("#measureApplyBtn");
const measureDiscardBtn = q<HTMLButtonElement>("#measureDiscardBtn");
const playMeasureBtn = q<HTMLButtonElement>("#playMeasureBtn");

const core = new ScoreCore({ editableVoice: EDITABLE_VOICE });
const state: UiState = {
  loaded: false,
  selectedNodeId: null,
  noteNodeIds: [],
  lastDispatchResult: null,
  lastSaveResult: null,
  lastSuccessfulSaveXml: "",
};

xmlInput.value = sampleXml;
let isPlaying = false;
const DEBUG_LOG = true;
let verovioRenderSeq = 0;
let currentSvgIdToNodeId = new Map<string, string>();
let nodeIdToLocation = new Map<string, NoteLocation>();
let partIdToName = new Map<string, string>();
let selectedMeasure: NoteLocation | null = null;
let draftCore: ScoreCore | null = null;
let draftNoteNodeIds: string[] = [];
let draftSvgIdToNodeId = new Map<string, string>();
let selectedDraftVoice = EDITABLE_VOICE;
let selectedDraftNoteIsRest = false;
let suppressDurationPresetEvent = false;
let selectedDraftDurationValue: number | null = null;
const NOTE_CLICK_SNAP_PX = 170;
const DEFAULT_DIVISIONS = 480;
const MAX_NEW_PARTS = 16;

const logDiagnostics = (
  phase: "load" | "dispatch" | "save" | "playback",
  diagnostics: Array<{ code: string; message: string }>,
  warnings: Array<{ code: string; message: string }> = []
): void => {
  if (!DEBUG_LOG) return;
  for (const d of diagnostics) {
    console.error(`[mikuscore][${phase}][${d.code}] ${d.message}`);
  }
  for (const w of warnings) {
    console.warn(`[mikuscore][${phase}][${w.code}] ${w.message}`);
  }
};

const dumpOverfullContext = (xml: string, voice: string): void => {
  if (!DEBUG_LOG) return;
  const doc = parseMusicXmlDocument(xml);
  if (!doc) {
    console.error("[mikuscore][debug] XML parse failed while dumping overfull context.");
    return;
  }

  const measures = Array.from(doc.querySelectorAll("part > measure"));
  let found = false;
  for (const measure of measures) {
    const number = measure.getAttribute("number") ?? "(no-number)";
    const divisionsText = measure.querySelector("attributes > divisions")?.textContent?.trim() ?? "(inherit)";
    const beatsText = measure.querySelector("attributes > time > beats")?.textContent?.trim() ?? "(inherit)";
    const beatTypeText =
      measure.querySelector("attributes > time > beat-type")?.textContent?.trim() ?? "(inherit)";

    const noteRows: Array<{
      idx: number;
      voice: string;
      duration: number;
      pitch: string;
      isRest: boolean;
    }> = [];

    const occupied = getOccupiedTime(measure, voice);
    Array.from(measure.children).forEach((child, idx) => {
      if (child.tagName !== "note") return;
      const noteVoice = child.querySelector("voice")?.textContent?.trim() ?? "";
      const duration = Number(child.querySelector("duration")?.textContent?.trim() ?? "");
      const isRest = Boolean(child.querySelector("rest"));
      const step = child.querySelector("pitch > step")?.textContent?.trim() ?? "";
      const alter = child.querySelector("pitch > alter")?.textContent?.trim();
      const octave = child.querySelector("pitch > octave")?.textContent?.trim() ?? "";
      const alterText = alter ? `${alter >= "0" ? "+" : ""}${alter}` : "";
      const pitch = isRest ? "rest" : `${step}${alterText}${octave ? octave : ""}`;

      noteRows.push({
        idx,
        voice: noteVoice || "(none)",
        duration: Number.isFinite(duration) ? duration : NaN,
        pitch,
        isRest,
      });
    });

    const capacity = getMeasureCapacity(measure);
    if (capacity === null) continue;
    if (occupied <= capacity) continue;
    found = true;

    console.groupCollapsed(
      `[mikuscore][debug][MEASURE_OVERFULL] measure=${number} occupied=${occupied} capacity=${capacity}`
    );
    console.log({
      measure: number,
      voice,
      divisions: divisionsText,
      beats: beatsText,
      beatType: beatTypeText,
      occupied,
      capacity,
    });
    console.table(noteRows);
    console.groupEnd();
  }
  if (!found) {
    console.warn("[mikuscore][debug] no overfull measure found while dumping context.");
  }
};

const renderInputMode = (): void => {
  const isAbcType = inputTypeAbc.checked;
  const isNewType = inputTypeNew.checked;
  const fileMode = inputModeFile.checked;
  newInputBlock.classList.toggle("md-hidden", !isNewType);
  fileInputBlock.classList.toggle("md-hidden", isNewType || !fileMode);
  sourceXmlInputBlock.classList.toggle("md-hidden", isNewType || fileMode || isAbcType);
  abcInputBlock.classList.toggle("md-hidden", isNewType || fileMode || !isAbcType);

  inputModeFile.disabled = isNewType;
  inputModeSource.disabled = isNewType;
  const loadLabel = loadBtn.querySelector("span");
  if (loadLabel) {
    loadLabel.textContent = isNewType ? "新規作成" : "読み込み";
  }

  fileInput.accept = isAbcType
    ? ".abc,text/plain"
    : ".musicxml,.xml,text/xml,application/xml";
};

const normalizeNewPartCount = (): number => {
  const raw = Number(newPartCountInput.value);
  const bounded = Number.isFinite(raw) ? Math.max(1, Math.min(MAX_NEW_PARTS, Math.round(raw))) : 1;
  newPartCountInput.value = String(bounded);
  return bounded;
};

const normalizeNewTimeBeats = (): number => {
  const raw = Number(newTimeBeatsInput.value);
  const bounded = Number.isFinite(raw) ? Math.max(1, Math.min(16, Math.round(raw))) : 4;
  newTimeBeatsInput.value = String(bounded);
  return bounded;
};

const normalizeNewTimeBeatType = (): number => {
  const raw = Number(newTimeBeatTypeSelect.value);
  const allowed = new Set([2, 4, 8, 16]);
  const normalized = allowed.has(raw) ? raw : 4;
  newTimeBeatTypeSelect.value = String(normalized);
  return normalized;
};

const normalizeClefKeyword = (raw: string): string => {
  const clef = String(raw || "").trim().toLowerCase();
  if (clef === "treble" || clef === "alto" || clef === "bass") return clef;
  return "treble";
};

const listCurrentNewPartClefs = (): string[] => {
  return Array.from(newPartClefList.querySelectorAll<HTMLSelectElement>("select[data-part-clef]")).map((select) =>
    normalizeClefKeyword(select.value)
  );
};

const renderNewPartClefControls = (): void => {
  const count = normalizeNewPartCount();
  const previous = listCurrentNewPartClefs();
  newPartClefList.innerHTML = "";

  for (let i = 0; i < count; i += 1) {
    const row = document.createElement("div");
    row.className = "ms-form-row";

    const label = document.createElement("label");
    label.className = "ms-field";
    label.textContent = `パート${i + 1} 記号`;

    const select = document.createElement("select");
    select.className = "md-select";
    select.setAttribute("data-part-clef", "true");

    const options: Array<{ value: string; label: string }> = [
      { value: "treble", label: "ト音記号" },
      { value: "alto", label: "ハ音記号" },
      { value: "bass", label: "ヘ音記号" },
    ];
    for (const optionDef of options) {
      const option = document.createElement("option");
      option.value = optionDef.value;
      option.textContent = optionDef.label;
      select.appendChild(option);
    }

    select.value = normalizeClefKeyword(previous[i] ?? "treble");
    label.appendChild(select);
    row.appendChild(label);
    newPartClefList.appendChild(row);
  }
};

const renderStatus = (): void => {
  const dirty = core.isDirty();
  statusText.textContent = state.loaded
    ? `ロード済み / 変更あり=${dirty} / ノート数=${state.noteNodeIds.length}`
    : "未ロード（まず読み込みしてください）";
};

const renderNotes = (): void => {
  noteSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = draftNoteNodeIds.length === 0 ? "(ノートなし)" : "(選択してください)";
  noteSelect.appendChild(placeholder);

  for (const nodeId of draftNoteNodeIds) {
    const option = document.createElement("option");
    option.value = nodeId;
    option.textContent = nodeId;
    noteSelect.appendChild(option);
  }

  if (state.selectedNodeId && draftNoteNodeIds.includes(state.selectedNodeId)) {
    noteSelect.value = state.selectedNodeId;
  } else {
    state.selectedNodeId = null;
    noteSelect.value = "";
  }
};

const isPitchStepValue = (value: string): value is Pitch["step"] => {
  return value === "A" || value === "B" || value === "C" || value === "D" || value === "E" || value === "F" || value === "G";
};

const renderPitchStepValue = (): void => {
  const step = pitchStep.value.trim();
  if (isPitchStepValue(step)) {
    pitchStepValue.textContent = step;
  } else {
    pitchStepValue.textContent = "休符";
  }
};

const normalizeAlterValue = (value: string): string => {
  const v = value.trim();
  if (v === "none") return "none";
  if (v === "-2" || v === "-1" || v === "0" || v === "1" || v === "2") return v;
  if (v === "") return "none";
  return "none";
};

const resolveEffectiveDivisionsForMeasure = (
  doc: XMLDocument,
  targetMeasure: Element | null
): number => {
  if (!targetMeasure) return DEFAULT_DIVISIONS;
  const part = targetMeasure.closest("part");
  if (!part) return DEFAULT_DIVISIONS;

  let divisions: number | null = null;
  for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
    const divisionsText = measure.querySelector(":scope > attributes > divisions")?.textContent?.trim() ?? "";
    const parsed = Number(divisionsText);
    if (Number.isInteger(parsed) && parsed > 0) {
      divisions = parsed;
    }
    if (measure === targetMeasure) break;
  }
  return divisions ?? DEFAULT_DIVISIONS;
};

const rebuildDurationPresetOptions = (divisions: number): void => {
  const safeDivisions = Number.isInteger(divisions) && divisions > 0 ? divisions : DEFAULT_DIVISIONS;
  const defs: Array<{ label: string; num: number; den: number }> = [
    { label: "全音符", num: 4, den: 1 },
    { label: "付点2分音符", num: 3, den: 1 },
    { label: "2分音符", num: 2, den: 1 },
    { label: "2分3連(1音)", num: 4, den: 3 },
    { label: "付点4分音符", num: 3, den: 2 },
    { label: "4分音符", num: 1, den: 1 },
    { label: "4分3連(1音)", num: 2, den: 3 },
    { label: "付点8分音符", num: 3, den: 4 },
    { label: "8分音符", num: 1, den: 2 },
    { label: "8分3連(1音)", num: 1, den: 3 },
    { label: "付点16分音符", num: 3, den: 8 },
    { label: "16分音符", num: 1, den: 4 },
    { label: "16分3連(1音)", num: 1, den: 6 },
    { label: "32分音符", num: 1, den: 8 },
    { label: "64分音符", num: 1, den: 16 },
  ];

  durationPreset.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "（音価を選択）";
  durationPreset.appendChild(placeholder);

  const used = new Set<number>();
  for (const def of defs) {
    const raw = (safeDivisions * def.num) / def.den;
    if (!Number.isInteger(raw) || raw <= 0) continue;
    if (used.has(raw)) continue;
    used.add(raw);
    const option = document.createElement("option");
    option.value = String(raw);
    option.textContent = `${def.label}(${raw})`;
    durationPreset.appendChild(option);
  }
};

const hasDurationPresetValue = (duration: number): boolean => {
  return Array.from(durationPreset.options).some((opt) => Number(opt.value) === duration);
};

const setDurationPresetFromValue = (duration: number | null): void => {
  suppressDurationPresetEvent = true;
  Array.from(durationPreset.querySelectorAll("option.ms-duration-custom")).forEach((opt) => opt.remove());
  if (!Number.isInteger(duration) || (duration ?? 0) <= 0) {
    durationPreset.value = "";
    suppressDurationPresetEvent = false;
    return;
  }
  if (hasDurationPresetValue(duration as number)) {
    durationPreset.value = String(duration);
    suppressDurationPresetEvent = false;
    return;
  }
  const custom = document.createElement("option");
  custom.value = String(duration);
  custom.textContent = `カスタム(${duration})`;
  custom.className = "ms-duration-custom";
  durationPreset.appendChild(custom);
  durationPreset.value = custom.value;
  suppressDurationPresetEvent = false;
};

const durationValueIsTriplet = (duration: number, divisions: number): boolean => {
  if (!Number.isInteger(duration) || duration <= 0) return false;
  if (!Number.isInteger(divisions) || divisions <= 0) return false;
  return (
    duration === (divisions * 4) / 3 ||
    duration === (divisions * 2) / 3 ||
    duration === divisions / 3 ||
    duration === divisions / 6
  );
};

const noteHasTupletContextInMeasure = (note: Element): boolean => {
  const measure = note.closest("measure");
  if (!measure) return false;
  const voice = note.querySelector(":scope > voice")?.textContent?.trim() ?? "";
  if (!voice) return false;
  const notes = Array.from(measure.children).filter((child) => child.tagName === "note");
  for (const candidate of notes) {
    const candidateVoice = candidate.querySelector(":scope > voice")?.textContent?.trim() ?? "";
    if (candidateVoice !== voice) continue;
    if (candidate.querySelector(":scope > time-modification")) return true;
    if (candidate.querySelector(":scope > notations > tuplet")) return true;
  }
  return false;
};

const applyDurationPresetAvailability = (selectedNote: Element, divisions: number): void => {
  const hasTupletContext = noteHasTupletContextInMeasure(selectedNote);
  for (const option of Array.from(durationPreset.options)) {
    if (!option.value) {
      option.disabled = false;
      continue;
    }
    const value = Number(option.value);
    const isTriplet = durationValueIsTriplet(value, divisions);
    const unavailable = isTriplet && !hasTupletContext;
    option.disabled = unavailable;
    const baseLabel = option.textContent?.replace("（この小節では不可）", "").trim() ?? "";
    option.textContent = unavailable ? `${baseLabel}（この小節では不可）` : baseLabel;
  }
};

const renderAlterButtons = (): void => {
  const active = normalizeAlterValue(pitchAlter.value);
  pitchAlter.value = active;
  for (const btn of pitchAlterBtns) {
    const value = normalizeAlterValue(btn.dataset.alter ?? "");
    const isActive = value === active;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  }
};

const syncStepFromSelectedDraftNote = (): void => {
  selectedDraftVoice = EDITABLE_VOICE;
  selectedDraftNoteIsRest = false;
  pitchStep.disabled = false;
  pitchStep.title = "";
  pitchOctave.title = "音名 ↑/↓ に連動して自動調整されます。";
  for (const btn of pitchAlterBtns) {
    btn.disabled = false;
    btn.title = "";
  }

  if (!draftCore || !state.selectedNodeId) {
    selectedDraftVoice = EDITABLE_VOICE;
    selectedDraftDurationValue = null;
    rebuildDurationPresetOptions(DEFAULT_DIVISIONS);
    setDurationPresetFromValue(null);
    pitchStep.value = "";
    pitchAlter.value = "none";
    renderPitchStepValue();
    renderAlterButtons();
    return;
  }
  const xml = draftCore.debugSerializeCurrentXml();
  if (!xml) {
    selectedDraftVoice = EDITABLE_VOICE;
    selectedDraftDurationValue = null;
    rebuildDurationPresetOptions(DEFAULT_DIVISIONS);
    setDurationPresetFromValue(null);
    pitchStep.value = "";
    pitchAlter.value = "none";
    renderPitchStepValue();
    renderAlterButtons();
    return;
  }

  const doc = parseMusicXmlDocument(xml);
  if (!doc) {
    selectedDraftVoice = EDITABLE_VOICE;
    selectedDraftDurationValue = null;
    rebuildDurationPresetOptions(DEFAULT_DIVISIONS);
    setDurationPresetFromValue(null);
    pitchStep.value = "";
    pitchAlter.value = "none";
    renderPitchStepValue();
    renderAlterButtons();
    return;
  }

  const notes = Array.from(doc.querySelectorAll("note"));
  const count = Math.min(notes.length, draftNoteNodeIds.length);
  for (let i = 0; i < count; i += 1) {
    if (draftNoteNodeIds[i] !== state.selectedNodeId) continue;
    selectedDraftVoice = notes[i].querySelector(":scope > voice")?.textContent?.trim() || EDITABLE_VOICE;
    const measure = notes[i].closest("measure");
    const divisions = resolveEffectiveDivisionsForMeasure(doc, measure);
    rebuildDurationPresetOptions(divisions);
    applyDurationPresetAvailability(notes[i], divisions);
    const durationText = notes[i].querySelector(":scope > duration")?.textContent?.trim() ?? "";
    const durationNumber = Number(durationText);
    if (Number.isInteger(durationNumber) && durationNumber > 0) {
      selectedDraftDurationValue = durationNumber;
      setDurationPresetFromValue(durationNumber);
    } else {
      selectedDraftDurationValue = null;
      setDurationPresetFromValue(null);
    }

    const alterText = notes[i].querySelector(":scope > pitch > alter")?.textContent?.trim() ?? "";
    const accidentalText = notes[i].querySelector(":scope > accidental")?.textContent?.trim() ?? "";
    const alterNumber = Number(alterText);
    if (alterText === "") {
      if (accidentalText === "natural") {
        pitchAlter.value = "0";
      } else if (accidentalText === "flat") {
        pitchAlter.value = "-1";
      } else if (accidentalText === "flat-flat") {
        pitchAlter.value = "-2";
      } else if (accidentalText === "sharp") {
        pitchAlter.value = "1";
      } else if (accidentalText === "double-sharp") {
        pitchAlter.value = "2";
      } else {
        pitchAlter.value = "none";
      }
    } else if (Number.isInteger(alterNumber) && alterNumber >= -2 && alterNumber <= 2) {
      pitchAlter.value = String(alterNumber);
    } else {
      pitchAlter.value = "none";
    }

    if (notes[i].querySelector(":scope > rest")) {
      selectedDraftNoteIsRest = true;
      pitchStep.value = "";
      pitchStep.disabled = true;
      pitchStep.title = "休符は音高を持たないため、音高変更はできません。";
      for (const btn of pitchAlterBtns) {
        btn.disabled = true;
        btn.title = "休符は音高を持たないため、音高変更はできません。";
      }
      pitchOctave.title = "音名 ↑/↓ に連動して自動調整されます。";
      renderPitchStepValue();
      renderAlterButtons();
      return;
    }
    const stepText = notes[i].querySelector(":scope > pitch > step")?.textContent?.trim() ?? "";
    if (isPitchStepValue(stepText)) {
      pitchStep.value = stepText;
    }
    const octaveText = notes[i].querySelector(":scope > pitch > octave")?.textContent?.trim() ?? "";
    const octaveNumber = Number(octaveText);
    if (Number.isInteger(octaveNumber) && octaveNumber >= 0 && octaveNumber <= 9) {
      pitchOctave.value = String(octaveNumber);
    }
    renderPitchStepValue();
    renderAlterButtons();
    return;
  }
  selectedDraftVoice = EDITABLE_VOICE;
  selectedDraftDurationValue = null;
  rebuildDurationPresetOptions(DEFAULT_DIVISIONS);
  setDurationPresetFromValue(null);
  renderPitchStepValue();
  renderAlterButtons();
};

const renderMeasureEditorState = (): void => {
  if (!selectedMeasure || !draftCore) {
    measurePartNameText.textContent = "小節未選択（譜面プレビューをクリックしてください）";
    measureSelectionText.textContent = "小節未選択（譜面プレビューをクリックしてください）";
    measureSelectionText.classList.add("md-hidden");
    measureEditorWrap.classList.add("md-hidden");
    measureApplyBtn.disabled = true;
    measureDiscardBtn.disabled = true;
    return;
  }

  const partName = partIdToName.get(selectedMeasure.partId) ?? selectedMeasure.partId;
  measurePartNameText.textContent =
    `トラック名: ${partName} / 選択中: トラック=${selectedMeasure.partId} / 小節=${selectedMeasure.measureNumber}`;
  measureSelectionText.textContent = "";
  measureSelectionText.classList.add("md-hidden");
  measureEditorWrap.classList.remove("md-hidden");
  measureDiscardBtn.disabled = false;
  measureApplyBtn.disabled = !draftCore.isDirty();
};

const highlightSelectedDraftNoteInEditor = (): void => {
  measureEditorArea
    .querySelectorAll(".ms-note-selected")
    .forEach((el) => el.classList.remove("ms-note-selected"));

  if (!state.selectedNodeId || draftSvgIdToNodeId.size === 0) return;

  for (const [svgId, nodeId] of draftSvgIdToNodeId.entries()) {
    if (nodeId !== state.selectedNodeId) continue;
    const target = document.getElementById(svgId);
    if (!target || !measureEditorArea.contains(target)) continue;
    target.classList.add("ms-note-selected");
    const group = target.closest("g");
    if (group && measureEditorArea.contains(group)) {
      group.classList.add("ms-note-selected");
    }
  }
};

const highlightSelectedMeasureInMainPreview = (): void => {
  debugScoreArea
    .querySelectorAll(".ms-measure-selected")
    .forEach((el) => el.classList.remove("ms-measure-selected"));

  if (!selectedMeasure || currentSvgIdToNodeId.size === 0) return;

  for (const [svgId, nodeId] of currentSvgIdToNodeId.entries()) {
    const location = nodeIdToLocation.get(nodeId);
    if (!location) continue;
    if (location.partId !== selectedMeasure.partId || location.measureNumber !== selectedMeasure.measureNumber) {
      continue;
    }
    const target = document.getElementById(svgId);
    if (!target || !debugScoreArea.contains(target)) continue;
    target.classList.add("ms-measure-selected");
    const group = target.closest("g");
    if (group && debugScoreArea.contains(group)) {
      group.classList.add("ms-measure-selected");
    }
  }
};

const renderDiagnostics = (): void => {
  diagArea.innerHTML = "";

  const dispatch = state.lastDispatchResult;
  const save = state.lastSaveResult;

  if (!dispatch && !save) {
    diagArea.textContent = "診断なし";
    return;
  }

  if (dispatch) {
    for (const diagnostic of dispatch.diagnostics) {
      const line = document.createElement("div");
      line.className = "diag-error";
      line.textContent = `[dispatch][${diagnostic.code}] ${diagnostic.message}`;
      diagArea.appendChild(line);
    }
    for (const warning of dispatch.warnings) {
      const line = document.createElement("div");
      line.className = "diag-warning";
      line.textContent = `[dispatch][${warning.code}] ${warning.message}`;
      diagArea.appendChild(line);
    }
  }

  if (save) {
    for (const diagnostic of save.diagnostics) {
      const line = document.createElement("div");
      line.className = "diag-error";
      line.textContent = `[save][${diagnostic.code}] ${diagnostic.message}`;
      diagArea.appendChild(line);
    }
  }

  if (!diagArea.firstChild) {
    diagArea.textContent = "診断なし";
  }
};

const renderUiMessage = (): void => {
  uiMessage.classList.remove("ms-ui-message--error", "ms-ui-message--warning");
  uiMessage.textContent = "";

  const dispatch = state.lastDispatchResult;
  if (dispatch) {
    if (!dispatch.ok && dispatch.diagnostics.length > 0) {
      const d = dispatch.diagnostics[0];
      uiMessage.textContent = `エラー: ${d.message} (${d.code})`;
      uiMessage.classList.add("ms-ui-message--error");
      uiMessage.classList.remove("md-hidden");
      return;
    }
    if (dispatch.warnings.length > 0) {
      const w = dispatch.warnings[0];
      uiMessage.textContent = `警告: ${w.message} (${w.code})`;
      uiMessage.classList.add("ms-ui-message--warning");
      uiMessage.classList.remove("md-hidden");
      return;
    }
  }

  const save = state.lastSaveResult;
  if (save && !save.ok && save.diagnostics.length > 0) {
    const d = save.diagnostics[0];
    uiMessage.textContent = `エラー: ${d.message} (${d.code})`;
    uiMessage.classList.add("ms-ui-message--error");
    uiMessage.classList.remove("md-hidden");
    return;
  }

  uiMessage.classList.add("md-hidden");
};

const renderOutput = (): void => {
  saveModeText.textContent = state.lastSaveResult ? state.lastSaveResult.mode : "-";
  outputXml.value = state.lastSaveResult?.ok ? state.lastSaveResult.xml : "";
  downloadBtn.disabled = !state.lastSaveResult?.ok;
  downloadMidiBtn.disabled = !state.lastSaveResult?.ok;
  downloadAbcBtn.disabled = !state.lastSaveResult?.ok;
};

const renderControlState = (): void => {
  const hasDraft = Boolean(draftCore);
  const hasSelection = Boolean(state.selectedNodeId);
  noteSelect.disabled = !hasDraft;
  pitchStepDownBtn.disabled = !hasDraft || !hasSelection || selectedDraftNoteIsRest;
  pitchStepUpBtn.disabled = !hasDraft || !hasSelection || selectedDraftNoteIsRest;
  for (const btn of pitchAlterBtns) {
    btn.disabled = !hasDraft || !hasSelection || selectedDraftNoteIsRest;
  }
  splitNoteBtn.disabled = !hasDraft || !hasSelection || selectedDraftNoteIsRest;
  convertRestBtn.disabled = !hasDraft || !hasSelection || !selectedDraftNoteIsRest;
  deleteBtn.disabled = !hasDraft || !hasSelection || selectedDraftNoteIsRest;
  playMeasureBtn.disabled = !hasDraft || isPlaying;
  playBtn.disabled = !state.loaded || isPlaying;
  stopBtn.disabled = !isPlaying;
};

const renderAll = (): void => {
  renderInputMode();
  renderNotes();
  syncStepFromSelectedDraftNote();
  renderStatus();
  renderUiMessage();
  renderDiagnostics();
  renderOutput();
  renderMeasureEditorState();
  renderControlState();
  highlightSelectedMeasureInMainPreview();
  highlightSelectedDraftNoteInEditor();
};

const setUiMappingDiagnostic = (message: string): void => {
  if (DEBUG_LOG) {
    console.warn(`[mikuscore][click-map][MVP_TARGET_NOT_FOUND] ${message}`);
  }
  state.lastDispatchResult = {
    ok: false,
    dirtyChanged: false,
    changedNodeIds: [],
    affectedMeasureNumbers: [],
    diagnostics: [{ code: "MVP_TARGET_NOT_FOUND", message }],
    warnings: [],
  };
  renderAll();
};

const rebuildNodeLocationMap = (doc: Document): void => {
  nodeIdToLocation = new Map<string, NoteLocation>();
  const notes = Array.from(doc.querySelectorAll("part > measure > note"));
  const count = Math.min(notes.length, state.noteNodeIds.length);
  for (let i = 0; i < count; i += 1) {
    const note = notes[i];
    const part = note.closest("part");
    const measure = note.closest("measure");
    if (!part || !measure) continue;
    const nodeId = state.noteNodeIds[i];
    const partId = part.getAttribute("id") ?? "";
    const measureNumber = measure.getAttribute("number") ?? "";
    if (!partId || !measureNumber) continue;
    nodeIdToLocation.set(nodeId, { partId, measureNumber });
  }
};

const rebuildPartNameMap = (doc: Document): void => {
  partIdToName = new Map<string, string>();
  for (const scorePart of Array.from(doc.querySelectorAll("score-partwise > part-list > score-part"))) {
    const partId = scorePart.getAttribute("id")?.trim() ?? "";
    if (!partId) continue;
    const partName =
      scorePart.querySelector(":scope > part-name")?.textContent?.trim() ||
      scorePart.querySelector(":scope > part-abbreviation")?.textContent?.trim() ||
      partId;
    partIdToName.set(partId, partName);
  }
};

const buildRenderXmlForVerovio = (
  xml: string
): { renderDoc: Document | null; svgIdToNodeId: Map<string, string>; noteCount: number } => {
  const sourceDoc = parseMusicXmlDocument(xml);
  if (!sourceDoc) {
    return {
      renderDoc: null,
      svgIdToNodeId: new Map<string, string>(),
      noteCount: 0,
    };
  }
  if (!state.loaded) {
    return {
      renderDoc: sourceDoc,
      svgIdToNodeId: new Map<string, string>(),
      noteCount: 0,
    };
  }
  return buildRenderDocWithNodeIds(sourceDoc, state.noteNodeIds.slice(), "mks-main");
};

const deriveRenderedNoteIds = (root: Element): string[] => {
  const direct = Array.from(
    root.querySelectorAll<HTMLElement>('[id^="mks-"], [id*="mks-"]')
  ).map((el) => el.id);
  if (direct.length > 0) {
    return Array.from(new Set(direct));
  }
  const fallback = Array.from(root.querySelectorAll<HTMLElement>("[id]"))
    .filter((el) => {
      const id = el.id || "";
      const className = el.getAttribute("class") ?? "";
      return id.startsWith("note-") || /\bnote\b/.test(className);
    })
    .map((el) => el.id);
  return Array.from(new Set(fallback));
};

const buildFallbackSvgIdMap = (
  sourceNodeIds: string[],
  renderedNoteIds: string[]
): Map<string, string> => {
  const map = new Map<string, string>();
  const count = Math.min(sourceNodeIds.length, renderedNoteIds.length);
  for (let i = 0; i < count; i += 1) {
    map.set(renderedNoteIds[i], sourceNodeIds[i]);
  }
  return map;
};

const resolveNodeIdFromCandidateIds = (
  candidateIds: string[],
  svgIdMap: Map<string, string>
): string | null => {
  for (const entry of candidateIds) {
    const exact = svgIdMap.get(entry);
    if (exact) return exact;
  }
  for (const entry of candidateIds) {
    for (const [knownSvgId, nodeId] of svgIdMap.entries()) {
      if (entry.startsWith(`${knownSvgId}-`) || knownSvgId.startsWith(`${entry}-`)) {
        return nodeId;
      }
    }
  }
  return null;
};

const collectCandidateIdsFromElement = (base: Element | null): string[] => {
  if (!base) return [];
  const candidateIds: string[] = [];
  const pushId = (value: string | null | undefined): void => {
    if (!value) return;
    const id = value.startsWith("#") ? value.slice(1) : value;
    if (!id) return;
    if (!candidateIds.includes(id)) candidateIds.push(id);
  };

  let cursor: Element | null = base;
  let depth = 0;
  while (cursor && depth < 16) {
    pushId(cursor.getAttribute("id"));
    pushId(cursor.getAttribute("href"));
    pushId(cursor.getAttribute("xlink:href"));
    cursor = cursor.parentElement;
    depth += 1;
  }

  return candidateIds;
};

const resolveNodeIdFromSvgTarget = (target: EventTarget | null, clickEvent?: MouseEvent): string | null => {
  if (!target || !(target instanceof Element)) return null;
  const directCandidates = collectCandidateIdsFromElement(target);
  const resolvedFromDirect = resolveNodeIdFromCandidateIds(directCandidates, currentSvgIdToNodeId);
  if (resolvedFromDirect) return resolvedFromDirect;

  if (clickEvent && typeof document.elementsFromPoint === "function") {
    const hitElements = document.elementsFromPoint(clickEvent.clientX, clickEvent.clientY);
    for (const hit of hitElements) {
      if (!(hit instanceof Element)) continue;
      const hitCandidates = collectCandidateIdsFromElement(hit);
      const resolvedFromHit = resolveNodeIdFromCandidateIds(hitCandidates, currentSvgIdToNodeId);
      if (resolvedFromHit) return resolvedFromHit;
    }
  }

  if (DEBUG_LOG) {
    console.warn("[mikuscore][click-map] unresolved candidates:", {
      tag: target.tagName,
      className: target.getAttribute("class"),
      candidates: directCandidates,
    });
  }
  return null;
};

const resolveDraftNodeIdFromSvgTarget = (target: EventTarget | null, clickEvent?: MouseEvent): string | null => {
  if (!target || !(target instanceof Element)) return null;
  const directCandidates = collectCandidateIdsFromElement(target);
  const resolvedFromDirect = resolveNodeIdFromCandidateIds(directCandidates, draftSvgIdToNodeId);
  if (resolvedFromDirect) return resolvedFromDirect;

  if (clickEvent && typeof document.elementsFromPoint === "function") {
    const hitElements = document.elementsFromPoint(clickEvent.clientX, clickEvent.clientY);
    for (const hit of hitElements) {
      if (!(hit instanceof Element)) continue;
      const hitCandidates = collectCandidateIdsFromElement(hit);
      const resolvedFromHit = resolveNodeIdFromCandidateIds(hitCandidates, draftSvgIdToNodeId);
      if (resolvedFromHit) return resolvedFromHit;
    }
  }
  return null;
};

const resolveNodeIdFromNearestPointInArea = (
  clickEvent: MouseEvent,
  area: ParentNode,
  svgIdToNodeId: Map<string, string>,
  snapPx: number = NOTE_CLICK_SNAP_PX
): string | null => {
  let bestNodeId: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const [svgId, nodeId] of svgIdToNodeId.entries()) {
    const el = area.querySelector<SVGGraphicsElement>(`#${CSS.escape(svgId)}`);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (!Number.isFinite(rect.left) || rect.width <= 0 || rect.height <= 0) continue;

    const dx =
      clickEvent.clientX < rect.left
        ? rect.left - clickEvent.clientX
        : clickEvent.clientX > rect.right
          ? clickEvent.clientX - rect.right
          : 0;
    const dy =
      clickEvent.clientY < rect.top
        ? rect.top - clickEvent.clientY
        : clickEvent.clientY > rect.bottom
          ? clickEvent.clientY - rect.bottom
          : 0;
    const score = Math.hypot(dx, dy);
    if (score < bestScore) {
      bestScore = score;
      bestNodeId = nodeId;
    }
  }
  return bestScore <= snapPx ? bestNodeId : null;
};

const resolveNodeIdFromNearestPoint = (clickEvent: MouseEvent): string | null => {
  return resolveNodeIdFromNearestPointInArea(clickEvent, debugScoreArea, currentSvgIdToNodeId, NOTE_CLICK_SNAP_PX);
};

const resolveDraftNodeIdFromNearestPoint = (clickEvent: MouseEvent): string | null => {
  return resolveNodeIdFromNearestPointInArea(clickEvent, measureEditorArea, draftSvgIdToNodeId, NOTE_CLICK_SNAP_PX);
};

const extractMeasureEditorXml = (xml: string, partId: string, measureNumber: string): string | null => {
  const sourceDoc = parseMusicXmlDocument(xml);
  if (!sourceDoc) return null;
  const extractedDoc = extractMeasureEditorDocument(sourceDoc, partId, measureNumber);
  if (!extractedDoc) return null;
  return serializeMusicXmlDocument(extractedDoc);
};

const initializeMeasureEditor = (location: NoteLocation): void => {
  const xml = core.debugSerializeCurrentXml();
  if (!xml) return;
  const extracted = extractMeasureEditorXml(xml, location.partId, location.measureNumber);
  if (!extracted) {
    setUiMappingDiagnostic("選択小節の抽出に失敗しました。");
    return;
  }
  const nextDraft = new ScoreCore({ editableVoice: EDITABLE_VOICE });
  try {
    nextDraft.load(extracted);
  } catch (error) {
    setUiMappingDiagnostic(`選択小節の読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  draftCore = nextDraft;
  draftNoteNodeIds = nextDraft.listNoteNodeIds();
  state.selectedNodeId = draftNoteNodeIds[0] ?? null;
  selectedMeasure = location;
  state.lastDispatchResult = null;
  draftSvgIdToNodeId = new Map<string, string>();
  renderAll();
  renderMeasureEditorPreview();
};

const onVerovioScoreClick = (event: MouseEvent): void => {
  if (!state.loaded) return;
  const nodeId = resolveNodeIdFromSvgTarget(event.target, event) ?? resolveNodeIdFromNearestPoint(event);
  if (DEBUG_LOG) {
    const clicked = event.target instanceof Element ? event.target.closest("[id]") : null;
    console.warn("[mikuscore][click-map] resolution:", {
      clickedId: clicked?.getAttribute("id") ?? null,
      mappedNodeId: nodeId,
      mapSize: currentSvgIdToNodeId.size,
    });
  }
  if (!nodeId) {
    setUiMappingDiagnostic("クリック位置からノートを特定できませんでした。");
    return;
  }
  if (!state.noteNodeIds.includes(nodeId)) {
    setUiMappingDiagnostic(`クリック要素に対応する nodeId が見つかりませんでした: ${nodeId}`);
    return;
  }
  const location = nodeIdToLocation.get(nodeId);
  if (!location) {
    setUiMappingDiagnostic(`nodeId からトラック/小節を特定できませんでした: ${nodeId}`);
    return;
  }
  initializeMeasureEditor(location);
};

const onMeasureEditorClick = (event: MouseEvent): void => {
  if (!draftCore) return;
  const nodeId = resolveDraftNodeIdFromSvgTarget(event.target, event) ?? resolveDraftNodeIdFromNearestPoint(event);
  if (!nodeId || !draftNoteNodeIds.includes(nodeId)) return;
  state.selectedNodeId = nodeId;
  state.lastDispatchResult = null;
  renderAll();
};

const renderScorePreview = (): void => {
  const renderSeq = ++verovioRenderSeq;
  const xml =
    (state.loaded ? core.debugSerializeCurrentXml() : null) ??
    xmlInput.value.trim() ??
    "";
  if (!xml) {
    debugScoreMeta.textContent = "描画対象XMLがありません";
    debugScoreArea.innerHTML = "";
    currentSvgIdToNodeId = new Map();
    return;
  }
  const renderBundle = buildRenderXmlForVerovio(xml);
  const renderDoc = renderBundle.renderDoc;
  if (!renderDoc) {
    debugScoreMeta.textContent = "描画失敗: MusicXML解析失敗";
    debugScoreArea.innerHTML = "";
    currentSvgIdToNodeId = new Map();
    return;
  }
  debugScoreMeta.textContent = "verovio 描画中...";
  void renderMusicXmlDomToSvg(renderDoc, {
    pageWidth: 20000,
    pageHeight: 3000,
    scale: 40,
    breaks: "none",
    mnumInterval: 1,
    adjustPageHeight: 1,
    footer: "none",
    header: "none",
  })
    .then(({ svg, pageCount }) => {
      if (renderSeq !== verovioRenderSeq) return;

      const measures = renderDoc.querySelectorAll("part > measure").length;
      debugScoreArea.innerHTML = svg;

      const renderedNoteIds = deriveRenderedNoteIds(debugScoreArea);
      let mapMode = "direct";
      if (renderedNoteIds.length > 0 && !renderedNoteIds.some((id) => id.startsWith("mks-"))) {
        currentSvgIdToNodeId = buildFallbackSvgIdMap(state.noteNodeIds, renderedNoteIds);
        mapMode = "fallback-seq";
      } else {
        currentSvgIdToNodeId = renderBundle.svgIdToNodeId;
      }
      if (DEBUG_LOG) {
        console.warn("[mikuscore][click-map] render map prepared:", {
          mapMode,
          mappedNotes: currentSvgIdToNodeId.size,
          renderedNoteIds: renderedNoteIds.slice(0, 20),
        });
      }
      highlightSelectedMeasureInMainPreview();

      debugScoreMeta.textContent = [
        "engine=verovio",
        "measures=" + measures,
        "mode=long-horizontal",
        "pages=" + pageCount,
        "click-map-notes=" + renderBundle.noteCount,
        "map-mode=" + mapMode,
      ].join(" ");
    })
    .catch((error: unknown) => {
      if (renderSeq !== verovioRenderSeq) return;
      const message = error instanceof Error ? error.message : String(error);
      debugScoreMeta.textContent = "描画失敗: " + message;
      debugScoreArea.innerHTML = "";
      currentSvgIdToNodeId = new Map();
    });
};

const renderMeasureEditorPreview = (): void => {
  if (!draftCore || !selectedMeasure) {
    measureEditorArea.innerHTML = "";
    draftSvgIdToNodeId = new Map<string, string>();
    return;
  }
  const xml = draftCore.debugSerializeCurrentXml();
  if (!xml) {
    measureEditorArea.innerHTML = "";
    draftSvgIdToNodeId = new Map<string, string>();
    return;
  }
  const sourceDoc = parseMusicXmlDocument(xml);
  if (!sourceDoc) {
    measureEditorArea.innerHTML = "描画失敗: MusicXML解析失敗";
    draftSvgIdToNodeId = new Map<string, string>();
    return;
  }
  const renderBundle = buildRenderDocWithNodeIds(sourceDoc, draftNoteNodeIds.slice(), "mks-draft");
  const renderDoc = renderBundle.renderDoc;
  if (!renderDoc) {
    measureEditorArea.innerHTML = "描画失敗: MusicXML解析失敗";
    draftSvgIdToNodeId = new Map<string, string>();
    return;
  }
  measureEditorArea.innerHTML = "描画中...";
  void renderMusicXmlDomToSvg(renderDoc, {
    pageWidth: 6000,
    pageHeight: 2200,
    scale: 58,
    breaks: "none",
    adjustPageHeight: 1,
    footer: "none",
    header: "none",
  })
    .then(({ svg }) => {
      measureEditorArea.innerHTML = svg;

      const renderedNoteIds = deriveRenderedNoteIds(measureEditorArea);
      if (renderedNoteIds.length > 0 && !renderedNoteIds.some((id) => id.startsWith("mks-"))) {
        draftSvgIdToNodeId = buildFallbackSvgIdMap(draftNoteNodeIds, renderedNoteIds);
      } else {
        draftSvgIdToNodeId = renderBundle.svgIdToNodeId;
      }
      highlightSelectedDraftNoteInEditor();
    })
    .catch((error: unknown) => {
      measureEditorArea.innerHTML = `描画失敗: ${error instanceof Error ? error.message : String(error)}`;
      draftSvgIdToNodeId = new Map<string, string>();
    });
};

const refreshNotesFromCore = (): void => {
  state.noteNodeIds = core.listNoteNodeIds();
  const currentXml = core.debugSerializeCurrentXml();
  if (currentXml) {
    const currentDoc = parseMusicXmlDocument(currentXml);
    if (currentDoc) {
      rebuildNodeLocationMap(currentDoc);
      rebuildPartNameMap(currentDoc);
    } else {
      nodeIdToLocation = new Map<string, NoteLocation>();
      partIdToName = new Map<string, string>();
    }
  } else {
    nodeIdToLocation = new Map<string, NoteLocation>();
    partIdToName = new Map<string, string>();
  }
};

type SynthSchedule = {
  tempo: number;
  events: Array<{
    midiNumber: number;
    start: number;
    ticks: number;
    channel: number;
  }>;
};

const midiToHz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

const PLAYBACK_TICKS_PER_QUARTER = 128;
const FIXED_PLAYBACK_WAVEFORM: OscillatorType = "sine";

const normalizeWaveform = (value: string): OscillatorType => {
  if (value === "square" || value === "triangle") return value;
  return "sine";
};

const createBasicWaveSynthEngine = (options: { ticksPerQuarter: number }) => {
  const ticksPerQuarter = Number.isFinite(options.ticksPerQuarter)
    ? Math.max(1, Math.round(options.ticksPerQuarter))
    : 128;
  let audioContext: AudioContext | null = null;
  let activeSynthNodes: Array<{ oscillator: OscillatorNode; gainNode: GainNode }> = [];
  let synthStopTimer: number | null = null;

  const scheduleBasicWaveNote = (
    event: SynthSchedule["events"][number],
    startAt: number,
    bodyDuration: number,
    waveform: OscillatorType
  ): number => {
    if (!audioContext) return startAt;
    const attack = 0.005;
    const release = 0.03;
    const endAt = startAt + bodyDuration;
    const oscillator = audioContext.createOscillator();
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(midiToHz(event.midiNumber), startAt);

    const gainNode = audioContext.createGain();
    const gainLevel = event.channel === 10 ? 0.06 : 0.1;
    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.linearRampToValueAtTime(gainLevel, startAt + attack);
    gainNode.gain.setValueAtTime(gainLevel, endAt);
    gainNode.gain.linearRampToValueAtTime(0.0001, endAt + release);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start(startAt);
    oscillator.stop(endAt + release + 0.01);
    oscillator.onended = () => {
      try {
        oscillator.disconnect();
        gainNode.disconnect();
      } catch {
        // ignore cleanup failure
      }
    };
    activeSynthNodes.push({ oscillator, gainNode });
    return endAt + release + 0.02;
  };

  const stop = (): void => {
    if (synthStopTimer !== null) {
      window.clearTimeout(synthStopTimer);
      synthStopTimer = null;
    }
    for (const node of activeSynthNodes) {
      try {
        node.oscillator.stop();
      } catch {
        // ignore already-stopped nodes
      }
      try {
        node.oscillator.disconnect();
        node.gainNode.disconnect();
      } catch {
        // ignore disconnect error
      }
    }
    activeSynthNodes = [];
  };

  const playSchedule = async (
    schedule: SynthSchedule,
    waveform: OscillatorType,
    onEnded?: () => void
  ): Promise<void> => {
    if (!schedule || !Array.isArray(schedule.events) || schedule.events.length === 0) {
      throw new Error("先に変換してください。");
    }

    if (!audioContext) {
      audioContext = new AudioContext();
    }
    stop();
    await audioContext.resume();

    const normalizedWaveform = normalizeWaveform(waveform);
    const secPerTick = 60 / (Math.max(1, Number(schedule.tempo) || 120) * ticksPerQuarter);
    const baseTime = audioContext.currentTime + 0.04;
    let latestEndTime = baseTime;

    for (const event of schedule.events) {
      const startAt = baseTime + event.start * secPerTick;
      const bodyDuration = Math.max(0.04, event.ticks * secPerTick);
      latestEndTime = Math.max(latestEndTime, scheduleBasicWaveNote(event, startAt, bodyDuration, normalizedWaveform));
    }

    const waitMs = Math.max(0, Math.ceil((latestEndTime - audioContext.currentTime) * 1000));
    synthStopTimer = window.setTimeout(() => {
      activeSynthNodes = [];
      if (typeof onEnded === "function") {
        onEnded();
      }
    }, waitMs);
  };

  return { playSchedule, stop };
};

const synthEngine = createBasicWaveSynthEngine({ ticksPerQuarter: PLAYBACK_TICKS_PER_QUARTER });

const stopPlayback = (): void => {
  synthEngine.stop();
  isPlaying = false;
  playbackText.textContent = "再生: 停止中";
  renderControlState();
};

const startPlayback = async (): Promise<void> => {
  if (!state.loaded || isPlaying) return;

  const saveResult = core.save();
  state.lastSaveResult = saveResult;
  if (!saveResult.ok) {
    logDiagnostics("playback", saveResult.diagnostics);
    if (saveResult.diagnostics.some((d) => d.code === "MEASURE_OVERFULL")) {
      const debugXml = core.debugSerializeCurrentXml();
      if (debugXml) {
        dumpOverfullContext(debugXml, EDITABLE_VOICE);
      } else if (DEBUG_LOG) {
        console.warn("[mikuscore][debug] no in-memory XML to dump.");
      }
    }
    renderAll();
    playbackText.textContent = "再生: 保存失敗";
    return;
  }

  const playbackDoc = parseMusicXmlDocument(saveResult.xml);
  if (!playbackDoc) {
    playbackText.textContent = "再生: MusicXML解析失敗";
    renderControlState();
    return;
  }
  const parsedPlayback = buildPlaybackEventsFromMusicXmlDoc(playbackDoc, PLAYBACK_TICKS_PER_QUARTER);
  const events = parsedPlayback.events;
  if (events.length === 0) {
    playbackText.textContent = "再生: 再生可能ノートなし";
    renderControlState();
    return;
  }
  let midiBytes: Uint8Array;
  try {
    midiBytes = buildMidiBytesForPlayback(events, parsedPlayback.tempo);
  } catch (error) {
    playbackText.textContent =
      "再生: MIDI生成失敗 (" +
      (error instanceof Error ? error.message : String(error)) +
      ")";
    renderControlState();
    return;
  }

  const schedule: SynthSchedule = {
    tempo: parsedPlayback.tempo,
    events: events
      .slice()
      .sort((a, b) =>
        a.startTicks === b.startTicks ? a.midiNumber - b.midiNumber : a.startTicks - b.startTicks
      )
      .map((event) => ({
        midiNumber: event.midiNumber,
        start: event.startTicks,
        ticks: event.durTicks,
        channel: event.channel,
      })),
  };

  try {
    await synthEngine.playSchedule(schedule, FIXED_PLAYBACK_WAVEFORM, () => {
      isPlaying = false;
      playbackText.textContent = "再生: 停止中";
      renderControlState();
    });
  } catch (error) {
    playbackText.textContent =
      "再生: シンセ再生失敗 (" + (error instanceof Error ? error.message : String(error)) + ")";
    renderControlState();
    return;
  }

  isPlaying = true;
  playbackText.textContent = `再生中: ノート${events.length}件 / MIDI ${midiBytes.length} bytes / 波形 sine`;
  renderControlState();
  renderAll();
};

const startMeasurePlayback = async (): Promise<void> => {
  if (!draftCore || isPlaying) return;

  const saveResult = draftCore.save();
  if (!saveResult.ok) {
    state.lastDispatchResult = {
      ok: false,
      dirtyChanged: false,
      changedNodeIds: [],
      affectedMeasureNumbers: [],
      diagnostics: saveResult.diagnostics,
      warnings: [],
    };
    logDiagnostics("playback", saveResult.diagnostics);
    playbackText.textContent = "再生: 小節保存失敗";
    renderAll();
    return;
  }

  const playbackDoc = parseMusicXmlDocument(saveResult.xml);
  if (!playbackDoc) {
    playbackText.textContent = "再生: MusicXML解析失敗";
    renderControlState();
    return;
  }
  const parsedPlayback = buildPlaybackEventsFromMusicXmlDoc(playbackDoc, PLAYBACK_TICKS_PER_QUARTER);
  const events = parsedPlayback.events;
  if (events.length === 0) {
    playbackText.textContent = "再生: この小節に再生可能ノートなし";
    renderControlState();
    return;
  }

  try {
    await synthEngine.playSchedule(
      {
        tempo: parsedPlayback.tempo,
        events: events
          .slice()
          .sort((a, b) =>
            a.startTicks === b.startTicks ? a.midiNumber - b.midiNumber : a.startTicks - b.startTicks
          )
          .map((event) => ({
            midiNumber: event.midiNumber,
            start: event.startTicks,
            ticks: event.durTicks,
            channel: event.channel,
          })),
      },
      FIXED_PLAYBACK_WAVEFORM,
      () => {
        isPlaying = false;
        playbackText.textContent = "再生: 停止中";
        renderControlState();
      }
    );
  } catch (error) {
    playbackText.textContent =
      "再生: 小節再生失敗 (" + (error instanceof Error ? error.message : String(error)) + ")";
    renderControlState();
    return;
  }

  isPlaying = true;
  playbackText.textContent = `再生中: 選択小節 ノート${events.length}件 / 波形 sine`;
  renderControlState();
};

const readSelectedPitch = (): Pitch | null => {
  const step = pitchStep.value.trim();
  if (!isPitchStepValue(step)) return null;

  const octave = Number(pitchOctave.value);
  if (!Number.isInteger(octave)) return null;

  const alterText = normalizeAlterValue(pitchAlter.value);
  const base: Pitch = {
    step,
    octave,
  };
  if (alterText === "none") {
    return base;
  }
  const alter = Number(alterText);
  if (!Number.isInteger(alter) || alter < -2 || alter > 2) return null;
  return { ...base, alter: alter as -2 | -1 | 0 | 1 | 2 };
};

const readDuration = (): number | null => {
  const duration = Number(durationPreset.value);
  if (!Number.isInteger(duration) || duration <= 0) return null;
  return duration;
};

const commandVoiceForSelection = (): string => {
  const voice = String(selectedDraftVoice || "").trim();
  return voice || EDITABLE_VOICE;
};

const onDurationPresetChange = (): void => {
  if (suppressDurationPresetEvent) return;
  const preset = Number(durationPreset.value);
  if (!Number.isInteger(preset) || preset <= 0) return;
  if (Number.isInteger(selectedDraftDurationValue) && selectedDraftDurationValue === preset) return;
  const targetNodeId = requireSelectedNode();
  if (!targetNodeId) return;
  const command: ChangeDurationCommand = {
    type: "change_duration",
    targetNodeId,
    voice: commandVoiceForSelection(),
    duration: preset,
  };
  const result = runCommand(command);
  if (!result || result.ok) return;
  const first = result.diagnostics[0];
  if (first?.code === "MEASURE_OVERFULL") {
    state.lastDispatchResult = {
      ...result,
      diagnostics: [
        {
          code: first.code,
          message: "この音価には変更できません。小節内の長さ上限を超えます。",
        },
      ],
    };
    renderAll();
  }
};

const runCommand = (command: CoreCommand): DispatchResult | null => {
  if (!draftCore) return null;
  state.lastDispatchResult = draftCore.dispatch(command);
  if (!state.lastDispatchResult.ok || state.lastDispatchResult.warnings.length > 0) {
    logDiagnostics(
      "dispatch",
      state.lastDispatchResult.diagnostics,
      state.lastDispatchResult.warnings
    );
  }
  state.lastSaveResult = null;

  if (state.lastDispatchResult.ok) {
    draftNoteNodeIds = draftCore.listNoteNodeIds();
    if (state.selectedNodeId && !draftNoteNodeIds.includes(state.selectedNodeId)) {
      state.selectedNodeId = draftNoteNodeIds[0] ?? null;
    }
  }
  renderAll();
  renderMeasureEditorPreview();
  return state.lastDispatchResult;
};

const autoSaveCurrentXml = (): void => {
  if (!state.loaded) return;
  const result = core.save();
  state.lastSaveResult = result;
  if (!result.ok) {
    logDiagnostics("save", result.diagnostics);
    if (result.diagnostics.some((d) => d.code === "MEASURE_OVERFULL")) {
      const debugXml = core.debugSerializeCurrentXml();
      if (debugXml) {
        dumpOverfullContext(debugXml, EDITABLE_VOICE);
      } else if (DEBUG_LOG) {
        console.warn("[mikuscore][debug] no in-memory XML to dump.");
      }
    }
    return;
  }
  state.lastSuccessfulSaveXml = result.xml;
};

type AbcParsedMeta = {
  title: string;
  composer: string;
  meter: { beats: number; beatType: number };
  keyInfo: { fifths: number };
};

type AbcParsedNote = {
  isRest: boolean;
  duration: number;
  type?: string;
  step?: string;
  octave?: number;
  alter?: number | null;
  accidentalText?: string | null;
  tieStart?: boolean;
  tieStop?: boolean;
  chord?: boolean;
  voice?: string;
};

type AbcParsedPart = {
  partId: string;
  partName: string;
  clef?: string;
  transpose?: { chromatic: number } | null;
  measures: AbcParsedNote[][];
};

type AbcParsedResult = {
  meta: AbcParsedMeta;
  parts: AbcParsedPart[];
  warnings?: string[];
};

const xmlEscape = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const normalizeTypeForMusicXml = (t?: string): string => {
  const raw = String(t || "").trim();
  if (!raw) return "quarter";
  if (raw === "16th" || raw === "32nd" || raw === "64th" || raw === "128th") return raw;
  if (raw === "whole" || raw === "half" || raw === "quarter" || raw === "eighth") return raw;
  return "quarter";
};

const clefXmlFromAbcClef = (rawClef?: string): string => {
  const clef = String(rawClef || "").trim().toLowerCase();
  if (clef === "bass" || clef === "f") {
    return "<clef><sign>F</sign><line>4</line></clef>";
  }
  if (clef === "alto" || clef === "c3") {
    return "<clef><sign>C</sign><line>3</line></clef>";
  }
  if (clef === "tenor" || clef === "c4") {
    return "<clef><sign>C</sign><line>4</line></clef>";
  }
  return "<clef><sign>G</sign><line>2</line></clef>";
};

const buildMusicXmlFromAbcParsed = (parsed: AbcParsedResult): string => {
  const parts = parsed.parts && parsed.parts.length > 0 ? parsed.parts : [{ partId: "P1", partName: "Voice 1", measures: [[]] }];
  const measureCount = parts.reduce((max, part) => Math.max(max, part.measures.length), 1);
  const title = parsed.meta?.title || "mikuscore";
  const composer = parsed.meta?.composer || "Unknown";
  const beats = parsed.meta?.meter?.beats || 4;
  const beatType = parsed.meta?.meter?.beatType || 4;
  const fifths = Number.isFinite(parsed.meta?.keyInfo?.fifths) ? parsed.meta.keyInfo.fifths : 0;

  const partListXml = parts
    .map((part, index) => {
      const midiChannel = ((index % 16) + 1 === 10) ? 11 : ((index % 16) + 1);
      return [
        `<score-part id="${xmlEscape(part.partId)}">`,
        `<part-name>${xmlEscape(part.partName || part.partId)}</part-name>`,
        `<midi-instrument id="${xmlEscape(part.partId)}-I1">`,
        `<midi-channel>${midiChannel}</midi-channel>`,
        `<midi-program>6</midi-program>`,
        "</midi-instrument>",
        "</score-part>",
      ].join("");
    })
    .join("");

  const partBodyXml = parts
    .map((part) => {
      const measuresXml: string[] = [];
      for (let i = 0; i < measureCount; i += 1) {
        const measureNo = i + 1;
        const notes = part.measures[i] ?? [];
        const header =
          i === 0
            ? [
                "<attributes>",
                "<divisions>960</divisions>",
                `<key><fifths>${Math.round(fifths)}</fifths></key>`,
                `<time><beats>${Math.round(beats)}</beats><beat-type>${Math.round(beatType)}</beat-type></time>`,
                part.transpose && Number.isFinite(part.transpose.chromatic)
                  ? `<transpose><chromatic>${Math.round(part.transpose.chromatic)}</chromatic></transpose>`
                  : "",
                clefXmlFromAbcClef(part.clef),
                "</attributes>",
              ].join("")
            : "";

        const notesXml =
          notes.length > 0
            ? notes
                .map((note) => {
                  const chunks: string[] = ["<note>"];
                  if (note.chord) chunks.push("<chord/>");
                  if (note.isRest) {
                    chunks.push("<rest/>");
                  } else {
                    const step = /^[A-G]$/.test(String(note.step || "").toUpperCase()) ? String(note.step).toUpperCase() : "C";
                    const octave = Number.isFinite(note.octave) ? Math.max(0, Math.min(9, Math.round(note.octave as number))) : 4;
                    chunks.push("<pitch>");
                    chunks.push(`<step>${step}</step>`);
                    if (Number.isFinite(note.alter as number) && Number(note.alter) !== 0) {
                      chunks.push(`<alter>${Math.round(Number(note.alter))}</alter>`);
                    }
                    chunks.push(`<octave>${octave}</octave>`);
                    chunks.push("</pitch>");
                  }
                  const duration = Math.max(1, Math.round(Number(note.duration) || 1));
                  chunks.push(`<duration>${duration}</duration>`);
                  chunks.push(`<voice>${xmlEscape(String(note.voice || "1"))}</voice>`);
                  chunks.push(`<type>${normalizeTypeForMusicXml(note.type)}</type>`);
                  if (note.accidentalText) {
                    chunks.push(`<accidental>${xmlEscape(String(note.accidentalText))}</accidental>`);
                  }
                  if (note.tieStart) chunks.push('<tie type="start"/>');
                  if (note.tieStop) chunks.push('<tie type="stop"/>');
                  if (note.tieStart || note.tieStop) {
                    chunks.push("<notations>");
                    if (note.tieStart) chunks.push('<tied type="start"/>');
                    if (note.tieStop) chunks.push('<tied type="stop"/>');
                    chunks.push("</notations>");
                  }
                  chunks.push("</note>");
                  return chunks.join("");
                })
                .join("")
            : '<note><rest/><duration>3840</duration><voice>1</voice><type>whole</type></note>';

        measuresXml.push(`<measure number="${measureNo}">${header}${notesXml}</measure>`);
      }
      return `<part id="${xmlEscape(part.partId)}">${measuresXml.join("")}</part>`;
    })
    .join("");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<score-partwise version="4.0">',
    `<work><work-title>${xmlEscape(title)}</work-title></work>`,
    `<identification><creator type="composer">${xmlEscape(composer)}</creator></identification>`,
    `<part-list>${partListXml}</part-list>`,
    partBodyXml,
    "</score-partwise>",
  ].join("");
};

const convertAbcToMusicXml = (abcSource: string): string => {
  const parsed = AbcCompatParser.parseForMusicXml(abcSource, {
    defaultTitle: "mikuscore",
    defaultComposer: "Unknown",
    inferTransposeFromPartName: true,
  }) as AbcParsedResult;
  return buildMusicXmlFromAbcParsed(parsed);
};

const loadFromText = (xml: string, collapseInputSection: boolean): void => {
  try {
    core.load(xml);
  } catch (err) {
    if (DEBUG_LOG) {
      console.error("[mikuscore][load] load failed:", err);
    }
    state.loaded = false;
    state.lastDispatchResult = {
      ok: false,
      dirtyChanged: false,
      changedNodeIds: [],
      affectedMeasureNumbers: [],
      diagnostics: [
        {
          code: "MVP_COMMAND_EXECUTION_FAILED",
          message: err instanceof Error ? err.message : "読み込みに失敗しました。",
        },
      ],
      warnings: [],
    };
    state.lastSaveResult = null;
    logDiagnostics("load", state.lastDispatchResult.diagnostics);
    renderAll();
    return;
  }

  state.loaded = true;
  state.selectedNodeId = null;
  state.lastDispatchResult = null;
  state.lastSaveResult = null;
  state.lastSuccessfulSaveXml = "";
  selectedMeasure = null;
  draftCore = null;
  draftNoteNodeIds = [];
  draftSvgIdToNodeId = new Map<string, string>();
  refreshNotesFromCore();
  autoSaveCurrentXml();
  if (collapseInputSection) {
    inputSectionDetails.open = false;
  }
  renderAll();
  renderScorePreview();
};

const onLoadClick = async (): Promise<void> => {
  if (inputTypeNew.checked) {
    const sourceText = createNewMusicXml();
    xmlInput.value = sourceText;
    loadFromText(sourceText, true);
    return;
  }

  let sourceText = "";
  const treatAsAbc = inputTypeAbc.checked;

  if (inputModeFile.checked) {
    const selected = fileInput.files?.[0];
    if (!selected) {
      state.lastDispatchResult = {
        ok: false,
        dirtyChanged: false,
        changedNodeIds: [],
        affectedMeasureNumbers: [],
        diagnostics: [{ code: "MVP_INVALID_COMMAND_PAYLOAD", message: "ファイルを選択してください。" }],
        warnings: [],
      };
      renderAll();
      return;
    }
    sourceText = await selected.text();
    if (treatAsAbc) {
      abcInput.value = sourceText;
    } else {
      xmlInput.value = sourceText;
    }
  } else if (!treatAsAbc) {
    sourceText = xmlInput.value;
  } else {
    sourceText = abcInput.value;
  }

  if (treatAsAbc) {
    try {
      const convertedXml = convertAbcToMusicXml(sourceText);
      xmlInput.value = convertedXml;
      loadFromText(convertedXml, true);
    } catch (error) {
      state.lastDispatchResult = {
        ok: false,
        dirtyChanged: false,
        changedNodeIds: [],
        affectedMeasureNumbers: [],
        diagnostics: [
          {
            code: "MVP_INVALID_COMMAND_PAYLOAD",
            message: `ABCの解析に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        warnings: [],
      };
      renderAll();
    }
    return;
  }

  loadFromText(sourceText, true);
};

const createNewMusicXml = (): string => {
  const partCount = normalizeNewPartCount();
  const parsedFifths = Number(newKeyFifthsSelect.value);
  const fifths = Number.isFinite(parsedFifths) ? Math.max(-7, Math.min(7, Math.round(parsedFifths))) : 0;
  const beats = normalizeNewTimeBeats();
  const beatType = normalizeNewTimeBeatType();
  const divisions = 960;
  const measureCount = 8;
  const measureDuration = Math.max(1, Math.round(divisions * beats * (4 / beatType)));
  const clefs = listCurrentNewPartClefs();

  const partListXml = Array.from({ length: partCount }, (_, i) => {
    const partId = `P${i + 1}`;
    const midiChannel = ((i % 16) + 1 === 10) ? 11 : ((i % 16) + 1);
    return [
      `<score-part id="${partId}">`,
      `<part-name>Part ${i + 1}</part-name>`,
      `<midi-instrument id="${partId}-I1">`,
      `<midi-channel>${midiChannel}</midi-channel>`,
      `<midi-program>6</midi-program>`,
      "</midi-instrument>",
      "</score-part>",
    ].join("");
  }).join("");

  const partsXml = Array.from({ length: partCount }, (_, i) => {
    const partId = `P${i + 1}`;
    const clefKeyword = normalizeClefKeyword(clefs[i] ?? "treble");
    const clefXml = clefXmlFromAbcClef(clefKeyword);
    const measuresXml = Array.from({ length: measureCount }, (_unused, m) => {
      const number = m + 1;
      const attrs = m === 0
        ? [
            "<attributes>",
            `<divisions>${divisions}</divisions>`,
            `<key><fifths>${fifths}</fifths><mode>major</mode></key>`,
            `<time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>`,
            clefXml,
            "</attributes>",
          ].join("")
        : "";
      return [
        `<measure number="${number}">`,
        attrs,
        `<note><rest measure="yes"/><duration>${measureDuration}</duration><voice>1</voice></note>`,
        "</measure>",
      ].join("");
    }).join("");
    return [
      `<part id="${partId}">`,
      measuresXml,
      "</part>",
    ].join("");
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <work>
    <work-title>Untitled</work-title>
  </work>
  <identification>
    <creator type="composer">Unknown</creator>
  </identification>
  <part-list>${partListXml}</part-list>
  ${partsXml}
</score-partwise>`;
};

const requireSelectedNode = (): string | null => {
  if (!draftCore) {
    state.lastDispatchResult = {
      ok: false,
      dirtyChanged: false,
      changedNodeIds: [],
      affectedMeasureNumbers: [],
      diagnostics: [{ code: "MVP_COMMAND_TARGET_MISSING", message: "先に小節を選択してください。" }],
      warnings: [],
    };
    renderAll();
    return null;
  }
  const nodeId = state.selectedNodeId;
  if (nodeId) return nodeId;
  state.lastDispatchResult = {
    ok: false,
    dirtyChanged: false,
    changedNodeIds: [],
    affectedMeasureNumbers: [],
    diagnostics: [{ code: "MVP_COMMAND_TARGET_MISSING", message: "ノートを選択してください。" }],
    warnings: [],
  };
  renderAll();
  return null;
};

const onChangePitch = (): void => {
  const targetNodeId = requireSelectedNode();
  if (!targetNodeId) return;
  const pitch = readSelectedPitch();
  if (!pitch) {
    state.lastDispatchResult = {
      ok: false,
      dirtyChanged: false,
      changedNodeIds: [],
      affectedMeasureNumbers: [],
      diagnostics: [{ code: "MVP_INVALID_COMMAND_PAYLOAD", message: "pitch 入力が不正です。" }],
      warnings: [],
    };
    renderAll();
    return;
  }

  const command: ChangePitchCommand = {
    type: "change_to_pitch",
    targetNodeId,
    voice: commandVoiceForSelection(),
    pitch,
  };
  runCommand(command);
};

const onPitchStepAutoChange = (): void => {
  if (!draftCore || !state.selectedNodeId || selectedDraftNoteIsRest) return;
  onChangePitch();
};

const onAlterAutoChange = (): void => {
  if (!draftCore || !state.selectedNodeId || selectedDraftNoteIsRest) return;
  renderAlterButtons();
  onChangePitch();
};

const shiftPitchStep = (delta: 1 | -1): void => {
  if (!draftCore || !state.selectedNodeId || selectedDraftNoteIsRest) return;
  const order: Pitch["step"][] = ["C", "D", "E", "F", "G", "A", "B"];
  const current = pitchStep.value.trim();
  if (!isPitchStepValue(current)) return;
  const index = order.indexOf(current);
  if (index < 0) return;
  // Clamp lower bound to A0.
  if (delta === -1) {
    const currentOctave = Number(pitchOctave.value);
    if (Number.isInteger(currentOctave) && currentOctave === 0 && current !== "B") {
      return;
    }
  }
  const rawNext = index + delta;
  let nextIndex = rawNext;
  let octave = Number(pitchOctave.value);
  if (!Number.isInteger(octave)) octave = 4;

  if (rawNext < 0) {
    if (octave <= 0) {
      return;
    }
    octave -= 1;
    nextIndex = order.length - 1;
  } else if (rawNext >= order.length) {
    if (octave >= 9) {
      return;
    }
    octave += 1;
    nextIndex = 0;
  }

  pitchOctave.value = String(octave);
  pitchStep.value = order[nextIndex];
  renderPitchStepValue();
  onPitchStepAutoChange();
};

const replaceMeasureInMainXml = (sourceXml: string, partId: string, measureNumber: string, measureXml: string): string | null => {
  const mainDoc = parseMusicXmlDocument(sourceXml);
  const measureDoc = parseMusicXmlDocument(measureXml);
  if (!mainDoc || !measureDoc) return null;
  const mergedDoc = replaceMeasureInMainDocument(mainDoc, partId, measureNumber, measureDoc);
  if (!mergedDoc) return null;
  return serializeMusicXmlDocument(mergedDoc);
};

const onMeasureApply = (): void => {
  if (!draftCore || !selectedMeasure) return;
  const draftSave = draftCore.save();
  if (!draftSave.ok) {
    state.lastDispatchResult = {
      ok: false,
      dirtyChanged: false,
      changedNodeIds: [],
      affectedMeasureNumbers: [],
      diagnostics: draftSave.diagnostics,
      warnings: [],
    };
    renderAll();
    return;
  }

  const mainXml = core.debugSerializeCurrentXml();
  if (!mainXml) return;
  const merged = replaceMeasureInMainXml(
    mainXml,
    selectedMeasure.partId,
    selectedMeasure.measureNumber,
    draftSave.xml
  );
  if (!merged) {
    setUiMappingDiagnostic("小節確定に失敗しました。");
    return;
  }

  try {
    core.load(merged);
  } catch (error) {
    setUiMappingDiagnostic(`小節確定後の再読込に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  state.loaded = true;
  state.lastDispatchResult = null;
  refreshNotesFromCore();
  autoSaveCurrentXml();
  renderAll();
  renderScorePreview();
  initializeMeasureEditor(selectedMeasure);
};

const onMeasureDiscard = (): void => {
  if (!selectedMeasure) return;
  initializeMeasureEditor(selectedMeasure);
};

const onChangeDuration = (): void => {
  const targetNodeId = requireSelectedNode();
  if (!targetNodeId) return;
  const duration = readDuration();
  if (!duration) {
    state.lastDispatchResult = {
      ok: false,
      dirtyChanged: false,
      changedNodeIds: [],
      affectedMeasureNumbers: [],
      diagnostics: [{ code: "MVP_INVALID_COMMAND_PAYLOAD", message: "duration 入力が不正です。" }],
      warnings: [],
    };
    renderAll();
    return;
  }

  const command: ChangeDurationCommand = {
    type: "change_duration",
    targetNodeId,
    voice: commandVoiceForSelection(),
    duration,
  };
  runCommand(command);
};

const onInsertAfter = (): void => {
  const anchorNodeId = requireSelectedNode();
  if (!anchorNodeId) return;
  const duration = readDuration();
  const pitch = readSelectedPitch();
  if (!duration || !pitch) {
    state.lastDispatchResult = {
      ok: false,
      dirtyChanged: false,
      changedNodeIds: [],
      affectedMeasureNumbers: [],
      diagnostics: [{ code: "MVP_INVALID_COMMAND_PAYLOAD", message: "挿入ノート入力が不正です。" }],
      warnings: [],
    };
    renderAll();
    return;
  }

  const command: InsertNoteAfterCommand = {
    type: "insert_note_after",
    anchorNodeId,
    voice: commandVoiceForSelection(),
    note: { duration, pitch },
  };
  runCommand(command);
};

const onDelete = (): void => {
  const targetNodeId = requireSelectedNode();
  if (!targetNodeId) return;
  const command: DeleteNoteCommand = {
    type: "delete_note",
    targetNodeId,
    voice: commandVoiceForSelection(),
  };
  runCommand(command);
};

const onSplitNote = (): void => {
  if (selectedDraftNoteIsRest) return;
  const targetNodeId = requireSelectedNode();
  if (!targetNodeId) return;
  const command: CoreCommand = {
    type: "split_note",
    targetNodeId,
    voice: commandVoiceForSelection(),
  };
  runCommand(command);
};

const onConvertRestToNote = (): void => {
  if (!selectedDraftNoteIsRest) return;
  const targetNodeId = requireSelectedNode();
  if (!targetNodeId) return;

  const stepRaw = pitchStep.value.trim();
  const step: Pitch["step"] = isPitchStepValue(stepRaw) ? stepRaw : "C";
  const octaveRaw = Number(pitchOctave.value);
  const octave = Number.isInteger(octaveRaw) ? octaveRaw : 4;
  const alterText = normalizeAlterValue(pitchAlter.value);
  const alterNum = Number(alterText);
  const pitch: Pitch =
    alterText !== "none" && Number.isInteger(alterNum) && alterNum >= -2 && alterNum <= 2
      ? { step, octave, alter: alterNum as -2 | -1 | 0 | 1 | 2 }
      : { step, octave };

  const command: ChangePitchCommand = {
    type: "change_to_pitch",
    targetNodeId,
    voice: commandVoiceForSelection(),
    pitch,
  };
  runCommand(command);
};

const onDownload = (): void => {
  if (!state.lastSuccessfulSaveXml) return;
  const blob = new Blob([state.lastSuccessfulSaveXml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mikuscore.musicxml";
  a.click();
  URL.revokeObjectURL(url);
};

const convertMusicXmlToAbc = (doc: Document): string => {
  const title =
    doc.querySelector("work > work-title")?.textContent?.trim() ||
    doc.querySelector("movement-title")?.textContent?.trim() ||
    "mikuscore";
  const composer =
    doc.querySelector('identification > creator[type="composer"]')?.textContent?.trim() || "";

  const firstMeasure = doc.querySelector("score-partwise > part > measure");
  const meterBeats = firstMeasure?.querySelector("attributes > time > beats")?.textContent?.trim() || "4";
  const meterBeatType = firstMeasure?.querySelector("attributes > time > beat-type")?.textContent?.trim() || "4";
  const fifths = Number(firstMeasure?.querySelector("attributes > key > fifths")?.textContent?.trim() || "0");
  const mode = firstMeasure?.querySelector("attributes > key > mode")?.textContent?.trim() || "major";
  const key = AbcCommon.keyFromFifthsMode(Number.isFinite(fifths) ? fifths : 0, mode);

  const partNameById = new Map<string, string>();
  for (const scorePart of Array.from(doc.querySelectorAll("part-list > score-part"))) {
    const id = scorePart.getAttribute("id") ?? "";
    if (!id) continue;
    const name = scorePart.querySelector("part-name")?.textContent?.trim() || id;
    partNameById.set(id, name);
  }

  const unitLength = { num: 1, den: 8 };
  const abcClefFromMusicXmlPart = (part: Element): string => {
    const firstClef = part.querySelector(":scope > measure > attributes > clef");
    if (!firstClef) return "";
    const sign = firstClef.querySelector(":scope > sign")?.textContent?.trim().toUpperCase() ?? "";
    const line = Number(firstClef.querySelector(":scope > line")?.textContent?.trim() ?? "");
    if (sign === "F" && line === 4) return "bass";
    if (sign === "G" && line === 2) return "treble";
    if (sign === "C" && line === 3) return "alto";
    if (sign === "C" && line === 4) return "tenor";
    return "";
  };
  const keySignatureAlterByStep = (fifthsValue: number): Record<string, number> => {
    const map: Record<string, number> = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
    const sharpOrder = ["F", "C", "G", "D", "A", "E", "B"] as const;
    const flatOrder = ["B", "E", "A", "D", "G", "C", "F"] as const;
    const safeFifths = Math.max(-7, Math.min(7, Math.round(fifthsValue)));
    if (safeFifths > 0) {
      for (let i = 0; i < safeFifths; i += 1) map[sharpOrder[i]] = 1;
    } else if (safeFifths < 0) {
      for (let i = 0; i < Math.abs(safeFifths); i += 1) map[flatOrder[i]] = -1;
    }
    return map;
  };
  const accidentalTextToAlter = (text: string): number | null => {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === "sharp") return 1;
    if (normalized === "flat") return -1;
    if (normalized === "natural") return 0;
    if (normalized === "double-sharp") return 2;
    if (normalized === "flat-flat") return -2;
    return null;
  };

  const headerLines = [
    "X:1",
    `T:${title}`,
    composer ? `C:${composer}` : "",
    `M:${meterBeats}/${meterBeatType}`,
    "L:1/8",
    `K:${key}`,
  ].filter(Boolean);

  const bodyLines: string[] = [];
  const parts = Array.from(doc.querySelectorAll("score-partwise > part"));
  parts.forEach((part, partIndex) => {
    const partId = part.getAttribute("id") || `P${partIndex + 1}`;
    const voiceId = partId.replace(/[^A-Za-z0-9_.-]/g, "_");
    const voiceName = partNameById.get(partId) || partId;
    const abcClef = abcClefFromMusicXmlPart(part);
    const clefSuffix = abcClef ? ` clef=${abcClef}` : "";
    headerLines.push(`V:${voiceId} name="${voiceName}"${clefSuffix}`);

    let currentDivisions = 480;
    let currentFifths = Number.isFinite(fifths) ? Math.round(fifths) : 0;
    const measureTexts: string[] = [];
    for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
      const parsedDiv = Number(measure.querySelector("attributes > divisions")?.textContent?.trim() || "");
      if (Number.isFinite(parsedDiv) && parsedDiv > 0) {
        currentDivisions = parsedDiv;
      }
      const parsedFifths = Number(measure.querySelector("attributes > key > fifths")?.textContent?.trim() || "");
      if (Number.isFinite(parsedFifths)) {
        currentFifths = Math.round(parsedFifths);
      }
      const keyAlterMap = keySignatureAlterByStep(currentFifths);
      const measureAccidentalByStepOctave = new Map<string, number>();

      let pending: { pitches: string[]; len: string; tie: boolean } | null = null;
      const tokens: string[] = [];
      const flush = (): void => {
        if (!pending) return;
        if (pending.pitches.length === 1) {
          tokens.push(`${pending.pitches[0]}${pending.len}${pending.tie ? "-" : ""}`);
        } else {
          tokens.push(`[${pending.pitches.join("")}]${pending.len}${pending.tie ? "-" : ""}`);
        }
        pending = null;
      };

      for (const child of Array.from(measure.children)) {
        if (child.tagName !== "note") continue;
        const isChord = Boolean(child.querySelector("chord"));
        const duration = Number(child.querySelector("duration")?.textContent?.trim() || "0");
        if (!Number.isFinite(duration) || duration <= 0) continue;

        const wholeFraction = AbcCommon.reduceFraction(duration, currentDivisions * 4, { num: 1, den: 4 });
        const lenRatio = AbcCommon.divideFractions(wholeFraction, unitLength, { num: 1, den: 1 });
        const len = AbcCommon.abcLengthTokenFromFraction(lenRatio);
        const hasTieStart = Boolean(child.querySelector('tie[type="start"]'));

        let pitchToken = "z";
        if (!child.querySelector("rest")) {
          const step = child.querySelector("pitch > step")?.textContent?.trim() || "C";
          const octave = Number(child.querySelector("pitch > octave")?.textContent?.trim() || "4");
          const upperStep = /^[A-G]$/.test(step.toUpperCase()) ? step.toUpperCase() : "C";
          const safeOctave = Number.isFinite(octave) ? Math.max(0, Math.min(9, Math.round(octave))) : 4;
          const stepOctaveKey = `${upperStep}${safeOctave}`;

          const alterRaw = child.querySelector("pitch > alter")?.textContent?.trim() ?? "";
          const explicitAlter = alterRaw !== "" && Number.isFinite(Number(alterRaw)) ? Math.round(Number(alterRaw)) : null;
          const accidentalText = child.querySelector("accidental")?.textContent?.trim() ?? "";
          const accidentalAlter = accidentalTextToAlter(accidentalText);

          const keyAlter = keyAlterMap[upperStep] ?? 0;
          const currentAlter = measureAccidentalByStepOctave.has(stepOctaveKey)
            ? measureAccidentalByStepOctave.get(stepOctaveKey) ?? 0
            : keyAlter;

          let targetAlter = currentAlter;
          if (explicitAlter !== null) {
            targetAlter = explicitAlter;
          } else if (accidentalAlter !== null) {
            targetAlter = accidentalAlter;
          }

          const shouldEmitAccidental = accidentalAlter !== null || targetAlter !== currentAlter;
          const accidental = shouldEmitAccidental
            ? (targetAlter === 0 ? "=" : AbcCommon.accidentalFromAlter(targetAlter))
            : "";
          measureAccidentalByStepOctave.set(stepOctaveKey, targetAlter);
          pitchToken = `${accidental}${AbcCommon.abcPitchFromStepOctave(step, Number.isFinite(octave) ? octave : 4)}`;
        }

        if (!isChord) {
          flush();
          pending = { pitches: [pitchToken], len, tie: hasTieStart };
        } else {
          if (!pending) {
            pending = { pitches: [pitchToken], len, tie: hasTieStart };
          } else {
            pending.pitches.push(pitchToken);
            pending.tie = pending.tie || hasTieStart;
          }
        }
      }
      flush();
      measureTexts.push(tokens.join(" "));
    }

    bodyLines.push(`V:${voiceId}`);
    bodyLines.push(`${measureTexts.join(" | ")} |`);
  });

  return `${headerLines.join("\n")}\n\n${bodyLines.join("\n")}\n`;
};

const onDownloadMidi = (): void => {
  if (!state.lastSuccessfulSaveXml) return;
  const playbackDoc = parseMusicXmlDocument(state.lastSuccessfulSaveXml);
  if (!playbackDoc) return;
  const parsedPlayback = buildPlaybackEventsFromMusicXmlDoc(playbackDoc, PLAYBACK_TICKS_PER_QUARTER);
  if (parsedPlayback.events.length === 0) return;
  let midiBytes: Uint8Array;
  try {
    midiBytes = buildMidiBytesForPlayback(parsedPlayback.events, parsedPlayback.tempo);
  } catch {
    return;
  }
  const midiArrayBuffer = new ArrayBuffer(midiBytes.byteLength);
  new Uint8Array(midiArrayBuffer).set(midiBytes);
  const blob = new Blob([midiArrayBuffer], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mikuscore.mid";
  a.click();
  URL.revokeObjectURL(url);
};

const onDownloadAbc = (): void => {
  if (!state.lastSuccessfulSaveXml) return;
  const musicXmlDoc = parseMusicXmlDocument(state.lastSuccessfulSaveXml);
  if (!musicXmlDoc) return;
  let abcText = "";
  try {
    abcText = convertMusicXmlToAbc(musicXmlDoc);
  } catch {
    return;
  }
  const blob = new Blob([abcText], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "mikuscore.abc";
  a.click();
  URL.revokeObjectURL(url);
};

inputTypeXml.addEventListener("change", renderInputMode);
inputTypeAbc.addEventListener("change", renderInputMode);
inputTypeNew.addEventListener("change", renderInputMode);
inputModeFile.addEventListener("change", renderInputMode);
inputModeSource.addEventListener("change", renderInputMode);
newPartCountInput.addEventListener("change", renderNewPartClefControls);
newPartCountInput.addEventListener("input", renderNewPartClefControls);
fileSelectBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  fileNameText.textContent = f ? f.name : "未選択";
});
loadBtn.addEventListener("click", () => {
  void onLoadClick();
});
noteSelect.addEventListener("change", () => {
  state.selectedNodeId = noteSelect.value || null;
  renderAll();
});
durationPreset.addEventListener("change", () => {
  onDurationPresetChange();
});
durationPreset.addEventListener("input", () => {
  onDurationPresetChange();
});
pitchStepDownBtn.addEventListener("click", () => {
  shiftPitchStep(-1);
});
pitchStepUpBtn.addEventListener("click", () => {
  shiftPitchStep(1);
});
for (const btn of pitchAlterBtns) {
  btn.addEventListener("click", () => {
    pitchAlter.value = normalizeAlterValue(btn.dataset.alter ?? "");
    onAlterAutoChange();
  });
}
deleteBtn.addEventListener("click", onDelete);
splitNoteBtn.addEventListener("click", onSplitNote);
convertRestBtn.addEventListener("click", onConvertRestToNote);
playBtn.addEventListener("click", () => {
  void startPlayback();
});
stopBtn.addEventListener("click", stopPlayback);
downloadBtn.addEventListener("click", onDownload);
downloadMidiBtn.addEventListener("click", onDownloadMidi);
downloadAbcBtn.addEventListener("click", onDownloadAbc);
debugScoreArea.addEventListener("click", onVerovioScoreClick);
measureEditorArea.addEventListener("click", onMeasureEditorClick);
measureApplyBtn.addEventListener("click", onMeasureApply);
measureDiscardBtn.addEventListener("click", onMeasureDiscard);
playMeasureBtn.addEventListener("click", () => {
  void startMeasurePlayback();
});

renderNewPartClefControls();
loadFromText(xmlInput.value, false);
