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
import { sampleXml } from "./sampleXml";

type UiState = {
  loaded: boolean;
  selectedNodeId: string | null;
  noteNodeIds: string[];
  lastDispatchResult: DispatchResult | null;
  lastSaveResult: SaveResult | null;
  lastSuccessfulSaveXml: string;
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

type MidiWriterTrackApi = {
  setTempo: (tempo: number) => void;
  addEvent: (event: unknown) => void;
};

type MidiWriterNoteEventFields = {
  pitch: string[];
  duration: string;
  wait?: string;
  velocity?: number;
  channel?: number;
};

type MidiWriterRuntime = {
  Track: new () => MidiWriterTrackApi;
  NoteEvent: new (fields: MidiWriterNoteEventFields) => unknown;
  Writer: new (tracks: unknown[] | unknown) => {
    buildFile: () => Uint8Array | number[];
  };
};


const q = <T extends Element>(selector: string): T => {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el as T;
};

const inputModeFile = q<HTMLInputElement>("#inputModeFile");
const inputModeSource = q<HTMLInputElement>("#inputModeSource");
const fileInputBlock = q<HTMLDivElement>("#fileInputBlock");
const sourceInputBlock = q<HTMLDivElement>("#sourceInputBlock");
const xmlInput = q<HTMLTextAreaElement>("#xmlInput");
const fileSelectBtn = q<HTMLButtonElement>("#fileSelectBtn");
const fileInput = q<HTMLInputElement>("#fileInput");
const fileNameText = q<HTMLSpanElement>("#fileNameText");
const loadBtn = q<HTMLButtonElement>("#loadBtn");
const noteSelect = q<HTMLSelectElement>("#noteSelect");
const statusText = q<HTMLParagraphElement>("#statusText");
const pitchStep = q<HTMLSelectElement>("#pitchStep");
const pitchAlter = q<HTMLSelectElement>("#pitchAlter");
const pitchOctave = q<HTMLInputElement>("#pitchOctave");
const durationInput = q<HTMLInputElement>("#durationInput");
const changePitchBtn = q<HTMLButtonElement>("#changePitchBtn");
const changeDurationBtn = q<HTMLButtonElement>("#changeDurationBtn");
const insertAfterBtn = q<HTMLButtonElement>("#insertAfterBtn");
const deleteBtn = q<HTMLButtonElement>("#deleteBtn");
const saveBtn = q<HTMLButtonElement>("#saveBtn");
const playBtn = q<HTMLButtonElement>("#playBtn");
const stopBtn = q<HTMLButtonElement>("#stopBtn");
const downloadBtn = q<HTMLButtonElement>("#downloadBtn");
const saveModeText = q<HTMLSpanElement>("#saveModeText");
const playbackText = q<HTMLParagraphElement>("#playbackText");
const outputXml = q<HTMLTextAreaElement>("#outputXml");
const diagArea = q<HTMLDivElement>("#diagArea");
const debugScoreMeta = q<HTMLParagraphElement>("#debugScoreMeta");
const debugScoreArea = q<HTMLDivElement>("#debugScoreArea");

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
  fileInputBlock.classList.toggle("ms-hidden", !fileMode);
  sourceInputBlock.classList.toggle("ms-hidden", fileMode);
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
  placeholder.textContent = state.noteNodeIds.length === 0 ? "(ノートなし)" : "(選択してください)";
  noteSelect.appendChild(placeholder);

  for (const nodeId of state.noteNodeIds) {
    const option = document.createElement("option");
    option.value = nodeId;
    option.textContent = nodeId;
    noteSelect.appendChild(option);
  }

  if (state.selectedNodeId && state.noteNodeIds.includes(state.selectedNodeId)) {
    noteSelect.value = state.selectedNodeId;
  } else {
    state.selectedNodeId = null;
    noteSelect.value = "";
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

const renderOutput = (): void => {
  saveModeText.textContent = state.lastSaveResult ? state.lastSaveResult.mode : "-";
  outputXml.value = state.lastSaveResult?.ok ? state.lastSaveResult.xml : "";
  downloadBtn.disabled = !state.lastSaveResult?.ok;
};

const renderControlState = (): void => {
  const hasSelection = Boolean(state.selectedNodeId);
  noteSelect.disabled = !state.loaded;
  changePitchBtn.disabled = !state.loaded || !hasSelection;
  changeDurationBtn.disabled = !state.loaded || !hasSelection;
  insertAfterBtn.disabled = !state.loaded || !hasSelection;
  deleteBtn.disabled = !state.loaded || !hasSelection;
  saveBtn.disabled = !state.loaded;
  playBtn.disabled = !state.loaded || isPlaying;
  stopBtn.disabled = !isPlaying;
};

const renderAll = (): void => {
  renderInputMode();
  renderNotes();
  renderStatus();
  renderDiagnostics();
  renderOutput();
  renderControlState();
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

const buildRenderXmlForVerovio = (
  xml: string
): { renderXml: string; svgIdToNodeId: Map<string, string>; noteCount: number } => {
  const map = new Map<string, string>();
  if (!state.loaded) {
    return {
      renderXml: xml,
      svgIdToNodeId: map,
      noteCount: 0,
    };
  }

  const nodeIds = state.noteNodeIds.slice();
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
    const svgId = `mks-tmp-${nodeId}`;
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

const deriveRenderedNoteIds = (root: Element): string[] => {
  const direct = Array.from(
    root.querySelectorAll<HTMLElement>('[id^="mks-tmp-"], [id*="mks-tmp-"]')
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

const resolveNodeIdFromCandidateIds = (candidateIds: string[]): string | null => {
  for (const entry of candidateIds) {
    const exact = currentSvgIdToNodeId.get(entry);
    if (exact) return exact;
  }
  for (const entry of candidateIds) {
    for (const [knownSvgId, nodeId] of currentSvgIdToNodeId.entries()) {
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
  const resolvedFromDirect = resolveNodeIdFromCandidateIds(directCandidates);
  if (resolvedFromDirect) return resolvedFromDirect;

  if (clickEvent && typeof document.elementsFromPoint === "function") {
    const hitElements = document.elementsFromPoint(clickEvent.clientX, clickEvent.clientY);
    for (const hit of hitElements) {
      if (!(hit instanceof Element)) continue;
      const hitCandidates = collectCandidateIdsFromElement(hit);
      const resolvedFromHit = resolveNodeIdFromCandidateIds(hitCandidates);
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

const onVerovioScoreClick = (event: MouseEvent): void => {
  if (!state.loaded) return;
  const nodeId = resolveNodeIdFromSvgTarget(event.target, event);
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

const renderDebugScore = (): void => {
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
      if (renderedNoteIds.length > 0 && !renderedNoteIds.some((id) => id.startsWith("mks-tmp-"))) {
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

const refreshNotesFromCore = (): void => {
  state.noteNodeIds = core.listNoteNodeIds();
  if (state.selectedNodeId && !state.noteNodeIds.includes(state.selectedNodeId)) {
    state.selectedNodeId = null;
  }
};

type PlaybackEvent = {
  midiNumber: number;
  startTicks: number;
  durTicks: number;
  channel: number;
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

const pitchToMidi = (step: string, alter: number, octave: number): number | null => {
  const semitoneMap: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };
  const base = semitoneMap[step];
  if (base === undefined) return null;
  return (octave + 1) * 12 + base + alter;
};

const getFirstNumber = (el: ParentNode, selector: string): number | null => {
  const text = el.querySelector(selector)?.textContent?.trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

const PLAYBACK_TICKS_PER_QUARTER = 128;
const FIXED_PLAYBACK_WAVEFORM: OscillatorType = "sine";

const clampTempo = (tempo: number): number => {
  if (!Number.isFinite(tempo)) return 120;
  return Math.max(20, Math.min(300, Math.round(tempo)));
};

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

const midiToPitchText = (midiNumber: number): string => {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const n = Math.max(0, Math.min(127, Math.round(midiNumber)));
  const octave = Math.floor(n / 12) - 1;
  return `${names[n % 12]}${octave}`;
};

const getMidiWriterRuntime = (): MidiWriterRuntime | null => {
  return (window as unknown as { MidiWriter?: MidiWriterRuntime }).MidiWriter ?? null;
};

const buildMidiBytesForPlayback = (events: PlaybackEvent[], tempo: number): Uint8Array => {
  const midiWriter = getMidiWriterRuntime();
  if (!midiWriter) {
    throw new Error("midi-writer.js が読み込まれていません。");
  }
  const track = new midiWriter.Track();
  track.setTempo(clampTempo(tempo));

  const ordered = events
    .slice()
    .sort((a, b) => (a.startTicks === b.startTicks ? a.midiNumber - b.midiNumber : a.startTicks - b.startTicks));
  let cursorTicks = 0;
  for (const event of ordered) {
    const waitTicks = Math.max(0, event.startTicks - cursorTicks);
    const fields: MidiWriterNoteEventFields = {
      pitch: [midiToPitchText(event.midiNumber)],
      duration: `T${event.durTicks}`,
      velocity: 80,
      channel: Math.max(1, Math.min(16, Math.round(event.channel || 1))),
    };
    if (waitTicks > 0) {
      fields.wait = `T${waitTicks}`;
    }
    track.addEvent(new midiWriter.NoteEvent(fields));
    cursorTicks = Math.max(cursorTicks, event.startTicks + event.durTicks);
  }

  const writer = new midiWriter.Writer([track]);
  const built = writer.buildFile();
  return built instanceof Uint8Array ? built : Uint8Array.from(built);
};

const buildPlaybackEventsFromXml = (xml: string): { tempo: number; events: PlaybackEvent[] } => {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return { tempo: 120, events: [] };
  const partNodes = Array.from(doc.querySelectorAll("score-partwise > part"));
  if (partNodes.length === 0) return { tempo: 120, events: [] };

  const channelMap = new Map<string, number>();
  for (const scorePart of Array.from(doc.querySelectorAll("part-list > score-part"))) {
    const partId = scorePart.getAttribute("id") ?? "";
    if (!partId) continue;
    const midiChannelText = scorePart.querySelector("midi-instrument > midi-channel")?.textContent?.trim();
    const midiChannel = midiChannelText ? Number.parseInt(midiChannelText, 10) : NaN;
    if (Number.isFinite(midiChannel) && midiChannel >= 1 && midiChannel <= 16) {
      channelMap.set(partId, midiChannel);
    }
  }

  const defaultTempo = 120;
  const tempo = clampTempo(getFirstNumber(doc, "sound[tempo]") ?? defaultTempo);
  const events: PlaybackEvent[] = [];

  partNodes.forEach((part, partIndex) => {
    const partId = part.getAttribute("id") ?? "";
    const fallbackChannel = ((partIndex % 16) + 1 === 10) ? 11 : ((partIndex % 16) + 1);
    const channel = channelMap.get(partId) ?? fallbackChannel;

    let currentDivisions = 1;
    let currentBeats = 4;
    let currentBeatType = 4;
    let currentTransposeSemitones = 0;
    let timelineDiv = 0;

    for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
      const divisions = getFirstNumber(measure, "attributes > divisions");
      if (divisions && divisions > 0) {
        currentDivisions = divisions;
      }
      const beats = getFirstNumber(measure, "attributes > time > beats");
      const beatType = getFirstNumber(measure, "attributes > time > beat-type");
      if (beats && beats > 0 && beatType && beatType > 0) {
        currentBeats = beats;
        currentBeatType = beatType;
      }
      const hasTranspose =
        Boolean(measure.querySelector("attributes > transpose > chromatic")) ||
        Boolean(measure.querySelector("attributes > transpose > octave-change"));
      if (hasTranspose) {
        const chromatic = getFirstNumber(measure, "attributes > transpose > chromatic") ?? 0;
        const octaveChange = getFirstNumber(measure, "attributes > transpose > octave-change") ?? 0;
        currentTransposeSemitones = Math.round(chromatic + octaveChange * 12);
      }

      let cursorDiv = 0;
      let measureMaxDiv = 0;
      const lastStartByVoice = new Map<string, number>();

      for (const child of Array.from(measure.children)) {
        if (child.tagName === "backup" || child.tagName === "forward") {
          const dur = getFirstNumber(child, "duration");
          if (!dur || dur <= 0) continue;
          if (child.tagName === "backup") {
            cursorDiv = Math.max(0, cursorDiv - dur);
          } else {
            cursorDiv += dur;
            measureMaxDiv = Math.max(measureMaxDiv, cursorDiv);
          }
          continue;
        }

        if (child.tagName !== "note") continue;
        const durationDiv = getFirstNumber(child, "duration");
        if (!durationDiv || durationDiv <= 0) continue;

        const voice = child.querySelector("voice")?.textContent?.trim() ?? "1";
        const isChord = Boolean(child.querySelector("chord"));
        const isRest = Boolean(child.querySelector("rest"));
        const startDiv = isChord ? (lastStartByVoice.get(voice) ?? cursorDiv) : cursorDiv;
        if (!isChord) {
          lastStartByVoice.set(voice, startDiv);
        }

        if (!isRest) {
          const step = child.querySelector("pitch > step")?.textContent?.trim() ?? "";
          const octave = getFirstNumber(child, "pitch > octave");
          const alter = getFirstNumber(child, "pitch > alter") ?? 0;
          if (octave !== null) {
            const midi = pitchToMidi(step, alter, octave);
            if (midi !== null) {
              const soundingMidi = midi + currentTransposeSemitones;
              if (soundingMidi < 0 || soundingMidi > 127) {
                continue;
              }
              const startTicks = Math.max(
                0,
                Math.round(((timelineDiv + startDiv) / currentDivisions) * PLAYBACK_TICKS_PER_QUARTER)
              );
              const durTicks = Math.max(
                1,
                Math.round((durationDiv / currentDivisions) * PLAYBACK_TICKS_PER_QUARTER)
              );
              events.push({ midiNumber: soundingMidi, startTicks, durTicks, channel });
            }
          }
        }

        if (!isChord) {
          cursorDiv += durationDiv;
        }
        measureMaxDiv = Math.max(measureMaxDiv, cursorDiv, startDiv + durationDiv);
      }

      if (measureMaxDiv <= 0) {
        measureMaxDiv = Math.max(
          1,
          Math.round((currentDivisions * 4 * currentBeats) / Math.max(1, currentBeatType))
        );
      }
      timelineDiv += measureMaxDiv;
    }
  });

  return { tempo, events };
};

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

  const parsedPlayback = buildPlaybackEventsFromXml(saveResult.xml);
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

const readSelectedPitch = (): Pitch | null => {
  const octave = Number(pitchOctave.value);
  if (!Number.isInteger(octave)) return null;

  const alterText = pitchAlter.value.trim();
  const base: Pitch = {
    step: pitchStep.value as Pitch["step"],
    octave,
  };
  if (alterText === "") return base;

  const alter = Number(alterText);
  if (!Number.isInteger(alter) || alter < -2 || alter > 2) return null;
  return { ...base, alter: alter as -2 | -1 | 0 | 1 | 2 };
};

const readDuration = (): number | null => {
  const duration = Number(durationInput.value);
  if (!Number.isInteger(duration) || duration <= 0) return null;
  return duration;
};

const runCommand = (command: CoreCommand): void => {
  if (!state.loaded) return;
  state.lastDispatchResult = core.dispatch(command);
  if (!state.lastDispatchResult.ok || state.lastDispatchResult.warnings.length > 0) {
    logDiagnostics(
      "dispatch",
      state.lastDispatchResult.diagnostics,
      state.lastDispatchResult.warnings
    );
  }
  state.lastSaveResult = null;

  if (state.lastDispatchResult.ok) {
    refreshNotesFromCore();
  }
  renderAll();
  renderDebugScore();
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
  refreshNotesFromCore();
  renderAll();
  renderDebugScore();
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

  loadFromText(xmlInput.value);
};

const requireSelectedNode = (): string | null => {
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
    type: "change_pitch",
    targetNodeId,
    voice: EDITABLE_VOICE,
    pitch,
  };
  runCommand(command);
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

const onSave = (): void => {
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
  }
  if (result.ok) {
    state.lastSuccessfulSaveXml = result.xml;
  }
  renderAll();
  renderDebugScore();
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
  renderStatus();
  renderControlState();
});
changePitchBtn.addEventListener("click", onChangePitch);
changeDurationBtn.addEventListener("click", onChangeDuration);
insertAfterBtn.addEventListener("click", onInsertAfter);
deleteBtn.addEventListener("click", onDelete);
saveBtn.addEventListener("click", onSave);
playBtn.addEventListener("click", () => {
  void startPlayback();
});
stopBtn.addEventListener("click", stopPlayback);
downloadBtn.addEventListener("click", onDownload);
debugScoreArea.addEventListener("click", onVerovioScoreClick);

renderAll();
renderDebugScore();
