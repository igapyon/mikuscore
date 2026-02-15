export type LoadFlowParams = {
  isNewType: boolean;
  isAbcType: boolean;
  isFileMode: boolean;
  selectedFile: File | null;
  xmlSourceText: string;
  abcSourceText: string;
  createNewMusicXml: () => string;
  convertAbcToMusicXml: (abcSource: string) => string;
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
    sourceText = await selected.text();
    if (!treatAsAbc) {
      return {
        ok: true,
        xmlToLoad: sourceText,
        collapseInputSection: true,
        nextXmlInputText: sourceText,
      };
    }
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
