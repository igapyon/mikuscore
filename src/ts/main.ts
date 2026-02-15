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
import { buildMidiBytesForPlayback, buildPlaybackEventsFromXml } from "./playback";
import { sampleXml } from "./sampleXml";

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

type VerovioToolkitApi = {
  setOptions: (options: Record<string, unknown>) => void;
  loadData: (xml: string) => boolean;
  getPageCount: () => number;
  renderToSVG: (page: number, options: Record<string, unknown>) => string;
};

type VerovioRuntime = {
  module?: {
    calledRun?: boolean;
    cwrap?: unknown;
    onRuntimeInitialized?: (() => void) | null;
  };
  toolkit?: new () => VerovioToolkitApi;
};

const q = <T extends Element>(selector: string): T => {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el as T;
};

const inputModeFile = q<HTMLInputElement>("#inputModeFile");
const inputModeSource = q<HTMLInputElement>("#inputModeSource");
const inputSectionDetails = q<HTMLDetailsElement>("#inputSectionDetails");
const fileInputBlock = q<HTMLDivElement>("#fileInputBlock");
const sourceInputBlock = q<HTMLDivElement>("#sourceInputBlock");
const xmlInput = q<HTMLTextAreaElement>("#xmlInput");
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
let verovioToolkit: VerovioToolkitApi | null = null;
let verovioInitPromise: Promise<VerovioToolkitApi | null> | null = null;
let verovioRenderSeq = 0;
let currentSvgIdToNodeId = new Map<string, string>();
let nodeIdToLocation = new Map<string, NoteLocation>();
let partIdToName = new Map<string, string>();
let selectedMeasure: NoteLocation | null = null;
let draftCore: ScoreCore | null = null;
let draftNoteNodeIds: string[] = [];
let draftSvgIdToNodeId = new Map<string, string>();
let selectedDraftNoteIsRest = false;
let suppressDurationPresetEvent = false;
let selectedDraftDurationValue: number | null = null;
const NOTE_CLICK_SNAP_PX = 170;
const DEFAULT_DIVISIONS = 480;

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
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
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
  const fileMode = inputModeFile.checked;
  fileInputBlock.classList.toggle("md-hidden", !fileMode);
  sourceInputBlock.classList.toggle("md-hidden", fileMode);
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
  selectedDraftNoteIsRest = false;
  pitchStep.disabled = false;
  pitchStep.title = "";
  pitchOctave.title = "音名 ↑/↓ に連動して自動調整されます。";
  for (const btn of pitchAlterBtns) {
    btn.disabled = false;
    btn.title = "";
  }

  if (!draftCore || !state.selectedNodeId) {
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
    selectedDraftDurationValue = null;
    rebuildDurationPresetOptions(DEFAULT_DIVISIONS);
    setDurationPresetFromValue(null);
    pitchStep.value = "";
    pitchAlter.value = "none";
    renderPitchStepValue();
    renderAlterButtons();
    return;
  }

  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
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
  deleteBtn.disabled = !hasDraft || !hasSelection;
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

const rebuildNodeLocationMap = (xml: string): void => {
  nodeIdToLocation = new Map<string, NoteLocation>();
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return;

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

const rebuildPartNameMap = (xml: string): void => {
  partIdToName = new Map<string, string>();
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return;

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

const buildRenderXmlWithNodeIds = (
  xml: string,
  nodeIds: string[],
  idPrefix: string
): { renderXml: string; svgIdToNodeId: Map<string, string>; noteCount: number } => {
  const map = new Map<string, string>();
  if (nodeIds.length === 0) {
    return { renderXml: xml, svgIdToNodeId: map, noteCount: 0 };
  }

  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    return { renderXml: xml, svgIdToNodeId: map, noteCount: 0 };
  }

  const notes = Array.from(doc.querySelectorAll("note"));
  const count = Math.min(notes.length, nodeIds.length);
  for (let i = 0; i < count; i += 1) {
    const nodeId = nodeIds[i];
    const svgId = `${idPrefix}-${nodeId}`;
    notes[i].setAttribute("xml:id", svgId);
    notes[i].setAttribute("id", svgId);
    map.set(svgId, nodeId);
  }
  return {
    renderXml: new XMLSerializer().serializeToString(doc),
    svgIdToNodeId: map,
    noteCount: count,
  };
};

const buildRenderXmlForVerovio = (
  xml: string
): { renderXml: string; svgIdToNodeId: Map<string, string>; noteCount: number } => {
  if (!state.loaded) {
    return {
      renderXml: xml,
      svgIdToNodeId: new Map<string, string>(),
      noteCount: 0,
    };
  }
  return buildRenderXmlWithNodeIds(xml, state.noteNodeIds.slice(), "mks-main");
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
  const source = new DOMParser().parseFromString(xml, "application/xml");
  if (source.querySelector("parsererror")) return null;

  const srcRoot = source.querySelector("score-partwise");
  const srcPart = source.querySelector(`score-partwise > part[id="${CSS.escape(partId)}"]`);
  if (!srcRoot || !srcPart) return null;
  const srcMeasure = Array.from(srcPart.querySelectorAll(":scope > measure")).find(
    (m) => (m.getAttribute("number") ?? "") === measureNumber
  );
  if (!srcMeasure) return null;

  const collectEffectiveAttributes = (part: Element, targetMeasure: Element): Element | null => {
    let divisions: Element | null = null;
    let key: Element | null = null;
    let time: Element | null = null;
    let staves: Element | null = null;
    const clefByNo = new Map<string, Element>();

    for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
      const attrs = measure.querySelector(":scope > attributes");
      if (attrs) {
        const nextDivisions = attrs.querySelector(":scope > divisions");
        if (nextDivisions) divisions = nextDivisions.cloneNode(true) as Element;
        const nextKey = attrs.querySelector(":scope > key");
        if (nextKey) key = nextKey.cloneNode(true) as Element;
        const nextTime = attrs.querySelector(":scope > time");
        if (nextTime) time = nextTime.cloneNode(true) as Element;
        const nextStaves = attrs.querySelector(":scope > staves");
        if (nextStaves) staves = nextStaves.cloneNode(true) as Element;
        for (const clef of Array.from(attrs.querySelectorAll(":scope > clef"))) {
          const no = clef.getAttribute("number") ?? "1";
          clefByNo.set(no, clef.cloneNode(true) as Element);
        }
      }
      if (measure === targetMeasure) break;
    }

    const doc = targetMeasure.ownerDocument;
    const effective = doc.createElement("attributes");
    if (divisions) effective.appendChild(divisions);
    if (key) effective.appendChild(key);
    if (time) effective.appendChild(time);
    if (staves) effective.appendChild(staves);
    for (const no of Array.from(clefByNo.keys()).sort()) {
      const clef = clefByNo.get(no);
      if (clef) effective.appendChild(clef);
    }
    return effective.childElementCount > 0 ? effective : null;
  };

  const patchedMeasure = srcMeasure.cloneNode(true) as Element;
  const effectiveAttrs = collectEffectiveAttributes(srcPart, srcMeasure);
  if (effectiveAttrs) {
    const existing = patchedMeasure.querySelector(":scope > attributes");
    if (!existing) {
      patchedMeasure.insertBefore(effectiveAttrs, patchedMeasure.firstChild);
    } else {
      const ensureSingle = (selector: string): void => {
        if (existing.querySelector(`:scope > ${selector}`)) return;
        const src = effectiveAttrs.querySelector(`:scope > ${selector}`);
        if (src) existing.appendChild(src.cloneNode(true));
      };
      ensureSingle("divisions");
      ensureSingle("key");
      ensureSingle("time");
      ensureSingle("staves");

      const existingClefNos = new Set(
        Array.from(existing.querySelectorAll(":scope > clef")).map((c) => c.getAttribute("number") ?? "1")
      );
      for (const clef of Array.from(effectiveAttrs.querySelectorAll(":scope > clef"))) {
        const no = clef.getAttribute("number") ?? "1";
        if (existingClefNos.has(no)) continue;
        existing.appendChild(clef.cloneNode(true));
      }
    }
  }

  const dst = document.implementation.createDocument("", "score-partwise", null);
  const dstRoot = dst.documentElement;
  if (!dstRoot) return null;
  const version = srcRoot.getAttribute("version");
  if (version) dstRoot.setAttribute("version", version);

  const srcPartList = source.querySelector("score-partwise > part-list");
  const srcScorePart = source.querySelector(`score-partwise > part-list > score-part[id="${CSS.escape(partId)}"]`);
  if (srcPartList && srcScorePart) {
    const dstPartList = dst.importNode(srcPartList, false);
    const dstScorePart = dst.importNode(srcScorePart, true) as Element;
    const dstPartName = dstScorePart.querySelector(":scope > part-name");
    if (dstPartName) dstPartName.textContent = "";
    const dstPartAbbreviation = dstScorePart.querySelector(":scope > part-abbreviation");
    if (dstPartAbbreviation) dstPartAbbreviation.textContent = "";
    dstPartList.appendChild(dstScorePart);
    dstRoot.appendChild(dstPartList);
  }

  const dstPart = dst.importNode(srcPart, false) as Element;
  dstPart.appendChild(dst.importNode(patchedMeasure, true));
  dstRoot.appendChild(dstPart);

  return new XMLSerializer().serializeToString(dst);
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

const getVerovioRuntime = (): VerovioRuntime | null => {
  return (window as unknown as { verovio?: VerovioRuntime }).verovio ?? null;
};

const ensureVerovioToolkit = async (): Promise<VerovioToolkitApi | null> => {
  if (verovioToolkit) {
    return verovioToolkit;
  }
  if (verovioInitPromise) {
    return verovioInitPromise;
  }

  verovioInitPromise = (async () => {
    const runtime = getVerovioRuntime();
    if (!runtime || typeof runtime.toolkit !== "function") {
      throw new Error("verovio.js が読み込まれていません。");
    }
    const moduleObj = runtime.module;
    if (!moduleObj) {
      throw new Error("verovio module が見つかりません。");
    }

    if (!moduleObj.calledRun || typeof moduleObj.cwrap !== "function") {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const timeoutId = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error("verovio 初期化待機がタイムアウトしました。"));
        }, 8000);

        const complete = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeoutId);
          resolve();
        };

        const previous = moduleObj.onRuntimeInitialized;
        moduleObj.onRuntimeInitialized = () => {
          if (typeof previous === "function") {
            previous();
          }
          complete();
        };

        if (moduleObj.calledRun && typeof moduleObj.cwrap === "function") {
          complete();
        }
      });
    }

    verovioToolkit = new runtime.toolkit();
    return verovioToolkit;
  })()
    .catch((error) => {
      verovioInitPromise = null;
      throw error;
    });

  return verovioInitPromise;
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
  debugScoreMeta.textContent = "verovio 描画中...";
  void ensureVerovioToolkit()
    .then((toolkit) => {
      if (renderSeq !== verovioRenderSeq) return;
      if (!toolkit) {
        throw new Error("verovio toolkit の初期化に失敗しました。");
      }

      const options: Record<string, unknown> = {
        pageWidth: 20000,
        pageHeight: 3000,
        scale: 40,
        breaks: "none",
        mnumInterval: 1,
        adjustPageHeight: 1,
        footer: "none",
        header: "none",
      };
      toolkit.setOptions(options);
      const loaded = toolkit.loadData(renderBundle.renderXml);
      if (!loaded) {
        throw new Error("verovio loadData が失敗しました。");
      }
      const pageCount = toolkit.getPageCount();
      if (!Number.isFinite(pageCount) || pageCount < 1) {
        throw new Error("verovio pageCount が不正です。");
      }
      const svg = toolkit.renderToSVG(1, {});
      if (!svg) {
        throw new Error("verovio SVG 生成に失敗しました。");
      }

      const doc = new DOMParser().parseFromString(xml, "application/xml");
      const measures = doc.querySelectorAll("part > measure").length;
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
  const renderBundle = buildRenderXmlWithNodeIds(xml, draftNoteNodeIds.slice(), "mks-draft");
  measureEditorArea.innerHTML = "描画中...";
  void ensureVerovioToolkit()
    .then((toolkit) => {
      if (!toolkit) throw new Error("verovio toolkit の初期化に失敗しました。");
      toolkit.setOptions({
        pageWidth: 6000,
        pageHeight: 2200,
        scale: 58,
        breaks: "none",
        adjustPageHeight: 1,
        footer: "none",
        header: "none",
      });
      if (!toolkit.loadData(renderBundle.renderXml)) {
        throw new Error("verovio loadData が失敗しました。");
      }
      const svg = toolkit.renderToSVG(1, {});
      if (!svg) throw new Error("verovio SVG 生成に失敗しました。");
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
    rebuildNodeLocationMap(currentXml);
    rebuildPartNameMap(currentXml);
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

  const parsedPlayback = buildPlaybackEventsFromXml(saveResult.xml, PLAYBACK_TICKS_PER_QUARTER);
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

  const parsedPlayback = buildPlaybackEventsFromXml(saveResult.xml, PLAYBACK_TICKS_PER_QUARTER);
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
    voice: EDITABLE_VOICE,
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
    const text = await selected.text();
    xmlInput.value = text;
  }

  loadFromText(xmlInput.value, true);
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
    voice: EDITABLE_VOICE,
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
  const mainDoc = new DOMParser().parseFromString(sourceXml, "application/xml");
  const measureDoc = new DOMParser().parseFromString(measureXml, "application/xml");
  if (mainDoc.querySelector("parsererror") || measureDoc.querySelector("parsererror")) return null;

  const replacementMeasure = measureDoc.querySelector("part > measure");
  if (!replacementMeasure) return null;
  const targetPart = mainDoc.querySelector(`score-partwise > part[id="${CSS.escape(partId)}"]`);
  if (!targetPart) return null;
  const targetMeasure = Array.from(targetPart.querySelectorAll(":scope > measure")).find(
    (m) => (m.getAttribute("number") ?? "") === measureNumber
  );
  if (!targetMeasure) return null;

  targetMeasure.replaceWith(mainDoc.importNode(replacementMeasure, true));
  return new XMLSerializer().serializeToString(mainDoc);
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
    voice: EDITABLE_VOICE,
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
    voice: EDITABLE_VOICE,
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
    voice: EDITABLE_VOICE,
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
    voice: EDITABLE_VOICE,
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
    voice: EDITABLE_VOICE,
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

const onDownloadMidi = (): void => {
  if (!state.lastSuccessfulSaveXml) return;
  const parsedPlayback = buildPlaybackEventsFromXml(
    state.lastSuccessfulSaveXml,
    PLAYBACK_TICKS_PER_QUARTER
  );
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

inputModeFile.addEventListener("change", renderInputMode);
inputModeSource.addEventListener("change", renderInputMode);
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
debugScoreArea.addEventListener("click", onVerovioScoreClick);
measureEditorArea.addEventListener("click", onMeasureEditorClick);
measureApplyBtn.addEventListener("click", onMeasureApply);
measureDiscardBtn.addEventListener("click", onMeasureDiscard);
playMeasureBtn.addEventListener("click", () => {
  void startMeasurePlayback();
});

loadFromText(xmlInput.value, false);
