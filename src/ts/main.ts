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

type UiState = {
  loaded: boolean;
  selectedNodeId: string | null;
  noteNodeIds: string[];
  lastDispatchResult: DispatchResult | null;
  lastSaveResult: SaveResult | null;
  lastSuccessfulSaveXml: string;
};

const EDITABLE_VOICE = "1";

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list>
    <score-part id="P1"><part-name>Music</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice></note>
    </measure>
  </part>
</score-partwise>`;

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
const loadSampleBtn = q<HTMLButtonElement>("#loadSampleBtn");
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
let audioContext: AudioContext | null = null;
let activeOscillators: OscillatorNode[] = [];
let activeGains: GainNode[] = [];
let playbackTimer: number | null = null;
let isPlaying = false;
const DEBUG_LOG = true;

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
    ? `ロード済み / dirty=${dirty} / notes=${state.noteNodeIds.length}`
    : "未ロード（まず Load してください）";
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

const refreshNotesFromCore = (): void => {
  state.noteNodeIds = core.listNoteNodeIds();
  if (state.selectedNodeId && !state.noteNodeIds.includes(state.selectedNodeId)) {
    state.selectedNodeId = null;
  }
};

type PlaybackEvent = {
  freqHz: number;
  startSec: number;
  durSec: number;
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

const buildPlaybackEventsFromXml = (xml: string): PlaybackEvent[] => {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) return [];
  const part = doc.querySelector("part");
  if (!part) return [];

  let currentDivisions = 1;
  const defaultTempo = 120;
  const tempo = getFirstNumber(doc, "sound[tempo]") ?? defaultTempo;
  const secPerDivision = 60 / tempo / currentDivisions;

  const events: PlaybackEvent[] = [];
  let cursorSec = 0;
  let lastNoteStartSec = 0;

  for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
    const divisions = getFirstNumber(measure, "attributes > divisions");
    if (divisions && divisions > 0) {
      currentDivisions = divisions;
    }
    const measureSecPerDivision = 60 / tempo / currentDivisions;

    for (const child of Array.from(measure.children)) {
      if (child.tagName !== "note") continue;

      const voice = child.querySelector("voice")?.textContent?.trim() ?? "1";
      if (voice !== EDITABLE_VOICE) continue;

      const durationValue = getFirstNumber(child, "duration");
      if (!durationValue || durationValue <= 0) continue;

      const durationSec = durationValue * measureSecPerDivision;
      const isRest = Boolean(child.querySelector("rest"));
      const isChord = Boolean(child.querySelector("chord"));
      if (isRest) {
        cursorSec += durationSec;
        continue;
      }

      const step = child.querySelector("pitch > step")?.textContent?.trim() ?? "";
      const octave = getFirstNumber(child, "pitch > octave");
      const alter = getFirstNumber(child, "pitch > alter") ?? 0;
      if (octave === null) {
        cursorSec += durationSec;
        continue;
      }

      const midi = pitchToMidi(step, alter, octave);
      if (midi === null) {
        if (!isChord) {
          cursorSec += durationSec;
        }
        continue;
      }

      const startSec = isChord ? lastNoteStartSec : cursorSec;
      events.push({
        freqHz: midiToHz(midi),
        startSec,
        durSec: Math.max(0.05, durationSec),
      });
      if (!isChord) {
        lastNoteStartSec = cursorSec;
        cursorSec += durationSec;
      }
    }
  }

  // Touch computed variable so TypeScript keeps intent explicit and avoids accidental drift.
  void secPerDivision;
  return events;
};

const stopPlayback = (): void => {
  for (const osc of activeOscillators) {
    try {
      osc.stop();
    } catch {
      // ignore stale node stop calls
    }
    osc.disconnect();
  }
  for (const gain of activeGains) {
    gain.disconnect();
  }
  activeOscillators = [];
  activeGains = [];
  if (playbackTimer !== null) {
    window.clearTimeout(playbackTimer);
    playbackTimer = null;
  }
  isPlaying = false;
  playbackText.textContent = "playback: idle";
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
    playbackText.textContent = "playback: save failed";
    return;
  }

  const events = buildPlaybackEventsFromXml(saveResult.xml);
  if (events.length === 0) {
    playbackText.textContent = "playback: no playable notes";
    renderControlState();
    return;
  }

  if (!audioContext) {
    audioContext = new AudioContext();
  }
  await audioContext.resume();

  const now = audioContext.currentTime + 0.02;
  let maxEnd = 0;

  for (const event of events) {
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.0001, now + event.startSec);
    gain.gain.exponentialRampToValueAtTime(0.12, now + event.startSec + 0.01);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + event.startSec + Math.max(0.02, event.durSec * 0.9)
    );
    gain.connect(audioContext.destination);

    const osc = audioContext.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(event.freqHz, now + event.startSec);
    osc.connect(gain);
    osc.start(now + event.startSec);
    osc.stop(now + event.startSec + event.durSec);

    activeOscillators.push(osc);
    activeGains.push(gain);
    maxEnd = Math.max(maxEnd, event.startSec + event.durSec);
  }

  isPlaying = true;
  playbackText.textContent = `playback: playing (${events.length} notes)`;
  renderControlState();

  playbackTimer = window.setTimeout(() => {
    stopPlayback();
  }, Math.ceil(maxEnd * 1000) + 60);
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
  refreshNotesFromCore();
  renderAll();
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
loadSampleBtn.addEventListener("click", () => {
  inputModeSource.checked = true;
  inputModeFile.checked = false;
  xmlInput.value = sampleXml;
  fileNameText.textContent = "未選択";
  renderInputMode();
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

renderAll();
