import { extractMusicXmlTextFromMxl, extractTextFromZipByExtensions } from "./mxl-io";

export type LoadFlowParams = {
  isNewType: boolean;
  isAbcType: boolean;
  isFileMode: boolean;
  selectedFile: File | null;
  xmlSourceText: string;
  abcSourceText: string;
  createNewMusicXml: () => string;
  convertAbcToMusicXml: (abcSource: string) => string;
  convertMeiToMusicXml: (meiSource: string) => string;
  convertLilyPondToMusicXml: (lilySource: string) => string;
  convertMuseScoreToMusicXml: (musescoreSource: string) => string;
  formatImportedMusicXml: (xml: string) => string;
  convertVsqxToMusicXml: (vsqxSource: string) => {
    ok: boolean;
    xml: string;
    diagnostics: Array<{ code: string; message: string }>;
    warnings: Array<{ code: string; message: string }>;
  };
  convertMidiToMusicXml: (midiBytes: Uint8Array) => {
    ok: boolean;
    xml: string;
    diagnostics: Array<{ code: string; message: string }>;
    warnings: Array<{ code: string; message: string }>;
  };
};

export type LoadFlowSuccess = {
  ok: true;
  xmlToLoad: string;
  collapseInputSection: boolean;
  nextXmlInputText?: string;
  nextAbcInputText?: string;
};

export type LoadFlowFailure = {
  ok: false;
  diagnosticCode: "MVP_INVALID_COMMAND_PAYLOAD";
  diagnosticMessage: string;
};

export type LoadFlowResult = LoadFlowSuccess | LoadFlowFailure;

const looksLikeScorePartwise = (xmlText: string): boolean => {
  return /<\s*score-partwise(?:\s|>)/i.test(xmlText);
};

const readBinaryFile = async (file: File): Promise<Uint8Array> => {
  const withArrayBuffer = file as File & { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof withArrayBuffer.arrayBuffer === "function") {
    const buffer = await withArrayBuffer.arrayBuffer();
    return new Uint8Array(buffer);
  }
  const blob = file as Blob;
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (!(result instanceof ArrayBuffer)) {
        reject(new Error("Failed to read binary file."));
        return;
      }
      resolve(new Uint8Array(result));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read binary file."));
    };
    reader.readAsArrayBuffer(blob);
  });
};

const readTextFile = async (file: File): Promise<string> => {
  const withText = file as File & { text?: () => Promise<string> };
  if (typeof withText.text === "function") {
    return withText.text();
  }
  const blob = file as Blob;
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read text file."));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read text file."));
    };
    reader.readAsText(blob);
  });
};

export const resolveLoadFlow = async (params: LoadFlowParams): Promise<LoadFlowResult> => {
  if (params.isNewType) {
    const sourceText = params.createNewMusicXml();
    return {
      ok: true,
      xmlToLoad: sourceText,
      collapseInputSection: true,
      nextXmlInputText: sourceText,
    };
  }

  const treatAsAbc = params.isAbcType;
  let sourceText = "";

  if (params.isFileMode) {
    const selected = params.selectedFile;
    if (!selected) {
      return {
        ok: false,
        diagnosticCode: "MVP_INVALID_COMMAND_PAYLOAD",
        diagnosticMessage: "Please select a file.",
      };
    }
    const lowerName = selected.name.toLowerCase();
    const isAbcFile = lowerName.endsWith(".abc");
    const isMxl = lowerName.endsWith(".mxl");
    const isMusicXmlLike = lowerName.endsWith(".musicxml") || lowerName.endsWith(".xml");
    const isMidiFile = lowerName.endsWith(".mid") || lowerName.endsWith(".midi");
    const isVsqxFile = lowerName.endsWith(".vsqx");
    const isMeiFile = lowerName.endsWith(".mei");
    const isLilyPondFile = lowerName.endsWith(".ly");
    const isMuseScoreXmlFile = lowerName.endsWith(".mscx");
    const isMuseScoreZipFile = lowerName.endsWith(".mscz");

    if (isMxl) {
      try {
        sourceText = await extractMusicXmlTextFromMxl(await selected.arrayBuffer());
      } catch (error) {
        return {
          ok: false,
          diagnosticCode: "MVP_INVALID_COMMAND_PAYLOAD",
          diagnosticMessage: `Failed to parse MXL: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
      const normalized = params.formatImportedMusicXml(sourceText);
      return {
        ok: true,
        xmlToLoad: normalized,
        collapseInputSection: true,
        nextXmlInputText: normalized,
      };
    }

    if (isMusicXmlLike) {
      sourceText = await readTextFile(selected);
      const normalized = params.formatImportedMusicXml(sourceText);
      return {
        ok: true,
        xmlToLoad: normalized,
        collapseInputSection: true,
        nextXmlInputText: normalized,
      };
    }

    if (isAbcFile) {
      sourceText = await readTextFile(selected);
      try {
        const convertedXml = params.formatImportedMusicXml(params.convertAbcToMusicXml(sourceText));
        return {
          ok: true,
          xmlToLoad: convertedXml,
          collapseInputSection: true,
          nextXmlInputText: convertedXml,
          nextAbcInputText: sourceText,
        };
      } catch (error) {
        return {
          ok: false,
          diagnosticCode: "MVP_INVALID_COMMAND_PAYLOAD",
          diagnosticMessage: `Failed to parse ABC: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    }

    if (isMidiFile) {
      try {
        const converted = params.convertMidiToMusicXml(await readBinaryFile(selected));
        if (!converted.ok) {
          const first = converted.diagnostics[0];
          return {
            ok: false,
            diagnosticCode: "MVP_INVALID_COMMAND_PAYLOAD",
            diagnosticMessage: `Failed to parse MIDI: ${
              first ? `${first.message} (${first.code})` : "Unknown parse error."
            }`,
          };
        }
        const formattedXml = params.formatImportedMusicXml(converted.xml);
        return {
          ok: true,
          xmlToLoad: formattedXml,
          collapseInputSection: true,
          nextXmlInputText: formattedXml,
        };
      } catch (error) {
        return {
          ok: false,
          diagnosticCode: "MVP_INVALID_COMMAND_PAYLOAD",
          diagnosticMessage: `Failed to parse MIDI: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    }

    if (isVsqxFile) {
      try {
        const converted = params.convertVsqxToMusicXml(await readTextFile(selected));
        if (!converted.ok) {
          const first = converted.diagnostics[0];
          return {
            ok: false,
            diagnosticCode: "MVP_INVALID_COMMAND_PAYLOAD",
            diagnosticMessage: `Failed to parse VSQX: ${
              first ? `${first.message} (${first.code})` : "Unknown parse error."
            }`,
          };
        }
        const formattedXml = params.formatImportedMusicXml(converted.xml);
        return {
          ok: true,
          xmlToLoad: formattedXml,
          collapseInputSection: true,
          nextXmlInputText: formattedXml,
        };
      } catch (error) {
        return {
          ok: false,
          diagnosticCode: "MVP_INVALID_COMMAND_PAYLOAD",
          diagnosticMessage: `Failed to parse VSQX: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    }

    if (isMeiFile) {
      sourceText = await readTextFile(selected);
      try {
        const convertedXml = params.formatImportedMusicXml(params.convertMeiToMusicXml(sourceText));
        return {
          ok: true,
          xmlToLoad: convertedXml,
          collapseInputSection: true,
          nextXmlInputText: convertedXml,
        };
      } catch (error) {
        return {
          ok: false,
          diagnosticCode: "MVP_INVALID_COMMAND_PAYLOAD",
          diagnosticMessage: `Failed to parse MEI: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    }

    if (isLilyPondFile) {
      sourceText = await readTextFile(selected);
      try {
        const convertedXml = params.formatImportedMusicXml(params.convertLilyPondToMusicXml(sourceText));
        return {
          ok: true,
          xmlToLoad: convertedXml,
          collapseInputSection: true,
          nextXmlInputText: convertedXml,
        };
      } catch (error) {
        return {
          ok: false,
          diagnosticCode: "MVP_INVALID_COMMAND_PAYLOAD",
          diagnosticMessage: `Failed to parse LilyPond: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    }

    if (isMuseScoreZipFile) {
      try {
        try {
          // Prefer MuseScore XML entry first; generic MXL fallback can pick unrelated XML entries.
          const mscxText = await extractTextFromZipByExtensions(await selected.arrayBuffer(), [".mscx"]);
          const convertedXml = params.formatImportedMusicXml(params.convertMuseScoreToMusicXml(mscxText));
          return {
            ok: true,
            xmlToLoad: convertedXml,
            collapseInputSection: true,
            nextXmlInputText: convertedXml,
          };
        } catch {
          // Fallback: if this ZIP actually carries MusicXML, accept it as-is.
          sourceText = await extractMusicXmlTextFromMxl(await selected.arrayBuffer());
          if (looksLikeScorePartwise(sourceText)) {
            const normalized = params.formatImportedMusicXml(sourceText);
            return {
              ok: true,
              xmlToLoad: normalized,
              collapseInputSection: true,
              nextXmlInputText: normalized,
            };
          }
          // Last resort: try interpreting the extracted XML as MuseScore XML text.
          const convertedXml = params.formatImportedMusicXml(params.convertMuseScoreToMusicXml(sourceText));
          return {
            ok: true,
            xmlToLoad: convertedXml,
            collapseInputSection: true,
            nextXmlInputText: convertedXml,
          };
        }
      } catch (error) {
        return {
          ok: false,
          diagnosticCode: "MVP_INVALID_COMMAND_PAYLOAD",
          diagnosticMessage: `Failed to parse MuseScore: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    }

    if (isMuseScoreXmlFile) {
      sourceText = await readTextFile(selected);
      try {
        const convertedXml = params.formatImportedMusicXml(params.convertMuseScoreToMusicXml(sourceText));
        return {
          ok: true,
          xmlToLoad: convertedXml,
          collapseInputSection: true,
          nextXmlInputText: convertedXml,
        };
      } catch (error) {
        return {
          ok: false,
          diagnosticCode: "MVP_INVALID_COMMAND_PAYLOAD",
          diagnosticMessage: `Failed to parse MuseScore: ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    }

    return {
      ok: false,
      diagnosticCode: "MVP_INVALID_COMMAND_PAYLOAD",
      diagnosticMessage:
        "Unsupported file extension. Use .musicxml, .xml, .mxl, .abc, .mid, .midi, .vsqx, .mei, .ly, .mscx, or .mscz.",
    };
  }

  if (!treatAsAbc) {
    const normalized = params.formatImportedMusicXml(params.xmlSourceText);
    return {
      ok: true,
      xmlToLoad: normalized,
      collapseInputSection: true,
      nextXmlInputText: normalized,
    };
  }

  sourceText = params.abcSourceText;
  try {
    const convertedXml = params.formatImportedMusicXml(params.convertAbcToMusicXml(sourceText));
    return {
      ok: true,
      xmlToLoad: convertedXml,
      collapseInputSection: true,
      nextXmlInputText: convertedXml,
    };
  } catch (error) {
    return {
      ok: false,
      diagnosticCode: "MVP_INVALID_COMMAND_PAYLOAD",
      diagnosticMessage: `Failed to parse ABC: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
};
