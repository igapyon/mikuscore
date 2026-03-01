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
import { convertMeiToMusicXml, exportMusicXmlDomToMei } from "./mei-io";
import { convertLilyPondToMusicXml, exportMusicXmlDomToLilyPond } from "./lilypond-io";
import { convertMuseScoreToMusicXml, exportMusicXmlDomToMuseScore } from "./musescore-io";
import {
  convertMusicXmlToVsqx,
  convertVsqxToMusicXml,
  installVsqxMusicXmlNormalizationHook,
} from "./vsqx-io";
import {
  applyImplicitBeamsToMusicXmlText,
  buildRenderDocWithNodeIds,
  extractMeasureEditorDocument,
  normalizeImportedMusicXmlText,
  parseMusicXmlDocument,
  prettyPrintMusicXmlText,
  replaceMeasureInMainDocument,
  serializeMusicXmlDocument,
} from "./musicxml-io";
import {
  createAbcDownloadPayload,
  createLilyPondDownloadPayload,
  createMuseScoreDownloadPayload,
  createMeiDownloadPayload,
  createMidiDownloadPayload,
  createMusicXmlDownloadPayload,
  createSvgDownloadPayload,
  createVsqxDownloadPayload,
  createZipBundleDownloadPayload,
  triggerFileDownload,
} from "./download-flow";
import { normalizeMidiExportProfile, type MidiExportProfile } from "./midi-musescore-io";
import { resolveLoadFlow } from "./load-flow";
import { extractZipEntryBytesByPath, listZipRootEntryPathsByExtensions } from "./mxl-io";
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
import { sampleXml2 } from "./sampleXml2";
import {
  buildPlaybackEventsFromMusicXmlDoc,
  convertMidiToMusicXml,
  type GraceTimingMode,
  type MidiImportQuantizeGrid,
  type MetricAccentProfile,
  type MidiProgramPreset,
} from "./midi-io";

type UiState = {
  loaded: boolean;
  selectedNodeId: string | null;
  noteNodeIds: string[];
  lastDispatchResult: DispatchResult | null;
  lastSaveResult: SaveResult | null;
  lastSuccessfulSaveXml: string;
  importWarningSummary: string;
};

type NoteLocation = {
  partId: string;
  measureNumber: string;
};

type EditSubTabName = "editor" | "xml";

const DEFAULT_VOICE = "1";

const q = <T extends Element>(selector: string): T => {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el as T;
};
const qo = <T extends Element>(selector: string): T | null => {
  return document.querySelector(selector) as T | null;
};

const inputEntryFile = q<HTMLInputElement>("#inputEntryFile");
const inputEntrySource = q<HTMLInputElement>("#inputEntrySource");
const inputEntryNew = q<HTMLInputElement>("#inputEntryNew");
const sourceTypeBlock = q<HTMLDivElement>("#sourceTypeBlock");
const sourceTypeXml = q<HTMLInputElement>("#sourceTypeXml");
const sourceTypeMuseScore = q<HTMLInputElement>("#sourceTypeMuseScore");
const sourceTypeVsqx = q<HTMLInputElement>("#sourceTypeVsqx");
const sourceTypeAbc = q<HTMLInputElement>("#sourceTypeAbc");
const sourceTypeMei = q<HTMLInputElement>("#sourceTypeMei");
const sourceTypeLilyPond = q<HTMLInputElement>("#sourceTypeLilyPond");
const newInputBlock = q<HTMLDivElement>("#newInputBlock");
const newTemplatePianoGrandStaff = q<HTMLInputElement>("#newTemplatePianoGrandStaff");
const newPartCountInput = q<HTMLInputElement>("#newPartCount");
const newKeyFifthsSelect = q<HTMLSelectElement>("#newKeyFifths");
const newTimeBeatsInput = q<HTMLInputElement>("#newTimeBeats");
const newTimeBeatTypeSelect = q<HTMLSelectElement>("#newTimeBeatType");
const newPartClefList = q<HTMLDivElement>("#newPartClefList");
const fileInputBlock = q<HTMLDivElement>("#fileInputBlock");
const sourceXmlInputBlock = q<HTMLDivElement>("#sourceXmlInputBlock");
const abcInputBlock = q<HTMLDivElement>("#abcInputBlock");
const museScoreInputBlock = q<HTMLDivElement>("#museScoreInputBlock");
const vsqxInputBlock = q<HTMLDivElement>("#vsqxInputBlock");
const meiInputBlock = q<HTMLDivElement>("#meiInputBlock");
const lilyPondInputBlock = q<HTMLDivElement>("#lilyPondInputBlock");
const xmlInput = q<HTMLTextAreaElement>("#xmlInput");
const abcInput = q<HTMLTextAreaElement>("#abcInput");
const museScoreInput = q<HTMLTextAreaElement>("#museScoreInput");
const vsqxInput = q<HTMLTextAreaElement>("#vsqxInput");
const meiInput = q<HTMLTextAreaElement>("#meiInput");
const lilyPondInput = q<HTMLTextAreaElement>("#lilyPondInput");
const localDraftNotice = q<HTMLDivElement>("#localDraftNotice");
const localDraftText = q<HTMLDivElement>("#localDraftText");
const discardDraftExportBtn = q<HTMLButtonElement>("#discardDraftExportBtn");
const loadSampleBtn1 = q<HTMLButtonElement>("#loadSampleBtn1");
const loadSample2Btn = q<HTMLButtonElement>("#loadSample2Btn");
const fileSelectBtn = q<HTMLButtonElement>("#fileSelectBtn");
const fileInput = q<HTMLInputElement>("#fileInput");
const fileNameText = q<HTMLSpanElement>("#fileNameText");
const zipEntrySelectBlock = q<HTMLDivElement>("#zipEntrySelectBlock");
const zipEntrySelect = q<HTMLSelectElement>("#zipEntrySelect");
const fileLoadOverlay = q<HTMLDivElement>("#fileLoadOverlay");
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
const scoreEditBtn = q<HTMLButtonElement>("#scoreEditBtn");
const exportPlayBtn = q<HTMLButtonElement>("#exportPlayBtn");
const exportStopBtn = q<HTMLButtonElement>("#exportStopBtn");
const downloadSvgBtn = q<HTMLButtonElement>("#downloadSvgBtn");
const playbackWaveform = q<HTMLSelectElement>("#playbackWaveform");
const playbackUseMidiLike = q<HTMLInputElement>("#playbackUseMidiLike");
const graceTimingModeSelect = q<HTMLSelectElement>("#graceTimingMode");
const metricAccentEnabledInput = q<HTMLInputElement>("#metricAccentEnabled");
const metricAccentProfileSelect = q<HTMLSelectElement>("#metricAccentProfile");
const midiProgramSelect = q<HTMLSelectElement>("#midiProgramSelect");
const midiExportProfileSelect = q<HTMLSelectElement>("#midiExportProfile");
const midiImportQuantizeGridSelect = q<HTMLSelectElement>("#midiImportQuantizeGrid");
const midiImportTripletAware = q<HTMLInputElement>("#midiImportTripletAware");
const forceMidiProgramOverride = q<HTMLInputElement>("#forceMidiProgramOverride");
const keepMksMetaMetadataInMusicXml = q<HTMLInputElement>("#keepMksMetaMetadataInMusicXml");
const keepMksSrcMetadataInMusicXml = q<HTMLInputElement>("#keepMksSrcMetadataInMusicXml");
const keepMksDbgMetadataInMusicXml = q<HTMLInputElement>("#keepMksDbgMetadataInMusicXml");
const exportMusicXmlAsXmlExtension = q<HTMLInputElement>("#exportMusicXmlAsXmlExtension");
const compressXmlMuseScoreExport = q<HTMLInputElement>("#compressXmlMuseScoreExport");
const generalSettingsAccordion = q<HTMLDetailsElement>("#generalSettingsAccordion");
const settingsAccordion = q<HTMLDetailsElement>("#settingsAccordion");
const resetPlaybackSettingsBtn = q<HTMLButtonElement>("#resetPlaybackSettingsBtn");
const downloadBtn = q<HTMLButtonElement>("#downloadBtn");
const downloadMidiBtn = q<HTMLButtonElement>("#downloadMidiBtn");
const downloadVsqxBtn = q<HTMLButtonElement>("#downloadVsqxBtn");
const downloadAbcBtn = q<HTMLButtonElement>("#downloadAbcBtn");
const downloadMeiBtn = q<HTMLButtonElement>("#downloadMeiBtn");
const downloadLilyPondBtn = q<HTMLButtonElement>("#downloadLilyPondBtn");
const downloadMuseScoreBtn = q<HTMLButtonElement>("#downloadMuseScoreBtn");
const downloadAllBtn = q<HTMLButtonElement>("#downloadAllBtn");
const saveModeText = qo<HTMLSpanElement>("#saveModeText");
const playbackText = qo<HTMLParagraphElement>("#playbackText");
const outputXml = qo<HTMLTextAreaElement>("#outputXml");
const diagArea = qo<HTMLDivElement>("#diagArea");
const debugScoreMeta = qo<HTMLParagraphElement>("#debugScoreMeta");
const debugScoreArea = q<HTMLDivElement>("#debugScoreArea");
const scoreHeaderMetaText = q<HTMLParagraphElement>("#scoreHeaderMetaText");
const inputUiMessage = q<HTMLDivElement>("#inputUiMessage");
const uiMessage = q<HTMLDivElement>("#uiMessage");
const measurePartNameText = q<HTMLParagraphElement>("#measurePartNameText");
const measureEmptyState = q<HTMLDivElement>("#measureEmptyState");
const measureSelectGuideBtn = q<HTMLButtonElement>("#measureSelectGuideBtn");
const measureEditorWrap = q<HTMLDivElement>("#measureEditorWrap");
const measureEditorArea = q<HTMLDivElement>("#measureEditorArea");
const editSubTabList = q<HTMLDivElement>("#editSubTabList");
const editSubTabEditorBtn = q<HTMLButtonElement>("#editSubTabEditorBtn");
const editSubTabXmlBtn = q<HTMLButtonElement>("#editSubTabXmlBtn");
const editSubTabEditorPanel = q<HTMLDivElement>("#editSubTabEditorPanel");
const editSubTabXmlPanel = q<HTMLDivElement>("#editSubTabXmlPanel");
const measureXmlInspector = q<HTMLDivElement>("#measureXmlInspector");
const measureXmlMeasureViewer = q<HTMLTextAreaElement>("#measureXmlMeasureViewer");
const measureXmlDocumentViewer = q<HTMLTextAreaElement>("#measureXmlDocumentViewer");
const measureApplyBtn = q<HTMLButtonElement>("#measureApplyBtn");
const measureDiscardBtn = q<HTMLButtonElement>("#measureDiscardBtn");
const measureNavLeftBtn = q<HTMLButtonElement>("#measureNavLeftBtn");
const measureNavDownBtn = q<HTMLButtonElement>("#measureNavDownBtn");
const measureNavUpBtn = q<HTMLButtonElement>("#measureNavUpBtn");
const measureNavRightBtn = q<HTMLButtonElement>("#measureNavRightBtn");
const appendMeasureBtn = q<HTMLButtonElement>("#appendMeasureBtn");
const playMeasureBtn = q<HTMLButtonElement>("#playMeasureBtn");
const downloadMeasureMusicXmlBtn = q<HTMLButtonElement>("#downloadMeasureMusicXmlBtn");
const downloadMeasureMidiBtn = q<HTMLButtonElement>("#downloadMeasureMidiBtn");
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
  importWarningSummary: "",
};

let isPlaying = false;
const DEBUG_LOG = false;
let verovioRenderSeq = 0;
let currentSvgIdToNodeId = new Map<string, string>();
let nodeIdToLocation = new Map<string, NoteLocation>();
let partIdToName = new Map<string, string>();
let partOrder: string[] = [];
let measureNumbersByPart = new Map<string, string[]>();
let scoreTitleText = "";
let scoreComposerText = "";
let selectedMeasure: NoteLocation | null = null;
let draftCore: ScoreCore | null = null;
let draftNoteNodeIds: string[] = [];
let draftSvgIdToNodeId = new Map<string, string>();
let activeEditSubTab: EditSubTabName = "editor";
let selectedDraftVoice = DEFAULT_VOICE;
let selectedDraftNoteIsRest = false;
let suppressDurationPresetEvent = false;
let selectedDraftDurationValue: number | null = null;
let isFileLoadInProgress = false;
const NOTE_CLICK_SNAP_PX = 170;
const DEFAULT_DIVISIONS = 480;
const MAX_NEW_PARTS = 16;
const LOCAL_DRAFT_STORAGE_KEY = "mikuscore.localDraft.v1";
const PLAYBACK_SETTINGS_STORAGE_KEY = "mikuscore.playbackSettings.v1";
const DEFAULT_MIDI_PROGRAM: MidiProgramPreset = "electric_piano_2";
const DEFAULT_PLAYBACK_WAVEFORM: "sine" | "triangle" | "square" = "triangle";
const DEFAULT_PLAYBACK_USE_MIDI_LIKE = true;
const DEFAULT_FORCE_MIDI_PROGRAM_OVERRIDE = false;
const DEFAULT_MIDI_EXPORT_PROFILE: MidiExportProfile = "musescore_parity";
const ZIP_IMPORT_EXTENSIONS = [
  ".musicxml",
  ".xml",
  ".mxl",
  ".abc",
  ".mid",
  ".midi",
  ".vsqx",
  ".mei",
  ".ly",
  ".mscx",
  ".mscz",
] as const;
let selectedZipEntryVirtualFile: File | null = null;
const DEFAULT_MIDI_IMPORT_QUANTIZE_GRID: MidiImportQuantizeGrid = "1/64";
const DEFAULT_MIDI_IMPORT_TRIPLET_AWARE = true;
const DEFAULT_KEEP_MKS_META_METADATA_IN_MUSICXML = true;
const DEFAULT_KEEP_MKS_SRC_METADATA_IN_MUSICXML = true;
const DEFAULT_KEEP_MKS_DBG_METADATA_IN_MUSICXML = true;
const DEFAULT_EXPORT_MUSICXML_AS_XML_EXTENSION = false;
const DEFAULT_COMPRESS_XML_MUSESCORE_EXPORT = true;
const DEFAULT_GRACE_TIMING_MODE: GraceTimingMode = "before_beat";
const DEFAULT_METRIC_ACCENT_ENABLED = true;
const DEFAULT_METRIC_ACCENT_PROFILE: MetricAccentProfile = "subtle";
const DEFAULT_VSQX_LYRIC = "ら";

type LocalDraft = {
  xml: string;
  updatedAt: number;
};

type PlaybackSettings = {
  midiProgram: MidiProgramPreset;
  waveform: "sine" | "triangle" | "square";
  useMidiLikePlayback: boolean;
  graceTimingMode: GraceTimingMode;
  metricAccentEnabled: boolean;
  metricAccentProfile: MetricAccentProfile;
  midiExportProfile: MidiExportProfile;
  midiImportQuantizeGrid: MidiImportQuantizeGrid;
  midiImportTripletAware: boolean;
  forceMidiProgramOverride: boolean;
  keepMksMetaMetadataInMusicXml: boolean;
  keepMksSrcMetadataInMusicXml: boolean;
  keepMksDbgMetadataInMusicXml: boolean;
  exportMusicXmlAsXmlExtension: boolean;
  compressXmlMuseScoreExport: boolean;
  generalSettingsExpanded: boolean;
  settingsExpanded: boolean;
};

const normalizeMidiProgram = (value: string): PlaybackSettings["midiProgram"] => {
  switch (value) {
    case "acoustic_grand_piano":
    case "electric_piano_1":
    case "electric_piano_2":
    case "honky_tonk_piano":
    case "harpsichord":
    case "clavinet":
    case "drawbar_organ":
    case "acoustic_guitar_nylon":
    case "acoustic_bass":
    case "violin":
    case "string_ensemble_1":
    case "synth_brass_1":
      return value;
    default:
      return DEFAULT_MIDI_PROGRAM;
  }
};

const normalizeWaveformSetting = (value: string): PlaybackSettings["waveform"] => {
  if (value === "triangle" || value === "square") return value;
  return DEFAULT_PLAYBACK_WAVEFORM;
};

const normalizeForceMidiProgramOverride = (value: unknown): boolean => {
  return value === true;
};

const normalizeKeepMksMetadataInMusicXml = (value: unknown): boolean => {
  return value !== false;
};

const normalizeCompressXmlMuseScoreExport = (value: unknown): boolean => {
  return value === true;
};

const normalizeExportMusicXmlAsXmlExtension = (value: unknown): boolean => {
  return value === true;
};

const normalizeUseMidiLikePlayback = (value: unknown): boolean => {
  return value !== false;
};

const normalizeGraceTimingMode = (value: unknown): GraceTimingMode => {
  if (value === "on_beat" || value === "classical_equal") return value;
  return DEFAULT_GRACE_TIMING_MODE;
};

const normalizeMetricAccentEnabled = (value: unknown): boolean => {
  return value === true;
};

const normalizeMetricAccentProfile = (value: unknown): MetricAccentProfile => {
  if (value === "balanced" || value === "strong") return value;
  return DEFAULT_METRIC_ACCENT_PROFILE;
};

const normalizeMidiImportQuantizeGrid = (value: unknown): MidiImportQuantizeGrid => {
  if (value === "1/8" || value === "1/16" || value === "1/32" || value === "1/64") return value;
  return DEFAULT_MIDI_IMPORT_QUANTIZE_GRID;
};

const normalizeMidiImportTripletAware = (value: unknown): boolean => {
  return value !== false;
};

const readPlaybackSettings = (): PlaybackSettings | null => {
  try {
    const raw = localStorage.getItem(PLAYBACK_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlaybackSettings> & { keepMetadataInMusicXml?: unknown };
    const legacyKeepMetadataInMusicXml = normalizeKeepMksMetadataInMusicXml(parsed.keepMetadataInMusicXml);
    return {
      midiProgram: normalizeMidiProgram(String(parsed.midiProgram ?? "")),
      waveform: normalizeWaveformSetting(String(parsed.waveform ?? "")),
      useMidiLikePlayback: normalizeUseMidiLikePlayback(parsed.useMidiLikePlayback),
      graceTimingMode: normalizeGraceTimingMode(parsed.graceTimingMode),
      metricAccentEnabled: normalizeMetricAccentEnabled(parsed.metricAccentEnabled),
      metricAccentProfile: normalizeMetricAccentProfile(parsed.metricAccentProfile),
      midiExportProfile: normalizeMidiExportProfile(parsed.midiExportProfile),
      midiImportQuantizeGrid: normalizeMidiImportQuantizeGrid(parsed.midiImportQuantizeGrid),
      midiImportTripletAware: normalizeMidiImportTripletAware(parsed.midiImportTripletAware),
      forceMidiProgramOverride: normalizeForceMidiProgramOverride(parsed.forceMidiProgramOverride),
      keepMksMetaMetadataInMusicXml:
        parsed.keepMksMetaMetadataInMusicXml === undefined
          ? legacyKeepMetadataInMusicXml
          : normalizeKeepMksMetadataInMusicXml(parsed.keepMksMetaMetadataInMusicXml),
      keepMksSrcMetadataInMusicXml:
        parsed.keepMksSrcMetadataInMusicXml === undefined
          ? legacyKeepMetadataInMusicXml
          : normalizeKeepMksMetadataInMusicXml(parsed.keepMksSrcMetadataInMusicXml),
      keepMksDbgMetadataInMusicXml:
        parsed.keepMksDbgMetadataInMusicXml === undefined
          ? legacyKeepMetadataInMusicXml
          : normalizeKeepMksMetadataInMusicXml(parsed.keepMksDbgMetadataInMusicXml),
      exportMusicXmlAsXmlExtension: normalizeExportMusicXmlAsXmlExtension(parsed.exportMusicXmlAsXmlExtension),
      compressXmlMuseScoreExport: normalizeCompressXmlMuseScoreExport(parsed.compressXmlMuseScoreExport),
      generalSettingsExpanded: Boolean(parsed.generalSettingsExpanded),
      settingsExpanded: Boolean(parsed.settingsExpanded),
    };
  } catch {
    return null;
  }
};

const writePlaybackSettings = (): void => {
  syncGeneralExportSettings();
  try {
    const payload: PlaybackSettings = {
      midiProgram: normalizeMidiProgram(midiProgramSelect.value),
      waveform: normalizeWaveformSetting(playbackWaveform.value),
      useMidiLikePlayback: playbackUseMidiLike.checked,
      graceTimingMode: normalizeGraceTimingMode(graceTimingModeSelect.value),
      metricAccentEnabled: metricAccentEnabledInput.checked,
      metricAccentProfile: normalizeMetricAccentProfile(metricAccentProfileSelect.value),
      midiExportProfile: normalizeMidiExportProfile(midiExportProfileSelect.value),
      midiImportQuantizeGrid: normalizeMidiImportQuantizeGrid(midiImportQuantizeGridSelect.value),
      midiImportTripletAware: midiImportTripletAware.checked,
      forceMidiProgramOverride: forceMidiProgramOverride.checked,
      keepMksMetaMetadataInMusicXml: keepMksMetaMetadataInMusicXml.checked,
      keepMksSrcMetadataInMusicXml: keepMksSrcMetadataInMusicXml.checked,
      keepMksDbgMetadataInMusicXml: keepMksDbgMetadataInMusicXml.checked,
      exportMusicXmlAsXmlExtension: exportMusicXmlAsXmlExtension.checked,
      compressXmlMuseScoreExport: compressXmlMuseScoreExport.checked,
      generalSettingsExpanded: generalSettingsAccordion.open,
      settingsExpanded: settingsAccordion.open,
    };
    localStorage.setItem(PLAYBACK_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore quota/security errors in MVP.
  }
};

const syncGeneralExportSettings = (): void => {
  const useXmlExtension = exportMusicXmlAsXmlExtension.checked;
  if (useXmlExtension) {
    compressXmlMuseScoreExport.checked = false;
  }
};

const applyInitialPlaybackSettings = (): void => {
  const stored = readPlaybackSettings();
  midiProgramSelect.value = stored?.midiProgram ?? DEFAULT_MIDI_PROGRAM;
  playbackWaveform.value = stored?.waveform ?? DEFAULT_PLAYBACK_WAVEFORM;
  playbackUseMidiLike.checked = stored?.useMidiLikePlayback ?? DEFAULT_PLAYBACK_USE_MIDI_LIKE;
  graceTimingModeSelect.value = stored?.graceTimingMode ?? DEFAULT_GRACE_TIMING_MODE;
  metricAccentEnabledInput.checked = stored?.metricAccentEnabled ?? DEFAULT_METRIC_ACCENT_ENABLED;
  metricAccentProfileSelect.value = stored?.metricAccentProfile ?? DEFAULT_METRIC_ACCENT_PROFILE;
  midiExportProfileSelect.value = stored?.midiExportProfile ?? DEFAULT_MIDI_EXPORT_PROFILE;
  midiImportQuantizeGridSelect.value =
    stored?.midiImportQuantizeGrid ?? DEFAULT_MIDI_IMPORT_QUANTIZE_GRID;
  midiImportTripletAware.checked =
    stored?.midiImportTripletAware ?? DEFAULT_MIDI_IMPORT_TRIPLET_AWARE;
  forceMidiProgramOverride.checked =
    stored?.forceMidiProgramOverride ?? DEFAULT_FORCE_MIDI_PROGRAM_OVERRIDE;
  keepMksMetaMetadataInMusicXml.checked =
    stored?.keepMksMetaMetadataInMusicXml ?? DEFAULT_KEEP_MKS_META_METADATA_IN_MUSICXML;
  keepMksSrcMetadataInMusicXml.checked =
    stored?.keepMksSrcMetadataInMusicXml ?? DEFAULT_KEEP_MKS_SRC_METADATA_IN_MUSICXML;
  keepMksDbgMetadataInMusicXml.checked =
    stored?.keepMksDbgMetadataInMusicXml ?? DEFAULT_KEEP_MKS_DBG_METADATA_IN_MUSICXML;
  exportMusicXmlAsXmlExtension.checked =
    stored?.exportMusicXmlAsXmlExtension ?? DEFAULT_EXPORT_MUSICXML_AS_XML_EXTENSION;
  compressXmlMuseScoreExport.checked =
    stored?.compressXmlMuseScoreExport ?? DEFAULT_COMPRESS_XML_MUSESCORE_EXPORT;
  syncGeneralExportSettings();
  generalSettingsAccordion.open = stored?.generalSettingsExpanded ?? false;
  settingsAccordion.open = stored?.settingsExpanded ?? false;
};

const onResetPlaybackSettings = (): void => {
  midiProgramSelect.value = DEFAULT_MIDI_PROGRAM;
  playbackWaveform.value = DEFAULT_PLAYBACK_WAVEFORM;
  playbackUseMidiLike.checked = DEFAULT_PLAYBACK_USE_MIDI_LIKE;
  graceTimingModeSelect.value = DEFAULT_GRACE_TIMING_MODE;
  metricAccentEnabledInput.checked = DEFAULT_METRIC_ACCENT_ENABLED;
  metricAccentProfileSelect.value = DEFAULT_METRIC_ACCENT_PROFILE;
  midiExportProfileSelect.value = DEFAULT_MIDI_EXPORT_PROFILE;
  midiImportQuantizeGridSelect.value = DEFAULT_MIDI_IMPORT_QUANTIZE_GRID;
  midiImportTripletAware.checked = DEFAULT_MIDI_IMPORT_TRIPLET_AWARE;
  forceMidiProgramOverride.checked = DEFAULT_FORCE_MIDI_PROGRAM_OVERRIDE;
  keepMksMetaMetadataInMusicXml.checked = DEFAULT_KEEP_MKS_META_METADATA_IN_MUSICXML;
  keepMksSrcMetadataInMusicXml.checked = DEFAULT_KEEP_MKS_SRC_METADATA_IN_MUSICXML;
  keepMksDbgMetadataInMusicXml.checked = DEFAULT_KEEP_MKS_DBG_METADATA_IN_MUSICXML;
  exportMusicXmlAsXmlExtension.checked = DEFAULT_EXPORT_MUSICXML_AS_XML_EXTENSION;
  compressXmlMuseScoreExport.checked = DEFAULT_COMPRESS_XML_MUSESCORE_EXPORT;
  syncGeneralExportSettings();
  writePlaybackSettings();
  renderControlState();
};

type MksMetadataOutputSettings = {
  keepMeta: boolean;
  keepSrc: boolean;
  keepDbg: boolean;
};

const getMksMetadataOutputSettings = (): MksMetadataOutputSettings => {
  return {
    keepMeta: keepMksMetaMetadataInMusicXml.checked,
    keepSrc: keepMksSrcMetadataInMusicXml.checked,
    keepDbg: keepMksDbgMetadataInMusicXml.checked,
  };
};

const shouldRemoveMksField = (fieldName: string, settings: MksMetadataOutputSettings): boolean => {
  const lowered = fieldName.trim().toLowerCase();
  if (!lowered.startsWith("mks:")) return false;
  if (lowered.startsWith("mks:meta:")) return !settings.keepMeta;
  if (lowered.startsWith("mks:src:")) return !settings.keepSrc;
  if (lowered.startsWith("mks:dbg:")) return !settings.keepDbg;
  return false;
};

const stripMetadataFromMusicXml = (xml: string, settings: MksMetadataOutputSettings): string => {
  if (settings.keepMeta && settings.keepSrc && settings.keepDbg) return xml;
  const doc = parseMusicXmlDocument(xml);
  if (!doc) return xml;
  const fields = Array.from(
    doc.querySelectorAll(
      'part > measure > attributes > miscellaneous > miscellaneous-field[name^="mks:"]'
    )
  );
  for (const field of fields) {
    const name = field.getAttribute("name") ?? "";
    if (!shouldRemoveMksField(name, settings)) continue;
    field.remove();
  }
  for (const misc of Array.from(doc.querySelectorAll("part > measure > attributes > miscellaneous"))) {
    if (misc.querySelector("miscellaneous-field")) continue;
    misc.remove();
  }
  for (const attributes of Array.from(doc.querySelectorAll("part > measure > attributes"))) {
    if (attributes.children.length > 0) continue;
    attributes.remove();
  }
  return serializeMusicXmlDocument(doc);
};

const summarizeImportedDiagWarnings = (xml: string): string => {
  const doc = parseMusicXmlDocument(xml);
  if (!doc) return "";
  let overfullReflowCount = 0;
  let parserWarningCount = 0;
  const fields = Array.from(doc.querySelectorAll('miscellaneous-field[name^="mks:diag:"]'));
  for (const field of fields) {
    const name = (field.getAttribute("name") || "").trim().toLowerCase();
    if (name === "mks:diag:count") continue;
    const payload = field.textContent?.trim() ?? "";
    const m = payload.match(/(?:^|;)code=([^;]+)/);
    const code = (m?.[1] ?? "").trim().toUpperCase();
    if (code === "OVERFULL_REFLOWED") overfullReflowCount += 1;
    if (code === "ABC_IMPORT_WARNING") parserWarningCount += 1;
  }
  const parts: string[] = [];
  if (overfullReflowCount > 0) parts.push(`ABC overfull auto-reflow: ${overfullReflowCount}`);
  if (parserWarningCount > 0) parts.push(`ABC parser warnings: ${parserWarningCount}`);
  return parts.join(" / ");
};

const resolveMusicXmlOutput = (): string => {
  if (!state.lastSuccessfulSaveXml) return "";
  return stripMetadataFromMusicXml(state.lastSuccessfulSaveXml, getMksMetadataOutputSettings());
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

const getSelectedSourceType = (): "xml" | "musescore" | "vsqx" | "abc" | "mei" | "lilypond" => {
  if (sourceTypeMuseScore.checked) return "musescore";
  if (sourceTypeVsqx.checked) return "vsqx";
  if (sourceTypeAbc.checked) return "abc";
  if (sourceTypeMei.checked) return "mei";
  if (sourceTypeLilyPond.checked) return "lilypond";
  return "xml";
};

const renderInputMode = (): void => {
  const isNewEntry = inputEntryNew.checked;
  const isFileEntry = inputEntryFile.checked;
  const isSourceEntry = inputEntrySource.checked;
  const sourceType = getSelectedSourceType();
  newInputBlock.classList.toggle("md-hidden", !isNewEntry);
  sourceTypeBlock.classList.toggle("md-hidden", !isSourceEntry);
  fileInputBlock.classList.toggle("md-hidden", !isFileEntry);
  sourceXmlInputBlock.classList.toggle("md-hidden", !isSourceEntry || sourceType !== "xml");
  museScoreInputBlock.classList.toggle("md-hidden", !isSourceEntry || sourceType !== "musescore");
  vsqxInputBlock.classList.toggle("md-hidden", !isSourceEntry || sourceType !== "vsqx");
  abcInputBlock.classList.toggle("md-hidden", !isSourceEntry || sourceType !== "abc");
  meiInputBlock.classList.toggle("md-hidden", !isSourceEntry || sourceType !== "mei");
  lilyPondInputBlock.classList.toggle("md-hidden", !isSourceEntry || sourceType !== "lilypond");

  sourceTypeXml.disabled = !isSourceEntry;
  sourceTypeMuseScore.disabled = !isSourceEntry;
  sourceTypeVsqx.disabled = !isSourceEntry;
  sourceTypeAbc.disabled = !isSourceEntry;
  sourceTypeMei.disabled = !isSourceEntry;
  sourceTypeLilyPond.disabled = !isSourceEntry;
  fileSelectBtn.classList.toggle("md-hidden", !isFileEntry);
  loadBtn.classList.toggle("md-hidden", isFileEntry);
  const loadLabel = loadBtn.querySelector("span");
  if (loadLabel) {
    loadLabel.textContent = isNewEntry ? "Create" : "Load";
  }

};

const resetZipEntrySelectionUi = (): void => {
  zipEntrySelect.innerHTML = "";
  zipEntrySelectBlock.classList.add("md-hidden");
  selectedZipEntryVirtualFile = null;
};

const setFileLoadInProgress = (inProgress: boolean): void => {
  isFileLoadInProgress = inProgress;
  fileSelectBtn.disabled = inProgress;
  loadBtn.disabled = inProgress;
  zipEntrySelect.disabled = inProgress;
  fileInputBlock.setAttribute("aria-busy", inProgress ? "true" : "false");
  fileLoadOverlay.classList.toggle("md-hidden", !inProgress);
  fileLoadOverlay.setAttribute("aria-hidden", inProgress ? "false" : "true");
};

const waitForNextPaint = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
};

const isZipFileName = (name: string): boolean => {
  return name.toLowerCase().endsWith(".zip");
};

const loadZipEntryAsVirtualFile = async (archive: File, entryPath: string): Promise<File> => {
  const entryBytes = await extractZipEntryBytesByPath(await archive.arrayBuffer(), entryPath);
  const copiedBuffer = new ArrayBuffer(entryBytes.byteLength);
  new Uint8Array(copiedBuffer).set(entryBytes);
  return new File([copiedBuffer], entryPath, { type: "application/octet-stream" });
};

const prepareZipEntrySelection = async (
  archive: File
): Promise<{ ok: true; autoLoad: boolean } | { ok: false; message: string }> => {
  resetZipEntrySelectionUi();
  let entryPaths: string[] = [];
  try {
    entryPaths = await listZipRootEntryPathsByExtensions(await archive.arrayBuffer(), [...ZIP_IMPORT_EXTENSIONS]);
  } catch (error) {
    return {
      ok: false,
      message: `Failed to parse ZIP: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (!entryPaths.length) {
    return {
      ok: false,
      message:
        "No supported root files were found in ZIP. Use root-level .musicxml, .xml, .mxl, .abc, .mid, .midi, .vsqx, .mei, .ly, .mscx, or .mscz.",
    };
  }
  zipEntrySelectBlock.classList.remove("md-hidden");
  if (entryPaths.length === 1) {
    const onlyOption = document.createElement("option");
    onlyOption.value = entryPaths[0];
    onlyOption.textContent = entryPaths[0];
    zipEntrySelect.appendChild(onlyOption);
    try {
      selectedZipEntryVirtualFile = await loadZipEntryAsVirtualFile(archive, entryPaths[0]);
      return { ok: true, autoLoad: true };
    } catch (error) {
      return {
        ok: false,
        message: `Failed to read ZIP entry: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a ZIP root entry";
  placeholder.disabled = true;
  placeholder.selected = true;
  zipEntrySelect.appendChild(placeholder);
  for (const path of entryPaths) {
    const option = document.createElement("option");
    option.value = path;
    option.textContent = path;
    zipEntrySelect.appendChild(option);
  }
  selectedZipEntryVirtualFile = null;
  return { ok: true, autoLoad: false };
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
  const usePianoGrandStaffTemplate = newTemplatePianoGrandStaff.checked;
  newPartCountInput.disabled = usePianoGrandStaffTemplate;
  if (usePianoGrandStaffTemplate) {
    newPartClefList.innerHTML = "";
    const message = document.createElement("div");
    message.className = "ms-field-label";
    message.textContent = "Template: single part with 2 staves (staff 1: treble, staff 2: bass).";
    newPartClefList.appendChild(message);
    return;
  }
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

const renderScoreHeaderMeta = (): void => {
  if (!state.loaded) {
    scoreHeaderMetaText.textContent = "";
    scoreHeaderMetaText.classList.add("md-hidden");
    return;
  }
  const title = scoreTitleText || "Untitled";
  const composer = scoreComposerText || "Unknown";
  scoreHeaderMetaText.textContent = `Title: ${title} / Composer: ${composer}`;
  scoreHeaderMetaText.classList.remove("md-hidden");
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
    measurePartNameText.textContent = "";
    measurePartNameText.classList.add("md-hidden");
    measureEmptyState.classList.remove("md-hidden");
    measureEditorWrap.classList.add("md-hidden");
    measureXmlMeasureViewer.value = "";
    measureXmlDocumentViewer.value = "";
    renderEditSubTabState(false);
    measureApplyBtn.disabled = true;
    measureDiscardBtn.disabled = true;
    return;
  }

  const partName = partIdToName.get(selectedMeasure.partId) ?? selectedMeasure.partId;
  measurePartNameText.textContent = partName;
  measurePartNameText.classList.remove("md-hidden");
  measureEmptyState.classList.add("md-hidden");
  measureEditorWrap.classList.remove("md-hidden");
  renderEditSubTabState(true);
  const inspectorText = buildMeasureXmlInspectorText();
  measureXmlMeasureViewer.value = inspectorText.measureOnly;
  measureXmlDocumentViewer.value = inspectorText.selfContainedDocument;
  const hasDirtyDraft = draftCore.isDirty();
  measureDiscardBtn.disabled = !hasDirtyDraft;
  measureApplyBtn.disabled = !hasDirtyDraft;
};

const serializeElementXml = (element: Element): string => {
  return new XMLSerializer().serializeToString(element);
};

const collectEffectiveSrcFieldsForSelectedMeasure = (): Array<{ name: string; value: string }> => {
  if (!selectedMeasure) return [];
  const xml = core.debugSerializeCurrentXml() ?? "";
  if (!xml) return [];
  const sourceDoc = parseMusicXmlDocument(xml);
  if (!sourceDoc) return [];
  const part = sourceDoc.querySelector(`score-partwise > part[id="${CSS.escape(selectedMeasure.partId)}"]`);
  if (!part) return [];

  const latestByName = new Map<string, string>();
  for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
    const attrs = measure.querySelector(":scope > attributes");
    if (attrs) {
      const srcFields = attrs.querySelectorAll(
        ':scope > miscellaneous > miscellaneous-field[name^="mks:src:mei:"]'
      );
      for (const field of Array.from(srcFields)) {
        const name = (field.getAttribute("name") ?? "").trim();
        if (!name) continue;
        latestByName.set(name, field.textContent?.trim() ?? "");
      }
    }
    if ((measure.getAttribute("number") ?? "") === selectedMeasure.measureNumber) {
      break;
    }
  }
  return Array.from(latestByName.entries()).map(([name, value]) => ({ name, value }));
};

const injectSrcFieldsIntoSelfContainedXml = (
  selfContainedXml: string,
  fields: Array<{ name: string; value: string }>
): string => {
  if (fields.length === 0) return selfContainedXml;
  const doc = parseMusicXmlDocument(selfContainedXml);
  if (!doc) return selfContainedXml;
  const measure = doc.querySelector("part > measure");
  if (!measure) return selfContainedXml;

  let attrs = measure.querySelector(":scope > attributes");
  if (!attrs) {
    attrs = doc.createElement("attributes");
    measure.insertBefore(attrs, measure.firstChild);
  }
  let miscellaneous = attrs.querySelector(":scope > miscellaneous");
  if (!miscellaneous) {
    miscellaneous = doc.createElement("miscellaneous");
    attrs.appendChild(miscellaneous);
  }

  const existingNames = new Set(
    Array.from(miscellaneous.querySelectorAll(":scope > miscellaneous-field"))
      .map((field) => (field.getAttribute("name") ?? "").trim())
      .filter(Boolean)
  );
  for (const field of fields) {
    if (existingNames.has(field.name)) continue;
    const node = doc.createElement("miscellaneous-field");
    node.setAttribute("name", field.name);
    node.textContent = field.value;
    miscellaneous.appendChild(node);
    existingNames.add(field.name);
  }
  return serializeMusicXmlDocument(doc);
};

const buildMeasureXmlInspectorText = (): { measureOnly: string; selfContainedDocument: string } => {
  if (!draftCore) {
    return { measureOnly: "", selfContainedDocument: "" };
  }
  const draftXml = draftCore.debugSerializeCurrentXml() ?? "";
  const draftDoc = parseMusicXmlDocument(draftXml);
  const measureOnly = draftDoc
    ? prettyPrintMusicXmlText(serializeElementXml(draftDoc.querySelector("part > measure") ?? draftDoc.documentElement)).trim()
    : draftXml;
  const srcFields = collectEffectiveSrcFieldsForSelectedMeasure();
  const xmlWithSrc = injectSrcFieldsIntoSelfContainedXml(draftXml, srcFields);
  const prettyDoc = prettyPrintMusicXmlText(xmlWithSrc).trim();
  return {
    measureOnly: measureOnly || draftXml,
    selfContainedDocument: prettyDoc || xmlWithSrc,
  };
};

const activateEditSubTab = (tabName: EditSubTabName): void => {
  activeEditSubTab = tabName;
  renderEditSubTabState(Boolean(selectedMeasure && draftCore));
};

const renderEditSubTabState = (hasMeasure: boolean): void => {
  editSubTabList.classList.remove("md-hidden");
  editSubTabEditorBtn.disabled = false;
  editSubTabEditorPanel.classList.toggle("md-hidden", !hasMeasure || activeEditSubTab !== "editor");
  editSubTabXmlPanel.classList.toggle("md-hidden", activeEditSubTab !== "xml");
  measureXmlInspector.classList.toggle("md-hidden", activeEditSubTab !== "xml");

  const editorActive = hasMeasure && activeEditSubTab === "editor";
  const xmlActive = activeEditSubTab === "xml";
  editSubTabEditorBtn.classList.toggle("is-active", editorActive);
  editSubTabXmlBtn.classList.toggle("is-active", xmlActive);
  editSubTabEditorBtn.setAttribute("aria-selected", editorActive ? "true" : "false");
  editSubTabXmlBtn.setAttribute("aria-selected", xmlActive ? "true" : "false");
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
  const messageTargets = [inputUiMessage, uiMessage];
  for (const target of messageTargets) {
    target.classList.remove("ms-ui-message--error", "ms-ui-message--warning");
    target.textContent = "";
  }

  const showMessage = (kind: "error" | "warning", text: string): void => {
    const className = kind === "error" ? "ms-ui-message--error" : "ms-ui-message--warning";
    for (const target of messageTargets) {
      target.textContent = text;
      target.classList.add(className);
      target.classList.remove("md-hidden");
    }
  };

  const dispatch = state.lastDispatchResult;
  if (dispatch) {
    if (!dispatch.ok && dispatch.diagnostics.length > 0) {
      const d = dispatch.diagnostics[0];
      showMessage("error", `Error: ${d.message} (${d.code})`);
      return;
    }
    if (dispatch.warnings.length > 0) {
      const w = dispatch.warnings[0];
      showMessage("warning", `Warning: ${w.message} (${w.code})`);
      return;
    }
  }

  const save = state.lastSaveResult;
  if (save && !save.ok && save.diagnostics.length > 0) {
    const d = save.diagnostics[0];
    showMessage("error", `Error: ${d.message} (${d.code})`);
    return;
  }

  if (state.importWarningSummary) {
    showMessage("warning", `Warning: ${state.importWarningSummary}`);
    return;
  }

  for (const target of messageTargets) {
    target.classList.add("md-hidden");
  }
};

const renderOutput = (): void => {
  if (saveModeText) {
    saveModeText.textContent = state.lastSaveResult ? state.lastSaveResult.mode : "-";
  }
  if (outputXml) {
    outputXml.value = state.lastSaveResult?.ok ? resolveMusicXmlOutput() : "";
  }
  downloadBtn.disabled = !state.lastSaveResult?.ok;
  downloadMidiBtn.disabled = !state.lastSaveResult?.ok;
  downloadVsqxBtn.disabled = !state.lastSaveResult?.ok;
  downloadAbcBtn.disabled = !state.lastSaveResult?.ok;
  downloadMeiBtn.disabled = !state.lastSaveResult?.ok;
  downloadLilyPondBtn.disabled = !state.lastSaveResult?.ok;
  downloadMuseScoreBtn.disabled = !state.lastSaveResult?.ok;
  downloadAllBtn.disabled = !state.lastSaveResult?.ok;
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
  downloadMeasureMusicXmlBtn.disabled = !hasDraft;
  downloadMeasureMidiBtn.disabled = !hasDraft;
  playBtn.disabled = !state.loaded || isPlaying;
  stopBtn.disabled = !isPlaying;
  scoreEditBtn.disabled = !state.loaded || !selectedMeasure;
  exportPlayBtn.disabled = !state.loaded || isPlaying;
  exportStopBtn.disabled = !isPlaying;
  downloadSvgBtn.disabled = !state.loaded;
  playbackWaveform.disabled = isPlaying;
  playbackUseMidiLike.disabled = isPlaying;
  metricAccentEnabledInput.disabled = isPlaying;
  metricAccentProfileSelect.disabled = isPlaying || !metricAccentEnabledInput.checked;
  appendMeasureBtn.disabled = !state.loaded || isPlaying;
  const navLeftTarget = getMeasureNavigationTarget(selectedMeasure, "left");
  const navRightTarget = getMeasureNavigationTarget(selectedMeasure, "right");
  const navUpTarget = getMeasureNavigationTarget(selectedMeasure, "up");
  const navDownTarget = getMeasureNavigationTarget(selectedMeasure, "down");
  measureNavLeftBtn.disabled = !state.loaded || isPlaying || !selectedMeasure || !navLeftTarget;
  measureNavRightBtn.disabled = !state.loaded || isPlaying || !selectedMeasure || !navRightTarget;
  measureNavUpBtn.disabled = !state.loaded || isPlaying || !selectedMeasure || !navUpTarget;
  measureNavDownBtn.disabled = !state.loaded || isPlaying || !selectedMeasure || !navDownTarget;
};

const renderAll = (): void => {
  renderInputMode();
  renderLocalDraftUi();
  renderNotes();
  syncStepFromSelectedDraftNote();
  renderStatus();
  renderScoreHeaderMeta();
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

const rebuildMeasureStructureMap = (doc: Document): void => {
  partOrder = [];
  measureNumbersByPart = new Map<string, string[]>();
  for (const part of Array.from(doc.querySelectorAll("score-partwise > part"))) {
    const partId = part.getAttribute("id")?.trim() ?? "";
    if (!partId) continue;
    partOrder.push(partId);
    const numbers = Array.from(part.querySelectorAll(":scope > measure"))
      .map((measure) => measure.getAttribute("number")?.trim() ?? "")
      .filter((number) => number.length > 0);
    measureNumbersByPart.set(partId, Array.from(new Set(numbers)));
  }
};

const rebuildScoreHeaderMeta = (doc: Document): void => {
  const title =
    doc.querySelector("score-partwise > work > work-title")?.textContent?.trim()
    || doc.querySelector("score-partwise > movement-title")?.textContent?.trim()
    || "";
  const composer =
    doc.querySelector('score-partwise > identification > creator[type="composer"]')?.textContent?.trim()
    || doc.querySelector("score-partwise > identification > creator")?.textContent?.trim()
    || "";
  scoreTitleText = title;
  scoreComposerText = composer;
};

type MeasureNavDirection = "left" | "right" | "up" | "down";

const getMeasureNavigationTarget = (
  current: NoteLocation | null,
  direction: MeasureNavDirection
): NoteLocation | null => {
  if (!current) return null;
  if (direction === "left" || direction === "right") {
    const measures = measureNumbersByPart.get(current.partId) ?? [];
    const index = measures.indexOf(current.measureNumber);
    if (index < 0) return null;
    const nextIndex = direction === "left" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= measures.length) return null;
    return { partId: current.partId, measureNumber: measures[nextIndex] };
  }

  const partIndex = partOrder.indexOf(current.partId);
  if (partIndex < 0) return null;
  const nextPartIndex = direction === "up" ? partIndex - 1 : partIndex + 1;
  if (nextPartIndex < 0 || nextPartIndex >= partOrder.length) return null;
  const nextPartId = partOrder[nextPartIndex];
  const nextMeasures = measureNumbersByPart.get(nextPartId) ?? [];
  if (!nextMeasures.includes(current.measureNumber)) return null;
  return { partId: nextPartId, measureNumber: current.measureNumber };
};

const navigateSelectedMeasure = (direction: MeasureNavDirection): void => {
  if (!state.loaded || !selectedMeasure) return;
  if (draftCore && draftCore.isDirty()) {
    state.lastDispatchResult = {
      ok: false,
      dirtyChanged: false,
      changedNodeIds: [],
      affectedMeasureNumbers: [],
      diagnostics: [
        {
          code: "MVP_COMMAND_EXECUTION_FAILED",
          message: "Apply or discard current measure edits before moving to another measure.",
        },
      ],
      warnings: [],
    };
    renderAll();
    return;
  }
  const next = getMeasureNavigationTarget(selectedMeasure, direction);
  if (!next) return;
  initializeMeasureEditor(next);
  // Keep Score-tab measure highlight synced even while navigating from Edit tab.
  highlightSelectedMeasureInMainPreview();
};

const normalizeTextForRenderKey = (value: string | null | undefined): string => {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
};

const localNameOf = (el: Element): string => (el.localName || el.tagName || "").toLowerCase();

const directChildrenByName = (parent: Element, name: string): Element[] =>
  Array.from(parent.children).filter((child) => localNameOf(child) === name.toLowerCase());

const firstDescendantByName = (parent: Element, name: string): Element | null => {
  const nsHit = parent.getElementsByTagNameNS("*", name).item(0);
  if (nsHit) return nsHit;
  return parent.getElementsByTagName(name).item(0);
};

const extractTempoDirectionRenderKey = (direction: Element): string | null => {
  const directSound = directChildrenByName(direction, "sound")[0] ?? null;
  const directionType = directChildrenByName(direction, "direction-type")[0] ?? null;
  const metronome = directionType ? firstDescendantByName(directionType, "metronome") : null;
  const wordsEl = directionType ? firstDescendantByName(directionType, "words") : null;
  const perMinuteEl = metronome ? firstDescendantByName(metronome, "per-minute") : null;
  const beatUnitEl = metronome ? firstDescendantByName(metronome, "beat-unit") : null;
  const directOffset = directChildrenByName(direction, "offset")[0] ?? null;

  const soundTempo = normalizeTextForRenderKey(directSound?.getAttribute("tempo"));
  const perMinute = normalizeTextForRenderKey(perMinuteEl?.textContent);
  const beatUnit = normalizeTextForRenderKey(beatUnitEl?.textContent);
  const words = normalizeTextForRenderKey(wordsEl?.textContent);
  const hasTempoSignal = Boolean(soundTempo || perMinute || words);
  if (!hasTempoSignal) return null;
  const offset = normalizeTextForRenderKey(directOffset?.textContent || "0");
  return `off=${offset}|sound=${soundTempo}|pm=${perMinute}|unit=${beatUnit}|words=${words}`;
};

const dedupeGlobalTempoDirectionsInRenderDoc = (doc: Document): void => {
  const root = doc.documentElement;
  if (!root || localNameOf(root) !== "score-partwise") return;
  const parts = directChildrenByName(root, "part");
  if (parts.length <= 1) return;
  const seen = new Set<string>();
  for (let pi = 0; pi < parts.length; pi += 1) {
    const part = parts[pi];
    const measures = directChildrenByName(part, "measure");
    for (const measure of measures) {
      const measureNo = (measure.getAttribute("number") ?? "").trim();
      const directions = directChildrenByName(measure, "direction");
      for (const direction of directions) {
        const tempoKey = extractTempoDirectionRenderKey(direction);
        if (!tempoKey) continue;
        const dedupeKey = `m=${measureNo}|${tempoKey}`;
        if (seen.has(dedupeKey)) {
          direction.remove();
          continue;
        }
        seen.add(dedupeKey);
      }
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
    dedupeGlobalTempoDirectionsInRenderDoc(sourceDoc);
    return {
      renderDoc: sourceDoc,
      svgIdToNodeId: new Map<string, string>(),
      noteCount: 0,
    };
  }
  const renderBundle = buildRenderDocWithNodeIds(sourceDoc, state.noteNodeIds.slice(), "mks-main");
  if (renderBundle.renderDoc) {
    dedupeGlobalTempoDirectionsInRenderDoc(renderBundle.renderDoc);
  }
  return renderBundle;
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
    buildRenderXmlForVerovio,
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
      rebuildMeasureStructureMap(currentDoc);
      rebuildScoreHeaderMeta(currentDoc);
    } else {
      nodeIdToLocation = new Map<string, NoteLocation>();
      partIdToName = new Map<string, string>();
      partOrder = [];
      measureNumbersByPart = new Map<string, string[]>();
      scoreTitleText = "";
      scoreComposerText = "";
    }
  } else {
    nodeIdToLocation = new Map<string, NoteLocation>();
    partIdToName = new Map<string, string>();
    partOrder = [];
    measureNumbersByPart = new Map<string, string[]>();
    scoreTitleText = "";
    scoreComposerText = "";
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
  getUseMidiLikePlayback: () => playbackUseMidiLike.checked,
  getGraceTimingMode: () => normalizeGraceTimingMode(graceTimingModeSelect.value),
  getMetricAccentEnabled: () => metricAccentEnabledInput.checked,
  getMetricAccentProfile: () => normalizeMetricAccentProfile(metricAccentProfileSelect.value),
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
  await startPlaybackFlow(playbackFlowOptions, {
    isLoaded: state.loaded,
    core,
    startFromMeasure: selectedMeasure,
  });
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
  if (isFileLoadInProgress) return;
  const isFileMode = inputEntryFile.checked;
  if (isFileMode) {
    setFileLoadInProgress(true);
    // Ensure progress UI is painted before heavy parsing/conversion starts.
    await waitForNextPaint();
  }
  try {
    const selectedSourceType = getSelectedSourceType();
    const metadataOutputSettings = getMksMetadataOutputSettings();
    const keepSourceMetadata = metadataOutputSettings.keepSrc;
    const keepDebugMetadata = metadataOutputSettings.keepDbg;
    const selectedRawFile = fileInput.files?.[0] ?? null;
    let selectedFile = selectedZipEntryVirtualFile ?? selectedRawFile;

    if (
      inputEntryFile.checked &&
      selectedRawFile &&
      isZipFileName(selectedRawFile.name) &&
      !selectedZipEntryVirtualFile
    ) {
      const prepared = await prepareZipEntrySelection(selectedRawFile);
      if (!prepared.ok) {
        state.importWarningSummary = "";
        state.lastDispatchResult = {
          ok: false,
          dirtyChanged: false,
          changedNodeIds: [],
          affectedMeasureNumbers: [],
          diagnostics: [{ code: "MVP_INVALID_COMMAND_PAYLOAD", message: prepared.message }],
          warnings: [],
        };
        renderAll();
        return;
      }
      if (!prepared.autoLoad) {
        return;
      }
      selectedFile = selectedZipEntryVirtualFile ?? selectedRawFile;
    }

    const result = await resolveLoadFlow({
      isNewType: inputEntryNew.checked,
      sourceType: selectedSourceType,
      isFileMode: inputEntryFile.checked,
      selectedFile,
      xmlSourceText: xmlInput.value,
      museScoreSourceText: museScoreInput.value,
      vsqxSourceText: vsqxInput.value,
      abcSourceText: abcInput.value,
      meiSourceText: meiInput.value,
      lilyPondSourceText: lilyPondInput.value,
      createNewMusicXml,
      formatImportedMusicXml: normalizeImportedMusicXmlText,
      convertAbcToMusicXml: (abcSource) =>
        convertAbcToMusicXml(abcSource, {
          sourceMetadata: keepSourceMetadata,
          debugMetadata: keepDebugMetadata,
          overfullCompatibilityMode: true,
        }),
      convertMeiToMusicXml: (meiSource) =>
        convertMeiToMusicXml(meiSource, {
          sourceMetadata: keepSourceMetadata,
          debugMetadata: keepDebugMetadata,
        }),
      convertLilyPondToMusicXml: (lilySource) =>
        convertLilyPondToMusicXml(lilySource, {
          sourceMetadata: keepSourceMetadata,
          debugMetadata: keepDebugMetadata,
        }),
      convertMuseScoreToMusicXml: (musescoreSource) =>
        convertMuseScoreToMusicXml(musescoreSource, {
          sourceMetadata: keepSourceMetadata,
          debugMetadata: keepDebugMetadata,
        }),
      convertVsqxToMusicXml: (vsqxSource) =>
        convertVsqxToMusicXml(vsqxSource, {
          defaultLyric: DEFAULT_VSQX_LYRIC,
        }),
      convertMidiToMusicXml: (midiBytes) =>
        convertMidiToMusicXml(midiBytes, {
          quantizeGrid: normalizeMidiImportQuantizeGrid(midiImportQuantizeGridSelect.value),
          tripletAwareQuantize: midiImportTripletAware.checked,
          sourceMetadata: keepSourceMetadata,
          debugMetadata: keepDebugMetadata,
        }),
    });

    if (!result.ok) {
      state.importWarningSummary = "";
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
    state.importWarningSummary =
      selectedSourceType === "abc" ? summarizeImportedDiagWarnings(result.xmlToLoad) : "";
    // Persist immediately on explicit load actions (Load / Load sample).
    writeLocalDraft(result.xmlToLoad);
    loadFromText(result.xmlToLoad);
    activateTopTab("score");
  } finally {
    if (isFileMode) setFileLoadInProgress(false);
  }
};

const onDiscardLocalDraft = (): void => {
  clearLocalDraft();
  renderLocalDraftUi();
};

const createNewMusicXml = (): string => {
  const usePianoGrandStaffTemplate = newTemplatePianoGrandStaff.checked;
  const partCount = usePianoGrandStaffTemplate ? 1 : normalizeNewPartCount();
  const parsedFifths = Number(newKeyFifthsSelect.value);
  const fifths = Number.isFinite(parsedFifths) ? Math.max(-7, Math.min(7, Math.round(parsedFifths))) : 0;
  const beats = normalizeNewTimeBeats();
  const beatType = normalizeNewTimeBeatType();
  const divisions = 480;
  const measureCount = 8;
  const measureDuration = Math.max(1, Math.round(divisions * beats * (4 / beatType)));
  const clefs = usePianoGrandStaffTemplate ? ["treble"] : listCurrentNewPartClefs();

  const partListXml = Array.from({ length: partCount }, (_, i) => {
    const partId = `P${i + 1}`;
    const midiChannel = ((i % 16) + 1 === 10) ? 11 : ((i % 16) + 1);
    const midiProgram = usePianoGrandStaffTemplate ? 1 : 6;
    const partName = usePianoGrandStaffTemplate ? "Piano" : `Part ${i + 1}`;
    return [
      `<score-part id="${partId}">`,
      `<part-name>${partName}</part-name>`,
      `<midi-instrument id="${partId}-I1">`,
      `<midi-channel>${midiChannel}</midi-channel>`,
      `<midi-program>${midiProgram}</midi-program>`,
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
            usePianoGrandStaffTemplate
              ? "<staves>2</staves><clef number=\"1\"><sign>G</sign><line>2</line></clef><clef number=\"2\"><sign>F</sign><line>4</line></clef>"
              : clefXml,
            "</attributes>",
          ].join("")
        : "";
      const measureBody = usePianoGrandStaffTemplate
        ? `<note><rest measure="yes"/><duration>${measureDuration}</duration><voice>1</voice><staff>1</staff></note><backup><duration>${measureDuration}</duration></backup><note><rest measure="yes"/><duration>${measureDuration}</duration><voice>1</voice><staff>2</staff></note>`
        : `<note><rest measure="yes"/><duration>${measureDuration}</duration><voice>1</voice></note>`;
      return [
        `<measure number="${number}">`,
        attrs,
        measureBody,
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

const toPositiveInteger = (value: number | null | undefined): number | null => {
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value as number);
  return rounded > 0 ? rounded : null;
};

const resolveEffectiveStavesAtEnd = (part: Element): number => {
  const measures = Array.from(part.querySelectorAll(":scope > measure"));
  let staves = 1;
  for (const measure of measures) {
    const text = measure.querySelector(":scope > attributes > staves")?.textContent?.trim() ?? "";
    const parsed = Number(text);
    if (Number.isInteger(parsed) && parsed > 0) staves = parsed;
  }
  return staves;
};

const resolveHasTrebleBassGrandStaffAtEnd = (part: Element): boolean => {
  const measures = Array.from(part.querySelectorAll(":scope > measure"));
  let clef1 = "";
  let clef2 = "";
  for (const measure of measures) {
    const nextClef1 = measure.querySelector(':scope > attributes > clef[number="1"] > sign')?.textContent?.trim() ?? "";
    const nextClef2 = measure.querySelector(':scope > attributes > clef[number="2"] > sign')?.textContent?.trim() ?? "";
    if (nextClef1) clef1 = nextClef1;
    if (nextClef2) clef2 = nextClef2;
  }
  return clef1 === "G" && clef2 === "F";
};

const createMeasureRestNoteXml = (duration: number, voice: string, staff: string | null): string => {
  return [
    "<note>",
    '<rest measure="yes"/>',
    `<duration>${duration}</duration>`,
    `<voice>${voice}</voice>`,
    staff ? `<staff>${staff}</staff>` : "",
    "</note>",
  ].join("");
};

const deriveNextMeasureNumber = (part: Element): string => {
  const measures = Array.from(part.querySelectorAll(":scope > measure"));
  const lastMeasure = measures[measures.length - 1] ?? null;
  if (!lastMeasure) return "1";
  const raw = lastMeasure.getAttribute("number")?.trim() ?? "";
  const numeric = Number(raw);
  if (Number.isInteger(numeric) && numeric >= 0) return String(numeric + 1);
  return String(measures.length + 1);
};

const appendMeasureToMainXml = (sourceXml: string): string | null => {
  const doc = parseMusicXmlDocument(sourceXml);
  if (!doc) return null;
  const parts = Array.from(doc.querySelectorAll("score-partwise > part"));
  if (!parts.length) return null;

  for (const part of parts) {
    const measures = Array.from(part.querySelectorAll(":scope > measure"));
    const lastMeasure = measures[measures.length - 1] ?? null;
    if (!lastMeasure) continue;
    const capacity = toPositiveInteger(getMeasureCapacity(lastMeasure)) ?? 3840;
    const nextNumber = deriveNextMeasureNumber(part);
    const staves = resolveEffectiveStavesAtEnd(part);
    const isGrandStaff = staves >= 2 && resolveHasTrebleBassGrandStaffAtEnd(part);

    const measure = doc.createElement("measure");
    measure.setAttribute("number", nextNumber);
    if (isGrandStaff) {
      const lane1 = parseMusicXmlDocument(createMeasureRestNoteXml(capacity, "1", "1"))?.querySelector("note");
      const backup = doc.createElement("backup");
      const backupDur = doc.createElement("duration");
      backupDur.textContent = String(capacity);
      backup.appendChild(backupDur);
      const lane2 = parseMusicXmlDocument(createMeasureRestNoteXml(capacity, "1", "2"))?.querySelector("note");
      if (lane1) measure.appendChild(doc.importNode(lane1, true));
      measure.appendChild(backup);
      if (lane2) measure.appendChild(doc.importNode(lane2, true));
    } else {
      const rest = parseMusicXmlDocument(createMeasureRestNoteXml(capacity, "1", null))?.querySelector("note");
      if (rest) measure.appendChild(doc.importNode(rest, true));
    }
    part.appendChild(measure);
  }
  return serializeMusicXmlDocument(doc);
};

const onAppendMeasureAtEnd = (): void => {
  if (!state.loaded) return;
  if (draftCore && draftCore.isDirty()) {
    state.lastDispatchResult = {
      ok: false,
      dirtyChanged: false,
      changedNodeIds: [],
      affectedMeasureNumbers: [],
      diagnostics: [
        {
          code: "MVP_COMMAND_EXECUTION_FAILED",
          message: "Apply or discard current measure edits before adding a new measure.",
        },
      ],
      warnings: [],
    };
    renderAll();
    return;
  }
  const mainXml = core.debugSerializeCurrentXml();
  if (!mainXml) return;
  const nextXml = appendMeasureToMainXml(mainXml);
  if (!nextXml) {
    state.lastDispatchResult = {
      ok: false,
      dirtyChanged: false,
      changedNodeIds: [],
      affectedMeasureNumbers: [],
      diagnostics: [{ code: "MVP_COMMAND_EXECUTION_FAILED", message: "Failed to append measure." }],
      warnings: [],
    };
    renderAll();
    return;
  }
  loadFromText(nextXml);
  writeLocalDraft(nextXml);
  if (selectedMeasure) {
    initializeMeasureEditor(selectedMeasure);
  }
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

const failExport = (
  format: "MusicXML" | "MIDI" | "VSQX" | "ABC" | "MEI" | "LilyPond" | "MuseScore" | "All" | "SVG",
  reason: string
): void => {
  const message = `${format} export failed: ${reason}`;
  console.error(`[mikuscore][export][${format.toLowerCase()}] ${reason}`);
  state.lastDispatchResult = {
    ok: false,
    dirtyChanged: false,
    changedNodeIds: [],
    affectedMeasureNumbers: [],
    diagnostics: [{ code: "MVP_COMMAND_EXECUTION_FAILED", message }],
    warnings: [],
  };
  renderAll();
};

const onDownload = async (): Promise<void> => {
  const xmlText = resolveMusicXmlOutput();
  if (!xmlText) {
    failExport("MusicXML", "No valid saved XML is available.");
    return;
  }
  try {
    const payload = await createMusicXmlDownloadPayload(xmlText, {
      compressed: compressXmlMuseScoreExport.checked,
      useXmlExtension: exportMusicXmlAsXmlExtension.checked,
    });
    triggerFileDownload(payload);
  } catch (err) {
    failExport("MusicXML", err instanceof Error ? err.message : "Unknown download error.");
  }
};

const onDownloadMidi = (): void => {
  const xmlText = resolveMusicXmlOutput();
  if (!xmlText) {
    failExport("MIDI", "No valid saved XML is available.");
    return;
  }
  const sourceDoc = parseMusicXmlDocument(xmlText);
  if (!sourceDoc) {
    failExport("MIDI", "Current MusicXML could not be parsed.");
    return;
  }
  const parsedForCheck = buildPlaybackEventsFromMusicXmlDoc(sourceDoc, PLAYBACK_TICKS_PER_QUARTER, {
    mode: "midi",
    graceTimingMode: normalizeGraceTimingMode(graceTimingModeSelect.value),
    metricAccentEnabled: metricAccentEnabledInput.checked,
    metricAccentProfile: normalizeMetricAccentProfile(metricAccentProfileSelect.value),
  });
  if (parsedForCheck.events.length === 0) {
    failExport("MIDI", "No notes to export (MIDI events are empty).");
    return;
  }
  const payload = createMidiDownloadPayload(
    xmlText,
    PLAYBACK_TICKS_PER_QUARTER,
    normalizeMidiProgram(midiProgramSelect.value),
    forceMidiProgramOverride.checked,
    normalizeGraceTimingMode(graceTimingModeSelect.value),
    metricAccentEnabledInput.checked,
    normalizeMetricAccentProfile(metricAccentProfileSelect.value),
    normalizeMidiExportProfile(midiExportProfileSelect.value)
  );
  if (!payload) {
    failExport("MIDI", "Could not build MIDI payload from current MusicXML.");
    return;
  }
  try {
    triggerFileDownload(payload);
  } catch (err) {
    failExport("MIDI", err instanceof Error ? err.message : "Unknown download error.");
  }
};

const onDownloadVsqx = (): void => {
  const xmlText = resolveMusicXmlOutput();
  if (!xmlText) {
    failExport("VSQX", "No valid saved XML is available.");
    return;
  }

  const converted = convertMusicXmlToVsqx(xmlText, { musicXml: { defaultLyric: DEFAULT_VSQX_LYRIC } });
  if (!converted.ok) {
    failExport("VSQX", converted.diagnostic?.message ?? "MusicXML to VSQX conversion failed.");
    return;
  }

  try {
    triggerFileDownload(createVsqxDownloadPayload(converted.vsqx));
  } catch (err) {
    failExport("VSQX", err instanceof Error ? err.message : "Unknown download error.");
  }
};

const onDownloadAbc = (): void => {
  const xmlText = resolveMusicXmlOutput();
  if (!xmlText) {
    failExport("ABC", "No valid saved XML is available.");
    return;
  }
  const payload = createAbcDownloadPayload(xmlText, exportMusicXmlDomToAbc);
  if (!payload) {
    failExport("ABC", "Could not build ABC payload from current MusicXML.");
    return;
  }
  try {
    triggerFileDownload(payload);
  } catch (err) {
    failExport("ABC", err instanceof Error ? err.message : "Unknown download error.");
  }
};

const onDownloadMei = (): void => {
  const xmlText = resolveMusicXmlOutput();
  if (!xmlText) {
    failExport("MEI", "No valid saved XML is available.");
    return;
  }
  const payload = createMeiDownloadPayload(xmlText, exportMusicXmlDomToMei);
  if (!payload) {
    failExport("MEI", "Could not build MEI payload from current MusicXML.");
    return;
  }
  try {
    triggerFileDownload(payload);
  } catch (err) {
    failExport("MEI", err instanceof Error ? err.message : "Unknown download error.");
  }
};

const onDownloadLilyPond = (): void => {
  const xmlText = resolveMusicXmlOutput();
  if (!xmlText) {
    failExport("LilyPond", "No valid saved XML is available.");
    return;
  }
  const payload = createLilyPondDownloadPayload(xmlText, exportMusicXmlDomToLilyPond);
  if (!payload) {
    failExport("LilyPond", "Could not build LilyPond payload from current MusicXML.");
    return;
  }
  try {
    triggerFileDownload(payload);
  } catch (err) {
    failExport("LilyPond", err instanceof Error ? err.message : "Unknown download error.");
  }
};

const onDownloadMuseScore = async (): Promise<void> => {
  const xmlText = resolveMusicXmlOutput();
  if (!xmlText) {
    failExport("MuseScore", "No valid saved XML is available.");
    return;
  }
  const payload = await createMuseScoreDownloadPayload(xmlText, exportMusicXmlDomToMuseScore, {
    compressed: compressXmlMuseScoreExport.checked,
  });
  if (!payload) {
    failExport("MuseScore", "Could not build MuseScore payload from current MusicXML.");
    return;
  }
  try {
    triggerFileDownload(payload);
  } catch (err) {
    failExport("MuseScore", err instanceof Error ? err.message : "Unknown download error.");
  }
};

const onDownloadAll = async (): Promise<void> => {
  const xmlText = resolveMusicXmlOutput();
  if (!xmlText) {
    failExport("All", "No valid saved XML is available.");
    return;
  }
  try {
    const musicXmlPayload = await createMusicXmlDownloadPayload(xmlText, {
      compressed: compressXmlMuseScoreExport.checked,
      useXmlExtension: exportMusicXmlAsXmlExtension.checked,
    });
    const museScorePayload = await createMuseScoreDownloadPayload(xmlText, exportMusicXmlDomToMuseScore, {
      compressed: compressXmlMuseScoreExport.checked,
    });
    if (!museScorePayload) {
      failExport("All", "Could not build MuseScore payload from current MusicXML.");
      return;
    }
    const midiPayload = createMidiDownloadPayload(
      xmlText,
      PLAYBACK_TICKS_PER_QUARTER,
      normalizeMidiProgram(midiProgramSelect.value),
      forceMidiProgramOverride.checked,
      normalizeGraceTimingMode(graceTimingModeSelect.value),
      metricAccentEnabledInput.checked,
      normalizeMetricAccentProfile(metricAccentProfileSelect.value),
      normalizeMidiExportProfile(midiExportProfileSelect.value)
    );
    if (!midiPayload) {
      failExport("All", "Could not build MIDI payload from current MusicXML.");
      return;
    }
    const convertedVsqx = convertMusicXmlToVsqx(xmlText, { musicXml: { defaultLyric: DEFAULT_VSQX_LYRIC } });
    if (!convertedVsqx.ok) {
      failExport("All", convertedVsqx.diagnostic?.message ?? "MusicXML to VSQX conversion failed.");
      return;
    }
    const vsqxPayload = createVsqxDownloadPayload(convertedVsqx.vsqx);
    const abcPayload = createAbcDownloadPayload(xmlText, exportMusicXmlDomToAbc);
    if (!abcPayload) {
      failExport("All", "Could not build ABC payload from current MusicXML.");
      return;
    }
    const meiPayload = createMeiDownloadPayload(xmlText, exportMusicXmlDomToMei);
    if (!meiPayload) {
      failExport("All", "Could not build MEI payload from current MusicXML.");
      return;
    }
    const lilyPondPayload = createLilyPondDownloadPayload(xmlText, exportMusicXmlDomToLilyPond);
    if (!lilyPondPayload) {
      failExport("All", "Could not build LilyPond payload from current MusicXML.");
      return;
    }
    const svgNode = debugScoreArea.querySelector("svg");
    if (!svgNode) {
      failExport("All", "No rendered SVG preview is available.");
      return;
    }
    const svgPayload = createSvgDownloadPayload(new XMLSerializer().serializeToString(svgNode));
    const allPayload = await createZipBundleDownloadPayload([
      musicXmlPayload,
      museScorePayload,
      midiPayload,
      vsqxPayload,
      abcPayload,
      meiPayload,
      lilyPondPayload,
      svgPayload,
    ]);
    triggerFileDownload(allPayload);
  } catch (err) {
    failExport("All", err instanceof Error ? err.message : "Unknown download error.");
  }
};

const onDownloadSvg = (): void => {
  const svgNode = debugScoreArea.querySelector("svg");
  if (!svgNode) {
    failExport("SVG", "No rendered SVG preview is available.");
    return;
  }
  try {
    const svgText = new XMLSerializer().serializeToString(svgNode);
    triggerFileDownload(createSvgDownloadPayload(svgText));
  } catch (err) {
    failExport("SVG", err instanceof Error ? err.message : "Unknown download error.");
  }
};

const onDownloadMeasureMusicXml = (): void => {
  const xmlText = draftCore?.debugSerializeCurrentXml() ?? "";
  if (!xmlText) {
    failExport("MusicXML", "No editable measure XML is available.");
    return;
  }
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);
  const partId = selectedMeasure?.partId ?? "part";
  const measureNumber = selectedMeasure?.measureNumber ?? "measure";
  const safePartId = partId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const safeMeasureNumber = measureNumber.replace(/[^a-zA-Z0-9._-]/g, "_");
  try {
    triggerFileDownload({
      fileName: `mikuscore-measure-${safePartId}-${safeMeasureNumber}-${ts}.musicxml`,
      blob: new Blob([prettyPrintMusicXmlText(xmlText)], { type: "application/xml;charset=utf-8" }),
    });
  } catch (err) {
    failExport("MusicXML", err instanceof Error ? err.message : "Unknown download error.");
  }
};

const onDownloadMeasureMidi = (): void => {
  const xmlText = draftCore?.debugSerializeCurrentXml() ?? "";
  if (!xmlText) {
    failExport("MIDI", "No editable measure XML is available.");
    return;
  }
  const sourceDoc = parseMusicXmlDocument(xmlText);
  if (!sourceDoc) {
    failExport("MIDI", "Current measure MusicXML could not be parsed.");
    return;
  }
  const parsedForCheck = buildPlaybackEventsFromMusicXmlDoc(sourceDoc, PLAYBACK_TICKS_PER_QUARTER, {
    mode: "midi",
    graceTimingMode: normalizeGraceTimingMode(graceTimingModeSelect.value),
    metricAccentEnabled: metricAccentEnabledInput.checked,
    metricAccentProfile: normalizeMetricAccentProfile(metricAccentProfileSelect.value),
  });
  if (parsedForCheck.events.length === 0) {
    failExport("MIDI", "No notes to export (MIDI events are empty).");
    return;
  }
  const payload = createMidiDownloadPayload(
    xmlText,
    PLAYBACK_TICKS_PER_QUARTER,
    normalizeMidiProgram(midiProgramSelect.value),
    forceMidiProgramOverride.checked,
    normalizeGraceTimingMode(graceTimingModeSelect.value),
    metricAccentEnabledInput.checked,
    normalizeMetricAccentProfile(metricAccentProfileSelect.value),
    normalizeMidiExportProfile(midiExportProfileSelect.value)
  );
  if (!payload) {
    failExport("MIDI", "Could not build MIDI payload from current measure MusicXML.");
    return;
  }
  try {
    triggerFileDownload(payload);
  } catch (err) {
    failExport("MIDI", err instanceof Error ? err.message : "Unknown download error.");
  }
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

inputEntryFile.addEventListener("change", () => {
  if (!inputEntryFile.checked) {
    resetZipEntrySelectionUi();
  }
  renderInputMode();
});
inputEntrySource.addEventListener("change", () => {
  if (inputEntrySource.checked) {
    resetZipEntrySelectionUi();
  }
  renderInputMode();
});
inputEntryNew.addEventListener("change", () => {
  if (inputEntryNew.checked) {
    resetZipEntrySelectionUi();
  }
  renderInputMode();
});
sourceTypeXml.addEventListener("change", renderInputMode);
sourceTypeMuseScore.addEventListener("change", renderInputMode);
sourceTypeVsqx.addEventListener("change", renderInputMode);
sourceTypeAbc.addEventListener("change", renderInputMode);
sourceTypeMei.addEventListener("change", renderInputMode);
sourceTypeLilyPond.addEventListener("change", renderInputMode);
newPartCountInput.addEventListener("change", renderNewPartClefControls);
newPartCountInput.addEventListener("input", renderNewPartClefControls);
newTemplatePianoGrandStaff.addEventListener("change", renderNewPartClefControls);
fileSelectBtn.addEventListener("click", () => {
  // Clear selection so choosing the same file again still fires `change`.
  resetZipEntrySelectionUi();
  fileInput.value = "";
  fileInput.click();
});
fileInput.addEventListener("change", async () => {
  const f = fileInput.files?.[0];
  fileNameText.textContent = f ? f.name : "No file selected";
  fileNameText.classList.toggle("md-hidden", !f);
  if (!f) {
    resetZipEntrySelectionUi();
    return;
  }
  inputEntryFile.checked = true;
  inputEntrySource.checked = false;
  inputEntryNew.checked = false;
  if (!isZipFileName(f.name)) {
    resetZipEntrySelectionUi();
  }
  renderInputMode();
  if (inputEntryNew.checked || !inputEntryFile.checked) return;
  await onLoadClick();
});
zipEntrySelect.addEventListener("change", async () => {
  const archive = fileInput.files?.[0];
  const entryPath = zipEntrySelect.value;
  if (!archive || !entryPath || !isZipFileName(archive.name)) return;
  try {
    selectedZipEntryVirtualFile = await loadZipEntryAsVirtualFile(archive, entryPath);
  } catch (error) {
    state.importWarningSummary = "";
    state.lastDispatchResult = {
      ok: false,
      dirtyChanged: false,
      changedNodeIds: [],
      affectedMeasureNumbers: [],
      diagnostics: [
        {
          code: "MVP_INVALID_COMMAND_PAYLOAD",
          message: `Failed to read ZIP entry: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      warnings: [],
    };
    renderAll();
    return;
  }
  await onLoadClick();
});
loadBtn.addEventListener("click", () => {
  void onLoadClick();
});
discardDraftExportBtn.addEventListener("click", onDiscardLocalDraft);
const loadBuiltInSample = (xml: string): void => {
  inputEntryFile.checked = false;
  inputEntrySource.checked = true;
  inputEntryNew.checked = false;
  sourceTypeXml.checked = true;
  sourceTypeMuseScore.checked = false;
  sourceTypeVsqx.checked = false;
  sourceTypeAbc.checked = false;
  sourceTypeMei.checked = false;
  sourceTypeLilyPond.checked = false;
  xmlInput.value = xml;
  renderInputMode();
  renderLocalDraftUi();
  void onLoadClick();
};
loadSampleBtn1.addEventListener("click", () => {
  loadBuiltInSample(sampleXml);
});
loadSample2Btn.addEventListener("click", () => {
  loadBuiltInSample(sampleXml2);
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
exportPlayBtn.addEventListener("click", () => {
  void startPlayback();
});
exportPlayBtn.addEventListener("pointerdown", unlockAudioOnGesture, { passive: true });
exportPlayBtn.addEventListener("touchstart", unlockAudioOnGesture, { passive: true });
stopBtn.addEventListener("click", stopPlayback);
scoreEditBtn.addEventListener("click", () => {
  if (!selectedMeasure) return;
  activateTopTab("edit");
});
exportStopBtn.addEventListener("click", stopPlayback);
downloadBtn.addEventListener("click", onDownload);
downloadMidiBtn.addEventListener("click", onDownloadMidi);
downloadVsqxBtn.addEventListener("click", onDownloadVsqx);
downloadAbcBtn.addEventListener("click", onDownloadAbc);
downloadMeiBtn.addEventListener("click", onDownloadMei);
downloadLilyPondBtn.addEventListener("click", onDownloadLilyPond);
downloadMuseScoreBtn.addEventListener("click", onDownloadMuseScore);
downloadAllBtn.addEventListener("click", () => {
  void onDownloadAll();
});
downloadSvgBtn.addEventListener("click", onDownloadSvg);
resetPlaybackSettingsBtn.addEventListener("click", onResetPlaybackSettings);
midiProgramSelect.addEventListener("change", writePlaybackSettings);
midiExportProfileSelect.addEventListener("change", writePlaybackSettings);
midiImportQuantizeGridSelect.addEventListener("change", writePlaybackSettings);
midiImportTripletAware.addEventListener("change", writePlaybackSettings);
forceMidiProgramOverride.addEventListener("change", writePlaybackSettings);
playbackWaveform.addEventListener("change", writePlaybackSettings);
playbackUseMidiLike.addEventListener("change", writePlaybackSettings);
graceTimingModeSelect.addEventListener("change", writePlaybackSettings);
metricAccentEnabledInput.addEventListener("change", () => {
  writePlaybackSettings();
  renderControlState();
});
metricAccentProfileSelect.addEventListener("change", writePlaybackSettings);
keepMksMetaMetadataInMusicXml.addEventListener("change", () => {
  writePlaybackSettings();
  renderOutput();
});
keepMksSrcMetadataInMusicXml.addEventListener("change", () => {
  writePlaybackSettings();
  renderOutput();
});
keepMksDbgMetadataInMusicXml.addEventListener("change", () => {
  writePlaybackSettings();
  renderOutput();
});
exportMusicXmlAsXmlExtension.addEventListener("change", writePlaybackSettings);
compressXmlMuseScoreExport.addEventListener("change", () => {
  if (compressXmlMuseScoreExport.checked) {
    exportMusicXmlAsXmlExtension.checked = false;
  }
  writePlaybackSettings();
});
generalSettingsAccordion.addEventListener("toggle", writePlaybackSettings);
settingsAccordion.addEventListener("toggle", writePlaybackSettings);
debugScoreArea.addEventListener("click", onVerovioScoreClick);
measureEditorArea.addEventListener("click", onMeasureEditorClick);
editSubTabEditorBtn.addEventListener("click", () => {
  activateEditSubTab("editor");
});
editSubTabXmlBtn.addEventListener("click", () => {
  activateEditSubTab("xml");
});
measureApplyBtn.addEventListener("click", onMeasureApply);
measureDiscardBtn.addEventListener("click", onMeasureDiscard);
measureNavLeftBtn.addEventListener("click", () => navigateSelectedMeasure("left"));
measureNavRightBtn.addEventListener("click", () => navigateSelectedMeasure("right"));
measureNavUpBtn.addEventListener("click", () => navigateSelectedMeasure("up"));
measureNavDownBtn.addEventListener("click", () => navigateSelectedMeasure("down"));
appendMeasureBtn.addEventListener("click", onAppendMeasureAtEnd);
playMeasureBtn.addEventListener("click", () => {
  void startMeasurePlayback();
});
downloadMeasureMusicXmlBtn.addEventListener("click", onDownloadMeasureMusicXml);
downloadMeasureMidiBtn.addEventListener("click", onDownloadMeasureMidi);
playMeasureBtn.addEventListener("pointerdown", unlockAudioOnGesture, { passive: true });
playMeasureBtn.addEventListener("touchstart", unlockAudioOnGesture, { passive: true });

renderNewPartClefControls();
applyInitialXmlInputValue();
applyInitialPlaybackSettings();
installVsqxMusicXmlNormalizationHook((xml) =>
  applyImplicitBeamsToMusicXmlText(normalizeImportedMusicXmlText(xml))
);
installGlobalAudioUnlock();
loadFromText(xmlInput.value);
