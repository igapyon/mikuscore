import { convertAbcToMusicXml, exportMusicXmlDomToAbc } from "./abc-io";
import {
  buildMidiBytesForPlayback,
  buildPlaybackEventsFromMusicXmlDoc,
  collectLeadingPickupTicksFromMusicXmlDoc,
  collectMidiControlEventsFromMusicXmlDoc,
  collectMidiKeySignatureEventsFromMusicXmlDoc,
  collectMidiProgramOverridesFromMusicXmlDoc,
  collectMidiTempoEventsFromMusicXmlDoc,
  collectMidiTimeSignatureEventsFromMusicXmlDoc,
  convertMidiToMusicXml,
} from "./midi-io";
import { normalizeImportedMusicXmlText, parseMusicXmlDocument } from "./musicxml-io";
import { convertMuseScoreToMusicXml, exportMusicXmlDomToMuseScore } from "./musescore-io";
import { renderMusicXmlDomToSvg } from "./verovio-out";

export type CliResult =
  | {
    ok: true;
    output: string | Uint8Array;
    warnings: string[];
    diagnostics: string[];
  }
  | {
    ok: false;
    warnings: string[];
    diagnostics: string[];
  };

export const importAbcToMusicXml = (abcText: string): CliResult => {
  try {
    const xmlText = normalizeImportedMusicXmlText(convertAbcToMusicXml(abcText));
    return {
      ok: true,
      output: xmlText,
      warnings: [],
      diagnostics: [],
    };
  } catch (error) {
    return {
      ok: false,
      warnings: [],
      diagnostics: [`Failed to parse ABC: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
};

export const exportMusicXmlToAbc = (xmlText: string): CliResult => {
  const doc = parseMusicXmlDocument(xmlText);
  if (!doc) {
    return {
      ok: false,
      warnings: [],
      diagnostics: ["Failed to parse MusicXML: input is not a valid MusicXML document."],
    };
  }

  try {
    return {
      ok: true,
      output: exportMusicXmlDomToAbc(doc),
      warnings: [],
      diagnostics: [],
    };
  } catch (error) {
    return {
      ok: false,
      warnings: [],
      diagnostics: [`Failed to export ABC: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
};

export const importMidiToMusicXml = (midiBytes: Uint8Array): CliResult => {
  const result = convertMidiToMusicXml(midiBytes);
  if (!result.ok) {
    return {
      ok: false,
      warnings: result.warnings.map((item) => item.message),
      diagnostics: result.diagnostics.map((item) => item.message),
    };
  }
  return {
    ok: true,
    output: normalizeImportedMusicXmlText(result.xml),
    warnings: result.warnings.map((item) => item.message),
    diagnostics: result.diagnostics.map((item) => item.message),
  };
};

export const exportMusicXmlToMidi = (xmlText: string): CliResult => {
  const doc = parseMusicXmlDocument(xmlText);
  if (!doc) {
    return {
      ok: false,
      warnings: [],
      diagnostics: ["Failed to parse MusicXML: input is not a valid MusicXML document."],
    };
  }

  try {
    const ticksPerQuarter = 480;
    const parsedPlayback = buildPlaybackEventsFromMusicXmlDoc(doc, ticksPerQuarter, {
      mode: "midi",
    });
    if (parsedPlayback.events.length === 0) {
      return {
        ok: false,
        warnings: [],
        diagnostics: ["Failed to export MIDI: no playable note events found."],
      };
    }
    const midiBytes = buildMidiBytesForPlayback(
      parsedPlayback.events,
      parsedPlayback.tempo,
      "electric_piano_2",
      collectMidiProgramOverridesFromMusicXmlDoc(doc),
      collectMidiControlEventsFromMusicXmlDoc(doc, ticksPerQuarter),
      collectMidiTempoEventsFromMusicXmlDoc(doc, ticksPerQuarter),
      collectMidiTimeSignatureEventsFromMusicXmlDoc(doc, ticksPerQuarter),
      collectMidiKeySignatureEventsFromMusicXmlDoc(doc, ticksPerQuarter),
      {
        embedMksSysEx: true,
        emitMksTextMeta: true,
        ticksPerQuarter,
        rawWriter: true,
        metadata: {
          title:
            doc.querySelector("score-partwise > work > work-title")?.textContent?.trim() ??
            doc.querySelector("score-partwise > movement-title")?.textContent?.trim() ??
            "",
          movementTitle: doc.querySelector("score-partwise > movement-title")?.textContent?.trim() ?? "",
          composer:
            doc.querySelector('score-partwise > identification > creator[type="composer"]')?.textContent?.trim() ??
            doc.querySelector("score-partwise > identification > creator")?.textContent?.trim() ??
            "",
          pickupTicks: collectLeadingPickupTicksFromMusicXmlDoc(doc, ticksPerQuarter),
        },
      }
    );
    return {
      ok: true,
      output: midiBytes,
      warnings: [],
      diagnostics: [],
    };
  } catch (error) {
    return {
      ok: false,
      warnings: [],
      diagnostics: [`Failed to export MIDI: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
};

export const importMuseScoreToMusicXml = (musescoreText: string): CliResult => {
  try {
    return {
      ok: true,
      output: normalizeImportedMusicXmlText(convertMuseScoreToMusicXml(musescoreText)),
      warnings: [],
      diagnostics: [],
    };
  } catch (error) {
    return {
      ok: false,
      warnings: [],
      diagnostics: [`Failed to parse MuseScore: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
};

export const exportMusicXmlToMuseScore = (xmlText: string): CliResult => {
  const doc = parseMusicXmlDocument(xmlText);
  if (!doc) {
    return {
      ok: false,
      warnings: [],
      diagnostics: ["Failed to parse MusicXML: input is not a valid MusicXML document."],
    };
  }

  try {
    return {
      ok: true,
      output: exportMusicXmlDomToMuseScore(doc),
      warnings: [],
      diagnostics: [],
    };
  } catch (error) {
    return {
      ok: false,
      warnings: [],
      diagnostics: [`Failed to export MuseScore: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
};

export const renderMusicXmlToSvg = async (xmlText: string): Promise<CliResult> => {
  const doc = parseMusicXmlDocument(xmlText);
  if (!doc) {
    return {
      ok: false,
      warnings: [],
      diagnostics: ["Failed to parse MusicXML: input is not a valid MusicXML document."],
    };
  }

  try {
    const { svg } = await renderMusicXmlDomToSvg(doc, {
      pageWidth: 20000,
      pageHeight: 3000,
      scale: 40,
      breaks: "none",
      mnumInterval: 1,
      adjustPageHeight: 1,
      footer: "none",
      header: "none",
    });
    return {
      ok: true,
      output: svg,
      warnings: [],
      diagnostics: [],
    };
  } catch (error) {
    return {
      ok: false,
      warnings: [],
      diagnostics: [`Failed to render SVG: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
};

export const cliApi = {
  abc: {
    importToMusicXml: importAbcToMusicXml,
    exportFromMusicXml: exportMusicXmlToAbc,
  },
  midi: {
    importToMusicXml: importMidiToMusicXml,
    exportFromMusicXml: exportMusicXmlToMidi,
  },
  musescore: {
    importToMusicXml: importMuseScoreToMusicXml,
    exportFromMusicXml: exportMusicXmlToMuseScore,
  },
  render: {
    svgFromMusicXml: renderMusicXmlToSvg,
  },
};
