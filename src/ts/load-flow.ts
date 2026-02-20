import { extractMusicXmlTextFromMxl } from "./mxl-io";

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
    const isMeiFile = lowerName.endsWith(".mei");

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
      return {
        ok: true,
        xmlToLoad: sourceText,
        collapseInputSection: true,
        nextXmlInputText: sourceText,
      };
    }

    if (isMusicXmlLike) {
      sourceText = await readTextFile(selected);
      return {
        ok: true,
        xmlToLoad: sourceText,
        collapseInputSection: true,
        nextXmlInputText: sourceText,
      };
    }

    if (isAbcFile) {
      sourceText = await readTextFile(selected);
      try {
        const convertedXml = params.convertAbcToMusicXml(sourceText);
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
        return {
          ok: true,
          xmlToLoad: converted.xml,
          collapseInputSection: true,
          nextXmlInputText: converted.xml,
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

    if (isMeiFile) {
      sourceText = await readTextFile(selected);
      try {
        const convertedXml = params.convertMeiToMusicXml(sourceText);
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

    return {
      ok: false,
      diagnosticCode: "MVP_INVALID_COMMAND_PAYLOAD",
      diagnosticMessage:
        "Unsupported file extension. Use .musicxml, .xml, .mxl, .abc, .mid, .midi, or .mei.",
    };
  }

  if (!treatAsAbc) {
    return {
      ok: true,
      xmlToLoad: params.xmlSourceText,
      collapseInputSection: true,
    };
  }

  sourceText = params.abcSourceText;
  try {
    const convertedXml = params.convertAbcToMusicXml(sourceText);
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
