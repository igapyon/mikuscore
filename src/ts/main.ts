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
import { clefXmlFromAbcClef, convertAbcToMusicXml, exportMusicXmlDomToAbc } from "./abc-io";
import {
  buildRenderDocWithNodeIds,
  extractMeasureEditorDocument,
  parseMusicXmlDocument,
  replaceMeasureInMainDocument,
  serializeMusicXmlDocument,
} from "./musicxml-io";
import {
  createAbcDownloadPayload,
  createMidiDownloadPayload,
  createMusicXmlDownloadPayload,
  triggerFileDownload,
} from "./download-flow";
import { resolveLoadFlow } from "./load-flow";
import {
  createBasicWaveSynthEngine,
  PLAYBACK_TICKS_PER_QUARTER,
  startMeasurePlayback as startMeasurePlaybackFlow,
  startPlayback as startPlaybackFlow,
  stopPlayback as stopPlaybackFlow,
  type PlaybackFlowOptions,
} from "./playback-flow";
import {
  renderMeasureEditorPreview as renderMeasureEditorPreviewFlow,
  renderScorePreview as renderScorePreviewFlow,
} from "./preview-flow";
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

const DEFAULT_VOICE = "1";

const q = <T extends Element>(selector: string): T => {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el as T;
};
const qo = <T extends Element>(selector: string): T | null => {
  return document.querySelector(selector) as T | null;
};

const inputTypeXml = q<HTMLInputElement>("#inputTypeXml");
const inputTypeAbc = q<HTMLInputElement>("#inputTypeAbc");
const inputTypeNew = q<HTMLInputElement>("#inputTypeNew");
const inputModeFile = q<HTMLInputElement>("#inputModeFile");
const inputModeSource = q<HTMLInputElement>("#inputModeSource");
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
const localDraftNotice = q<HTMLDivElement>("#localDraftNotice");
const localDraftText = q<HTMLDivElement>("#localDraftText");
const discardDraftExportBtn = q<HTMLButtonElement>("#discardDraftExportBtn");
const loadSampleBtn = q<HTMLButtonElement>("#loadSampleBtn");
const fileSelectBtn = q<HTMLButtonElement>("#fileSelectBtn");
const fileInput = q<HTMLInputElement>("#fileInput");
const fileNameText = q<HTMLSpanElement>("#fileNameText");
const loadBtn = q<HTMLButtonElement>("#loadBtn");
const noteSelect = qo<HTMLSelectElement>("#noteSelect");
const statusText = qo<HTMLParagraphElement>("#statusText");
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
const playbackWaveform = q<HTMLSelectElement>("#playbackWaveform");
const midiProgramSelect = q<HTMLSelectElement>("#midiProgramSelect");
const settingsAccordion = q<HTMLDetailsElement>("#settingsAccordion");
const downloadBtn = q<HTMLButtonElement>("#downloadBtn");
const downloadMidiBtn = q<HTMLButtonElement>("#downloadMidiBtn");
const downloadAbcBtn = q<HTMLButtonElement>("#downloadAbcBtn");
const saveModeText = qo<HTMLSpanElement>("#saveModeText");
const playbackText = qo<HTMLParagraphElement>("#playbackText");
const outputXml = qo<HTMLTextAreaElement>("#outputXml");
const diagArea = qo<HTMLDivElement>("#diagArea");
const debugScoreMeta = qo<HTMLParagraphElement>("#debugScoreMeta");
const debugScoreArea = q<HTMLDivElement>("#debugScoreArea");
const uiMessage = q<HTMLDivElement>("#uiMessage");
const measurePartNameText = q<HTMLParagraphElement>("#measurePartNameText");
const measureEmptyState = q<HTMLDivElement>("#measureEmptyState");
const measureSelectGuideBtn = q<HTMLButtonElement>("#measureSelectGuideBtn");
const measureEditorWrap = q<HTMLDivElement>("#measureEditorWrap");
const measureEditorArea = q<HTMLDivElement>("#measureEditorArea");
const measureApplyBtn = q<HTMLButtonElement>("#measureApplyBtn");
const measureDiscardBtn = q<HTMLButtonElement>("#measureDiscardBtn");
const playMeasureBtn = q<HTMLButtonElement>("#playMeasureBtn");
const topTabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".ms-top-tab"));
const topTabPanels = Array.from(document.querySelectorAll<HTMLElement>(".ms-tab-panel"));

const core = new ScoreCore();
const state: UiState = {
  loaded: false,
  selectedNodeId: null,
  noteNodeIds: [],
  lastDispatchResult: null,
  lastSaveResult: null,
  lastSuccessfulSaveXml: "",
};

let isPlaying = false;
const DEBUG_LOG = false;
let verovioRenderSeq = 0;
let currentSvgIdToNodeId = new Map<string, string>();
let nodeIdToLocation = new Map<string, NoteLocation>();
let partIdToName = new Map<string, string>();
let selectedMeasure: NoteLocation | null = null;
let draftCore: ScoreCore | null = null;
let draftNoteNodeIds: string[] = [];
let draftSvgIdToNodeId = new Map<string, string>();
let selectedDraftVoice = DEFAULT_VOICE;
let selectedDraftNoteIsRest = false;
let suppressDurationPresetEvent = false;
let selectedDraftDurationValue: number | null = null;
const NOTE_CLICK_SNAP_PX = 170;
const DEFAULT_DIVISIONS = 480;
const MAX_NEW_PARTS = 16;
const LOCAL_DRAFT_STORAGE_KEY = "mikuscore.localDraft.v1";
const PLAYBACK_SETTINGS_STORAGE_KEY = "mikuscore.playbackSettings.v1";

type LocalDraft = {
  xml: string;
  updatedAt: number;
};

type PlaybackSettings = {
  midiProgram: "electric_piano_2" | "acoustic_grand_piano" | "electric_piano_1";
  waveform: "sine" | "triangle" | "square";
  settingsExpanded: boolean;
};

const normalizeMidiProgram = (value: string): PlaybackSettings["midiProgram"] => {
  if (value === "acoustic_grand_piano" || value === "electric_piano_1") return value;
  return "electric_piano_2";
};

const normalizeWaveformSetting = (value: string): PlaybackSettings["waveform"] => {
  if (value === "triangle" || value === "square") return value;
  return "sine";
};

const readPlaybackSettings = (): PlaybackSettings | null => {
  try {
    const raw = localStorage.getItem(PLAYBACK_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlaybackSettings>;
    return {
      midiProgram: normalizeMidiProgram(String(parsed.midiProgram ?? "")),
      waveform: normalizeWaveformSetting(String(parsed.waveform ?? "")),
      settingsExpanded: Boolean(parsed.settingsExpanded),
    };
  } catch {
    return null;
  }
};

const writePlaybackSettings = (): void => {
  try {
    const payload: PlaybackSettings = {
      midiProgram: normalizeMidiProgram(midiProgramSelect.value),
      waveform: normalizeWaveformSetting(playbackWaveform.value),
      settingsExpanded: settingsAccordion.open,
    };
    localStorage.setItem(PLAYBACK_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota/security errors in MVP.
  }
};

const applyInitialPlaybackSettings = (): void => {
  const stored = readPlaybackSettings();
  midiProgramSelect.value = stored?.midiProgram ?? "electric_piano_2";
  playbackWaveform.value = stored?.waveform ?? "sine";
  settingsAccordion.open = stored?.settingsExpanded ?? false;
};

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

const readLocalDraft = (): LocalDraft | null => {
  try {
    const raw = localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalDraft>;
    if (typeof parsed.xml !== "string" || !parsed.xml.trim()) return null;
    if (!Number.isFinite(parsed.updatedAt)) return null;
    return {
      xml: parsed.xml,
      updatedAt: Number(parsed.updatedAt),
    };
  } catch {
    return null;
  }
};

const writeLocalDraft = (xml: string): void => {
  const normalized = String(xml || "").trim();
  if (!normalized) return;
  try {
    const payload: LocalDraft = {
      xml: normalized,
      updatedAt: Date.now(),
    };
    localStorage.setItem(LOCAL_DRAFT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota/security errors in MVP.
  }
};

const clearLocalDraft = (): void => {
  try {
    localStorage.removeItem(LOCAL_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore quota/security errors in MVP.
  }
};

const formatLocalDraftTime = (timestamp: number): string => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "unknown";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "unknown";
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return date.toISOString();
  }
};

const renderLocalDraftUi = (): void => {
  const draft = readLocalDraft();
  const hasDraft = Boolean(draft);
  const inputPanelVisible = topTabPanels.some(
    (panel) => panel.dataset.tabPanel === "input" && !panel.hidden
  );
  const showNotice = hasDraft && inputPanelVisible;
  localDraftNotice.classList.toggle("md-hidden", !showNotice);
  discardDraftExportBtn.classList.remove("md-hidden");
  discardDraftExportBtn.disabled = !hasDraft;
  if (!showNotice || !draft) {
    localDraftText.textContent = "";
    return;
  }
  localDraftText.textContent = `Local draft exists (saved at ${formatLocalDraftTime(draft.updatedAt)}).`;
};

const applyInitialXmlInputValue = (): void => {
  const draft = readLocalDraft();
  if (draft) {
    xmlInput.value = draft.xml;
    return;
  }
  xmlInput.value = sampleXml;
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
    loadLabel.textContent = isNewType ? "Create" : "Load";
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
    label.textContent = `Part ${i + 1} clef`;

    const select = document.createElement("select");
    select.className = "md-select";
    select.setAttribute("data-part-clef", "true");

    const options: Array<{ value: string; label: string }> = [
      { value: "treble", label: "Treble clef" },
      { value: "alto", label: "Alto clef" },
      { value: "bass", label: "Bass clef" },
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
  if (!statusText) return;
  const dirty = core.isDirty();
  statusText.textContent = state.loaded
    ? `Loaded / dirty=${dirty}  / notes=${state.noteNodeIds.length}`
    : "Not loaded (please load first)";
};

const renderNotes = (): void => {
  const selectedNodeId =
    state.selectedNodeId && draftNoteNodeIds.includes(state.selectedNodeId)
      ? state.selectedNodeId
      : null;
  state.selectedNodeId = selectedNodeId;

  if (!noteSelect) return;
  noteSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = draftNoteNodeIds.length === 0 ? "(No notes)" : "(Select one)";
  noteSelect.appendChild(placeholder);

  for (const nodeId of draftNoteNodeIds) {
    const option = document.createElement("option");
    option.value = nodeId;
    option.textContent = nodeId;
    noteSelect.appendChild(option);
  }

  if (selectedNodeId) {
    noteSelect.value = selectedNodeId;
  } else {
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
    pitchStepValue.textContent = "Rest";
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
    { label: "Whole note", num: 4, den: 1 },
    { label: "Dotted half note", num: 3, den: 1 },
    { label: "Half note", num: 2, den: 1 },
    { label: "Half-note triplet (1 note)", num: 4, den: 3 },
    { label: "Dotted quarter note", num: 3, den: 2 },
    { label: "Quarter note", num: 1, den: 1 },
    { label: "Quarter-note triplet (1 note)", num: 2, den: 3 },
    { label: "Dotted eighth note", num: 3, den: 4 },
    { label: "Eighth note", num: 1, den: 2 },
    { label: "Eighth-note triplet (1 note)", num: 1, den: 3 },
    { label: "Dotted sixteenth note", num: 3, den: 8 },
    { label: "Sixteenth note", num: 1, den: 4 },
    { label: "Sixteenth-note triplet (1 note)", num: 1, den: 6 },
    { label: "3Half note", num: 1, den: 8 },
    { label: "6Quarter note", num: 1, den: 16 },
  ];

  durationPreset.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "(Select duration)";
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
  custom.textContent = `Custom(${duration})`;
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
    const baseLabel = option.textContent?.replace(" (not allowed in this measure)", "").trim() ?? "";
    option.textContent = unavailable ? `${baseLabel} (not allowed in this measure)` : baseLabel;
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
  selectedDraftVoice = DEFAULT_VOICE;
  selectedDraftNoteIsRest = false;
  pitchStep.disabled = false;
  pitchStep.title = "";
  pitchOctave.title = "Automatically adjusted with pitch step up/down.";
  for (const btn of pitchAlterBtns) {
    btn.disabled = false;
    btn.title = "";
  }

  if (!draftCore || !state.selectedNodeId) {
    selectedDraftVoice = DEFAULT_VOICE;
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
    selectedDraftVoice = DEFAULT_VOICE;
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
    selectedDraftVoice = DEFAULT_VOICE;
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
    selectedDraftVoice = notes[i].querySelector(":scope > voice")?.textContent?.trim() || DEFAULT_VOICE;
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
      pitchStep.title = "Rests do not have pitch. Pitch changes are disabled.";
      for (const btn of pitchAlterBtns) {
        btn.disabled = true;
        btn.title = "Rests do not have pitch. Pitch changes are disabled.";
      }
      pitchOctave.title = "Automatically adjusted with pitch step up/down.";
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
  selectedDraftVoice = DEFAULT_VOICE;
  selectedDraftDurationValue = null;
  rebuildDurationPresetOptions(DEFAULT_DIVISIONS);
  setDurationPresetFromValue(null);
  renderPitchStepValue();
  renderAlterButtons();
};

const renderMeasureEditorState = (): void => {
  if (!selectedMeasure || !draftCore) {
    measurePartNameText.textContent = "Track: -";
    measurePartNameText.classList.add("md-hidden");
    measureEmptyState.classList.remove("md-hidden");
    measureEditorWrap.classList.add("md-hidden");
    measureApplyBtn.disabled = true;
    measureDiscardBtn.disabled = true;
    return;
  }

  const partName = partIdToName.get(selectedMeasure.partId) ?? selectedMeasure.partId;
  measurePartNameText.textContent =
    `Track: ${partName} / Selected: track=${selectedMeasure.partId}  / measure=${selectedMeasure.measureNumber}`;
  measurePartNameText.classList.remove("md-hidden");
  measureEmptyState.classList.add("md-hidden");
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
  if (!diagArea) return;
  diagArea.innerHTML = "";

  const dispatch = state.lastDispatchResult;
  const save = state.lastSaveResult;

  if (!dispatch && !save) {
    diagArea.textContent = "No diagnostics";
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
    diagArea.textContent = "No diagnostics";
  }
};

const renderUiMessage = (): void => {
  uiMessage.classList.remove("ms-ui-message--error", "ms-ui-message--warning");
  uiMessage.textContent = "";

  const dispatch = state.lastDispatchResult;
  if (dispatch) {
    if (!dispatch.ok && dispatch.diagnostics.length > 0) {
      const d = dispatch.diagnostics[0];
      uiMessage.textContent = `Error: ${d.message} (${d.code})`;
      uiMessage.classList.add("ms-ui-message--error");
      uiMessage.classList.remove("md-hidden");
      return;
    }
    if (dispatch.warnings.length > 0) {
      const w = dispatch.warnings[0];
      uiMessage.textContent = `Warning: ${w.message} (${w.code})`;
      uiMessage.classList.add("ms-ui-message--warning");
      uiMessage.classList.remove("md-hidden");
      return;
    }
  }

  const save = state.lastSaveResult;
  if (save && !save.ok && save.diagnostics.length > 0) {
    const d = save.diagnostics[0];
    uiMessage.textContent = `Error: ${d.message} (${d.code})`;
    uiMessage.classList.add("ms-ui-message--error");
    uiMessage.classList.remove("md-hidden");
    return;
  }

  uiMessage.classList.add("md-hidden");
};

const renderOutput = (): void => {
  if (saveModeText) {
    saveModeText.textContent = state.lastSaveResult ? state.lastSaveResult.mode : "-";
  }
  if (outputXml) {
    outputXml.value = state.lastSaveResult?.ok ? state.lastSaveResult.xml : "";
  }
  downloadBtn.disabled = !state.lastSaveResult?.ok;
  downloadMidiBtn.disabled = !state.lastSaveResult?.ok;
  downloadAbcBtn.disabled = !state.lastSaveResult?.ok;
};

const renderControlState = (): void => {
  const hasDraft = Boolean(draftCore);
  const hasSelection = Boolean(state.selectedNodeId);
  if (noteSelect) {
    noteSelect.disabled = !hasDraft;
  }
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
  playbackWaveform.disabled = isPlaying;
};

const renderAll = (): void => {
  renderInputMode();
  renderLocalDraftUi();
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

const stripPartNamesInRenderDoc = (doc: Document): void => {
  const removableSelectors = [
    "score-partwise > part-list > score-part > part-name",
    "score-partwise > part-list > score-part > part-abbreviation",
    "score-partwise > part > measure > attributes > part-name-display",
    "score-partwise > part > measure > attributes > part-abbreviation-display",
    "score-partwise > part > measure > attributes > staff-details > staff-name",
  ];
  for (const selector of removableSelectors) {
    for (const node of Array.from(doc.querySelectorAll(selector))) {
      node.remove();
    }
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
    setUiMappingDiagnostic("Failed to extract selected measure.");
    return;
  }
  const nextDraft = new ScoreCore();
  try {
    nextDraft.load(extracted);
  } catch (error) {
    setUiMappingDiagnostic(`Failed to load the selected measure: ${error instanceof Error ? error.message : String(error)}`);
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
    setUiMappingDiagnostic("Could not resolve a note from the clicked position.");
    return;
  }
  if (!state.noteNodeIds.includes(nodeId)) {
    setUiMappingDiagnostic(`No nodeId matched the clicked element: ${nodeId}`);
    return;
  }
  const location = nodeIdToLocation.get(nodeId);
  if (!location) {
    setUiMappingDiagnostic(`Could not resolve track/measure from nodeId: ${nodeId}`);
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
  void renderScorePreviewFlow({
    renderSeq,
    isRenderSeqCurrent: (seq) => seq === verovioRenderSeq,
    xml,
    noteNodeIds: state.noteNodeIds,
    setMetaText: (text) => {
      if (debugScoreMeta) {
        debugScoreMeta.textContent = text;
      }
    },
    setSvgHtml: (svgHtml) => {
      debugScoreArea.innerHTML = svgHtml;
    },
    setSvgIdMap: (map) => {
      currentSvgIdToNodeId = map;
    },
    buildRenderXmlForVerovio: (sourceXml) => {
      const renderBundle = buildRenderXmlForVerovio(sourceXml);
      if (renderBundle.renderDoc) {
        stripPartNamesInRenderDoc(renderBundle.renderDoc);
      }
      return renderBundle;
    },
    deriveRenderedNoteIds,
    buildFallbackSvgIdMap,
    onRendered: () => {
      highlightSelectedMeasureInMainPreview();
    },
    debugLog: DEBUG_LOG,
    renderedRoot: debugScoreArea,
  });
};

const renderMeasureEditorPreview = (): void => {
  void renderMeasureEditorPreviewFlow({
    hasDraft: Boolean(draftCore && selectedMeasure),
    xml: draftCore?.debugSerializeCurrentXml() ?? "",
    draftNoteNodeIds,
    setHtml: (html) => {
      measureEditorArea.innerHTML = html;
    },
    setSvgIdMap: (map) => {
      draftSvgIdToNodeId = map;
    },
    buildRenderDocWithNodeIds,
    parseMusicXmlDocument,
    deriveRenderedNoteIds,
    buildFallbackSvgIdMap,
    onRendered: () => {
      highlightSelectedDraftNoteInEditor();
    },
    renderedRoot: measureEditorArea,
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

const synthEngine = createBasicWaveSynthEngine({ ticksPerQuarter: PLAYBACK_TICKS_PER_QUARTER });
const unlockAudioOnGesture = (): void => {
  void synthEngine.unlockFromUserGesture();
};
const installGlobalAudioUnlock = (): void => {
  const unlockOnce = (): void => {
    void synthEngine.unlockFromUserGesture().then((ok) => {
      if (!ok) return;
      window.removeEventListener("pointerdown", unlockOnce);
      window.removeEventListener("touchstart", unlockOnce);
      window.removeEventListener("keydown", unlockOnce);
    });
  };
  window.addEventListener("pointerdown", unlockOnce, { passive: true });
  window.addEventListener("touchstart", unlockOnce, { passive: true });
  window.addEventListener("keydown", unlockOnce);
};
const playbackFlowOptions: PlaybackFlowOptions = {
  engine: synthEngine,
  ticksPerQuarter: PLAYBACK_TICKS_PER_QUARTER,
  editableVoice: DEFAULT_VOICE,
  getPlaybackWaveform: () => {
    return normalizeWaveformSetting(playbackWaveform.value);
  },
  debugLog: DEBUG_LOG,
  getIsPlaying: () => isPlaying,
  setIsPlaying: (playing) => {
    isPlaying = playing;
  },
  setPlaybackText: (text) => {
    if (playbackText) {
      playbackText.textContent = text;
    }
  },
  renderControlState,
  renderAll,
  logDiagnostics: (scope, diagnostics) => {
    logDiagnostics(scope, diagnostics);
  },
  dumpOverfullContext,
  onFullSaveResult: (saveResult) => {
    state.lastSaveResult = saveResult;
  },
  onMeasureSaveDiagnostics: (diagnostics) => {
    state.lastDispatchResult = {
      ok: false,
      dirtyChanged: false,
      changedNodeIds: [],
      affectedMeasureNumbers: [],
      diagnostics,
      warnings: [],
    };
  },
};

const stopPlayback = (): void => {
  stopPlaybackFlow(playbackFlowOptions);
};

const unlockAudioForPlayback = async (): Promise<boolean> => {
  const ok = await synthEngine.unlockFromUserGesture();
  if (!ok && playbackText) {
    playbackText.textContent = "Playback: audio unlock failed";
  }
  return ok;
};

const startPlayback = async (): Promise<void> => {
  const ok = await unlockAudioForPlayback();
  if (!ok) return;
  await startPlaybackFlow(playbackFlowOptions, { isLoaded: state.loaded, core });
};

const startMeasurePlayback = async (): Promise<void> => {
  const ok = await unlockAudioForPlayback();
  if (!ok) return;
  await startMeasurePlaybackFlow(playbackFlowOptions, { draftCore });
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
  return voice || DEFAULT_VOICE;
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
          message: "This duration is not allowed. It exceeds the measure capacity.",
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

const autoSaveCurrentXml = (persistLocalDraft = false): void => {
  if (!state.loaded) return;
  const result = core.save();
  state.lastSaveResult = result;
  if (!result.ok) {
    logDiagnostics("save", result.diagnostics);
    if (result.diagnostics.some((d) => d.code === "MEASURE_OVERFULL")) {
      const debugXml = core.debugSerializeCurrentXml();
      if (debugXml) {
        dumpOverfullContext(debugXml, DEFAULT_VOICE);
      } else if (DEBUG_LOG) {
        console.warn("[mikuscore][debug] no in-memory XML to dump.");
      }
    }
    return;
  }
  state.lastSuccessfulSaveXml = result.xml;
  if (persistLocalDraft) {
    writeLocalDraft(result.xml);
  }
};

const loadFromText = (xml: string): void => {
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
          message: err instanceof Error ? err.message : "Load failed.",
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
  autoSaveCurrentXml(false);
  renderAll();
  renderScorePreview();
};

const onLoadClick = async (): Promise<void> => {
  const result = await resolveLoadFlow({
    isNewType: inputTypeNew.checked,
    isAbcType: inputTypeAbc.checked,
    isFileMode: inputModeFile.checked,
    selectedFile: fileInput.files?.[0] ?? null,
    xmlSourceText: xmlInput.value,
    abcSourceText: abcInput.value,
    createNewMusicXml,
    convertAbcToMusicXml,
  });

  if (!result.ok) {
    state.lastDispatchResult = {
      ok: false,
      dirtyChanged: false,
      changedNodeIds: [],
      affectedMeasureNumbers: [],
      diagnostics: [{ code: result.diagnosticCode, message: result.diagnosticMessage }],
      warnings: [],
    };
    renderAll();
    return;
  }

  if (result.nextAbcInputText !== undefined) {
    abcInput.value = result.nextAbcInputText;
  }
  if (result.nextXmlInputText !== undefined) {
    xmlInput.value = result.nextXmlInputText;
  }
  // Persist immediately on explicit load actions (Load / Load sample).
  writeLocalDraft(result.xmlToLoad);
  loadFromText(result.xmlToLoad);
};

const onDiscardLocalDraft = (): void => {
  clearLocalDraft();
  renderLocalDraftUi();
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
      diagnostics: [{ code: "MVP_COMMAND_TARGET_MISSING", message: "Select a measure first." }],
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
    diagnostics: [{ code: "MVP_COMMAND_TARGET_MISSING", message: "Select a note." }],
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
      diagnostics: [{ code: "MVP_INVALID_COMMAND_PAYLOAD", message: "Invalid pitch input." }],
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

const flashStepButton = (button: HTMLButtonElement): void => {
  pitchStepUpBtn.classList.remove("is-pressed");
  pitchStepDownBtn.classList.remove("is-pressed");
  button.classList.add("is-pressed");
  window.setTimeout(() => {
    button.classList.remove("is-pressed");
  }, 140);
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
    setUiMappingDiagnostic("Failed to apply measure changes.");
    return;
  }

  try {
    core.load(merged);
  } catch (error) {
    setUiMappingDiagnostic(`Failed to reload after applying measure changes: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  state.loaded = true;
  state.lastDispatchResult = null;
  refreshNotesFromCore();
  autoSaveCurrentXml(true);
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
      diagnostics: [{ code: "MVP_INVALID_COMMAND_PAYLOAD", message: "Invalid duration input." }],
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
      diagnostics: [{ code: "MVP_INVALID_COMMAND_PAYLOAD", message: "Invalid inserted note input." }],
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
  const pitch: Pitch = { step: "C", octave: 4 };

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
  triggerFileDownload(createMusicXmlDownloadPayload(state.lastSuccessfulSaveXml));
};

const onDownloadMidi = (): void => {
  if (!state.lastSuccessfulSaveXml) return;
  const payload = createMidiDownloadPayload(
    state.lastSuccessfulSaveXml,
    PLAYBACK_TICKS_PER_QUARTER,
    normalizeMidiProgram(midiProgramSelect.value)
  );
  if (!payload) return;
  triggerFileDownload(payload);
};

const onDownloadAbc = (): void => {
  if (!state.lastSuccessfulSaveXml) return;
  const payload = createAbcDownloadPayload(state.lastSuccessfulSaveXml, exportMusicXmlDomToAbc);
  if (!payload) return;
  triggerFileDownload(payload);
};

const activateTopTab = (tabName: string): void => {
  const activeIndex = topTabButtons.findIndex((button) => button.dataset.tab === tabName);
  for (const button of topTabButtons) {
    const currentIndex = topTabButtons.indexOf(button);
    const active = button.dataset.tab === tabName;
    button.classList.toggle("is-active", active);
    button.classList.toggle("is-complete", activeIndex >= 0 && currentIndex < activeIndex);
    button.setAttribute("aria-selected", active ? "true" : "false");
  }
  for (const panel of topTabPanels) {
    panel.hidden = panel.dataset.tabPanel !== tabName;
  }
  if (tabName !== "input") {
    localDraftNotice.classList.add("md-hidden");
  }
  renderLocalDraftUi();
};

if (topTabButtons.length > 0 && topTabPanels.length > 0) {
  for (const button of topTabButtons) {
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", button.classList.contains("is-active") ? "true" : "false");
    button.addEventListener("click", () => {
      activateTopTab(button.dataset.tab || "input");
    });
  }
  activateTopTab(
    topTabButtons.find((button) => button.classList.contains("is-active"))?.dataset.tab || "input"
  );
}
measureSelectGuideBtn.addEventListener("click", () => {
  activateTopTab("score");
});

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
  fileNameText.textContent = f ? f.name : "No file selected";
});
loadBtn.addEventListener("click", () => {
  void onLoadClick();
});
discardDraftExportBtn.addEventListener("click", onDiscardLocalDraft);
loadSampleBtn.addEventListener("click", () => {
  inputTypeXml.checked = true;
  inputTypeAbc.checked = false;
  inputTypeNew.checked = false;
  inputModeSource.checked = true;
  inputModeFile.checked = false;
  xmlInput.value = sampleXml;
  renderInputMode();
  renderLocalDraftUi();
  void onLoadClick();
});
if (noteSelect) {
  noteSelect.addEventListener("change", () => {
    state.selectedNodeId = noteSelect.value || null;
    renderAll();
  });
}
durationPreset.addEventListener("change", () => {
  onDurationPresetChange();
});
durationPreset.addEventListener("input", () => {
  onDurationPresetChange();
});
pitchStepDownBtn.addEventListener("click", () => {
  flashStepButton(pitchStepDownBtn);
  shiftPitchStep(-1);
});
pitchStepUpBtn.addEventListener("click", () => {
  flashStepButton(pitchStepUpBtn);
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
playBtn.addEventListener("pointerdown", unlockAudioOnGesture, { passive: true });
playBtn.addEventListener("touchstart", unlockAudioOnGesture, { passive: true });
stopBtn.addEventListener("click", stopPlayback);
downloadBtn.addEventListener("click", onDownload);
downloadMidiBtn.addEventListener("click", onDownloadMidi);
downloadAbcBtn.addEventListener("click", onDownloadAbc);
midiProgramSelect.addEventListener("change", writePlaybackSettings);
playbackWaveform.addEventListener("change", writePlaybackSettings);
settingsAccordion.addEventListener("toggle", writePlaybackSettings);
debugScoreArea.addEventListener("click", onVerovioScoreClick);
measureEditorArea.addEventListener("click", onMeasureEditorClick);
measureApplyBtn.addEventListener("click", onMeasureApply);
measureDiscardBtn.addEventListener("click", onMeasureDiscard);
playMeasureBtn.addEventListener("click", () => {
  void startMeasurePlayback();
});
playMeasureBtn.addEventListener("pointerdown", unlockAudioOnGesture, { passive: true });
playMeasureBtn.addEventListener("touchstart", unlockAudioOnGesture, { passive: true });

renderNewPartClefControls();
applyInitialXmlInputValue();
applyInitialPlaybackSettings();
installGlobalAudioUnlock();
loadFromText(xmlInput.value);
