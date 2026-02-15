(function () {
const modules = {
  "src/ts/main.js": function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ScoreCore_1 = require("../../core/ScoreCore");
const timeIndex_1 = require("../../core/timeIndex");
const abc_common_1 = require("./abc-common");
const abc_compat_parser_1 = require("./abc-compat-parser");
const playback_1 = require("./playback");
const sampleXml_1 = require("./sampleXml");
const EDITABLE_VOICE = "1";
const q = (selector) => {
    const el = document.querySelector(selector);
    if (!el)
        throw new Error(`Missing element: ${selector}`);
    return el;
};
const inputTypeXml = q("#inputTypeXml");
const inputTypeAbc = q("#inputTypeAbc");
const inputModeFile = q("#inputModeFile");
const inputModeSource = q("#inputModeSource");
const inputSectionDetails = q("#inputSectionDetails");
const fileInputBlock = q("#fileInputBlock");
const sourceXmlInputBlock = q("#sourceXmlInputBlock");
const abcInputBlock = q("#abcInputBlock");
const xmlInput = q("#xmlInput");
const abcInput = q("#abcInput");
const fileSelectBtn = q("#fileSelectBtn");
const fileInput = q("#fileInput");
const fileNameText = q("#fileNameText");
const loadBtn = q("#loadBtn");
const noteSelect = q("#noteSelect");
const statusText = q("#statusText");
const pitchStep = q("#pitchStep");
const pitchStepValue = q("#pitchStepValue");
const pitchStepDownBtn = q("#pitchStepDownBtn");
const pitchStepUpBtn = q("#pitchStepUpBtn");
const pitchAlter = q("#pitchAlter");
const pitchAlterBtns = Array.from(document.querySelectorAll(".ms-alter-btn"));
const pitchOctave = q("#pitchOctave");
const durationPreset = q("#durationPreset");
const splitNoteBtn = q("#splitNoteBtn");
const convertRestBtn = q("#convertRestBtn");
const deleteBtn = q("#deleteBtn");
const playBtn = q("#playBtn");
const stopBtn = q("#stopBtn");
const downloadBtn = q("#downloadBtn");
const downloadMidiBtn = q("#downloadMidiBtn");
const downloadAbcBtn = q("#downloadAbcBtn");
const saveModeText = q("#saveModeText");
const playbackText = q("#playbackText");
const outputXml = q("#outputXml");
const diagArea = q("#diagArea");
const debugScoreMeta = q("#debugScoreMeta");
const debugScoreArea = q("#debugScoreArea");
const uiMessage = q("#uiMessage");
const measurePartNameText = q("#measurePartNameText");
const measureSelectionText = q("#measureSelectionText");
const measureEditorWrap = q("#measureEditorWrap");
const measureEditorArea = q("#measureEditorArea");
const measureApplyBtn = q("#measureApplyBtn");
const measureDiscardBtn = q("#measureDiscardBtn");
const playMeasureBtn = q("#playMeasureBtn");
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
let nodeIdToLocation = new Map();
let partIdToName = new Map();
let selectedMeasure = null;
let draftCore = null;
let draftNoteNodeIds = [];
let draftSvgIdToNodeId = new Map();
let selectedDraftNoteIsRest = false;
let suppressDurationPresetEvent = false;
let selectedDraftDurationValue = null;
const NOTE_CLICK_SNAP_PX = 170;
const DEFAULT_DIVISIONS = 480;
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
    const isAbcType = inputTypeAbc.checked;
    const fileMode = inputModeFile.checked;
    fileInputBlock.classList.toggle("md-hidden", !fileMode);
    sourceXmlInputBlock.classList.toggle("md-hidden", fileMode || isAbcType);
    abcInputBlock.classList.toggle("md-hidden", fileMode || !isAbcType);
    fileInput.accept = isAbcType
        ? ".abc,text/plain"
        : ".musicxml,.xml,text/xml,application/xml";
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
    }
    else {
        state.selectedNodeId = null;
        noteSelect.value = "";
    }
};
const isPitchStepValue = (value) => {
    return value === "A" || value === "B" || value === "C" || value === "D" || value === "E" || value === "F" || value === "G";
};
const renderPitchStepValue = () => {
    const step = pitchStep.value.trim();
    if (isPitchStepValue(step)) {
        pitchStepValue.textContent = step;
    }
    else {
        pitchStepValue.textContent = "休符";
    }
};
const normalizeAlterValue = (value) => {
    const v = value.trim();
    if (v === "none")
        return "none";
    if (v === "-2" || v === "-1" || v === "0" || v === "1" || v === "2")
        return v;
    if (v === "")
        return "none";
    return "none";
};
const resolveEffectiveDivisionsForMeasure = (doc, targetMeasure) => {
    var _a, _b, _c;
    if (!targetMeasure)
        return DEFAULT_DIVISIONS;
    const part = targetMeasure.closest("part");
    if (!part)
        return DEFAULT_DIVISIONS;
    let divisions = null;
    for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
        const divisionsText = (_c = (_b = (_a = measure.querySelector(":scope > attributes > divisions")) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : "";
        const parsed = Number(divisionsText);
        if (Number.isInteger(parsed) && parsed > 0) {
            divisions = parsed;
        }
        if (measure === targetMeasure)
            break;
    }
    return divisions !== null && divisions !== void 0 ? divisions : DEFAULT_DIVISIONS;
};
const rebuildDurationPresetOptions = (divisions) => {
    const safeDivisions = Number.isInteger(divisions) && divisions > 0 ? divisions : DEFAULT_DIVISIONS;
    const defs = [
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
    const used = new Set();
    for (const def of defs) {
        const raw = (safeDivisions * def.num) / def.den;
        if (!Number.isInteger(raw) || raw <= 0)
            continue;
        if (used.has(raw))
            continue;
        used.add(raw);
        const option = document.createElement("option");
        option.value = String(raw);
        option.textContent = `${def.label}(${raw})`;
        durationPreset.appendChild(option);
    }
};
const hasDurationPresetValue = (duration) => {
    return Array.from(durationPreset.options).some((opt) => Number(opt.value) === duration);
};
const setDurationPresetFromValue = (duration) => {
    suppressDurationPresetEvent = true;
    Array.from(durationPreset.querySelectorAll("option.ms-duration-custom")).forEach((opt) => opt.remove());
    if (!Number.isInteger(duration) || (duration !== null && duration !== void 0 ? duration : 0) <= 0) {
        durationPreset.value = "";
        suppressDurationPresetEvent = false;
        return;
    }
    if (hasDurationPresetValue(duration)) {
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
const durationValueIsTriplet = (duration, divisions) => {
    if (!Number.isInteger(duration) || duration <= 0)
        return false;
    if (!Number.isInteger(divisions) || divisions <= 0)
        return false;
    return (duration === (divisions * 4) / 3 ||
        duration === (divisions * 2) / 3 ||
        duration === divisions / 3 ||
        duration === divisions / 6);
};
const noteHasTupletContextInMeasure = (note) => {
    var _a, _b, _c, _d, _e, _f;
    const measure = note.closest("measure");
    if (!measure)
        return false;
    const voice = (_c = (_b = (_a = note.querySelector(":scope > voice")) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : "";
    if (!voice)
        return false;
    const notes = Array.from(measure.children).filter((child) => child.tagName === "note");
    for (const candidate of notes) {
        const candidateVoice = (_f = (_e = (_d = candidate.querySelector(":scope > voice")) === null || _d === void 0 ? void 0 : _d.textContent) === null || _e === void 0 ? void 0 : _e.trim()) !== null && _f !== void 0 ? _f : "";
        if (candidateVoice !== voice)
            continue;
        if (candidate.querySelector(":scope > time-modification"))
            return true;
        if (candidate.querySelector(":scope > notations > tuplet"))
            return true;
    }
    return false;
};
const applyDurationPresetAvailability = (selectedNote, divisions) => {
    var _a, _b;
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
        const baseLabel = (_b = (_a = option.textContent) === null || _a === void 0 ? void 0 : _a.replace("（この小節では不可）", "").trim()) !== null && _b !== void 0 ? _b : "";
        option.textContent = unavailable ? `${baseLabel}（この小節では不可）` : baseLabel;
    }
};
const renderAlterButtons = () => {
    var _a;
    const active = normalizeAlterValue(pitchAlter.value);
    pitchAlter.value = active;
    for (const btn of pitchAlterBtns) {
        const value = normalizeAlterValue((_a = btn.dataset.alter) !== null && _a !== void 0 ? _a : "");
        const isActive = value === active;
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    }
};
const syncStepFromSelectedDraftNote = () => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
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
        if (draftNoteNodeIds[i] !== state.selectedNodeId)
            continue;
        const measure = notes[i].closest("measure");
        const divisions = resolveEffectiveDivisionsForMeasure(doc, measure);
        rebuildDurationPresetOptions(divisions);
        applyDurationPresetAvailability(notes[i], divisions);
        const durationText = (_c = (_b = (_a = notes[i].querySelector(":scope > duration")) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : "";
        const durationNumber = Number(durationText);
        if (Number.isInteger(durationNumber) && durationNumber > 0) {
            selectedDraftDurationValue = durationNumber;
            setDurationPresetFromValue(durationNumber);
        }
        else {
            selectedDraftDurationValue = null;
            setDurationPresetFromValue(null);
        }
        const alterText = (_f = (_e = (_d = notes[i].querySelector(":scope > pitch > alter")) === null || _d === void 0 ? void 0 : _d.textContent) === null || _e === void 0 ? void 0 : _e.trim()) !== null && _f !== void 0 ? _f : "";
        const accidentalText = (_j = (_h = (_g = notes[i].querySelector(":scope > accidental")) === null || _g === void 0 ? void 0 : _g.textContent) === null || _h === void 0 ? void 0 : _h.trim()) !== null && _j !== void 0 ? _j : "";
        const alterNumber = Number(alterText);
        if (alterText === "") {
            if (accidentalText === "natural") {
                pitchAlter.value = "0";
            }
            else if (accidentalText === "flat") {
                pitchAlter.value = "-1";
            }
            else if (accidentalText === "flat-flat") {
                pitchAlter.value = "-2";
            }
            else if (accidentalText === "sharp") {
                pitchAlter.value = "1";
            }
            else if (accidentalText === "double-sharp") {
                pitchAlter.value = "2";
            }
            else {
                pitchAlter.value = "none";
            }
        }
        else if (Number.isInteger(alterNumber) && alterNumber >= -2 && alterNumber <= 2) {
            pitchAlter.value = String(alterNumber);
        }
        else {
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
        const stepText = (_m = (_l = (_k = notes[i].querySelector(":scope > pitch > step")) === null || _k === void 0 ? void 0 : _k.textContent) === null || _l === void 0 ? void 0 : _l.trim()) !== null && _m !== void 0 ? _m : "";
        if (isPitchStepValue(stepText)) {
            pitchStep.value = stepText;
        }
        const octaveText = (_q = (_p = (_o = notes[i].querySelector(":scope > pitch > octave")) === null || _o === void 0 ? void 0 : _o.textContent) === null || _p === void 0 ? void 0 : _p.trim()) !== null && _q !== void 0 ? _q : "";
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
const renderMeasureEditorState = () => {
    var _a;
    if (!selectedMeasure || !draftCore) {
        measurePartNameText.textContent = "小節未選択（譜面プレビューをクリックしてください）";
        measureSelectionText.textContent = "小節未選択（譜面プレビューをクリックしてください）";
        measureSelectionText.classList.add("md-hidden");
        measureEditorWrap.classList.add("md-hidden");
        measureApplyBtn.disabled = true;
        measureDiscardBtn.disabled = true;
        return;
    }
    const partName = (_a = partIdToName.get(selectedMeasure.partId)) !== null && _a !== void 0 ? _a : selectedMeasure.partId;
    measurePartNameText.textContent =
        `トラック名: ${partName} / 選択中: トラック=${selectedMeasure.partId} / 小節=${selectedMeasure.measureNumber}`;
    measureSelectionText.textContent = "";
    measureSelectionText.classList.add("md-hidden");
    measureEditorWrap.classList.remove("md-hidden");
    measureDiscardBtn.disabled = false;
    measureApplyBtn.disabled = !draftCore.isDirty();
};
const highlightSelectedDraftNoteInEditor = () => {
    measureEditorArea
        .querySelectorAll(".ms-note-selected")
        .forEach((el) => el.classList.remove("ms-note-selected"));
    if (!state.selectedNodeId || draftSvgIdToNodeId.size === 0)
        return;
    for (const [svgId, nodeId] of draftSvgIdToNodeId.entries()) {
        if (nodeId !== state.selectedNodeId)
            continue;
        const target = document.getElementById(svgId);
        if (!target || !measureEditorArea.contains(target))
            continue;
        target.classList.add("ms-note-selected");
        const group = target.closest("g");
        if (group && measureEditorArea.contains(group)) {
            group.classList.add("ms-note-selected");
        }
    }
};
const highlightSelectedMeasureInMainPreview = () => {
    debugScoreArea
        .querySelectorAll(".ms-measure-selected")
        .forEach((el) => el.classList.remove("ms-measure-selected"));
    if (!selectedMeasure || currentSvgIdToNodeId.size === 0)
        return;
    for (const [svgId, nodeId] of currentSvgIdToNodeId.entries()) {
        const location = nodeIdToLocation.get(nodeId);
        if (!location)
            continue;
        if (location.partId !== selectedMeasure.partId || location.measureNumber !== selectedMeasure.measureNumber) {
            continue;
        }
        const target = document.getElementById(svgId);
        if (!target || !debugScoreArea.contains(target))
            continue;
        target.classList.add("ms-measure-selected");
        const group = target.closest("g");
        if (group && debugScoreArea.contains(group)) {
            group.classList.add("ms-measure-selected");
        }
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
const renderUiMessage = () => {
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
const renderOutput = () => {
    var _a, _b, _c, _d;
    saveModeText.textContent = state.lastSaveResult ? state.lastSaveResult.mode : "-";
    outputXml.value = ((_a = state.lastSaveResult) === null || _a === void 0 ? void 0 : _a.ok) ? state.lastSaveResult.xml : "";
    downloadBtn.disabled = !((_b = state.lastSaveResult) === null || _b === void 0 ? void 0 : _b.ok);
    downloadMidiBtn.disabled = !((_c = state.lastSaveResult) === null || _c === void 0 ? void 0 : _c.ok);
    downloadAbcBtn.disabled = !((_d = state.lastSaveResult) === null || _d === void 0 ? void 0 : _d.ok);
};
const renderControlState = () => {
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
const renderAll = () => {
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
const rebuildNodeLocationMap = (xml) => {
    var _a, _b;
    nodeIdToLocation = new Map();
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror"))
        return;
    const notes = Array.from(doc.querySelectorAll("part > measure > note"));
    const count = Math.min(notes.length, state.noteNodeIds.length);
    for (let i = 0; i < count; i += 1) {
        const note = notes[i];
        const part = note.closest("part");
        const measure = note.closest("measure");
        if (!part || !measure)
            continue;
        const nodeId = state.noteNodeIds[i];
        const partId = (_a = part.getAttribute("id")) !== null && _a !== void 0 ? _a : "";
        const measureNumber = (_b = measure.getAttribute("number")) !== null && _b !== void 0 ? _b : "";
        if (!partId || !measureNumber)
            continue;
        nodeIdToLocation.set(nodeId, { partId, measureNumber });
    }
};
const rebuildPartNameMap = (xml) => {
    var _a, _b, _c, _d, _e, _f;
    partIdToName = new Map();
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror"))
        return;
    for (const scorePart of Array.from(doc.querySelectorAll("score-partwise > part-list > score-part"))) {
        const partId = (_b = (_a = scorePart.getAttribute("id")) === null || _a === void 0 ? void 0 : _a.trim()) !== null && _b !== void 0 ? _b : "";
        if (!partId)
            continue;
        const partName = ((_d = (_c = scorePart.querySelector(":scope > part-name")) === null || _c === void 0 ? void 0 : _c.textContent) === null || _d === void 0 ? void 0 : _d.trim()) ||
            ((_f = (_e = scorePart.querySelector(":scope > part-abbreviation")) === null || _e === void 0 ? void 0 : _e.textContent) === null || _f === void 0 ? void 0 : _f.trim()) ||
            partId;
        partIdToName.set(partId, partName);
    }
};
const buildRenderXmlWithNodeIds = (xml, nodeIds, idPrefix) => {
    const map = new Map();
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
const buildRenderXmlForVerovio = (xml) => {
    if (!state.loaded) {
        return {
            renderXml: xml,
            svgIdToNodeId: new Map(),
            noteCount: 0,
        };
    }
    return buildRenderXmlWithNodeIds(xml, state.noteNodeIds.slice(), "mks-main");
};
const deriveRenderedNoteIds = (root) => {
    const direct = Array.from(root.querySelectorAll('[id^="mks-"], [id*="mks-"]')).map((el) => el.id);
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
const resolveNodeIdFromCandidateIds = (candidateIds, svgIdMap) => {
    for (const entry of candidateIds) {
        const exact = svgIdMap.get(entry);
        if (exact)
            return exact;
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
    const resolvedFromDirect = resolveNodeIdFromCandidateIds(directCandidates, currentSvgIdToNodeId);
    if (resolvedFromDirect)
        return resolvedFromDirect;
    if (clickEvent && typeof document.elementsFromPoint === "function") {
        const hitElements = document.elementsFromPoint(clickEvent.clientX, clickEvent.clientY);
        for (const hit of hitElements) {
            if (!(hit instanceof Element))
                continue;
            const hitCandidates = collectCandidateIdsFromElement(hit);
            const resolvedFromHit = resolveNodeIdFromCandidateIds(hitCandidates, currentSvgIdToNodeId);
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
const resolveDraftNodeIdFromSvgTarget = (target, clickEvent) => {
    if (!target || !(target instanceof Element))
        return null;
    const directCandidates = collectCandidateIdsFromElement(target);
    const resolvedFromDirect = resolveNodeIdFromCandidateIds(directCandidates, draftSvgIdToNodeId);
    if (resolvedFromDirect)
        return resolvedFromDirect;
    if (clickEvent && typeof document.elementsFromPoint === "function") {
        const hitElements = document.elementsFromPoint(clickEvent.clientX, clickEvent.clientY);
        for (const hit of hitElements) {
            if (!(hit instanceof Element))
                continue;
            const hitCandidates = collectCandidateIdsFromElement(hit);
            const resolvedFromHit = resolveNodeIdFromCandidateIds(hitCandidates, draftSvgIdToNodeId);
            if (resolvedFromHit)
                return resolvedFromHit;
        }
    }
    return null;
};
const resolveNodeIdFromNearestPointInArea = (clickEvent, area, svgIdToNodeId, snapPx = NOTE_CLICK_SNAP_PX) => {
    let bestNodeId = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const [svgId, nodeId] of svgIdToNodeId.entries()) {
        const el = area.querySelector(`#${CSS.escape(svgId)}`);
        if (!el)
            continue;
        const rect = el.getBoundingClientRect();
        if (!Number.isFinite(rect.left) || rect.width <= 0 || rect.height <= 0)
            continue;
        const dx = clickEvent.clientX < rect.left
            ? rect.left - clickEvent.clientX
            : clickEvent.clientX > rect.right
                ? clickEvent.clientX - rect.right
                : 0;
        const dy = clickEvent.clientY < rect.top
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
const resolveNodeIdFromNearestPoint = (clickEvent) => {
    return resolveNodeIdFromNearestPointInArea(clickEvent, debugScoreArea, currentSvgIdToNodeId, NOTE_CLICK_SNAP_PX);
};
const resolveDraftNodeIdFromNearestPoint = (clickEvent) => {
    return resolveNodeIdFromNearestPointInArea(clickEvent, measureEditorArea, draftSvgIdToNodeId, NOTE_CLICK_SNAP_PX);
};
const extractMeasureEditorXml = (xml, partId, measureNumber) => {
    var _a;
    const source = new DOMParser().parseFromString(xml, "application/xml");
    if (source.querySelector("parsererror"))
        return null;
    const srcRoot = source.querySelector("score-partwise");
    const srcPart = source.querySelector(`score-partwise > part[id="${CSS.escape(partId)}"]`);
    if (!srcRoot || !srcPart)
        return null;
    const srcMeasure = Array.from(srcPart.querySelectorAll(":scope > measure")).find((m) => { var _a; return ((_a = m.getAttribute("number")) !== null && _a !== void 0 ? _a : "") === measureNumber; });
    if (!srcMeasure)
        return null;
    const collectEffectiveAttributes = (part, targetMeasure) => {
        var _a;
        let divisions = null;
        let key = null;
        let time = null;
        let staves = null;
        const clefByNo = new Map();
        for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
            const attrs = measure.querySelector(":scope > attributes");
            if (attrs) {
                const nextDivisions = attrs.querySelector(":scope > divisions");
                if (nextDivisions)
                    divisions = nextDivisions.cloneNode(true);
                const nextKey = attrs.querySelector(":scope > key");
                if (nextKey)
                    key = nextKey.cloneNode(true);
                const nextTime = attrs.querySelector(":scope > time");
                if (nextTime)
                    time = nextTime.cloneNode(true);
                const nextStaves = attrs.querySelector(":scope > staves");
                if (nextStaves)
                    staves = nextStaves.cloneNode(true);
                for (const clef of Array.from(attrs.querySelectorAll(":scope > clef"))) {
                    const no = (_a = clef.getAttribute("number")) !== null && _a !== void 0 ? _a : "1";
                    clefByNo.set(no, clef.cloneNode(true));
                }
            }
            if (measure === targetMeasure)
                break;
        }
        const doc = targetMeasure.ownerDocument;
        const effective = doc.createElement("attributes");
        if (divisions)
            effective.appendChild(divisions);
        if (key)
            effective.appendChild(key);
        if (time)
            effective.appendChild(time);
        if (staves)
            effective.appendChild(staves);
        for (const no of Array.from(clefByNo.keys()).sort()) {
            const clef = clefByNo.get(no);
            if (clef)
                effective.appendChild(clef);
        }
        return effective.childElementCount > 0 ? effective : null;
    };
    const patchedMeasure = srcMeasure.cloneNode(true);
    const effectiveAttrs = collectEffectiveAttributes(srcPart, srcMeasure);
    if (effectiveAttrs) {
        const existing = patchedMeasure.querySelector(":scope > attributes");
        if (!existing) {
            patchedMeasure.insertBefore(effectiveAttrs, patchedMeasure.firstChild);
        }
        else {
            const ensureSingle = (selector) => {
                if (existing.querySelector(`:scope > ${selector}`))
                    return;
                const src = effectiveAttrs.querySelector(`:scope > ${selector}`);
                if (src)
                    existing.appendChild(src.cloneNode(true));
            };
            ensureSingle("divisions");
            ensureSingle("key");
            ensureSingle("time");
            ensureSingle("staves");
            const existingClefNos = new Set(Array.from(existing.querySelectorAll(":scope > clef")).map((c) => { var _a; return (_a = c.getAttribute("number")) !== null && _a !== void 0 ? _a : "1"; }));
            for (const clef of Array.from(effectiveAttrs.querySelectorAll(":scope > clef"))) {
                const no = (_a = clef.getAttribute("number")) !== null && _a !== void 0 ? _a : "1";
                if (existingClefNos.has(no))
                    continue;
                existing.appendChild(clef.cloneNode(true));
            }
        }
    }
    const dst = document.implementation.createDocument("", "score-partwise", null);
    const dstRoot = dst.documentElement;
    if (!dstRoot)
        return null;
    const version = srcRoot.getAttribute("version");
    if (version)
        dstRoot.setAttribute("version", version);
    const srcPartList = source.querySelector("score-partwise > part-list");
    const srcScorePart = source.querySelector(`score-partwise > part-list > score-part[id="${CSS.escape(partId)}"]`);
    if (srcPartList && srcScorePart) {
        const dstPartList = dst.importNode(srcPartList, false);
        const dstScorePart = dst.importNode(srcScorePart, true);
        const dstPartName = dstScorePart.querySelector(":scope > part-name");
        if (dstPartName)
            dstPartName.textContent = "";
        const dstPartAbbreviation = dstScorePart.querySelector(":scope > part-abbreviation");
        if (dstPartAbbreviation)
            dstPartAbbreviation.textContent = "";
        dstPartList.appendChild(dstScorePart);
        dstRoot.appendChild(dstPartList);
    }
    const dstPart = dst.importNode(srcPart, false);
    dstPart.appendChild(dst.importNode(patchedMeasure, true));
    dstRoot.appendChild(dstPart);
    return new XMLSerializer().serializeToString(dst);
};
const initializeMeasureEditor = (location) => {
    var _a;
    const xml = core.debugSerializeCurrentXml();
    if (!xml)
        return;
    const extracted = extractMeasureEditorXml(xml, location.partId, location.measureNumber);
    if (!extracted) {
        setUiMappingDiagnostic("選択小節の抽出に失敗しました。");
        return;
    }
    const nextDraft = new ScoreCore_1.ScoreCore({ editableVoice: EDITABLE_VOICE });
    try {
        nextDraft.load(extracted);
    }
    catch (error) {
        setUiMappingDiagnostic(`選択小節の読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`);
        return;
    }
    draftCore = nextDraft;
    draftNoteNodeIds = nextDraft.listNoteNodeIds();
    state.selectedNodeId = (_a = draftNoteNodeIds[0]) !== null && _a !== void 0 ? _a : null;
    selectedMeasure = location;
    state.lastDispatchResult = null;
    draftSvgIdToNodeId = new Map();
    renderAll();
    renderMeasureEditorPreview();
};
const onVerovioScoreClick = (event) => {
    var _a, _b;
    if (!state.loaded)
        return;
    const nodeId = (_a = resolveNodeIdFromSvgTarget(event.target, event)) !== null && _a !== void 0 ? _a : resolveNodeIdFromNearestPoint(event);
    if (DEBUG_LOG) {
        const clicked = event.target instanceof Element ? event.target.closest("[id]") : null;
        console.warn("[mikuscore][click-map] resolution:", {
            clickedId: (_b = clicked === null || clicked === void 0 ? void 0 : clicked.getAttribute("id")) !== null && _b !== void 0 ? _b : null,
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
const onMeasureEditorClick = (event) => {
    var _a;
    if (!draftCore)
        return;
    const nodeId = (_a = resolveDraftNodeIdFromSvgTarget(event.target, event)) !== null && _a !== void 0 ? _a : resolveDraftNodeIdFromNearestPoint(event);
    if (!nodeId || !draftNoteNodeIds.includes(nodeId))
        return;
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
        .catch((error) => {
        if (renderSeq !== verovioRenderSeq)
            return;
        const message = error instanceof Error ? error.message : String(error);
        debugScoreMeta.textContent = "描画失敗: " + message;
        debugScoreArea.innerHTML = "";
        currentSvgIdToNodeId = new Map();
    });
};
const renderMeasureEditorPreview = () => {
    if (!draftCore || !selectedMeasure) {
        measureEditorArea.innerHTML = "";
        draftSvgIdToNodeId = new Map();
        return;
    }
    const xml = draftCore.debugSerializeCurrentXml();
    if (!xml) {
        measureEditorArea.innerHTML = "";
        draftSvgIdToNodeId = new Map();
        return;
    }
    const renderBundle = buildRenderXmlWithNodeIds(xml, draftNoteNodeIds.slice(), "mks-draft");
    measureEditorArea.innerHTML = "描画中...";
    void ensureVerovioToolkit()
        .then((toolkit) => {
        if (!toolkit)
            throw new Error("verovio toolkit の初期化に失敗しました。");
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
        if (!svg)
            throw new Error("verovio SVG 生成に失敗しました。");
        measureEditorArea.innerHTML = svg;
        const renderedNoteIds = deriveRenderedNoteIds(measureEditorArea);
        if (renderedNoteIds.length > 0 && !renderedNoteIds.some((id) => id.startsWith("mks-"))) {
            draftSvgIdToNodeId = buildFallbackSvgIdMap(draftNoteNodeIds, renderedNoteIds);
        }
        else {
            draftSvgIdToNodeId = renderBundle.svgIdToNodeId;
        }
        highlightSelectedDraftNoteInEditor();
    })
        .catch((error) => {
        measureEditorArea.innerHTML = `描画失敗: ${error instanceof Error ? error.message : String(error)}`;
        draftSvgIdToNodeId = new Map();
    });
};
const refreshNotesFromCore = () => {
    state.noteNodeIds = core.listNoteNodeIds();
    const currentXml = core.debugSerializeCurrentXml();
    if (currentXml) {
        rebuildNodeLocationMap(currentXml);
        rebuildPartNameMap(currentXml);
    }
    else {
        nodeIdToLocation = new Map();
        partIdToName = new Map();
    }
};
const midiToHz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const PLAYBACK_TICKS_PER_QUARTER = 128;
const FIXED_PLAYBACK_WAVEFORM = "sine";
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
    const parsedPlayback = (0, playback_1.buildPlaybackEventsFromXml)(saveResult.xml, PLAYBACK_TICKS_PER_QUARTER);
    const events = parsedPlayback.events;
    if (events.length === 0) {
        playbackText.textContent = "再生: 再生可能ノートなし";
        renderControlState();
        return;
    }
    let midiBytes;
    try {
        midiBytes = (0, playback_1.buildMidiBytesForPlayback)(events, parsedPlayback.tempo);
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
const startMeasurePlayback = async () => {
    if (!draftCore || isPlaying)
        return;
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
    const parsedPlayback = (0, playback_1.buildPlaybackEventsFromXml)(saveResult.xml, PLAYBACK_TICKS_PER_QUARTER);
    const events = parsedPlayback.events;
    if (events.length === 0) {
        playbackText.textContent = "再生: この小節に再生可能ノートなし";
        renderControlState();
        return;
    }
    try {
        await synthEngine.playSchedule({
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
        }, FIXED_PLAYBACK_WAVEFORM, () => {
            isPlaying = false;
            playbackText.textContent = "再生: 停止中";
            renderControlState();
        });
    }
    catch (error) {
        playbackText.textContent =
            "再生: 小節再生失敗 (" + (error instanceof Error ? error.message : String(error)) + ")";
        renderControlState();
        return;
    }
    isPlaying = true;
    playbackText.textContent = `再生中: 選択小節 ノート${events.length}件 / 波形 sine`;
    renderControlState();
};
const readSelectedPitch = () => {
    const step = pitchStep.value.trim();
    if (!isPitchStepValue(step))
        return null;
    const octave = Number(pitchOctave.value);
    if (!Number.isInteger(octave))
        return null;
    const alterText = normalizeAlterValue(pitchAlter.value);
    const base = {
        step,
        octave,
    };
    if (alterText === "none") {
        return base;
    }
    const alter = Number(alterText);
    if (!Number.isInteger(alter) || alter < -2 || alter > 2)
        return null;
    return { ...base, alter: alter };
};
const readDuration = () => {
    const duration = Number(durationPreset.value);
    if (!Number.isInteger(duration) || duration <= 0)
        return null;
    return duration;
};
const onDurationPresetChange = () => {
    if (suppressDurationPresetEvent)
        return;
    const preset = Number(durationPreset.value);
    if (!Number.isInteger(preset) || preset <= 0)
        return;
    if (Number.isInteger(selectedDraftDurationValue) && selectedDraftDurationValue === preset)
        return;
    const targetNodeId = requireSelectedNode();
    if (!targetNodeId)
        return;
    const command = {
        type: "change_duration",
        targetNodeId,
        voice: EDITABLE_VOICE,
        duration: preset,
    };
    const result = runCommand(command);
    if (!result || result.ok)
        return;
    const first = result.diagnostics[0];
    if ((first === null || first === void 0 ? void 0 : first.code) === "MEASURE_OVERFULL") {
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
const runCommand = (command) => {
    var _a;
    if (!draftCore)
        return null;
    state.lastDispatchResult = draftCore.dispatch(command);
    if (!state.lastDispatchResult.ok || state.lastDispatchResult.warnings.length > 0) {
        logDiagnostics("dispatch", state.lastDispatchResult.diagnostics, state.lastDispatchResult.warnings);
    }
    state.lastSaveResult = null;
    if (state.lastDispatchResult.ok) {
        draftNoteNodeIds = draftCore.listNoteNodeIds();
        if (state.selectedNodeId && !draftNoteNodeIds.includes(state.selectedNodeId)) {
            state.selectedNodeId = (_a = draftNoteNodeIds[0]) !== null && _a !== void 0 ? _a : null;
        }
    }
    renderAll();
    renderMeasureEditorPreview();
    return state.lastDispatchResult;
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
const xmlEscape = (text) => text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
const normalizeTypeForMusicXml = (t) => {
    const raw = String(t || "").trim();
    if (!raw)
        return "quarter";
    if (raw === "16th" || raw === "32nd" || raw === "64th" || raw === "128th")
        return raw;
    if (raw === "whole" || raw === "half" || raw === "quarter" || raw === "eighth")
        return raw;
    return "quarter";
};
const clefXmlFromAbcClef = (rawClef) => {
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
const buildMusicXmlFromAbcParsed = (parsed) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const parts = parsed.parts && parsed.parts.length > 0 ? parsed.parts : [{ partId: "P1", partName: "Voice 1", measures: [[]] }];
    const measureCount = parts.reduce((max, part) => Math.max(max, part.measures.length), 1);
    const title = ((_a = parsed.meta) === null || _a === void 0 ? void 0 : _a.title) || "mikuscore";
    const composer = ((_b = parsed.meta) === null || _b === void 0 ? void 0 : _b.composer) || "Unknown";
    const beats = ((_d = (_c = parsed.meta) === null || _c === void 0 ? void 0 : _c.meter) === null || _d === void 0 ? void 0 : _d.beats) || 4;
    const beatType = ((_f = (_e = parsed.meta) === null || _e === void 0 ? void 0 : _e.meter) === null || _f === void 0 ? void 0 : _f.beatType) || 4;
    const fifths = Number.isFinite((_h = (_g = parsed.meta) === null || _g === void 0 ? void 0 : _g.keyInfo) === null || _h === void 0 ? void 0 : _h.fifths) ? parsed.meta.keyInfo.fifths : 0;
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
        var _a;
        const measuresXml = [];
        for (let i = 0; i < measureCount; i += 1) {
            const measureNo = i + 1;
            const notes = (_a = part.measures[i]) !== null && _a !== void 0 ? _a : [];
            const header = i === 0
                ? [
                    "<attributes>",
                    "<divisions>960</divisions>",
                    `<key><fifths>${Math.round(fifths)}</fifths></key>`,
                    `<time><beats>${Math.round(beats)}</beats><beat-type>${Math.round(beatType)}</beat-type></time>`,
                    clefXmlFromAbcClef(part.clef),
                    "</attributes>",
                ].join("")
                : "";
            const notesXml = notes.length > 0
                ? notes
                    .map((note) => {
                    const chunks = ["<note>"];
                    if (note.chord)
                        chunks.push("<chord/>");
                    if (note.isRest) {
                        chunks.push("<rest/>");
                    }
                    else {
                        const step = /^[A-G]$/.test(String(note.step || "").toUpperCase()) ? String(note.step).toUpperCase() : "C";
                        const octave = Number.isFinite(note.octave) ? Math.max(0, Math.min(9, Math.round(note.octave))) : 4;
                        chunks.push("<pitch>");
                        chunks.push(`<step>${step}</step>`);
                        if (Number.isFinite(note.alter) && Number(note.alter) !== 0) {
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
                    if (note.tieStart)
                        chunks.push('<tie type="start"/>');
                    if (note.tieStop)
                        chunks.push('<tie type="stop"/>');
                    if (note.tieStart || note.tieStop) {
                        chunks.push("<notations>");
                        if (note.tieStart)
                            chunks.push('<tied type="start"/>');
                        if (note.tieStop)
                            chunks.push('<tied type="stop"/>');
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
const convertAbcToMusicXml = (abcSource) => {
    const parsed = abc_compat_parser_1.AbcCompatParser.parseForMusicXml(abcSource, {
        defaultTitle: "mikuscore",
        defaultComposer: "Unknown",
        inferTransposeFromPartName: true,
    });
    return buildMusicXmlFromAbcParsed(parsed);
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
    selectedMeasure = null;
    draftCore = null;
    draftNoteNodeIds = [];
    draftSvgIdToNodeId = new Map();
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
    let sourceText = "";
    const treatAsAbc = inputTypeAbc.checked;
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
        sourceText = await selected.text();
        if (treatAsAbc) {
            abcInput.value = sourceText;
        }
        else {
            xmlInput.value = sourceText;
        }
    }
    else if (!treatAsAbc) {
        sourceText = xmlInput.value;
    }
    else {
        sourceText = abcInput.value;
    }
    if (treatAsAbc) {
        try {
            const convertedXml = convertAbcToMusicXml(sourceText);
            xmlInput.value = convertedXml;
            loadFromText(convertedXml, true);
        }
        catch (error) {
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
const requireSelectedNode = () => {
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
        type: "change_to_pitch",
        targetNodeId,
        voice: EDITABLE_VOICE,
        pitch,
    };
    runCommand(command);
};
const onPitchStepAutoChange = () => {
    if (!draftCore || !state.selectedNodeId || selectedDraftNoteIsRest)
        return;
    onChangePitch();
};
const onAlterAutoChange = () => {
    if (!draftCore || !state.selectedNodeId || selectedDraftNoteIsRest)
        return;
    renderAlterButtons();
    onChangePitch();
};
const shiftPitchStep = (delta) => {
    if (!draftCore || !state.selectedNodeId || selectedDraftNoteIsRest)
        return;
    const order = ["C", "D", "E", "F", "G", "A", "B"];
    const current = pitchStep.value.trim();
    if (!isPitchStepValue(current))
        return;
    const index = order.indexOf(current);
    if (index < 0)
        return;
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
    if (!Number.isInteger(octave))
        octave = 4;
    if (rawNext < 0) {
        if (octave <= 0) {
            return;
        }
        octave -= 1;
        nextIndex = order.length - 1;
    }
    else if (rawNext >= order.length) {
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
const replaceMeasureInMainXml = (sourceXml, partId, measureNumber, measureXml) => {
    const mainDoc = new DOMParser().parseFromString(sourceXml, "application/xml");
    const measureDoc = new DOMParser().parseFromString(measureXml, "application/xml");
    if (mainDoc.querySelector("parsererror") || measureDoc.querySelector("parsererror"))
        return null;
    const replacementMeasure = measureDoc.querySelector("part > measure");
    if (!replacementMeasure)
        return null;
    const targetPart = mainDoc.querySelector(`score-partwise > part[id="${CSS.escape(partId)}"]`);
    if (!targetPart)
        return null;
    const targetMeasure = Array.from(targetPart.querySelectorAll(":scope > measure")).find((m) => { var _a; return ((_a = m.getAttribute("number")) !== null && _a !== void 0 ? _a : "") === measureNumber; });
    if (!targetMeasure)
        return null;
    targetMeasure.replaceWith(mainDoc.importNode(replacementMeasure, true));
    return new XMLSerializer().serializeToString(mainDoc);
};
const onMeasureApply = () => {
    if (!draftCore || !selectedMeasure)
        return;
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
    if (!mainXml)
        return;
    const merged = replaceMeasureInMainXml(mainXml, selectedMeasure.partId, selectedMeasure.measureNumber, draftSave.xml);
    if (!merged) {
        setUiMappingDiagnostic("小節確定に失敗しました。");
        return;
    }
    try {
        core.load(merged);
    }
    catch (error) {
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
const onMeasureDiscard = () => {
    if (!selectedMeasure)
        return;
    initializeMeasureEditor(selectedMeasure);
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
const onSplitNote = () => {
    if (selectedDraftNoteIsRest)
        return;
    const targetNodeId = requireSelectedNode();
    if (!targetNodeId)
        return;
    const command = {
        type: "split_note",
        targetNodeId,
        voice: EDITABLE_VOICE,
    };
    runCommand(command);
};
const onConvertRestToNote = () => {
    if (!selectedDraftNoteIsRest)
        return;
    const targetNodeId = requireSelectedNode();
    if (!targetNodeId)
        return;
    const stepRaw = pitchStep.value.trim();
    const step = isPitchStepValue(stepRaw) ? stepRaw : "C";
    const octaveRaw = Number(pitchOctave.value);
    const octave = Number.isInteger(octaveRaw) ? octaveRaw : 4;
    const alterText = normalizeAlterValue(pitchAlter.value);
    const alterNum = Number(alterText);
    const pitch = alterText !== "none" && Number.isInteger(alterNum) && alterNum >= -2 && alterNum <= 2
        ? { step, octave, alter: alterNum }
        : { step, octave };
    const command = {
        type: "change_to_pitch",
        targetNodeId,
        voice: EDITABLE_VOICE,
        pitch,
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
const convertMusicXmlToAbc = (xml) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) {
        throw new Error("MusicXMLの解析に失敗しました。");
    }
    const title = ((_b = (_a = doc.querySelector("work > work-title")) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim()) ||
        ((_d = (_c = doc.querySelector("movement-title")) === null || _c === void 0 ? void 0 : _c.textContent) === null || _d === void 0 ? void 0 : _d.trim()) ||
        "mikuscore";
    const composer = ((_f = (_e = doc.querySelector('identification > creator[type="composer"]')) === null || _e === void 0 ? void 0 : _e.textContent) === null || _f === void 0 ? void 0 : _f.trim()) || "";
    const firstMeasure = doc.querySelector("score-partwise > part > measure");
    const meterBeats = ((_h = (_g = firstMeasure === null || firstMeasure === void 0 ? void 0 : firstMeasure.querySelector("attributes > time > beats")) === null || _g === void 0 ? void 0 : _g.textContent) === null || _h === void 0 ? void 0 : _h.trim()) || "4";
    const meterBeatType = ((_k = (_j = firstMeasure === null || firstMeasure === void 0 ? void 0 : firstMeasure.querySelector("attributes > time > beat-type")) === null || _j === void 0 ? void 0 : _j.textContent) === null || _k === void 0 ? void 0 : _k.trim()) || "4";
    const fifths = Number(((_m = (_l = firstMeasure === null || firstMeasure === void 0 ? void 0 : firstMeasure.querySelector("attributes > key > fifths")) === null || _l === void 0 ? void 0 : _l.textContent) === null || _m === void 0 ? void 0 : _m.trim()) || "0");
    const mode = ((_p = (_o = firstMeasure === null || firstMeasure === void 0 ? void 0 : firstMeasure.querySelector("attributes > key > mode")) === null || _o === void 0 ? void 0 : _o.textContent) === null || _p === void 0 ? void 0 : _p.trim()) || "major";
    const key = abc_common_1.AbcCommon.keyFromFifthsMode(Number.isFinite(fifths) ? fifths : 0, mode);
    const partNameById = new Map();
    for (const scorePart of Array.from(doc.querySelectorAll("part-list > score-part"))) {
        const id = (_q = scorePart.getAttribute("id")) !== null && _q !== void 0 ? _q : "";
        if (!id)
            continue;
        const name = ((_s = (_r = scorePart.querySelector("part-name")) === null || _r === void 0 ? void 0 : _r.textContent) === null || _s === void 0 ? void 0 : _s.trim()) || id;
        partNameById.set(id, name);
    }
    const unitLength = { num: 1, den: 8 };
    const abcClefFromMusicXmlPart = (part) => {
        var _a, _b, _c, _d, _e, _f;
        const firstClef = part.querySelector(":scope > measure > attributes > clef");
        if (!firstClef)
            return "";
        const sign = (_c = (_b = (_a = firstClef.querySelector(":scope > sign")) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim().toUpperCase()) !== null && _c !== void 0 ? _c : "";
        const line = Number((_f = (_e = (_d = firstClef.querySelector(":scope > line")) === null || _d === void 0 ? void 0 : _d.textContent) === null || _e === void 0 ? void 0 : _e.trim()) !== null && _f !== void 0 ? _f : "");
        if (sign === "F" && line === 4)
            return "bass";
        if (sign === "G" && line === 2)
            return "treble";
        if (sign === "C" && line === 3)
            return "alto";
        if (sign === "C" && line === 4)
            return "tenor";
        return "";
    };
    const keySignatureAlterByStep = (fifthsValue) => {
        const map = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
        const sharpOrder = ["F", "C", "G", "D", "A", "E", "B"];
        const flatOrder = ["B", "E", "A", "D", "G", "C", "F"];
        const safeFifths = Math.max(-7, Math.min(7, Math.round(fifthsValue)));
        if (safeFifths > 0) {
            for (let i = 0; i < safeFifths; i += 1)
                map[sharpOrder[i]] = 1;
        }
        else if (safeFifths < 0) {
            for (let i = 0; i < Math.abs(safeFifths); i += 1)
                map[flatOrder[i]] = -1;
        }
        return map;
    };
    const accidentalTextToAlter = (text) => {
        const normalized = text.trim().toLowerCase();
        if (!normalized)
            return null;
        if (normalized === "sharp")
            return 1;
        if (normalized === "flat")
            return -1;
        if (normalized === "natural")
            return 0;
        if (normalized === "double-sharp")
            return 2;
        if (normalized === "flat-flat")
            return -2;
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
    const bodyLines = [];
    const parts = Array.from(doc.querySelectorAll("score-partwise > part"));
    parts.forEach((part, partIndex) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
        const partId = part.getAttribute("id") || `P${partIndex + 1}`;
        const voiceId = partId.replace(/[^A-Za-z0-9_.-]/g, "_");
        const voiceName = partNameById.get(partId) || partId;
        const abcClef = abcClefFromMusicXmlPart(part);
        const clefSuffix = abcClef ? ` clef=${abcClef}` : "";
        headerLines.push(`V:${voiceId} name="${voiceName}"${clefSuffix}`);
        let currentDivisions = 480;
        let currentFifths = Number.isFinite(fifths) ? Math.round(fifths) : 0;
        const measureTexts = [];
        for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
            const parsedDiv = Number(((_b = (_a = measure.querySelector("attributes > divisions")) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || "");
            if (Number.isFinite(parsedDiv) && parsedDiv > 0) {
                currentDivisions = parsedDiv;
            }
            const parsedFifths = Number(((_d = (_c = measure.querySelector("attributes > key > fifths")) === null || _c === void 0 ? void 0 : _c.textContent) === null || _d === void 0 ? void 0 : _d.trim()) || "");
            if (Number.isFinite(parsedFifths)) {
                currentFifths = Math.round(parsedFifths);
            }
            const keyAlterMap = keySignatureAlterByStep(currentFifths);
            const measureAccidentalByStepOctave = new Map();
            let pending = null;
            const tokens = [];
            const flush = () => {
                if (!pending)
                    return;
                if (pending.pitches.length === 1) {
                    tokens.push(`${pending.pitches[0]}${pending.len}${pending.tie ? "-" : ""}`);
                }
                else {
                    tokens.push(`[${pending.pitches.join("")}]${pending.len}${pending.tie ? "-" : ""}`);
                }
                pending = null;
            };
            for (const child of Array.from(measure.children)) {
                if (child.tagName !== "note")
                    continue;
                const isChord = Boolean(child.querySelector("chord"));
                const duration = Number(((_f = (_e = child.querySelector("duration")) === null || _e === void 0 ? void 0 : _e.textContent) === null || _f === void 0 ? void 0 : _f.trim()) || "0");
                if (!Number.isFinite(duration) || duration <= 0)
                    continue;
                const wholeFraction = abc_common_1.AbcCommon.reduceFraction(duration, currentDivisions * 4, { num: 1, den: 4 });
                const lenRatio = abc_common_1.AbcCommon.divideFractions(wholeFraction, unitLength, { num: 1, den: 1 });
                const len = abc_common_1.AbcCommon.abcLengthTokenFromFraction(lenRatio);
                const hasTieStart = Boolean(child.querySelector('tie[type="start"]'));
                let pitchToken = "z";
                if (!child.querySelector("rest")) {
                    const step = ((_h = (_g = child.querySelector("pitch > step")) === null || _g === void 0 ? void 0 : _g.textContent) === null || _h === void 0 ? void 0 : _h.trim()) || "C";
                    const octave = Number(((_k = (_j = child.querySelector("pitch > octave")) === null || _j === void 0 ? void 0 : _j.textContent) === null || _k === void 0 ? void 0 : _k.trim()) || "4");
                    const upperStep = /^[A-G]$/.test(step.toUpperCase()) ? step.toUpperCase() : "C";
                    const safeOctave = Number.isFinite(octave) ? Math.max(0, Math.min(9, Math.round(octave))) : 4;
                    const stepOctaveKey = `${upperStep}${safeOctave}`;
                    const alterRaw = (_o = (_m = (_l = child.querySelector("pitch > alter")) === null || _l === void 0 ? void 0 : _l.textContent) === null || _m === void 0 ? void 0 : _m.trim()) !== null && _o !== void 0 ? _o : "";
                    const explicitAlter = alterRaw !== "" && Number.isFinite(Number(alterRaw)) ? Math.round(Number(alterRaw)) : null;
                    const accidentalText = (_r = (_q = (_p = child.querySelector("accidental")) === null || _p === void 0 ? void 0 : _p.textContent) === null || _q === void 0 ? void 0 : _q.trim()) !== null && _r !== void 0 ? _r : "";
                    const accidentalAlter = accidentalTextToAlter(accidentalText);
                    const keyAlter = (_s = keyAlterMap[upperStep]) !== null && _s !== void 0 ? _s : 0;
                    const currentAlter = measureAccidentalByStepOctave.has(stepOctaveKey)
                        ? (_t = measureAccidentalByStepOctave.get(stepOctaveKey)) !== null && _t !== void 0 ? _t : 0
                        : keyAlter;
                    let targetAlter = currentAlter;
                    if (explicitAlter !== null) {
                        targetAlter = explicitAlter;
                    }
                    else if (accidentalAlter !== null) {
                        targetAlter = accidentalAlter;
                    }
                    const shouldEmitAccidental = accidentalAlter !== null || targetAlter !== currentAlter;
                    const accidental = shouldEmitAccidental
                        ? (targetAlter === 0 ? "=" : abc_common_1.AbcCommon.accidentalFromAlter(targetAlter))
                        : "";
                    measureAccidentalByStepOctave.set(stepOctaveKey, targetAlter);
                    pitchToken = `${accidental}${abc_common_1.AbcCommon.abcPitchFromStepOctave(step, Number.isFinite(octave) ? octave : 4)}`;
                }
                if (!isChord) {
                    flush();
                    pending = { pitches: [pitchToken], len, tie: hasTieStart };
                }
                else {
                    if (!pending) {
                        pending = { pitches: [pitchToken], len, tie: hasTieStart };
                    }
                    else {
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
const onDownloadMidi = () => {
    if (!state.lastSuccessfulSaveXml)
        return;
    const parsedPlayback = (0, playback_1.buildPlaybackEventsFromXml)(state.lastSuccessfulSaveXml, PLAYBACK_TICKS_PER_QUARTER);
    if (parsedPlayback.events.length === 0)
        return;
    let midiBytes;
    try {
        midiBytes = (0, playback_1.buildMidiBytesForPlayback)(parsedPlayback.events, parsedPlayback.tempo);
    }
    catch (_a) {
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
const onDownloadAbc = () => {
    if (!state.lastSuccessfulSaveXml)
        return;
    let abcText = "";
    try {
        abcText = convertMusicXmlToAbc(state.lastSuccessfulSaveXml);
    }
    catch (_a) {
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
        var _a;
        pitchAlter.value = normalizeAlterValue((_a = btn.dataset.alter) !== null && _a !== void 0 ? _a : "");
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
  "src/ts/playback.js": function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPlaybackEventsFromXml = exports.buildMidiBytesForPlayback = void 0;
const clampTempo = (tempo) => {
    if (!Number.isFinite(tempo))
        return 120;
    return Math.max(20, Math.min(300, Math.round(tempo)));
};
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
const keySignatureAlterByStep = (fifths) => {
    const map = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
    const sharpOrder = ["F", "C", "G", "D", "A", "E", "B"];
    const flatOrder = ["B", "E", "A", "D", "G", "C", "F"];
    const safeFifths = Math.max(-7, Math.min(7, Math.round(fifths)));
    if (safeFifths > 0) {
        for (let i = 0; i < safeFifths; i += 1)
            map[sharpOrder[i]] = 1;
    }
    else if (safeFifths < 0) {
        for (let i = 0; i < Math.abs(safeFifths); i += 1)
            map[flatOrder[i]] = -1;
    }
    return map;
};
const accidentalTextToAlter = (text) => {
    const normalized = text.trim().toLowerCase();
    if (!normalized)
        return null;
    if (normalized === "sharp")
        return 1;
    if (normalized === "flat")
        return -1;
    if (normalized === "natural")
        return 0;
    if (normalized === "double-sharp")
        return 2;
    if (normalized === "flat-flat")
        return -2;
    return null;
};
const getFirstNumber = (el, selector) => {
    var _a, _b;
    const text = (_b = (_a = el.querySelector(selector)) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim();
    if (!text)
        return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
};
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
const normalizeTicksPerQuarter = (ticksPerQuarter) => {
    if (!Number.isFinite(ticksPerQuarter))
        return 128;
    return Math.max(1, Math.round(ticksPerQuarter));
};
const buildMidiBytesForPlayback = (events, tempo) => {
    var _a;
    const midiWriter = getMidiWriterRuntime();
    if (!midiWriter) {
        throw new Error("midi-writer.js が読み込まれていません。");
    }
    const tracksById = new Map();
    for (const event of events) {
        const key = event.trackId || "__default__";
        const bucket = (_a = tracksById.get(key)) !== null && _a !== void 0 ? _a : [];
        bucket.push(event);
        tracksById.set(key, bucket);
    }
    const midiTracks = [];
    const sortedTrackIds = Array.from(tracksById.keys()).sort((a, b) => a.localeCompare(b));
    sortedTrackIds.forEach((trackId, index) => {
        var _a, _b;
        const trackEvents = ((_a = tracksById.get(trackId)) !== null && _a !== void 0 ? _a : [])
            .slice()
            .sort((a, b) => (a.startTicks === b.startTicks ? a.midiNumber - b.midiNumber : a.startTicks - b.startTicks));
        if (!trackEvents.length)
            return;
        const track = new midiWriter.Track();
        track.setTempo(clampTempo(tempo));
        const first = trackEvents[0];
        const trackName = ((_b = first.trackName) === null || _b === void 0 ? void 0 : _b.trim()) || trackId || `Track ${index + 1}`;
        track.addTrackName(trackName);
        track.addInstrumentName(trackName);
        const channels = Array.from(new Set(trackEvents.map((event) => Math.max(1, Math.min(16, Math.round(event.channel || 1)))))).sort((a, b) => a - b);
        for (const channel of channels) {
            if (channel === 10)
                continue;
            track.addEvent(new midiWriter.ProgramChangeEvent({
                channel,
                instrument: 5, // GM: Electric Piano 2
                delta: 0,
            }));
        }
        for (const event of trackEvents) {
            const fields = {
                pitch: [midiToPitchText(event.midiNumber)],
                duration: `T${event.durTicks}`,
                startTick: Math.max(0, Math.round(event.startTicks)),
                velocity: 80,
                channel: Math.max(1, Math.min(16, Math.round(event.channel || 1))),
            };
            track.addEvent(new midiWriter.NoteEvent(fields));
        }
        midiTracks.push(track);
    });
    if (!midiTracks.length) {
        throw new Error("MIDI化するノートがありません。");
    }
    const writer = new midiWriter.Writer(midiTracks);
    const built = writer.buildFile();
    return built instanceof Uint8Array ? built : Uint8Array.from(built);
};
exports.buildMidiBytesForPlayback = buildMidiBytesForPlayback;
const buildPlaybackEventsFromXml = (xml, ticksPerQuarter) => {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const normalizedTicksPerQuarter = normalizeTicksPerQuarter(ticksPerQuarter);
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
    const partNameById = new Map();
    for (const scorePart of Array.from(doc.querySelectorAll("part-list > score-part"))) {
        const partId = (_d = scorePart.getAttribute("id")) !== null && _d !== void 0 ? _d : "";
        if (!partId)
            continue;
        const rawName = (_g = (_f = (_e = scorePart.querySelector("part-name")) === null || _e === void 0 ? void 0 : _e.textContent) === null || _f === void 0 ? void 0 : _f.trim()) !== null && _g !== void 0 ? _g : "";
        partNameById.set(partId, rawName || partId);
    }
    const defaultTempo = 120;
    const tempo = clampTempo((_h = getFirstNumber(doc, "sound[tempo]")) !== null && _h !== void 0 ? _h : defaultTempo);
    const events = [];
    partNodes.forEach((part, partIndex) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
        const partId = (_a = part.getAttribute("id")) !== null && _a !== void 0 ? _a : "";
        const fallbackChannel = (partIndex % 16) + 1 === 10 ? 11 : (partIndex % 16) + 1;
        const channel = (_b = channelMap.get(partId)) !== null && _b !== void 0 ? _b : fallbackChannel;
        let currentDivisions = 1;
        let currentBeats = 4;
        let currentBeatType = 4;
        let currentFifths = 0;
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
            const fifths = getFirstNumber(measure, "attributes > key > fifths");
            if (fifths !== null) {
                currentFifths = Math.max(-7, Math.min(7, Math.round(fifths)));
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
            const measureAccidentalByStepOctave = new Map();
            const keyAlterMap = keySignatureAlterByStep(currentFifths);
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
                    const explicitAlter = getFirstNumber(child, "pitch > alter");
                    const accidentalAlter = accidentalTextToAlter((_p = (_o = (_m = child.querySelector("accidental")) === null || _m === void 0 ? void 0 : _m.textContent) === null || _o === void 0 ? void 0 : _o.trim()) !== null && _p !== void 0 ? _p : "");
                    if (octave !== null) {
                        const stepOctaveKey = `${step}${octave}`;
                        let effectiveAlter = 0;
                        if (explicitAlter !== null) {
                            effectiveAlter = Math.round(explicitAlter);
                            measureAccidentalByStepOctave.set(stepOctaveKey, effectiveAlter);
                        }
                        else if (accidentalAlter !== null) {
                            effectiveAlter = accidentalAlter;
                            measureAccidentalByStepOctave.set(stepOctaveKey, effectiveAlter);
                        }
                        else if (measureAccidentalByStepOctave.has(stepOctaveKey)) {
                            effectiveAlter = (_q = measureAccidentalByStepOctave.get(stepOctaveKey)) !== null && _q !== void 0 ? _q : 0;
                        }
                        else {
                            effectiveAlter = (_r = keyAlterMap[step]) !== null && _r !== void 0 ? _r : 0;
                        }
                        const midi = pitchToMidi(step, effectiveAlter, octave);
                        if (midi !== null) {
                            const soundingMidi = midi + currentTransposeSemitones;
                            if (soundingMidi < 0 || soundingMidi > 127) {
                                continue;
                            }
                            const startTicks = Math.max(0, Math.round(((timelineDiv + startDiv) / currentDivisions) * normalizedTicksPerQuarter));
                            const durTicks = Math.max(1, Math.round((durationDiv / currentDivisions) * normalizedTicksPerQuarter));
                            events.push({
                                midiNumber: soundingMidi,
                                startTicks,
                                durTicks,
                                channel,
                                trackId: partId || `part-${partIndex + 1}`,
                                trackName: (_s = partNameById.get(partId)) !== null && _s !== void 0 ? _s : (partId || `part-${partIndex + 1}`),
                            });
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
exports.buildPlaybackEventsFromXml = buildPlaybackEventsFromXml;

  },
  "src/ts/abc-compat-parser.js": function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbcCompatParser = void 0;
// @ts-nocheck
const abc_common_1 = require("./abc-common");
const abcCommon = abc_common_1.AbcCommon;
function parseForMusicXml(source, settings) {
    const warnings = [];
    const lines = String(source || "").split("\n");
    const headers = {};
    const bodyEntries = [];
    const declaredVoiceIds = [];
    const voiceNameById = {};
    const voiceClefById = {};
    let currentVoiceId = "1";
    let scoreDirective = "";
    for (let i = 0; i < lines.length; i += 1) {
        const lineNo = i + 1;
        const raw = lines[i];
        const noComment = raw.split("%")[0];
        const trimmed = noComment.trim();
        if (!trimmed) {
            continue;
        }
        const scoreMatch = trimmed.match(/^%%\s*score\s+(.+)$/i);
        if (scoreMatch) {
            scoreDirective = scoreMatch[1].trim();
            continue;
        }
        const headerMatch = trimmed.match(/^([A-Za-z]):\s*(.*)$/);
        if (headerMatch && /^[A-Za-z]$/.test(headerMatch[1])) {
            const key = headerMatch[1];
            const value = headerMatch[2].trim();
            if (key === "V") {
                const m = value.match(/^(\S+)\s*(.*)$/);
                if (!m) {
                    continue;
                }
                currentVoiceId = m[1];
                if (!declaredVoiceIds.includes(currentVoiceId)) {
                    declaredVoiceIds.push(currentVoiceId);
                }
                const rest = m[2].trim();
                const parsedVoice = parseVoiceDirectiveTail(rest);
                if (parsedVoice.name) {
                    voiceNameById[currentVoiceId] = parsedVoice.name;
                }
                if (parsedVoice.clef) {
                    voiceClefById[currentVoiceId] = parsedVoice.clef;
                }
                if (parsedVoice.bodyText) {
                    bodyEntries.push({ text: parsedVoice.bodyText, lineNo, voiceId: currentVoiceId });
                }
                continue;
            }
            headers[key] = value;
            continue;
        }
        if (!declaredVoiceIds.includes(currentVoiceId)) {
            declaredVoiceIds.push(currentVoiceId);
        }
        bodyEntries.push({ text: noComment, lineNo, voiceId: currentVoiceId });
    }
    if (bodyEntries.length === 0) {
        throw new Error("本文が見つかりません。ABCのノート列を入力してください。 (line 1)");
    }
    const meter = parseMeter(headers.M || "4/4", warnings);
    const unitLength = parseFraction(headers.L || "1/8", "L", warnings);
    const keyInfo = parseKey(headers.K || "C", warnings);
    const keySignatureAccidentals = keySignatureAlterByStep(keyInfo.fifths);
    const measuresByVoice = {};
    let noteCount = 0;
    function ensureVoice(voiceId) {
        if (!Object.prototype.hasOwnProperty.call(measuresByVoice, voiceId)) {
            measuresByVoice[voiceId] = [[]];
        }
        return measuresByVoice[voiceId];
    }
    for (const entry of bodyEntries) {
        const measures = ensureVoice(entry.voiceId);
        let currentMeasure = measures[measures.length - 1];
        let measureAccidentals = {};
        let lastNote = null;
        let lastEventNotes = [];
        let pendingTieToNext = false;
        let pendingRhythmScale = null;
        let tupletRemaining = 0;
        let tupletScale = null;
        let idx = 0;
        const text = entry.text;
        while (idx < text.length) {
            const ch = text[idx];
            if (ch === " " || ch === "\t") {
                idx += 1;
                continue;
            }
            if (ch === "," || ch === "'") {
                // Lenient compatibility: some real-world sources include standalone octave marks.
                // They are non-standard in strict ABC, but skipping them improves interoperability.
                idx += 1;
                continue;
            }
            if (ch === "|" || ch === ":") {
                if (ch === "|" && (currentMeasure.length > 0 || measures.length === 0)) {
                    currentMeasure = [];
                    measures.push(currentMeasure);
                }
                if (ch === "|") {
                    measureAccidentals = {};
                    lastNote = null;
                }
                idx += 1;
                continue;
            }
            if (ch === ">" || ch === "<") {
                if (!lastEventNotes || lastEventNotes.length === 0 || lastEventNotes.some((n) => n.isRest)) {
                    warnings.push("line " + entry.lineNo + ": broken rhythm(" + ch + ") の前にノートがないためスキップしました。");
                    idx += 1;
                    continue;
                }
                const lastScale = ch === ">" ? { num: 3, den: 2 } : { num: 1, den: 2 };
                pendingRhythmScale = ch === ">" ? { num: 1, den: 2 } : { num: 3, den: 2 };
                scaleNotesDuration(lastEventNotes, lastScale);
                idx += 1;
                continue;
            }
            if (ch === "(") {
                const tupletMatch = text.slice(idx).match(/^\((\d)(?::(\d))?(?::(\d))?/);
                if (tupletMatch) {
                    const n = Number(tupletMatch[1] || 0);
                    const qRaw = tupletMatch[2] ? Number(tupletMatch[2]) : NaN;
                    const rRaw = tupletMatch[3] ? Number(tupletMatch[3]) : NaN;
                    const q = Number.isFinite(qRaw) && qRaw > 0 ? qRaw : (n === 3 ? 2 : n);
                    const r = Number.isFinite(rRaw) && rRaw > 0 ? rRaw : n;
                    if (n > 0 && q > 0 && r > 0) {
                        tupletScale = { num: q, den: n };
                        tupletRemaining = r;
                    }
                    else {
                        warnings.push("line " + entry.lineNo + ": 連符記法の解釈に失敗しました: " + tupletMatch[0]);
                    }
                    idx += tupletMatch[0].length;
                    continue;
                }
                warnings.push("line " + entry.lineNo + ": 非対応の連符記法をスキップしました: (");
                idx += 1;
                continue;
            }
            if (ch === "-") {
                if (lastNote && !lastNote.isRest) {
                    lastNote.tieStart = true;
                    pendingTieToNext = true;
                }
                else {
                    warnings.push("line " + entry.lineNo + ": tie(-) の前にノートがないためスキップしました。");
                }
                idx += 1;
                continue;
            }
            if (ch === "\"") {
                const endQuote = text.indexOf("\"", idx + 1);
                if (endQuote >= 0) {
                    idx = endQuote + 1;
                }
                else {
                    idx = text.length;
                }
                warnings.push("line " + entry.lineNo + ': インライン文字列("...")はスキップしました。');
                continue;
            }
            if (ch === "!" || ch === "+") {
                const endMark = text.indexOf(ch, idx + 1);
                if (endMark >= 0) {
                    idx = endMark + 1;
                }
                else {
                    idx += 1;
                }
                warnings.push("line " + entry.lineNo + ": 装飾記法をスキップしました: " + ch + "..." + ch);
                continue;
            }
            if (ch === "[") {
                const chordResult = parseChordAt(text, idx, entry.lineNo);
                if (!chordResult) {
                    warnings.push("line " + entry.lineNo + ": 和音記法の解釈に失敗したためスキップしました。");
                    idx += 1;
                    continue;
                }
                idx = chordResult.nextIdx;
                let chordLength = parseLengthToken(chordResult.lengthToken, entry.lineNo);
                if (!chordResult.lengthToken && chordResult.notes.length > 0 && chordResult.notes[0].lengthToken) {
                    chordLength = parseLengthToken(chordResult.notes[0].lengthToken, entry.lineNo);
                }
                let absoluteLength = multiplyFractions(unitLength, chordLength);
                if (pendingRhythmScale) {
                    absoluteLength = multiplyFractions(absoluteLength, pendingRhythmScale);
                    pendingRhythmScale = null;
                }
                if (tupletRemaining > 0 && tupletScale) {
                    absoluteLength = multiplyFractions(absoluteLength, tupletScale);
                    tupletRemaining -= 1;
                    if (tupletRemaining <= 0) {
                        tupletScale = null;
                    }
                }
                if (idx < text.length && (text[idx] === ">" || text[idx] === "<")) {
                    const rhythmChar = text[idx];
                    idx += 1;
                    if (rhythmChar === ">") {
                        absoluteLength = multiplyFractions(absoluteLength, { num: 3, den: 2 });
                        pendingRhythmScale = { num: 1, den: 2 };
                    }
                    else {
                        absoluteLength = multiplyFractions(absoluteLength, { num: 1, den: 2 });
                        pendingRhythmScale = { num: 3, den: 2 };
                    }
                }
                const dur = durationInDivisions(absoluteLength, 960);
                if (dur <= 0) {
                    throw new Error("line " + entry.lineNo + ": 長さが不正です");
                }
                const chordNotes = [];
                for (let chordIndex = 0; chordIndex < chordResult.notes.length; chordIndex += 1) {
                    const chordNote = chordResult.notes[chordIndex];
                    const note = buildNoteData(chordNote.pitchChar, chordNote.accidentalText, chordNote.octaveShift, absoluteLength, dur, entry.lineNo, keySignatureAccidentals, measureAccidentals);
                    note.voice = entry.voiceId;
                    if (chordIndex > 0) {
                        note.chord = true;
                    }
                    chordNotes.push(note);
                }
                if (pendingTieToNext && chordNotes.length > 0) {
                    chordNotes[0].tieStop = true;
                    pendingTieToNext = false;
                }
                for (const note of chordNotes) {
                    currentMeasure.push(note);
                }
                lastNote = chordNotes[0] || null;
                lastEventNotes = chordNotes;
                noteCount += chordNotes.length;
                continue;
            }
            if (ch === "]" || ch === ")" || ch === "{" || ch === "}") {
                warnings.push("line " + entry.lineNo + ": 非対応記法をスキップしました: " + ch);
                idx += 1;
                continue;
            }
            let accidentalText = "";
            while (idx < text.length && (text[idx] === "^" || text[idx] === "_" || text[idx] === "=")) {
                accidentalText += text[idx];
                idx += 1;
                if (accidentalText === "=" || accidentalText.startsWith("^") || accidentalText.startsWith("_")) {
                    if (accidentalText.length >= 2 && accidentalText[0] !== accidentalText[1]) {
                        break;
                    }
                    if (accidentalText.length >= 2 && accidentalText[0] === "=") {
                        accidentalText = "=";
                        break;
                    }
                }
            }
            const pitchChar = text[idx];
            if (!pitchChar || !/[A-Ga-gzZxX]/.test(pitchChar)) {
                throw new Error("line " + entry.lineNo + ": ノート/休符の解釈に失敗しました: " + text.slice(idx, idx + 12));
            }
            idx += 1;
            let octaveShift = "";
            while (idx < text.length && (text[idx] === "'" || text[idx] === ",")) {
                octaveShift += text[idx];
                idx += 1;
            }
            let lengthToken = "";
            const lengthMatch = text.slice(idx).match(/^(\d+\/\d+|\d+|\/\d+|\/)/);
            if (lengthMatch) {
                lengthToken = lengthMatch[1];
                idx += lengthToken.length;
            }
            const len = parseLengthToken(lengthToken, entry.lineNo);
            let absoluteLength = multiplyFractions(unitLength, len);
            if (pendingRhythmScale) {
                absoluteLength = multiplyFractions(absoluteLength, pendingRhythmScale);
                pendingRhythmScale = null;
            }
            if (tupletRemaining > 0 && tupletScale) {
                absoluteLength = multiplyFractions(absoluteLength, tupletScale);
                tupletRemaining -= 1;
                if (tupletRemaining <= 0) {
                    tupletScale = null;
                }
            }
            if (idx < text.length && (text[idx] === ">" || text[idx] === "<")) {
                const rhythmChar = text[idx];
                idx += 1;
                if (rhythmChar === ">") {
                    absoluteLength = multiplyFractions(absoluteLength, { num: 3, den: 2 });
                    pendingRhythmScale = { num: 1, den: 2 };
                }
                else {
                    absoluteLength = multiplyFractions(absoluteLength, { num: 1, den: 2 });
                    pendingRhythmScale = { num: 3, den: 2 };
                }
            }
            const dur = durationInDivisions(absoluteLength, 960);
            if (dur <= 0) {
                throw new Error("line " + entry.lineNo + ": 長さが不正です");
            }
            const note = buildNoteData(pitchChar, accidentalText, octaveShift, absoluteLength, dur, entry.lineNo, keySignatureAccidentals, measureAccidentals);
            if (pendingTieToNext && !note.isRest) {
                note.tieStop = true;
                pendingTieToNext = false;
            }
            else if (note.isRest && pendingTieToNext) {
                warnings.push("line " + entry.lineNo + ": tie(-) の後ろが休符のため tie を解除しました。");
                pendingTieToNext = false;
            }
            note.voice = entry.voiceId;
            currentMeasure.push(note);
            lastNote = note;
            lastEventNotes = [note];
            noteCount += 1;
        }
    }
    for (const voiceId of Object.keys(measuresByVoice)) {
        const measures = measuresByVoice[voiceId];
        while (measures.length > 1 && measures[measures.length - 1].length === 0) {
            measures.pop();
        }
    }
    if (noteCount === 0) {
        throw new Error("ノートまたは休符が見つかりませんでした。 (line 1)");
    }
    const orderedVoiceIds = parseScoreVoiceOrder(scoreDirective, declaredVoiceIds);
    const parts = orderedVoiceIds.map((voiceId, index) => {
        const partName = voiceNameById[voiceId] || ("Voice " + voiceId);
        return {
            partId: "P" + String(index + 1),
            partName,
            clef: voiceClefById[voiceId] || "",
            transpose: settings.inferTransposeFromPartName ? inferTransposeFromPartName(partName) : null,
            voiceId,
            measures: measuresByVoice[voiceId] || [[]]
        };
    });
    const measureCount = parts.reduce((acc, part) => Math.max(acc, part.measures.length), 0);
    return {
        meta: {
            title: headers.T || settings.defaultTitle,
            composer: headers.C || settings.defaultComposer,
            meter,
            meterText: headers.M || "4/4",
            unitLength,
            unitLengthText: headers.L || "1/8",
            keyInfo,
            keyText: headers.K || "C"
        },
        parts,
        measures: parts[0] ? parts[0].measures : [[]],
        voiceCount: parts.length,
        measureCount,
        noteCount,
        warnings
    };
}
function parseScoreVoiceOrder(raw, declaredVoiceIds) {
    const baseOrder = Array.from(declaredVoiceIds || []);
    if (!raw) {
        return baseOrder.length > 0 ? baseOrder : ["1"];
    }
    const ordered = [];
    const seen = new Set();
    const groupRegex = /\(([^)]*)\)|([^\s()]+)/g;
    let m;
    while ((m = groupRegex.exec(raw)) !== null) {
        const chunk = m[1] || m[2] || "";
        const ids = chunk
            .split(/\s+/)
            .map((v) => v.trim())
            .filter((v) => /^[A-Za-z0-9_.-]+$/.test(v));
        for (const id of ids) {
            if (!seen.has(id)) {
                seen.add(id);
                ordered.push(id);
            }
        }
    }
    for (const id of baseOrder) {
        if (!seen.has(id)) {
            seen.add(id);
            ordered.push(id);
        }
    }
    return ordered.length > 0 ? ordered : ["1"];
}
function parseVoiceDirectiveTail(raw) {
    if (!raw) {
        return { name: "", clef: "", bodyText: "" };
    }
    let bodyText = String(raw);
    let name = "";
    let clef = "";
    const attrRegex = /([A-Za-z][A-Za-z0-9_-]*)\s*=\s*("([^"]*)"|(\S+))/g;
    bodyText = bodyText.replace(attrRegex, (_full, key, _quotedValue, quotedInner, bareValue) => {
        const lowerKey = String(key).toLowerCase();
        if (lowerKey === "name") {
            name = quotedInner || bareValue || "";
        }
        else if (lowerKey === "clef") {
            clef = String(quotedInner || bareValue || "").trim().toLowerCase();
        }
        return " ";
    });
    return {
        name: name.trim(),
        clef: clef.trim(),
        bodyText: bodyText.trim()
    };
}
function inferTransposeFromPartName(partName) {
    if (!partName) {
        return null;
    }
    const normalized = String(partName).replace(/[♭]/g, "b").replace(/[♯]/g, "#");
    const m = normalized.match(/\bin\s+([A-Ga-g])([#b]?)/);
    if (!m) {
        return null;
    }
    const tonic = String(m[1]).toUpperCase() + (m[2] || "");
    const semitoneByTonic = {
        C: 0,
        "C#": 1,
        Db: 1,
        D: 2,
        "D#": 3,
        Eb: 3,
        E: 4,
        F: 5,
        "F#": 6,
        Gb: 6,
        G: 7,
        "G#": 8,
        Ab: 8,
        A: 9,
        "A#": 10,
        Bb: 10,
        B: 11
    };
    if (!Object.prototype.hasOwnProperty.call(semitoneByTonic, tonic)) {
        return null;
    }
    let chromatic = semitoneByTonic[tonic];
    if (chromatic > 6) {
        chromatic -= 12;
    }
    if (chromatic === 0) {
        return null;
    }
    return { chromatic };
}
function parseMeter(raw, warnings) {
    const normalized = String(raw || "").trim();
    if (normalized === "C") {
        return { beats: 4, beatType: 4 };
    }
    if (normalized === "C|") {
        return { beats: 2, beatType: 2 };
    }
    const m = normalized.match(/^(\d+)\/(\d+)$/);
    if (!m) {
        warnings.push("拍子 M: の形式が不正なため 4/4 を使用しました: " + raw);
        return { beats: 4, beatType: 4 };
    }
    return { beats: Number(m[1]), beatType: Number(m[2]) };
}
function parseFraction(raw, fieldName, warnings) {
    const parsed = abcCommon.parseFractionText(raw, { num: 1, den: 8 });
    if (parsed.num === 1 && parsed.den === 8 && !/^\s*\d+\/\d+\s*$/.test(String(raw || ""))) {
        warnings.push(fieldName + " の形式が不正なため 1/8 を使用しました: " + raw);
        return parsed;
    }
    const m = String(raw || "").match(/^\s*(\d+)\/(\d+)\s*$/);
    if (!m || !Number(m[1]) || !Number(m[2])) {
        warnings.push(fieldName + " の値が不正なため 1/8 を使用しました: " + raw);
        return { num: 1, den: 8 };
    }
    return parsed;
}
function parseKey(raw, warnings) {
    const key = raw.trim();
    const fifths = abcCommon.fifthsFromAbcKey(key);
    if (fifths !== null) {
        return { fifths };
    }
    warnings.push("K: 非対応キーのため C を使用しました: " + key);
    return { fifths: 0 };
}
function parseLengthToken(token, lineNo) {
    return abcCommon.parseAbcLengthToken(token, lineNo);
}
function parseChordAt(text, startIdx, lineNo) {
    if (text[startIdx] !== "[") {
        return null;
    }
    const closeIdx = text.indexOf("]", startIdx + 1);
    if (closeIdx < 0) {
        return null;
    }
    const inner = text.slice(startIdx + 1, closeIdx);
    const noteRegex = /(\^{1,2}|_{1,2}|=)?([A-Ga-g])([',]*)(\d+\/\d+|\d+|\/\d+|\/)?/g;
    const notes = [];
    let match;
    while ((match = noteRegex.exec(inner)) !== null) {
        notes.push({
            accidentalText: match[1] || "",
            pitchChar: match[2],
            octaveShift: match[3] || "",
            lengthToken: match[4] || ""
        });
    }
    if (notes.length === 0) {
        return null;
    }
    const after = text.slice(closeIdx + 1);
    const lengthMatch = after.match(/^(\d+\/\d+|\d+|\/\d+|\/)/);
    const lengthToken = lengthMatch ? lengthMatch[1] : "";
    const nextIdx = closeIdx + 1 + (lengthMatch ? lengthMatch[1].length : 0);
    return {
        notes,
        lengthToken,
        nextIdx
    };
}
function scaleNotesDuration(notes, scale) {
    if (!Array.isArray(notes) || notes.length === 0 || !scale) {
        return;
    }
    for (const note of notes) {
        note.duration = Math.max(1, Math.round(note.duration * (scale.num / scale.den)));
        note.type = typeFromDuration(note.duration, 960);
    }
}
function accidentalToAlter(accidental) {
    if (!accidental) {
        return null;
    }
    if (accidental === "=") {
        return 0;
    }
    if (/^\^+$/.test(accidental)) {
        return accidental.length;
    }
    if (/^_+$/.test(accidental)) {
        return -accidental.length;
    }
    return null;
}
function buildNoteData(pitchChar, accidental, octaveShift, absoluteLength, duration, lineNo, keySignatureAccidentals, measureAccidentals) {
    const isRest = /[zZxX]/.test(pitchChar);
    if (isRest) {
        return {
            isRest: true,
            duration,
            type: typeFromFraction(absoluteLength)
        };
    }
    const step = pitchChar.toUpperCase();
    const isLower = /[a-g]/.test(pitchChar);
    let octave = isLower ? 5 : 4;
    for (const ch of octaveShift) {
        if (ch === "'") {
            octave += 1;
        }
        else if (ch === ",") {
            octave -= 1;
        }
    }
    if (octave < 0 || octave > 9) {
        throw new Error("line " + lineNo + ": オクターブが範囲外です");
    }
    let alter = null;
    let accidentalText = null;
    const explicitAlter = accidentalToAlter(accidental);
    if (explicitAlter !== null) {
        alter = explicitAlter;
        if (explicitAlter === 0) {
            accidentalText = "natural";
        }
        else if (explicitAlter > 0) {
            accidentalText = explicitAlter >= 2 ? "double-sharp" : "sharp";
        }
        else {
            accidentalText = explicitAlter <= -2 ? "flat-flat" : "flat";
        }
        measureAccidentals[step] = explicitAlter;
    }
    else {
        let resolvedAlter = 0;
        if (Object.prototype.hasOwnProperty.call(measureAccidentals, step)) {
            resolvedAlter = measureAccidentals[step];
        }
        else if (Object.prototype.hasOwnProperty.call(keySignatureAccidentals, step)) {
            resolvedAlter = keySignatureAccidentals[step];
        }
        alter = resolvedAlter === 0 ? null : resolvedAlter;
    }
    return {
        isRest: false,
        step,
        octave,
        alter,
        accidentalText,
        duration,
        type: typeFromFraction(absoluteLength)
    };
}
function keySignatureAlterByStep(fifths) {
    const map = {};
    const sharpOrder = ["F", "C", "G", "D", "A", "E", "B"];
    const flatOrder = ["B", "E", "A", "D", "G", "C", "F"];
    const f = Number.isFinite(fifths) ? Math.max(-7, Math.min(7, Math.trunc(fifths))) : 0;
    if (f > 0) {
        for (let i = 0; i < f; i += 1) {
            map[sharpOrder[i]] = 1;
        }
    }
    else if (f < 0) {
        for (let i = 0; i < Math.abs(f); i += 1) {
            map[flatOrder[i]] = -1;
        }
    }
    return map;
}
function typeFromFraction(frac) {
    const value = frac.num / frac.den;
    if (value >= 1) {
        return "whole";
    }
    if (value >= 0.5) {
        return "half";
    }
    if (value >= 0.25) {
        return "quarter";
    }
    if (value >= 0.125) {
        return "eighth";
    }
    if (value >= 0.0625) {
        return "16th";
    }
    return "32nd";
}
function durationInDivisions(wholeFraction, divisionsPerQuarter) {
    return Math.round((wholeFraction.num / wholeFraction.den) * 4 * divisionsPerQuarter);
}
function typeFromDuration(duration, divisionsPerQuarter) {
    const whole = Number(duration) / (4 * divisionsPerQuarter);
    if (whole >= 1) {
        return "whole";
    }
    if (whole >= 0.5) {
        return "half";
    }
    if (whole >= 0.25) {
        return "quarter";
    }
    if (whole >= 0.125) {
        return "eighth";
    }
    if (whole >= 0.0625) {
        return "16th";
    }
    return "32nd";
}
function multiplyFractions(a, b) {
    return abcCommon.multiplyFractions(a, b, { num: 1, den: 1 });
}
exports.AbcCompatParser = {
    parseForMusicXml
};
if (typeof window !== "undefined") {
    window.AbcCompatParser = exports.AbcCompatParser;
}

  },
  "src/ts/abc-common.js": function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbcCommon = void 0;
const DEFAULT_UNIT = { num: 1, den: 8 };
const DEFAULT_RATIO = { num: 1, den: 1 };
const gcd = (a, b) => {
    let x = Math.abs(Number(a) || 0);
    let y = Math.abs(Number(b) || 0);
    while (y !== 0) {
        const t = x % y;
        x = y;
        y = t;
    }
    return x || 1;
};
const reduceFraction = (num, den, fallback = DEFAULT_RATIO) => {
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) {
        return { num: fallback.num, den: fallback.den };
    }
    const sign = den < 0 ? -1 : 1;
    const n = num * sign;
    const d = den * sign;
    const g = gcd(n, d);
    return { num: n / g, den: d / g };
};
const multiplyFractions = (a, b, fallback = DEFAULT_RATIO) => {
    return reduceFraction(a.num * b.num, a.den * b.den, fallback);
};
const divideFractions = (a, b, fallback = DEFAULT_RATIO) => {
    return reduceFraction(a.num * b.den, a.den * b.num, fallback);
};
const parseFractionText = (text, fallback = DEFAULT_UNIT) => {
    const m = String(text || "").match(/^\s*(\d+)\/(\d+)\s*$/);
    if (!m) {
        return { num: fallback.num, den: fallback.den };
    }
    const num = Number.parseInt(m[1], 10);
    const den = Number.parseInt(m[2], 10);
    if (!num || !den) {
        return { num: fallback.num, den: fallback.den };
    }
    return reduceFraction(num, den, fallback);
};
const parseAbcLengthToken = (token, lineNo) => {
    if (!token) {
        return { num: 1, den: 1 };
    }
    if (token === "/") {
        return { num: 1, den: 2 };
    }
    if (/^\d+$/.test(token)) {
        return { num: Number(token), den: 1 };
    }
    if (/^\/\d+$/.test(token)) {
        return { num: 1, den: Number(token.slice(1)) };
    }
    if (/^\d+\/\d+$/.test(token)) {
        const p = token.split("/");
        return reduceFraction(Number(p[0]), Number(p[1]), { num: 1, den: 1 });
    }
    throw new Error(`line ${lineNo}: 長さ指定を解釈できません: ${token}`);
};
const abcLengthTokenFromFraction = (ratio) => {
    const reduced = reduceFraction(ratio.num, ratio.den, { num: 1, den: 1 });
    if (reduced.num === reduced.den)
        return "";
    if (reduced.den === 1)
        return String(reduced.num);
    if (reduced.num === 1 && reduced.den === 2)
        return "/";
    if (reduced.num === 1)
        return `/${reduced.den}`;
    return `${reduced.num}/${reduced.den}`;
};
const abcPitchFromStepOctave = (step, octave) => {
    const upperStep = String(step || "").toUpperCase();
    if (!/^[A-G]$/.test(upperStep)) {
        return "C";
    }
    if (octave >= 5) {
        return upperStep.toLowerCase() + "'".repeat(octave - 5);
    }
    return upperStep + ",".repeat(Math.max(0, 4 - octave));
};
const accidentalFromAlter = (alter) => {
    if (alter === 0)
        return "";
    if (alter > 0)
        return "^".repeat(Math.min(2, alter));
    return "_".repeat(Math.min(2, Math.abs(alter)));
};
const keyFromFifthsMode = (fifths, mode) => {
    const major = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
    const minor = ["Abm", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m"];
    const idx = Number(fifths) + 7;
    if (idx < 0 || idx >= major.length) {
        return "C";
    }
    const lowerMode = String(mode || "").toLowerCase();
    if (lowerMode === "minor") {
        return minor[idx];
    }
    return major[idx];
};
const fifthsFromAbcKey = (raw) => {
    const table = {
        C: 0,
        G: 1,
        D: 2,
        A: 3,
        E: 4,
        B: 5,
        "F#": 6,
        "C#": 7,
        F: -1,
        Bb: -2,
        Eb: -3,
        Ab: -4,
        Db: -5,
        Gb: -6,
        Cb: -7,
        Am: 0,
        Em: 1,
        Bm: 2,
        "F#m": 3,
        "C#m": 4,
        "G#m": 5,
        "D#m": 6,
        "A#m": 7,
        Dm: -1,
        Gm: -2,
        Cm: -3,
        Fm: -4,
        Bbm: -5,
        Ebm: -6,
        Abm: -7,
    };
    const normalized = String(raw || "").trim().replace(/\s+/g, "");
    if (Object.prototype.hasOwnProperty.call(table, normalized)) {
        return table[normalized];
    }
    return null;
};
exports.AbcCommon = {
    gcd,
    reduceFraction,
    multiplyFractions,
    divideFractions,
    parseFractionText,
    parseAbcLengthToken,
    abcLengthTokenFromFraction,
    abcPitchFromStepOctave,
    accidentalFromAlter,
    keyFromFifthsMode,
    fifthsFromAbcKey,
};
if (typeof window !== "undefined") {
    window.AbcCommon = exports.AbcCommon;
}

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
exports.measureHasBackupOrForward = exports.findAncestorMeasure = exports.replaceWithRestNote = exports.createRestElement = exports.createNoteElement = exports.isUnsupportedNoteKind = exports.setPitch = exports.getDurationNotationHint = exports.setDurationValue = exports.getDurationValue = exports.getVoiceText = exports.reindexNodeIds = exports.serializeXml = exports.parseXml = void 0;
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
    syncSimpleTypeFromDuration(note, duration);
};
exports.setDurationValue = setDurationValue;
const getDurationNotationHint = (note, duration) => {
    if (!Number.isInteger(duration) || duration <= 0)
        return null;
    const divisions = resolveEffectiveDivisions(note);
    if (divisions === null || !Number.isInteger(divisions) || divisions <= 0)
        return null;
    return durationToNotation(duration, divisions);
};
exports.getDurationNotationHint = getDurationNotationHint;
const setPitch = (note, pitch) => {
    const restNode = getDirectChild(note, "rest");
    if (restNode)
        restNode.remove();
    let pitchNode = getDirectChild(note, "pitch");
    if (!pitchNode) {
        pitchNode = note.ownerDocument.createElement("pitch");
        // Keep patch local by adding pitch near start, but do not reorder siblings.
        note.insertBefore(pitchNode, note.firstChild);
    }
    upsertSimpleChild(pitchNode, "step", pitch.step);
    if (typeof pitch.alter === "number") {
        upsertSimpleChild(pitchNode, "alter", String(pitch.alter));
        upsertSimpleChild(note, "accidental", accidentalFromAlter(pitch.alter));
    }
    else {
        const alter = getDirectChild(pitchNode, "alter");
        if (alter)
            alter.remove();
        const accidental = getDirectChild(note, "accidental");
        if (accidental)
            accidental.remove();
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
    if (typeof pitch.alter === "number") {
        upsertSimpleChild(note, "accidental", accidentalFromAlter(pitch.alter));
    }
    const durationNode = doc.createElement("duration");
    durationNode.textContent = String(duration);
    note.appendChild(durationNode);
    const voiceNode = doc.createElement("voice");
    voiceNode.textContent = voice;
    note.appendChild(voiceNode);
    return note;
};
exports.createNoteElement = createNoteElement;
const createRestElement = (doc, voice, duration) => {
    const note = doc.createElement("note");
    const restNode = doc.createElement("rest");
    note.appendChild(restNode);
    const durationNode = doc.createElement("duration");
    durationNode.textContent = String(duration);
    note.appendChild(durationNode);
    const voiceNode = doc.createElement("voice");
    voiceNode.textContent = voice;
    note.appendChild(voiceNode);
    return note;
};
exports.createRestElement = createRestElement;
const replaceWithRestNote = (note, fallbackVoice = "1", forcedDuration) => {
    var _a;
    const doc = note.ownerDocument;
    const pitchNode = getDirectChild(note, "pitch");
    if (pitchNode)
        pitchNode.remove();
    const accidentalNode = getDirectChild(note, "accidental");
    if (accidentalNode)
        accidentalNode.remove();
    const chordNode = getDirectChild(note, "chord");
    if (chordNode)
        chordNode.remove();
    // Remove tie markers that no longer make sense after replacing with rest.
    Array.from(note.children)
        .filter((child) => child.tagName === "tie")
        .forEach((child) => child.remove());
    const notations = getDirectChild(note, "notations");
    if (notations) {
        Array.from(notations.children)
            .filter((child) => child.tagName === "tied")
            .forEach((child) => child.remove());
        if (notations.children.length === 0) {
            notations.remove();
        }
    }
    let restNode = getDirectChild(note, "rest");
    if (!restNode) {
        restNode = doc.createElement("rest");
        const durationNode = getDirectChild(note, "duration");
        if (durationNode) {
            note.insertBefore(restNode, durationNode);
        }
        else {
            note.insertBefore(restNode, note.firstChild);
        }
    }
    let durationNode = getDirectChild(note, "duration");
    if (!durationNode) {
        durationNode = doc.createElement("duration");
        note.appendChild(durationNode);
    }
    const duration = Number.isInteger(forcedDuration) && (forcedDuration !== null && forcedDuration !== void 0 ? forcedDuration : 0) > 0
        ? forcedDuration
        : ((_a = (0, exports.getDurationValue)(note)) !== null && _a !== void 0 ? _a : 1);
    durationNode.textContent = String(duration);
    let voiceNode = getDirectChild(note, "voice");
    if (!voiceNode) {
        voiceNode = doc.createElement("voice");
        voiceNode.textContent = fallbackVoice;
        note.appendChild(voiceNode);
    }
};
exports.replaceWithRestNote = replaceWithRestNote;
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
const accidentalFromAlter = (alter) => {
    if (alter <= -2)
        return "flat-flat";
    if (alter === -1)
        return "flat";
    if (alter === 0)
        return "natural";
    if (alter === 1)
        return "sharp";
    return "double-sharp";
};
const syncSimpleTypeFromDuration = (note, duration) => {
    if (!Number.isInteger(duration) || duration <= 0)
        return;
    const divisions = resolveEffectiveDivisions(note);
    if (divisions === null || !Number.isInteger(divisions) || divisions <= 0)
        return;
    const notation = durationToNotation(duration, divisions);
    if (!notation)
        return;
    upsertSimpleChild(note, "type", notation.type);
    Array.from(note.children)
        .filter((child) => child.tagName === "dot" || child.tagName === "time-modification")
        .forEach((child) => child.remove());
    for (let i = 0; i < notation.dotCount; i += 1) {
        const dot = note.ownerDocument.createElement("dot");
        note.appendChild(dot);
    }
    if (notation.triplet) {
        const tm = note.ownerDocument.createElement("time-modification");
        const actual = note.ownerDocument.createElement("actual-notes");
        actual.textContent = "3";
        const normal = note.ownerDocument.createElement("normal-notes");
        normal.textContent = "2";
        tm.appendChild(actual);
        tm.appendChild(normal);
        note.appendChild(tm);
    }
};
const resolveEffectiveDivisions = (note) => {
    var _a, _b, _c;
    const measure = (0, exports.findAncestorMeasure)(note);
    if (!measure)
        return null;
    const part = measure.parentElement;
    if (!part || part.tagName !== "part")
        return null;
    const measures = Array.from(part.children).filter((child) => child.tagName === "measure");
    const measureIndex = measures.indexOf(measure);
    if (measureIndex < 0)
        return null;
    let divisions = null;
    for (let i = measureIndex; i >= 0; i -= 1) {
        const candidate = measures[i];
        const text = (_c = (_b = (_a = candidate.querySelector("attributes > divisions")) === null || _a === void 0 ? void 0 : _a.textContent) === null || _b === void 0 ? void 0 : _b.trim()) !== null && _c !== void 0 ? _c : "";
        const n = Number(text);
        if (Number.isInteger(n) && n > 0) {
            divisions = n;
            break;
        }
    }
    return divisions;
};
const durationToNotation = (duration, divisions) => {
    const defs = [
        { num: 4, den: 1, type: "whole", dotCount: 0, triplet: false },
        { num: 3, den: 1, type: "half", dotCount: 1, triplet: false },
        { num: 2, den: 1, type: "half", dotCount: 0, triplet: false },
        { num: 4, den: 3, type: "half", dotCount: 0, triplet: true },
        { num: 3, den: 2, type: "quarter", dotCount: 1, triplet: false },
        { num: 1, den: 1, type: "quarter", dotCount: 0, triplet: false },
        { num: 2, den: 3, type: "quarter", dotCount: 0, triplet: true },
        { num: 3, den: 4, type: "eighth", dotCount: 1, triplet: false },
        { num: 1, den: 2, type: "eighth", dotCount: 0, triplet: false },
        { num: 1, den: 3, type: "eighth", dotCount: 0, triplet: true },
        { num: 3, den: 8, type: "16th", dotCount: 1, triplet: false },
        { num: 1, den: 4, type: "16th", dotCount: 0, triplet: false },
        { num: 1, den: 6, type: "16th", dotCount: 0, triplet: true },
        { num: 1, den: 8, type: "32nd", dotCount: 0, triplet: false },
        { num: 1, den: 16, type: "64th", dotCount: 0, triplet: false },
    ];
    for (const def of defs) {
        const value = (divisions * def.num) / def.den;
        if (!Number.isInteger(value) || value <= 0)
            continue;
        if (duration === value) {
            return { type: def.type, dotCount: def.dotCount, triplet: def.triplet };
        }
    }
    return null;
};

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
        var _a;
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
        const noteKindDiagnostic = (0, validators_1.validateSupportedNoteKind)(command, target);
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
            if (command.type === "change_to_pitch") {
                (0, xmlUtils_1.setPitch)(target, command.pitch);
            }
            else if (command.type === "change_duration") {
                const durationNotation = (0, xmlUtils_1.getDurationNotationHint)(target, command.duration);
                if ((durationNotation === null || durationNotation === void 0 ? void 0 : durationNotation.triplet) &&
                    !measureVoiceHasTupletContext(target, command.voice)) {
                    return this.fail("MVP_INVALID_COMMAND_PAYLOAD", "この小節/voice には3連コンテキストがないため、3連音価は適用できません。");
                }
                const oldDuration = (_a = (0, xmlUtils_1.getDurationValue)(target)) !== null && _a !== void 0 ? _a : 0;
                const timing = (0, timeIndex_1.getMeasureTimingForVoice)(target, command.voice);
                let underfullDelta = 0;
                let projectedWarning = null;
                if (timing) {
                    const projected = timing.occupied - oldDuration + command.duration;
                    const overflow = projected - timing.capacity;
                    if (overflow > 0) {
                        const consumedAfter = consumeFollowingRestsForDurationExpansion(target, command.voice, overflow);
                        const remainingAfter = overflow - consumedAfter;
                        const consumedBefore = remainingAfter > 0
                            ? consumePrecedingRestsForDurationExpansion(target, command.voice, remainingAfter)
                            : 0;
                        const consumed = consumedAfter + consumedBefore;
                        if (consumed < overflow) {
                            const result = (0, validators_1.validateProjectedMeasureTiming)(target, command.voice, projected);
                            if (result.diagnostic)
                                return this.failWith(result.diagnostic);
                        }
                    }
                    const timingAfterRestAdjust = (0, timeIndex_1.getMeasureTimingForVoice)(target, command.voice);
                    const adjustedProjected = timingAfterRestAdjust
                        ? timingAfterRestAdjust.occupied - oldDuration + command.duration
                        : projected;
                    const result = (0, validators_1.validateProjectedMeasureTiming)(target, command.voice, adjustedProjected);
                    if (result.diagnostic)
                        return this.failWith(result.diagnostic);
                    projectedWarning = result.warning;
                    if (adjustedProjected < timing.capacity) {
                        underfullDelta = timing.capacity - adjustedProjected;
                    }
                }
                (0, xmlUtils_1.setDurationValue)(target, command.duration);
                if (underfullDelta > 0) {
                    const filled = fillUnderfullGapAfterTarget(target, command.voice, underfullDelta);
                    if (!filled && projectedWarning) {
                        warnings.push(projectedWarning);
                    }
                }
                else if (projectedWarning) {
                    warnings.push(projectedWarning);
                }
            }
            else if (command.type === "split_note") {
                const currentDuration = (0, xmlUtils_1.getDurationValue)(target);
                if (!Number.isInteger(currentDuration) || (currentDuration !== null && currentDuration !== void 0 ? currentDuration : 0) <= 1) {
                    return this.fail("MVP_INVALID_COMMAND_PAYLOAD", "split_note requires duration >= 2.");
                }
                if (currentDuration % 2 !== 0) {
                    return this.fail("MVP_INVALID_COMMAND_PAYLOAD", "split_note requires an even duration value.");
                }
                const half = currentDuration / 2;
                const duplicated = target.cloneNode(true);
                // Attach clone first so duration->notation sync can resolve measure divisions.
                target.after(duplicated);
                (0, xmlUtils_1.setDurationValue)(target, half);
                (0, xmlUtils_1.setDurationValue)(duplicated, half);
                insertedNode = duplicated;
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
                const nextChordTone = findImmediateNextChordTone(target);
                if (nextChordTone) {
                    // Deleting a chord head must not inject a timed rest.
                    // Promote the next chord tone to chord head and remove only target pitch.
                    const chordMarker = nextChordTone.querySelector(":scope > chord");
                    if (chordMarker)
                        chordMarker.remove();
                    target.remove();
                    removedNodeId = targetId;
                }
                else {
                    const duration = (0, xmlUtils_1.getDurationValue)(target);
                    if (duration === null || duration <= 0) {
                        return this.fail("MVP_INVALID_NOTE_DURATION", "Target note has invalid duration.");
                    }
                    (0, xmlUtils_1.replaceWithRestNote)(target, command.voice, duration);
                }
            }
        }
        catch (_b) {
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
        var _a, _b;
        if (command.type === "insert_note_after") {
            const insertedId = insertedNode ? (_a = this.nodeToId.get(insertedNode)) !== null && _a !== void 0 ? _a : null : null;
            return insertedId ? [targetId, insertedId] : [targetId];
        }
        if (command.type === "delete_note") {
            return removedNodeId ? [removedNodeId] : [targetId];
        }
        if (command.type === "split_note") {
            const insertedId = insertedNode ? (_b = this.nodeToId.get(insertedNode)) !== null && _b !== void 0 ? _b : null : null;
            return insertedId ? [targetId, insertedId] : [targetId];
        }
        return [targetId];
    }
}
exports.ScoreCore = ScoreCore;
const hasDirectChild = (node, tagName) => Array.from(node.children).some((child) => child.tagName === tagName);
const findImmediateNextChordTone = (note) => {
    const next = note.nextElementSibling;
    if (!next || next.tagName !== "note")
        return null;
    if (!hasDirectChild(next, "chord"))
        return null;
    return next;
};
const consumeFollowingRestsForDurationExpansion = (target, voice, overflow) => {
    var _a;
    if (!Number.isInteger(overflow) || overflow <= 0)
        return 0;
    let remaining = overflow;
    let cursor = target.nextElementSibling;
    while (cursor && remaining > 0) {
        const next = cursor.nextElementSibling;
        if (cursor.tagName === "backup" || cursor.tagName === "forward")
            break;
        if (cursor.tagName !== "note") {
            cursor = next;
            continue;
        }
        const noteVoice = (0, xmlUtils_1.getVoiceText)(cursor);
        if (noteVoice !== voice) {
            cursor = next;
            continue;
        }
        const isRest = cursor.querySelector(":scope > rest") !== null;
        const isChord = cursor.querySelector(":scope > chord") !== null;
        const duration = (_a = (0, xmlUtils_1.getDurationValue)(cursor)) !== null && _a !== void 0 ? _a : 0;
        if (!isRest || isChord || duration <= 0) {
            cursor = next;
            continue;
        }
        if (duration <= remaining) {
            remaining -= duration;
            cursor.remove();
        }
        else {
            (0, xmlUtils_1.setDurationValue)(cursor, duration - remaining);
            remaining = 0;
        }
        cursor = next;
    }
    return overflow - remaining;
};
const consumePrecedingRestsForDurationExpansion = (target, voice, overflow) => {
    var _a;
    if (!Number.isInteger(overflow) || overflow <= 0)
        return 0;
    let remaining = overflow;
    let cursor = target.previousElementSibling;
    while (cursor && remaining > 0) {
        const prev = cursor.previousElementSibling;
        if (cursor.tagName === "backup" || cursor.tagName === "forward")
            break;
        if (cursor.tagName !== "note") {
            cursor = prev;
            continue;
        }
        const noteVoice = (0, xmlUtils_1.getVoiceText)(cursor);
        if (noteVoice !== voice) {
            cursor = prev;
            continue;
        }
        const isRest = cursor.querySelector(":scope > rest") !== null;
        const isChord = cursor.querySelector(":scope > chord") !== null;
        const duration = (_a = (0, xmlUtils_1.getDurationValue)(cursor)) !== null && _a !== void 0 ? _a : 0;
        if (!isRest || isChord || duration <= 0) {
            cursor = prev;
            continue;
        }
        if (duration <= remaining) {
            remaining -= duration;
            cursor.remove();
        }
        else {
            (0, xmlUtils_1.setDurationValue)(cursor, duration - remaining);
            remaining = 0;
        }
        cursor = prev;
    }
    return overflow - remaining;
};
const fillUnderfullGapAfterTarget = (target, voice, deficit) => {
    var _a;
    if (!Number.isInteger(deficit) || deficit <= 0)
        return true;
    const measure = (0, xmlUtils_1.findAncestorMeasure)(target);
    if (!measure)
        return false;
    if ((0, xmlUtils_1.measureHasBackupOrForward)(measure))
        return false;
    // Keep rhythmic gap close to the edited note to avoid visual/timing drift.
    const next = target.nextElementSibling;
    if (next && next.tagName === "note" && (0, xmlUtils_1.getVoiceText)(next) === voice) {
        const isRest = next.querySelector(":scope > rest") !== null;
        const isChord = next.querySelector(":scope > chord") !== null;
        if (isRest && !isChord) {
            const current = (_a = (0, xmlUtils_1.getDurationValue)(next)) !== null && _a !== void 0 ? _a : 0;
            (0, xmlUtils_1.setDurationValue)(next, current + deficit);
            return true;
        }
    }
    const rest = (0, xmlUtils_1.createRestElement)(target.ownerDocument, voice, deficit);
    target.after(rest);
    // Ensure notation metadata (<type>/<dot>/<time-modification>) is consistent for Verovio.
    (0, xmlUtils_1.setDurationValue)(rest, deficit);
    return true;
};
const measureVoiceHasTupletContext = (target, voice) => {
    const measure = (0, xmlUtils_1.findAncestorMeasure)(target);
    if (!measure)
        return false;
    const notes = Array.from(measure.children).filter((child) => child.tagName === "note");
    for (const note of notes) {
        if ((0, xmlUtils_1.getVoiceText)(note) !== voice)
            continue;
        if (note.querySelector(":scope > time-modification"))
            return true;
        if (note.querySelector(":scope > notations > tuplet"))
            return true;
    }
    return false;
};

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
    if (command.type === "change_to_pitch") {
        if (!isValidPitch(command.pitch)) {
            return {
                code: "MVP_INVALID_COMMAND_PAYLOAD",
                message: "change_to_pitch.pitch is invalid.",
            };
        }
    }
    return null;
};
exports.validateCommandPayload = validateCommandPayload;
const validateSupportedNoteKind = (command, note) => {
    // Allow rest -> pitched note conversion via change_to_pitch.
    if (command.type === "change_to_pitch") {
        const hasUnsupportedExceptRest = note.querySelector(":scope > grace") !== null ||
            note.querySelector(":scope > cue") !== null ||
            note.querySelector(":scope > chord") !== null;
        if (!hasUnsupportedExceptRest)
            return null;
    }
    else if (!(0, xmlUtils_1.isUnsupportedNoteKind)(note)) {
        return null;
    }
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
    if (command.type !== "insert_note_after" &&
        command.type !== "delete_note" &&
        command.type !== "split_note") {
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
    if (command.type === "split_note") {
        if (next && isBackupOrForward(next)) {
            return {
                code: "MVP_UNSUPPORTED_NON_EDITABLE_VOICE",
                message: "Split point crosses a backup/forward boundary in MVP.",
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
        case "change_to_pitch":
        case "change_duration":
        case "delete_note":
        case "split_note":
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
