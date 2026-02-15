(function () {
const modules = {
  "src/ts/main.js": function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ScoreCore_1 = require("../../core/ScoreCore");
const timeIndex_1 = require("../../core/timeIndex");
const sampleXml_1 = require("./sampleXml");
const EDITABLE_VOICE = "1";
const q = (selector) => {
    const el = document.querySelector(selector);
    if (!el)
        throw new Error(`Missing element: ${selector}`);
    return el;
};
const inputModeFile = q("#inputModeFile");
const inputModeSource = q("#inputModeSource");
const inputSectionDetails = q("#inputSectionDetails");
const fileInputBlock = q("#fileInputBlock");
const sourceInputBlock = q("#sourceInputBlock");
const xmlInput = q("#xmlInput");
const fileSelectBtn = q("#fileSelectBtn");
const fileInput = q("#fileInput");
const fileNameText = q("#fileNameText");
const loadBtn = q("#loadBtn");
const noteSelect = q("#noteSelect");
const statusText = q("#statusText");
const pitchStep = q("#pitchStep");
const pitchAlter = q("#pitchAlter");
const pitchOctave = q("#pitchOctave");
const durationInput = q("#durationInput");
const changePitchBtn = q("#changePitchBtn");
const changeDurationBtn = q("#changeDurationBtn");
const insertAfterBtn = q("#insertAfterBtn");
const deleteBtn = q("#deleteBtn");
const playBtn = q("#playBtn");
const stopBtn = q("#stopBtn");
const downloadBtn = q("#downloadBtn");
const saveModeText = q("#saveModeText");
const playbackText = q("#playbackText");
const outputXml = q("#outputXml");
const diagArea = q("#diagArea");
const debugScoreMeta = q("#debugScoreMeta");
const debugScoreArea = q("#debugScoreArea");
const core = new ScoreCore_1.ScoreCore({ editableVoice: EDITABLE_VOICE });
const state = {
    loaded: false,
    selectedNodeId: null,
    noteNodeIds: [],
    lastDispatchResult: null,
    lastSaveResult: null,
    lastSuccessfulSaveXml: "",
};
xmlInput.value = sampleXml_1.sampleXml;
let isPlaying = false;
const DEBUG_LOG = true;
let verovioToolkit = null;
let verovioInitPromise = null;
let verovioRenderSeq = 0;
let currentSvgIdToNodeId = new Map();
const logDiagnostics = (phase, diagnostics, warnings = []) => {
    if (!DEBUG_LOG)
        return;
    for (const d of diagnostics) {
        console.error(`[mikuscore][${phase}][${d.code}] ${d.message}`);
    }
    for (const w of warnings) {
        console.warn(`[mikuscore][${phase}][${w.code}] ${w.message}`);
    }
};
const dumpOverfullContext = (xml, voice) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    if (!DEBUG_LOG)
        return;
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) {
        console.error("[mikuscore][debug] XML parse failed while dumping overfull context.");
        return;
    }
    const measures = Array.from(doc.querySelectorAll("part > measure"));
    let found = false;
    for (const measure of measures) {
        const number = (_a = measure.getAttribute("number")) !== null && _a !== void 0 ? _a : "(no-number)";
        const divisionsText = (_d = (_c = (_b = measure.querySelector("attributes > divisions")) === null || _b === void 0 ? void 0 : _b.textContent) === null || _c === void 0 ? void 0 : _c.trim()) !== null && _d !== void 0 ? _d : "(inherit)";
        const beatsText = (_g = (_f = (_e = measure.querySelector("attributes > time > beats")) === null || _e === void 0 ? void 0 : _e.textContent) === null || _f === void 0 ? void 0 : _f.trim()) !== null && _g !== void 0 ? _g : "(inherit)";
        const beatTypeText = (_k = (_j = (_h = measure.querySelector("attributes > time > beat-type")) === null || _h === void 0 ? void 0 : _h.textContent) === null || _j === void 0 ? void 0 : _j.trim()) !== null && _k !== void 0 ? _k : "(inherit)";
        const noteRows = [];
        const occupied = (0, timeIndex_1.getOccupiedTime)(measure, voice);
        Array.from(measure.children).forEach((child, idx) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
            if (child.tagName !== "note")
                return;
            const noteVoice = (_c = (_b = (_a = child.querySelector("voice")) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : "";
            const duration = Number((_f = (_e = (_d = child.querySelector("duration")) === null || _d === void 0 ? void 0 : _d.textContent) === null || _e === void 0 ? void 0 : _e.trim()) !== null && _f !== void 0 ? _f : "");
            const isRest = Boolean(child.querySelector("rest"));
            const step = (_j = (_h = (_g = child.querySelector("pitch > step")) === null || _g === void 0 ? void 0 : _g.textContent) === null || _h === void 0 ? void 0 : _h.trim()) !== null && _j !== void 0 ? _j : "";
            const alter = (_l = (_k = child.querySelector("pitch > alter")) === null || _k === void 0 ? void 0 : _k.textContent) === null || _l === void 0 ? void 0 : _l.trim();
            const octave = (_p = (_o = (_m = child.querySelector("pitch > octave")) === null || _m === void 0 ? void 0 : _m.textContent) === null || _o === void 0 ? void 0 : _o.trim()) !== null && _p !== void 0 ? _p : "";
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
        const capacity = (0, timeIndex_1.getMeasureCapacity)(measure);
        if (capacity === null)
            continue;
        if (occupied <= capacity)
            continue;
        found = true;
        console.groupCollapsed(`[mikuscore][debug][MEASURE_OVERFULL] measure=${number} occupied=${occupied} capacity=${capacity}`);
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
const renderInputMode = () => {
    const fileMode = inputModeFile.checked;
    fileInputBlock.classList.toggle("md-hidden", !fileMode);
    sourceInputBlock.classList.toggle("md-hidden", fileMode);
};
const renderStatus = () => {
    const dirty = core.isDirty();
    statusText.textContent = state.loaded
        ? `ロード済み / 変更あり=${dirty} / ノート数=${state.noteNodeIds.length}`
        : "未ロード（まず読み込みしてください）";
};
const renderNotes = () => {
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
    }
    else {
        state.selectedNodeId = null;
        noteSelect.value = "";
    }
};
const renderDiagnostics = () => {
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
const renderOutput = () => {
    var _a, _b;
    saveModeText.textContent = state.lastSaveResult ? state.lastSaveResult.mode : "-";
    outputXml.value = ((_a = state.lastSaveResult) === null || _a === void 0 ? void 0 : _a.ok) ? state.lastSaveResult.xml : "";
    downloadBtn.disabled = !((_b = state.lastSaveResult) === null || _b === void 0 ? void 0 : _b.ok);
};
const renderControlState = () => {
    const hasSelection = Boolean(state.selectedNodeId);
    noteSelect.disabled = !state.loaded;
    changePitchBtn.disabled = !state.loaded || !hasSelection;
    changeDurationBtn.disabled = !state.loaded || !hasSelection;
    insertAfterBtn.disabled = !state.loaded || !hasSelection;
    deleteBtn.disabled = !state.loaded || !hasSelection;
    playBtn.disabled = !state.loaded || isPlaying;
    stopBtn.disabled = !isPlaying;
};
const renderAll = () => {
    renderInputMode();
    renderNotes();
    renderStatus();
    renderDiagnostics();
    renderOutput();
    renderControlState();
};
const setUiMappingDiagnostic = (message) => {
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
const buildRenderXmlForVerovio = (xml) => {
    const map = new Map();
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
const deriveRenderedNoteIds = (root) => {
    const direct = Array.from(root.querySelectorAll('[id^="mks-tmp-"], [id*="mks-tmp-"]')).map((el) => el.id);
    if (direct.length > 0) {
        return Array.from(new Set(direct));
    }
    const fallback = Array.from(root.querySelectorAll("[id]"))
        .filter((el) => {
        var _a;
        const id = el.id || "";
        const className = (_a = el.getAttribute("class")) !== null && _a !== void 0 ? _a : "";
        return id.startsWith("note-") || /\bnote\b/.test(className);
    })
        .map((el) => el.id);
    return Array.from(new Set(fallback));
};
const buildFallbackSvgIdMap = (sourceNodeIds, renderedNoteIds) => {
    const map = new Map();
    const count = Math.min(sourceNodeIds.length, renderedNoteIds.length);
    for (let i = 0; i < count; i += 1) {
        map.set(renderedNoteIds[i], sourceNodeIds[i]);
    }
    return map;
};
const resolveNodeIdFromCandidateIds = (candidateIds) => {
    for (const entry of candidateIds) {
        const exact = currentSvgIdToNodeId.get(entry);
        if (exact)
            return exact;
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
const collectCandidateIdsFromElement = (base) => {
    if (!base)
        return [];
    const candidateIds = [];
    const pushId = (value) => {
        if (!value)
            return;
        const id = value.startsWith("#") ? value.slice(1) : value;
        if (!id)
            return;
        if (!candidateIds.includes(id))
            candidateIds.push(id);
    };
    let cursor = base;
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
const resolveNodeIdFromSvgTarget = (target, clickEvent) => {
    if (!target || !(target instanceof Element))
        return null;
    const directCandidates = collectCandidateIdsFromElement(target);
    const resolvedFromDirect = resolveNodeIdFromCandidateIds(directCandidates);
    if (resolvedFromDirect)
        return resolvedFromDirect;
    if (clickEvent && typeof document.elementsFromPoint === "function") {
        const hitElements = document.elementsFromPoint(clickEvent.clientX, clickEvent.clientY);
        for (const hit of hitElements) {
            if (!(hit instanceof Element))
                continue;
            const hitCandidates = collectCandidateIdsFromElement(hit);
            const resolvedFromHit = resolveNodeIdFromCandidateIds(hitCandidates);
            if (resolvedFromHit)
                return resolvedFromHit;
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
const onVerovioScoreClick = (event) => {
    var _a;
    if (!state.loaded)
        return;
    const nodeId = resolveNodeIdFromSvgTarget(event.target, event);
    if (DEBUG_LOG) {
        const clicked = event.target instanceof Element ? event.target.closest("[id]") : null;
        console.warn("[mikuscore][click-map] resolution:", {
            clickedId: (_a = clicked === null || clicked === void 0 ? void 0 : clicked.getAttribute("id")) !== null && _a !== void 0 ? _a : null,
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
const getVerovioRuntime = () => {
    var _a;
    return (_a = window.verovio) !== null && _a !== void 0 ? _a : null;
};
const ensureVerovioToolkit = async () => {
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
            await new Promise((resolve, reject) => {
                let settled = false;
                const timeoutId = window.setTimeout(() => {
                    if (settled)
                        return;
                    settled = true;
                    reject(new Error("verovio 初期化待機がタイムアウトしました。"));
                }, 8000);
                const complete = () => {
                    if (settled)
                        return;
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
const renderScorePreview = () => {
    var _a, _b;
    const renderSeq = ++verovioRenderSeq;
    const xml = (_b = (_a = (state.loaded ? core.debugSerializeCurrentXml() : null)) !== null && _a !== void 0 ? _a : xmlInput.value.trim()) !== null && _b !== void 0 ? _b : "";
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
        if (renderSeq !== verovioRenderSeq)
            return;
        if (!toolkit) {
            throw new Error("verovio toolkit の初期化に失敗しました。");
        }
        const options = {
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
        }
        else {
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
        .catch((error) => {
        if (renderSeq !== verovioRenderSeq)
            return;
        const message = error instanceof Error ? error.message : String(error);
        debugScoreMeta.textContent = "描画失敗: " + message;
        debugScoreArea.innerHTML = "";
        currentSvgIdToNodeId = new Map();
    });
};
const refreshNotesFromCore = () => {
    state.noteNodeIds = core.listNoteNodeIds();
    if (state.selectedNodeId && !state.noteNodeIds.includes(state.selectedNodeId)) {
        state.selectedNodeId = null;
    }
};
const midiToHz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const pitchToMidi = (step, alter, octave) => {
    const semitoneMap = {
        C: 0,
        D: 2,
        E: 4,
        F: 5,
        G: 7,
        A: 9,
        B: 11,
    };
    const base = semitoneMap[step];
    if (base === undefined)
        return null;
    return (octave + 1) * 12 + base + alter;
};
const getFirstNumber = (el, selector) => {
    var _a, _b;
    const text = (_b = (_a = el.querySelector(selector)) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim();
    if (!text)
        return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
};
const PLAYBACK_TICKS_PER_QUARTER = 128;
const FIXED_PLAYBACK_WAVEFORM = "sine";
const clampTempo = (tempo) => {
    if (!Number.isFinite(tempo))
        return 120;
    return Math.max(20, Math.min(300, Math.round(tempo)));
};
const normalizeWaveform = (value) => {
    if (value === "square" || value === "triangle")
        return value;
    return "sine";
};
const createBasicWaveSynthEngine = (options) => {
    const ticksPerQuarter = Number.isFinite(options.ticksPerQuarter)
        ? Math.max(1, Math.round(options.ticksPerQuarter))
        : 128;
    let audioContext = null;
    let activeSynthNodes = [];
    let synthStopTimer = null;
    const scheduleBasicWaveNote = (event, startAt, bodyDuration, waveform) => {
        if (!audioContext)
            return startAt;
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
            }
            catch (_a) {
                // ignore cleanup failure
            }
        };
        activeSynthNodes.push({ oscillator, gainNode });
        return endAt + release + 0.02;
    };
    const stop = () => {
        if (synthStopTimer !== null) {
            window.clearTimeout(synthStopTimer);
            synthStopTimer = null;
        }
        for (const node of activeSynthNodes) {
            try {
                node.oscillator.stop();
            }
            catch (_a) {
                // ignore already-stopped nodes
            }
            try {
                node.oscillator.disconnect();
                node.gainNode.disconnect();
            }
            catch (_b) {
                // ignore disconnect error
            }
        }
        activeSynthNodes = [];
    };
    const playSchedule = async (schedule, waveform, onEnded) => {
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
const midiToPitchText = (midiNumber) => {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const n = Math.max(0, Math.min(127, Math.round(midiNumber)));
    const octave = Math.floor(n / 12) - 1;
    return `${names[n % 12]}${octave}`;
};
const getMidiWriterRuntime = () => {
    var _a;
    return (_a = window.MidiWriter) !== null && _a !== void 0 ? _a : null;
};
const buildMidiBytesForPlayback = (events, tempo) => {
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
        const fields = {
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
const buildPlaybackEventsFromXml = (xml) => {
    var _a, _b, _c, _d;
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror"))
        return { tempo: 120, events: [] };
    const partNodes = Array.from(doc.querySelectorAll("score-partwise > part"));
    if (partNodes.length === 0)
        return { tempo: 120, events: [] };
    const channelMap = new Map();
    for (const scorePart of Array.from(doc.querySelectorAll("part-list > score-part"))) {
        const partId = (_a = scorePart.getAttribute("id")) !== null && _a !== void 0 ? _a : "";
        if (!partId)
            continue;
        const midiChannelText = (_c = (_b = scorePart.querySelector("midi-instrument > midi-channel")) === null || _b === void 0 ? void 0 : _b.textContent) === null || _c === void 0 ? void 0 : _c.trim();
        const midiChannel = midiChannelText ? Number.parseInt(midiChannelText, 10) : NaN;
        if (Number.isFinite(midiChannel) && midiChannel >= 1 && midiChannel <= 16) {
            channelMap.set(partId, midiChannel);
        }
    }
    const defaultTempo = 120;
    const tempo = clampTempo((_d = getFirstNumber(doc, "sound[tempo]")) !== null && _d !== void 0 ? _d : defaultTempo);
    const events = [];
    partNodes.forEach((part, partIndex) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        const partId = (_a = part.getAttribute("id")) !== null && _a !== void 0 ? _a : "";
        const fallbackChannel = ((partIndex % 16) + 1 === 10) ? 11 : ((partIndex % 16) + 1);
        const channel = (_b = channelMap.get(partId)) !== null && _b !== void 0 ? _b : fallbackChannel;
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
            const hasTranspose = Boolean(measure.querySelector("attributes > transpose > chromatic")) ||
                Boolean(measure.querySelector("attributes > transpose > octave-change"));
            if (hasTranspose) {
                const chromatic = (_c = getFirstNumber(measure, "attributes > transpose > chromatic")) !== null && _c !== void 0 ? _c : 0;
                const octaveChange = (_d = getFirstNumber(measure, "attributes > transpose > octave-change")) !== null && _d !== void 0 ? _d : 0;
                currentTransposeSemitones = Math.round(chromatic + octaveChange * 12);
            }
            let cursorDiv = 0;
            let measureMaxDiv = 0;
            const lastStartByVoice = new Map();
            for (const child of Array.from(measure.children)) {
                if (child.tagName === "backup" || child.tagName === "forward") {
                    const dur = getFirstNumber(child, "duration");
                    if (!dur || dur <= 0)
                        continue;
                    if (child.tagName === "backup") {
                        cursorDiv = Math.max(0, cursorDiv - dur);
                    }
                    else {
                        cursorDiv += dur;
                        measureMaxDiv = Math.max(measureMaxDiv, cursorDiv);
                    }
                    continue;
                }
                if (child.tagName !== "note")
                    continue;
                const durationDiv = getFirstNumber(child, "duration");
                if (!durationDiv || durationDiv <= 0)
                    continue;
                const voice = (_g = (_f = (_e = child.querySelector("voice")) === null || _e === void 0 ? void 0 : _e.textContent) === null || _f === void 0 ? void 0 : _f.trim()) !== null && _g !== void 0 ? _g : "1";
                const isChord = Boolean(child.querySelector("chord"));
                const isRest = Boolean(child.querySelector("rest"));
                const startDiv = isChord ? ((_h = lastStartByVoice.get(voice)) !== null && _h !== void 0 ? _h : cursorDiv) : cursorDiv;
                if (!isChord) {
                    lastStartByVoice.set(voice, startDiv);
                }
                if (!isRest) {
                    const step = (_l = (_k = (_j = child.querySelector("pitch > step")) === null || _j === void 0 ? void 0 : _j.textContent) === null || _k === void 0 ? void 0 : _k.trim()) !== null && _l !== void 0 ? _l : "";
                    const octave = getFirstNumber(child, "pitch > octave");
                    const alter = (_m = getFirstNumber(child, "pitch > alter")) !== null && _m !== void 0 ? _m : 0;
                    if (octave !== null) {
                        const midi = pitchToMidi(step, alter, octave);
                        if (midi !== null) {
                            const soundingMidi = midi + currentTransposeSemitones;
                            if (soundingMidi < 0 || soundingMidi > 127) {
                                continue;
                            }
                            const startTicks = Math.max(0, Math.round(((timelineDiv + startDiv) / currentDivisions) * PLAYBACK_TICKS_PER_QUARTER));
                            const durTicks = Math.max(1, Math.round((durationDiv / currentDivisions) * PLAYBACK_TICKS_PER_QUARTER));
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
                measureMaxDiv = Math.max(1, Math.round((currentDivisions * 4 * currentBeats) / Math.max(1, currentBeatType)));
            }
            timelineDiv += measureMaxDiv;
        }
    });
    return { tempo, events };
};
const stopPlayback = () => {
    synthEngine.stop();
    isPlaying = false;
    playbackText.textContent = "再生: 停止中";
    renderControlState();
};
const startPlayback = async () => {
    if (!state.loaded || isPlaying)
        return;
    const saveResult = core.save();
    state.lastSaveResult = saveResult;
    if (!saveResult.ok) {
        logDiagnostics("playback", saveResult.diagnostics);
        if (saveResult.diagnostics.some((d) => d.code === "MEASURE_OVERFULL")) {
            const debugXml = core.debugSerializeCurrentXml();
            if (debugXml) {
                dumpOverfullContext(debugXml, EDITABLE_VOICE);
            }
            else if (DEBUG_LOG) {
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
    let midiBytes;
    try {
        midiBytes = buildMidiBytesForPlayback(events, parsedPlayback.tempo);
    }
    catch (error) {
        playbackText.textContent =
            "再生: MIDI生成失敗 (" +
                (error instanceof Error ? error.message : String(error)) +
                ")";
        renderControlState();
        return;
    }
    const schedule = {
        tempo: parsedPlayback.tempo,
        events: events
            .slice()
            .sort((a, b) => a.startTicks === b.startTicks ? a.midiNumber - b.midiNumber : a.startTicks - b.startTicks)
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
    }
    catch (error) {
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
const readSelectedPitch = () => {
    const octave = Number(pitchOctave.value);
    if (!Number.isInteger(octave))
        return null;
    const alterText = pitchAlter.value.trim();
    const base = {
        step: pitchStep.value,
        octave,
    };
    if (alterText === "")
        return base;
    const alter = Number(alterText);
    if (!Number.isInteger(alter) || alter < -2 || alter > 2)
        return null;
    return { ...base, alter: alter };
};
const readDuration = () => {
    const duration = Number(durationInput.value);
    if (!Number.isInteger(duration) || duration <= 0)
        return null;
    return duration;
};
const runCommand = (command) => {
    if (!state.loaded)
        return;
    state.lastDispatchResult = core.dispatch(command);
    if (!state.lastDispatchResult.ok || state.lastDispatchResult.warnings.length > 0) {
        logDiagnostics("dispatch", state.lastDispatchResult.diagnostics, state.lastDispatchResult.warnings);
    }
    state.lastSaveResult = null;
    if (state.lastDispatchResult.ok) {
        refreshNotesFromCore();
        autoSaveCurrentXml();
    }
    renderAll();
    renderScorePreview();
};
const autoSaveCurrentXml = () => {
    if (!state.loaded)
        return;
    const result = core.save();
    state.lastSaveResult = result;
    if (!result.ok) {
        logDiagnostics("save", result.diagnostics);
        if (result.diagnostics.some((d) => d.code === "MEASURE_OVERFULL")) {
            const debugXml = core.debugSerializeCurrentXml();
            if (debugXml) {
                dumpOverfullContext(debugXml, EDITABLE_VOICE);
            }
            else if (DEBUG_LOG) {
                console.warn("[mikuscore][debug] no in-memory XML to dump.");
            }
        }
        return;
    }
    state.lastSuccessfulSaveXml = result.xml;
};
const loadFromText = (xml, collapseInputSection) => {
    try {
        core.load(xml);
    }
    catch (err) {
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
    autoSaveCurrentXml();
    if (collapseInputSection) {
        inputSectionDetails.open = false;
    }
    renderAll();
    renderScorePreview();
};
const onLoadClick = async () => {
    var _a;
    if (inputModeFile.checked) {
        const selected = (_a = fileInput.files) === null || _a === void 0 ? void 0 : _a[0];
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
const requireSelectedNode = () => {
    const nodeId = state.selectedNodeId;
    if (nodeId)
        return nodeId;
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
const onChangePitch = () => {
    const targetNodeId = requireSelectedNode();
    if (!targetNodeId)
        return;
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
    const command = {
        type: "change_pitch",
        targetNodeId,
        voice: EDITABLE_VOICE,
        pitch,
    };
    runCommand(command);
};
const onChangeDuration = () => {
    const targetNodeId = requireSelectedNode();
    if (!targetNodeId)
        return;
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
    const command = {
        type: "change_duration",
        targetNodeId,
        voice: EDITABLE_VOICE,
        duration,
    };
    runCommand(command);
};
const onInsertAfter = () => {
    const anchorNodeId = requireSelectedNode();
    if (!anchorNodeId)
        return;
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
    const command = {
        type: "insert_note_after",
        anchorNodeId,
        voice: EDITABLE_VOICE,
        note: { duration, pitch },
    };
    runCommand(command);
};
const onDelete = () => {
    const targetNodeId = requireSelectedNode();
    if (!targetNodeId)
        return;
    const command = {
        type: "delete_note",
        targetNodeId,
        voice: EDITABLE_VOICE,
    };
    runCommand(command);
};
const onDownload = () => {
    if (!state.lastSuccessfulSaveXml)
        return;
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
    var _a;
    const f = (_a = fileInput.files) === null || _a === void 0 ? void 0 : _a[0];
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
playBtn.addEventListener("click", () => {
    void startPlayback();
});
stopBtn.addEventListener("click", stopPlayback);
downloadBtn.addEventListener("click", onDownload);
debugScoreArea.addEventListener("click", onVerovioScoreClick);
loadFromText(xmlInput.value, false);

  },
  "src/ts/sampleXml.js": function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sampleXml = void 0;
exports.sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN"
  "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>Brahms Nr.4 mov.1</work-title></work>
  <identification><creator type="composer">Unknown</creator></identification>
  <part-list>
    <score-part id="P1"><part-name>Brahms Nr.4 mov.1 Treble L1</part-name></score-part>
    <score-part id="P2"><part-name>Brahms Nr.4 mov.1 Treble L2</part-name></score-part>
    <score-part id="P3"><part-name>Brahms Nr.4 mov.1 Treble L3</part-name></score-part>
    <score-part id="P4"><part-name>Brahms Nr.4 mov.1 Treble L4</part-name></score-part>
    <score-part id="P5"><part-name>Brahms Nr.4 mov.1 Treble L5</part-name></score-part>
    <score-part id="P6"><part-name>Brahms Nr.4 mov.1 Bass L1</part-name></score-part>
    <score-part id="P7"><part-name>Brahms Nr.4 mov.1 Bass L2</part-name></score-part>
    <score-part id="P8"><part-name>Brahms Nr.4 mov.1 Bass L3</part-name></score-part>
    <score-part id="P9"><part-name>Brahms Nr.4 mov.1 Bass L4</part-name></score-part>
    <score-part id="P10"><part-name>Brahms Nr.4 mov.1 Bass L5</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>2</fifths><mode>minor</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <rest/>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="3">
      <note>
        <pitch>
          <step>C</step>
          <octave>6</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="4">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
    </measure>
    <measure number="5">
      <note>
        <pitch>
          <step>B</step>
          <octave>5</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>6</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="6">
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="7">
      <note>
        <pitch>
          <step>B</step>
          <octave>5</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>6</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="8">
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
    </measure>
    <measure number="9">
      <note>
        <pitch>
          <step>A</step>
          <octave>5</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>6</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
    </measure>
    <measure number="10">
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="11">
      <note>
        <pitch>
          <step>C</step>
          <octave>6</octave>
        </pitch>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="12">
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="13">
      <note>
        <pitch>
          <step>C</step>
          <octave>6</octave>
        </pitch>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
    </measure>
    <measure number="14">
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="15">
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="16">
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="17">
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="18">
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="19">
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>720</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>240</duration>
        <type>16th</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="20">
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="21">
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>6</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="22">
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
    </measure>
    <measure number="23">
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>6</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
    </measure>
    <measure number="24">
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="25">
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>6</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="26">
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
    </measure>
    <measure number="27">
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>6</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
    </measure>
    <measure number="28">
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="29">
      <note>
        <pitch>
          <step>C</step>
          <octave>6</octave>
        </pitch>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
    </measure>
    <measure number="30">
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="31">
      <note>
        <pitch>
          <step>D</step>
          <octave>6</octave>
        </pitch>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="32">
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="33">
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
    </measure>
    <measure number="34">
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>5</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="35">
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>6</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>6</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>6</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="36">
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="37">
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>6</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>6</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="38">
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="39">
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="40">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>6</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>6</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="41">
      <note>
        <pitch>
          <step>D</step>
          <octave>6</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>6</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="42">
      <note>
        <pitch>
          <step>B</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>6</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>6</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="43">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="44">
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="45">
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="46">
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>6</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>6</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="47">
      <note>
        <pitch>
          <step>A</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="48">
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="49">
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>5</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>6</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="50">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>6</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>6</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>6</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>6</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="51">
      <note>
        <pitch>
          <step>D</step>
          <octave>6</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>6</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="52">
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>6</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="53">
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="54">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>2</fifths><mode>minor</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <rest/>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="3">
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="4">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="5">
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="6">
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="7">
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="8">
      <note>
        <pitch>
          <step>F</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="9">
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="10">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="11">
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="12">
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="13">
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="14">
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="15">
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
    </measure>
    <measure number="16">
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="17">
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="18">
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="19">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>240</duration>
        <type>16th</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1200</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="20">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="21">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="22">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="23">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="24">
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="25">
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="26">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="27">
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="28">
      <note>
        <rest/>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="29">
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="30">
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="31">
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="32">
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
    </measure>
    <measure number="33">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="34">
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="35">
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>6</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>6</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="36">
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="37">
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>6</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="38">
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="39">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="40">
      <note>
        <pitch>
          <step>B</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="41">
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="42">
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="43">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="44">
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="45">
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="46">
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="47">
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="48">
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="49">
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="50">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="51">
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="52">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="53">
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="54">
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
  </part>
  <part id="P3">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>2</fifths><mode>minor</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="2">
      <note>
        <rest/>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="3">
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="4">
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="5">
      <note>
        <rest/>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="6">
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="7">
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="8">
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
    </measure>
    <measure number="9">
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="10">
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="11">
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="12">
      <note>
        <rest/>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="13">
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="14">
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="15">
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="16">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="17">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="18">
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="19">
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="20">
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
    </measure>
    <measure number="21">
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="22">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="23">
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <rest/>
        <duration>3360</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="24">
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>3360</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="25">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="26">
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>3360</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="27">
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>3360</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="28">
      <note>
        <rest/>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="29">
      <note>
        <rest/>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="30">
      <note>
        <rest/>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="31">
      <note>
        <rest/>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="32">
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="33">
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="34">
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="35">
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="36">
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="37">
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
    </measure>
    <measure number="38">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="39">
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
    </measure>
    <measure number="40">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="41">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="42">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="43">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>5</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="44">
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="45">
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="46">
      <note>
        <rest/>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="47">
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="48">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="49">
      <note>
        <rest/>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="50">
      <note>
        <pitch>
          <step>D</step>
          <octave>5</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="51">
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="52">
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
  </part>
  <part id="P4">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>2</fifths><mode>minor</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="2">
      <note>
        <rest/>
        <duration>3360</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="3">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="4">
      <note>
        <rest/>
        <duration>3360</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="5">
      <note>
        <rest/>
        <duration>3360</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="6">
      <note>
        <rest/>
        <duration>3360</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="7">
      <note>
        <rest/>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="8">
      <note>
        <rest/>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="9">
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="10">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="11">
      <note>
        <rest/>
        <duration>3360</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="12">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="13">
      <note>
        <rest/>
        <duration>3360</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="14">
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="15">
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="16">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="17">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="18">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="19">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="20">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="21">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="22">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="23">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="24">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="25">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="26">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="27">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="28">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="29">
      <note>
        <rest/>
        <duration>3360</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
    </measure>
    <measure number="30">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="31">
      <note>
        <rest/>
        <duration>3360</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="32">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="33">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="34">
      <note>
        <rest/>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="35">
      <note>
        <rest/>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="36">
      <note>
        <rest/>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="37">
      <note>
        <rest/>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="38">
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <rest/>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="39">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="40">
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="41">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="42">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="43">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="44">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="45">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="46">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="47">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="48">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="49">
      <note>
        <rest/>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="50">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="51">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
    </measure>
  </part>
  <part id="P5">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>2</fifths><mode>minor</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="2">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="3">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="4">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="5">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="6">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="7">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="8">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="9">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="10">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="11">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="12">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="13">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="14">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="15">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="16">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="17">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="18">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="19">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="20">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="21">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="22">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="23">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="24">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="25">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="26">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="27">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="28">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="29">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="30">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="31">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="32">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="33">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="34">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="35">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="36">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="37">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="38">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="39">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="40">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="41">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="42">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="43">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>4</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
  </part>
  <part id="P6">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>2</fifths><mode>minor</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="2">
      <note>
        <pitch>
          <step>E</step>
          <octave>2</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="3">
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="4">
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="5">
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="6">
      <note>
        <pitch>
          <step>C</step>
          <octave>2</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="7">
      <note>
        <pitch>
          <step>G</step>
          <octave>2</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="8">
      <note>
        <pitch>
          <step>D</step>
          <octave>2</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="9">
      <note>
        <pitch>
          <step>A</step>
          <octave>2</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="10">
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
    </measure>
    <measure number="11">
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="12">
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
    </measure>
    <measure number="13">
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="14">
      <note>
        <pitch>
          <step>G</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="15">
      <note>
        <pitch>
          <step>A</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
    </measure>
    <measure number="16">
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
    </measure>
    <measure number="17">
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
    </measure>
    <measure number="18">
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="19">
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="20">
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
    </measure>
    <measure number="21">
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="22">
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="23">
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="24">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
    </measure>
    <measure number="25">
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="26">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="27">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="28">
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
    </measure>
    <measure number="29">
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="30">
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="31">
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
    </measure>
    <measure number="32">
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="33">
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="34">
      <note>
        <pitch>
          <step>G</step>
          <octave>2</octave>
        </pitch>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="35">
      <note>
        <pitch>
          <step>A</step>
          <octave>2</octave>
        </pitch>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="36">
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="37">
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="38">
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="39">
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="40">
      <note>
        <pitch>
          <step>G</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="41">
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="42">
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="43">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="44">
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="45">
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="46">
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="47">
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="48">
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="49">
      <note>
        <pitch>
          <step>D</step>
          <octave>2</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="50">
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="51">
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="52">
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="53">
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="54">
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
    </measure>
  </part>
  <part id="P7">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>2</fifths><mode>minor</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="2">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>2</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="3">
      <note>
        <pitch>
          <step>E</step>
          <octave>2</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="4">
      <note>
        <pitch>
          <step>E</step>
          <octave>2</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="5">
      <note>
        <pitch>
          <step>E</step>
          <octave>2</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="6">
      <note>
        <pitch>
          <step>E</step>
          <octave>2</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>2</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="7">
      <note>
        <pitch>
          <step>B</step>
          <octave>1</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="8">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="9">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="10">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="11">
      <note>
        <pitch>
          <step>E</step>
          <octave>2</octave>
        </pitch>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="12">
      <note>
        <pitch>
          <step>F</step>
          <octave>2</octave>
        </pitch>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="13">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="14">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="15">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="16">
      <note>
        <pitch>
          <step>C</step>
          <octave>3</octave>
        </pitch>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="17">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="18">
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="19">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="20">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="21">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="22">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="23">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="24">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="25">
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>1</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="26">
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="27">
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="28">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="29">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="30">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>2</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="31">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>2</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="32">
      <note>
        <pitch>
          <step>B</step>
          <octave>1</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="33">
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>1</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="34">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="35">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="36">
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="37">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>1</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="38">
      <note>
        <pitch>
          <step>B</step>
          <octave>1</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="39">
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>1</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="40">
      <note>
        <pitch>
          <step>G</step>
          <octave>1</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="41">
      <note>
        <pitch>
          <step>E</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>2</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>2</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="42">
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>1</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="43">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>1</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="44">
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="45">
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="46">
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="47">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="48">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="49">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="50">
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>2</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="51">
      <note>
        <pitch>
          <step>D</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="52">
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="53">
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
  </part>
  <part id="P8">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>2</fifths><mode>minor</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="2">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="3">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="4">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="5">
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="6">
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="7">
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="8">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>2</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="9">
      <note>
        <pitch>
          <step>A</step>
          <octave>1</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="10">
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="11">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="12">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="13">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="14">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="15">
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>1</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="16">
      <note>
        <pitch>
          <step>C</step>
          <octave>2</octave>
        </pitch>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="17">
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>1</octave>
        </pitch>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="18">
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>1</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="19">
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="20">
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
    </measure>
    <measure number="21">
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>1</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="22">
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>1</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="23">
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>1</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="24">
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
    </measure>
    <measure number="25">
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="26">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="27">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="28">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>2</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
    </measure>
    <measure number="29">
      <note>
        <pitch>
          <step>D</step>
          <octave>2</octave>
        </pitch>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="30">
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="31">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>3</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
    </measure>
    <measure number="32">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="33">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="34">
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="35">
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="36">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="37">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="38">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="39">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="40">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="41">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="42">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="43">
      <note>
        <rest/>
        <duration>3360</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="44">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="45">
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="46">
      <note>
        <pitch>
          <step>G</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="47">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="48">
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>2</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="49">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="50">
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="51">
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>2</octave>
        </pitch>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="52">
      <note>
        <pitch>
          <step>E</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>2</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
    </measure>
    <measure number="53">
      <note>
        <pitch>
          <step>B</step>
          <octave>1</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <octave>2</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
    </measure>
    <measure number="54">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
  </part>
  <part id="P9">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>2</fifths><mode>minor</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="2">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="3">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="4">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="5">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="6">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="7">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="8">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="9">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="10">
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="11">
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="12">
      <note>
        <rest/>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="13">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="14">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="15">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="16">
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="17">
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <alter>1</alter>
          <octave>1</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
    </measure>
    <measure number="18">
      <note>
        <pitch>
          <step>B</step>
          <octave>1</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="19">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="20">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="21">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="22">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="23">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="24">
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="25">
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="26">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="27">
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>1</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="28">
      <note>
        <pitch>
          <step>D</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
        <accidental>sharp</accidental>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="29">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>A</step>
          <octave>2</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="30">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="31">
      <note>
        <pitch>
          <step>C</step>
          <octave>2</octave>
        </pitch>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="32">
      <note>
        <pitch>
          <step>B</step>
          <octave>2</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="33">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="34">
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="35">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="36">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="37">
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="38">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="39">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="40">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="41">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="42">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="43">
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>1</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="44">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>1</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>1</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>C</step>
          <alter>1</alter>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="45">
      <note>
        <pitch>
          <step>G</step>
          <octave>2</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>B</step>
          <octave>1</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>1</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="46">
      <note>
        <pitch>
          <step>G</step>
          <octave>1</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>2880</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="47">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="48">
      <note>
        <rest/>
        <duration>2400</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>D</step>
          <octave>3</octave>
        </pitch>
        <duration>960</duration>
        <type>quarter</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="49">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="50">
      <note>
        <rest/>
        <duration>1440</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>G</step>
          <octave>2</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="51">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="52">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="53">
      <note>
        <rest/>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>F</step>
          <octave>1</octave>
        </pitch>
        <duration>1920</duration>
        <type>half</type>
        <voice>1</voice>
        <accidental>natural</accidental>
      </note>
    </measure>
    <measure number="54">
      <note>
        <pitch>
          <step>F</step>
          <alter>1</alter>
          <octave>1</octave>
        </pitch>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
  </part>
  <part id="P10">
    <measure number="1">
      <attributes>
        <divisions>960</divisions>
        <key><fifths>2</fifths><mode>minor</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>F</sign><line>4</line></clef>
      </attributes>
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="2">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="3">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="4">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="5">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="6">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="7">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="8">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="9">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="10">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="11">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="12">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="13">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="14">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="15">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="16">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="17">
      <note>
        <rest/>
        <duration>3840</duration>
        <type>whole</type>
        <voice>1</voice>
      </note>
    </measure>
    <measure number="18">
      <note>
        <rest/>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
      <note>
        <pitch>
          <step>E</step>
          <octave>3</octave>
        </pitch>
        <duration>480</duration>
        <type>eighth</type>
        <voice>1</voice>
      </note>
    </measure>
  </part>
</score-partwise>`;

  },
  "core/interfaces.js": function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

  },
  "core/timeIndex.js": function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOccupiedTime = exports.getMeasureCapacity = exports.getMeasureTimingForVoice = void 0;
const xmlUtils_1 = require("./xmlUtils");
const getMeasureTimingForVoice = (noteInMeasure, voice) => {
    const measure = (0, xmlUtils_1.findAncestorMeasure)(noteInMeasure);
    if (!measure)
        return null;
    const capacity = (0, exports.getMeasureCapacity)(measure);
    if (capacity === null)
        return null;
    const occupied = (0, exports.getOccupiedTime)(measure, voice);
    return { capacity, occupied };
};
exports.getMeasureTimingForVoice = getMeasureTimingForVoice;
const getMeasureCapacity = (measure) => {
    const context = resolveTimingContext(measure);
    if (!context)
        return null;
    const { beats, beatType, divisions } = context;
    if (!Number.isFinite(beats) ||
        !Number.isFinite(beatType) ||
        !Number.isFinite(divisions) ||
        beatType <= 0) {
        return null;
    }
    const beatUnit = (4 / beatType) * divisions;
    return Math.round(beats * beatUnit);
};
exports.getMeasureCapacity = getMeasureCapacity;
const getOccupiedTime = (measure, voice) => {
    const directChildren = Array.from(measure.children);
    let total = 0;
    for (const child of directChildren) {
        if (child.tagName !== "note")
            continue;
        // Chord notes share onset with the previous note and must not advance time.
        if (Array.from(child.children).some((c) => c.tagName === "chord"))
            continue;
        const noteVoice = (0, xmlUtils_1.getVoiceText)(child);
        if (noteVoice !== voice)
            continue;
        const duration = (0, xmlUtils_1.getDurationValue)(child);
        if (duration !== null)
            total += duration;
    }
    return total;
};
exports.getOccupiedTime = getOccupiedTime;
const resolveTimingContext = (measure) => {
    var _a, _b, _c, _d, _e, _f;
    const part = measure.parentElement;
    if (!part || part.tagName !== "part")
        return null;
    let beats = null;
    let beatType = null;
    let divisions = null;
    const measures = Array.from(part.children).filter((child) => child.tagName === "measure");
    const measureIndex = measures.indexOf(measure);
    if (measureIndex < 0)
        return null;
    for (let i = measureIndex; i >= 0; i -= 1) {
        const candidate = measures[i];
        const attributes = candidate.querySelector("attributes");
        if (!attributes)
            continue;
        if (divisions === null) {
            const divisionsText = (_b = (_a = attributes.querySelector("divisions")) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim();
            if (divisionsText)
                divisions = Number(divisionsText);
        }
        if (beats === null) {
            const beatsText = (_d = (_c = attributes.querySelector("time > beats")) === null || _c === void 0 ? void 0 : _c.textContent) === null || _d === void 0 ? void 0 : _d.trim();
            if (beatsText)
                beats = Number(beatsText);
        }
        if (beatType === null) {
            const beatTypeText = (_f = (_e = attributes
                .querySelector("time > beat-type")) === null || _e === void 0 ? void 0 : _e.textContent) === null || _f === void 0 ? void 0 : _f.trim();
            if (beatTypeText)
                beatType = Number(beatTypeText);
        }
        if (beats !== null && beatType !== null && divisions !== null) {
            return { beats, beatType, divisions };
        }
    }
    return null;
};

  },
  "core/xmlUtils.js": function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.measureHasBackupOrForward = exports.findAncestorMeasure = exports.createNoteElement = exports.isUnsupportedNoteKind = exports.setPitch = exports.setDurationValue = exports.getDurationValue = exports.getVoiceText = exports.reindexNodeIds = exports.serializeXml = exports.parseXml = void 0;
const SCORE_PARTWISE = "score-partwise";
const parseXml = (xmlText) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
        throw new Error("Invalid XML input.");
    }
    const root = doc.documentElement;
    if (!root || root.tagName !== SCORE_PARTWISE) {
        throw new Error("MusicXML root must be <score-partwise>.");
    }
    return doc;
};
exports.parseXml = parseXml;
const serializeXml = (doc) => new XMLSerializer().serializeToString(doc);
exports.serializeXml = serializeXml;
/**
 * Assigns stable-in-session node IDs without mutating XML.
 */
const reindexNodeIds = (doc, nodeToId, idToNode, nextId) => {
    idToNode.clear();
    const notes = doc.querySelectorAll("note");
    for (const note of notes) {
        const existing = nodeToId.get(note);
        const id = existing !== null && existing !== void 0 ? existing : nextId();
        nodeToId.set(note, id);
        idToNode.set(id, note);
    }
};
exports.reindexNodeIds = reindexNodeIds;
const getVoiceText = (note) => {
    var _a, _b;
    const voice = getDirectChild(note, "voice");
    return (_b = (_a = voice === null || voice === void 0 ? void 0 : voice.textContent) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : null;
};
exports.getVoiceText = getVoiceText;
const getDurationValue = (note) => {
    const duration = getDirectChild(note, "duration");
    if (!(duration === null || duration === void 0 ? void 0 : duration.textContent))
        return null;
    const n = Number(duration.textContent.trim());
    return Number.isFinite(n) ? n : null;
};
exports.getDurationValue = getDurationValue;
const setDurationValue = (note, duration) => {
    let durationNode = getDirectChild(note, "duration");
    if (!durationNode) {
        durationNode = note.ownerDocument.createElement("duration");
        note.appendChild(durationNode);
    }
    durationNode.textContent = String(duration);
};
exports.setDurationValue = setDurationValue;
const setPitch = (note, pitch) => {
    let pitchNode = getDirectChild(note, "pitch");
    if (!pitchNode) {
        pitchNode = note.ownerDocument.createElement("pitch");
        // Keep patch local by adding pitch near start, but do not reorder siblings.
        note.insertBefore(pitchNode, note.firstChild);
    }
    upsertSimpleChild(pitchNode, "step", pitch.step);
    if (typeof pitch.alter === "number") {
        upsertSimpleChild(pitchNode, "alter", String(pitch.alter));
    }
    else {
        const alter = getDirectChild(pitchNode, "alter");
        if (alter)
            alter.remove();
    }
    upsertSimpleChild(pitchNode, "octave", String(pitch.octave));
};
exports.setPitch = setPitch;
const isUnsupportedNoteKind = (note) => hasDirectChild(note, "grace") ||
    hasDirectChild(note, "cue") ||
    hasDirectChild(note, "chord") ||
    hasDirectChild(note, "rest");
exports.isUnsupportedNoteKind = isUnsupportedNoteKind;
const createNoteElement = (doc, voice, duration, pitch) => {
    const note = doc.createElement("note");
    const pitchNode = doc.createElement("pitch");
    upsertSimpleChild(pitchNode, "step", pitch.step);
    if (typeof pitch.alter === "number") {
        upsertSimpleChild(pitchNode, "alter", String(pitch.alter));
    }
    upsertSimpleChild(pitchNode, "octave", String(pitch.octave));
    note.appendChild(pitchNode);
    const durationNode = doc.createElement("duration");
    durationNode.textContent = String(duration);
    note.appendChild(durationNode);
    const voiceNode = doc.createElement("voice");
    voiceNode.textContent = voice;
    note.appendChild(voiceNode);
    return note;
};
exports.createNoteElement = createNoteElement;
const findAncestorMeasure = (node) => {
    let cursor = node;
    while (cursor) {
        if (cursor.tagName === "measure")
            return cursor;
        cursor = cursor.parentElement;
    }
    return null;
};
exports.findAncestorMeasure = findAncestorMeasure;
const measureHasBackupOrForward = (measure) => Array.from(measure.children).some((child) => child.tagName === "backup" || child.tagName === "forward");
exports.measureHasBackupOrForward = measureHasBackupOrForward;
const upsertSimpleChild = (parent, tagName, value) => {
    let node = getDirectChild(parent, tagName);
    if (!node) {
        node = parent.ownerDocument.createElement(tagName);
        parent.appendChild(node);
    }
    node.textContent = value;
};
const hasDirectChild = (parent, tagName) => Array.from(parent.children).some((child) => child.tagName === tagName);
const getDirectChild = (parent, tagName) => { var _a; return (_a = Array.from(parent.children).find((child) => child.tagName === tagName)) !== null && _a !== void 0 ? _a : null; };

  },
  "core/ScoreCore.js": function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScoreCore = void 0;
const commands_1 = require("./commands");
const timeIndex_1 = require("./timeIndex");
const xmlUtils_1 = require("./xmlUtils");
const validators_1 = require("./validators");
const DEFAULT_EDITABLE_VOICE = "1";
class ScoreCore {
    constructor(options = {}) {
        var _a;
        this.originalXml = "";
        this.doc = null;
        this.dirty = false;
        // Node identity is kept outside XML with WeakMap as required by spec.
        this.nodeToId = new WeakMap();
        this.idToNode = new Map();
        this.nodeCounter = 0;
        this.editableVoice = (_a = options.editableVoice) !== null && _a !== void 0 ? _a : DEFAULT_EDITABLE_VOICE;
    }
    load(xml) {
        this.originalXml = xml;
        this.doc = (0, xmlUtils_1.parseXml)(xml);
        this.dirty = false;
        this.reindex();
    }
    dispatch(command) {
        var _a, _b;
        if (!this.doc) {
            return this.fail("MVP_SCORE_NOT_LOADED", "Score is not loaded.");
        }
        if ((0, commands_1.isUiOnlyCommand)(command)) {
            return {
                ok: true,
                dirtyChanged: false,
                changedNodeIds: [],
                affectedMeasureNumbers: [],
                diagnostics: [],
                warnings: [],
            };
        }
        const voiceDiagnostic = (0, validators_1.validateVoice)(command, this.editableVoice);
        if (voiceDiagnostic)
            return this.failWith(voiceDiagnostic);
        const payloadDiagnostic = (0, validators_1.validateCommandPayload)(command);
        if (payloadDiagnostic)
            return this.failWith(payloadDiagnostic);
        const targetId = (0, commands_1.getCommandNodeId)(command);
        if (!targetId) {
            return this.fail("MVP_COMMAND_TARGET_MISSING", "Command target is missing.");
        }
        const target = this.idToNode.get(targetId);
        if (!target)
            return this.fail("MVP_TARGET_NOT_FOUND", `Unknown nodeId: ${targetId}`);
        const noteKindDiagnostic = (0, validators_1.validateSupportedNoteKind)(target);
        if (noteKindDiagnostic)
            return this.failWith(noteKindDiagnostic);
        const targetVoiceDiagnostic = (0, validators_1.validateTargetVoiceMatch)(command, target);
        if (targetVoiceDiagnostic)
            return this.failWith(targetVoiceDiagnostic);
        const bfDiagnostic = (0, validators_1.validateBackupForwardBoundaryForStructuralEdit)(command, target);
        if (bfDiagnostic)
            return this.failWith(bfDiagnostic);
        const laneDiagnostic = (0, validators_1.validateInsertLaneBoundary)(command, target);
        if (laneDiagnostic)
            return this.failWith(laneDiagnostic);
        const snapshot = (0, xmlUtils_1.serializeXml)(this.doc);
        const warnings = [];
        let insertedNode = null;
        let removedNodeId = null;
        const affectedMeasureNumbers = this.collectAffectedMeasureNumbers(target);
        try {
            if (command.type === "change_pitch") {
                (0, xmlUtils_1.setPitch)(target, command.pitch);
            }
            else if (command.type === "change_duration") {
                const oldDuration = (_a = (0, xmlUtils_1.getDurationValue)(target)) !== null && _a !== void 0 ? _a : 0;
                const timing = (0, timeIndex_1.getMeasureTimingForVoice)(target, command.voice);
                if (timing) {
                    const projected = timing.occupied - oldDuration + command.duration;
                    const result = (0, validators_1.validateProjectedMeasureTiming)(target, command.voice, projected);
                    if (result.diagnostic)
                        return this.failWith(result.diagnostic);
                    if (result.warning)
                        warnings.push(result.warning);
                }
                (0, xmlUtils_1.setDurationValue)(target, command.duration);
            }
            else if (command.type === "insert_note_after") {
                const timing = (0, timeIndex_1.getMeasureTimingForVoice)(target, command.voice);
                if (timing) {
                    const projected = timing.occupied + command.note.duration;
                    const result = (0, validators_1.validateProjectedMeasureTiming)(target, command.voice, projected);
                    if (result.diagnostic)
                        return this.failWith(result.diagnostic);
                    if (result.warning)
                        warnings.push(result.warning);
                }
                const note = (0, xmlUtils_1.createNoteElement)(this.doc, command.voice, command.note.duration, command.note.pitch);
                target.after(note);
                insertedNode = note;
            }
            else if (command.type === "delete_note") {
                const duration = (_b = (0, xmlUtils_1.getDurationValue)(target)) !== null && _b !== void 0 ? _b : 0;
                const timing = (0, timeIndex_1.getMeasureTimingForVoice)(target, command.voice);
                if (timing) {
                    const projected = timing.occupied - duration;
                    const result = (0, validators_1.validateProjectedMeasureTiming)(target, command.voice, projected);
                    if (result.diagnostic)
                        return this.failWith(result.diagnostic);
                    if (result.warning)
                        warnings.push(result.warning);
                }
                removedNodeId = targetId;
                target.remove();
            }
        }
        catch (_c) {
            this.restoreFrom(snapshot);
            return this.fail("MVP_COMMAND_EXECUTION_FAILED", "Command failed unexpectedly.");
        }
        this.reindex();
        const dirtyBefore = this.dirty;
        this.dirty = true;
        const changedNodeIds = this.buildChangedNodeIds(command, targetId, insertedNode, removedNodeId);
        return {
            ok: true,
            dirtyChanged: !dirtyBefore,
            changedNodeIds,
            affectedMeasureNumbers,
            diagnostics: [],
            warnings,
        };
    }
    save() {
        if (!this.doc) {
            return {
                ok: false,
                mode: "original_noop",
                xml: "",
                diagnostics: [{ code: "MVP_SCORE_NOT_LOADED", message: "Score is not loaded." }],
            };
        }
        const integrity = this.findInvalidNoteDiagnostic();
        if (integrity) {
            return { ok: false, mode: "serialized_dirty", xml: "", diagnostics: [integrity] };
        }
        const overfull = this.findOverfullDiagnostic();
        if (overfull) {
            return { ok: false, mode: "serialized_dirty", xml: "", diagnostics: [overfull] };
        }
        if (!this.dirty) {
            return {
                ok: true,
                mode: "original_noop",
                xml: this.originalXml,
                diagnostics: [],
            };
        }
        return {
            ok: true,
            mode: "serialized_dirty",
            xml: (0, xmlUtils_1.serializeXml)(this.doc),
            diagnostics: [],
        };
    }
    isDirty() {
        return this.dirty;
    }
    listNoteNodeIds() {
        return Array.from(this.idToNode.keys());
    }
    /**
     * Debug-only helper for UI diagnostics.
     * Returns current in-memory XML regardless of dirty/validation state.
     */
    debugSerializeCurrentXml() {
        if (!this.doc)
            return null;
        return (0, xmlUtils_1.serializeXml)(this.doc);
    }
    nextNodeId() {
        this.nodeCounter += 1;
        return `n${this.nodeCounter}`;
    }
    reindex() {
        if (!this.doc)
            return;
        (0, xmlUtils_1.reindexNodeIds)(this.doc, this.nodeToId, this.idToNode, () => this.nextNodeId());
    }
    restoreFrom(xmlSnapshot) {
        this.doc = (0, xmlUtils_1.parseXml)(xmlSnapshot);
        this.reindex();
    }
    findOverfullDiagnostic() {
        if (!this.doc)
            return null;
        const measures = this.doc.querySelectorAll("measure");
        for (const measure of measures) {
            const note = measure.querySelector("note");
            if (!note)
                continue;
            const timing = (0, timeIndex_1.getMeasureTimingForVoice)(note, this.editableVoice);
            if (!timing)
                continue;
            if (timing.occupied > timing.capacity) {
                return {
                    code: "MEASURE_OVERFULL",
                    message: `Occupied time ${timing.occupied} exceeds capacity ${timing.capacity}.`,
                };
            }
        }
        return null;
    }
    findInvalidNoteDiagnostic() {
        if (!this.doc)
            return null;
        const notes = this.doc.querySelectorAll("note");
        for (const note of notes) {
            const voice = (0, xmlUtils_1.getVoiceText)(note);
            if (!voice) {
                return {
                    code: "MVP_INVALID_NOTE_VOICE",
                    message: "Note is missing a valid <voice> value.",
                };
            }
            const duration = (0, xmlUtils_1.getDurationValue)(note);
            if (duration === null || duration <= 0) {
                return {
                    code: "MVP_INVALID_NOTE_DURATION",
                    message: "Note is missing a valid positive <duration> value.",
                };
            }
            const pitchDiagnostic = this.validateNotePitch(note);
            if (pitchDiagnostic)
                return pitchDiagnostic;
        }
        return null;
    }
    fail(code, message) {
        return this.failWith({ code, message });
    }
    failWith(diagnostic) {
        return {
            ok: false,
            dirtyChanged: false,
            changedNodeIds: [],
            affectedMeasureNumbers: [],
            diagnostics: [diagnostic],
            warnings: [],
        };
    }
    collectAffectedMeasureNumbers(note) {
        var _a;
        const measure = (0, xmlUtils_1.findAncestorMeasure)(note);
        if (!measure)
            return [];
        const number = (_a = measure.getAttribute("number")) !== null && _a !== void 0 ? _a : "";
        return number ? [number] : [];
    }
    validateNotePitch(note) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const hasRest = Array.from(note.children).some((c) => c.tagName === "rest");
        const hasChord = Array.from(note.children).some((c) => c.tagName === "chord");
        const pitch = (_a = Array.from(note.children).find((c) => c.tagName === "pitch")) !== null && _a !== void 0 ? _a : null;
        if (hasRest && hasChord) {
            return {
                code: "MVP_INVALID_NOTE_PITCH",
                message: "Note must not contain both <rest> and <chord>.",
            };
        }
        if (hasRest && pitch) {
            return {
                code: "MVP_INVALID_NOTE_PITCH",
                message: "Rest note must not contain <pitch>.",
            };
        }
        if (hasChord && !pitch) {
            return {
                code: "MVP_INVALID_NOTE_PITCH",
                message: "Chord note must contain a valid <pitch>.",
            };
        }
        if (!pitch) {
            if (hasRest)
                return null;
            return {
                code: "MVP_INVALID_NOTE_PITCH",
                message: "Non-rest note is missing a valid <pitch>.",
            };
        }
        const step = (_d = (_c = (_b = pitch.querySelector("step")) === null || _b === void 0 ? void 0 : _b.textContent) === null || _c === void 0 ? void 0 : _c.trim()) !== null && _d !== void 0 ? _d : "";
        if (!["A", "B", "C", "D", "E", "F", "G"].includes(step)) {
            return {
                code: "MVP_INVALID_NOTE_PITCH",
                message: "Pitch step is invalid.",
            };
        }
        const octaveText = (_g = (_f = (_e = pitch.querySelector("octave")) === null || _e === void 0 ? void 0 : _e.textContent) === null || _f === void 0 ? void 0 : _f.trim()) !== null && _g !== void 0 ? _g : "";
        const octave = Number(octaveText);
        if (!Number.isInteger(octave)) {
            return {
                code: "MVP_INVALID_NOTE_PITCH",
                message: "Pitch octave is invalid.",
            };
        }
        const alterText = (_j = (_h = pitch.querySelector("alter")) === null || _h === void 0 ? void 0 : _h.textContent) === null || _j === void 0 ? void 0 : _j.trim();
        if (alterText !== undefined) {
            const alter = Number(alterText);
            if (!Number.isInteger(alter) || alter < -2 || alter > 2) {
                return {
                    code: "MVP_INVALID_NOTE_PITCH",
                    message: "Pitch alter is invalid.",
                };
            }
        }
        return null;
    }
    buildChangedNodeIds(command, targetId, insertedNode, removedNodeId) {
        var _a;
        if (command.type === "insert_note_after") {
            const insertedId = insertedNode ? (_a = this.nodeToId.get(insertedNode)) !== null && _a !== void 0 ? _a : null : null;
            return insertedId ? [targetId, insertedId] : [targetId];
        }
        if (command.type === "delete_note") {
            return removedNodeId ? [removedNodeId] : [targetId];
        }
        return [targetId];
    }
}
exports.ScoreCore = ScoreCore;

  },
  "core/validators.js": function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateProjectedMeasureTiming = exports.validateBackupForwardBoundaryForStructuralEdit = exports.validateInsertLaneBoundary = exports.validateTargetVoiceMatch = exports.validateSupportedNoteKind = exports.validateCommandPayload = exports.validateVoice = void 0;
const timeIndex_1 = require("./timeIndex");
const xmlUtils_1 = require("./xmlUtils");
const validateVoice = (command, editableVoice) => {
    if (command.type === "ui_noop")
        return null;
    if (command.voice === editableVoice)
        return null;
    return {
        code: "MVP_UNSUPPORTED_NON_EDITABLE_VOICE",
        message: `Voice ${command.voice} is not editable in MVP.`,
    };
};
exports.validateVoice = validateVoice;
const validateCommandPayload = (command) => {
    if (command.type === "ui_noop")
        return null;
    if (command.type === "change_duration") {
        if (!isPositiveInteger(command.duration)) {
            return {
                code: "MVP_INVALID_COMMAND_PAYLOAD",
                message: "change_duration.duration must be a positive integer.",
            };
        }
        return null;
    }
    if (command.type === "insert_note_after") {
        if (!isPositiveInteger(command.note.duration)) {
            return {
                code: "MVP_INVALID_COMMAND_PAYLOAD",
                message: "insert_note_after.note.duration must be a positive integer.",
            };
        }
        if (!isValidPitch(command.note.pitch)) {
            return {
                code: "MVP_INVALID_COMMAND_PAYLOAD",
                message: "insert_note_after.note.pitch is invalid.",
            };
        }
        return null;
    }
    if (command.type === "change_pitch") {
        if (!isValidPitch(command.pitch)) {
            return {
                code: "MVP_INVALID_COMMAND_PAYLOAD",
                message: "change_pitch.pitch is invalid.",
            };
        }
    }
    return null;
};
exports.validateCommandPayload = validateCommandPayload;
const validateSupportedNoteKind = (note) => {
    if (!(0, xmlUtils_1.isUnsupportedNoteKind)(note))
        return null;
    return {
        code: "MVP_UNSUPPORTED_NOTE_KIND",
        message: "Editing grace/cue/chord/rest notes is not supported in MVP.",
    };
};
exports.validateSupportedNoteKind = validateSupportedNoteKind;
const validateTargetVoiceMatch = (command, targetNote) => {
    if (command.type === "ui_noop")
        return null;
    const targetVoice = (0, xmlUtils_1.getVoiceText)(targetNote);
    if (targetVoice === command.voice)
        return null;
    return {
        code: "MVP_UNSUPPORTED_NON_EDITABLE_VOICE",
        message: `Target note voice (${targetVoice !== null && targetVoice !== void 0 ? targetVoice : "none"}) does not match command voice (${command.voice}).`,
    };
};
exports.validateTargetVoiceMatch = validateTargetVoiceMatch;
const validateInsertLaneBoundary = (command, anchorNote) => {
    if (command.type !== "insert_note_after")
        return null;
    const measure = (0, xmlUtils_1.findAncestorMeasure)(anchorNote);
    if (!measure)
        return null;
    const children = Array.from(measure.children);
    const anchorIndex = children.indexOf(anchorNote);
    if (anchorIndex < 0)
        return null;
    for (let i = anchorIndex + 1; i < children.length; i += 1) {
        const node = children[i];
        if (node.tagName !== "note")
            continue;
        const nextVoice = (0, xmlUtils_1.getVoiceText)(node);
        if (nextVoice !== command.voice) {
            return {
                code: "MVP_UNSUPPORTED_NON_EDITABLE_VOICE",
                message: "Insert is restricted to a continuous local voice lane in MVP.",
            };
        }
        break;
    }
    return null;
};
exports.validateInsertLaneBoundary = validateInsertLaneBoundary;
const validateBackupForwardBoundaryForStructuralEdit = (command, anchorOrTarget) => {
    if (command.type !== "insert_note_after" && command.type !== "delete_note") {
        return null;
    }
    const prev = anchorOrTarget.previousElementSibling;
    const next = anchorOrTarget.nextElementSibling;
    if (command.type === "insert_note_after") {
        if (next && isBackupOrForward(next)) {
            return {
                code: "MVP_UNSUPPORTED_NON_EDITABLE_VOICE",
                message: "Insert point crosses a backup/forward boundary in MVP.",
            };
        }
        return null;
    }
    // delete_note
    if ((prev && isBackupOrForward(prev)) || (next && isBackupOrForward(next))) {
        return {
            code: "MVP_UNSUPPORTED_NON_EDITABLE_VOICE",
            message: "Delete point crosses a backup/forward boundary in MVP.",
        };
    }
    return null;
};
exports.validateBackupForwardBoundaryForStructuralEdit = validateBackupForwardBoundaryForStructuralEdit;
const validateProjectedMeasureTiming = (noteInMeasure, voice, projectedOccupiedTime) => {
    const timing = (0, timeIndex_1.getMeasureTimingForVoice)(noteInMeasure, voice);
    if (!timing)
        return { diagnostic: null, warning: null };
    if (projectedOccupiedTime > timing.capacity) {
        return {
            diagnostic: {
                code: "MEASURE_OVERFULL",
                message: `Projected occupied time ${projectedOccupiedTime} exceeds capacity ${timing.capacity}.`,
            },
            warning: null,
        };
    }
    if (projectedOccupiedTime < timing.capacity) {
        return {
            diagnostic: null,
            warning: {
                code: "MEASURE_UNDERFULL",
                message: `Projected occupied time ${projectedOccupiedTime} is below capacity ${timing.capacity}.`,
            },
        };
    }
    return { diagnostic: null, warning: null };
};
exports.validateProjectedMeasureTiming = validateProjectedMeasureTiming;
const isBackupOrForward = (node) => node.tagName === "backup" || node.tagName === "forward";
const isPositiveInteger = (value) => Number.isFinite(value) && Number.isInteger(value) && value > 0;
const isValidPitch = (pitch) => {
    const stepOk = ["A", "B", "C", "D", "E", "F", "G"].includes(pitch.step);
    if (!stepOk)
        return false;
    if (!Number.isFinite(pitch.octave) || !Number.isInteger(pitch.octave))
        return false;
    if (typeof pitch.alter === "number") {
        if (!Number.isInteger(pitch.alter))
            return false;
        if (pitch.alter < -2 || pitch.alter > 2)
            return false;
    }
    return true;
};

  },
  "core/commands.js": function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCommandNodeId = exports.isUiOnlyCommand = void 0;
const isUiOnlyCommand = (command) => command.type === "ui_noop";
exports.isUiOnlyCommand = isUiOnlyCommand;
const getCommandNodeId = (command) => {
    switch (command.type) {
        case "change_pitch":
        case "change_duration":
        case "delete_note":
            return command.targetNodeId;
        case "insert_note_after":
            return command.anchorNodeId;
        case "ui_noop":
            return null;
    }
};
exports.getCommandNodeId = getCommandNodeId;

  }
};

const cache = {};

function normalizePath(p) {
  const parts = [];
  for (const part of p.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join('/');
}

function resolve(fromId, specifier) {
  if (!specifier.startsWith('.')) {
    throw new Error('External module is not allowed in single-file build: ' + specifier);
  }
  const fromParts = fromId.split('/');
  fromParts.pop();
  const resolvedBase = normalizePath(fromParts.concat(specifier.split('/')).join('/'));
  const candidates = [resolvedBase + '.js', resolvedBase + '/index.js'];
  for (const c of candidates) {
    if (Object.prototype.hasOwnProperty.call(modules, c)) return c;
  }
  throw new Error('Cannot resolve module at runtime: ' + specifier + ' from ' + fromId);
}

function load(id) {
  if (cache[id]) return cache[id].exports;
  const factory = modules[id];
  if (!factory) throw new Error('Unknown module: ' + id);
  const module = { exports: {} };
  cache[id] = module;
  const localRequire = function (specifier) {
    return load(resolve(id, specifier));
  };
  factory(localRequire, module, module.exports);
  return module.exports;
}

load("src/ts/main.js");
})();
