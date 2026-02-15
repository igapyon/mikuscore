import type { RenderDocBundle } from "./musicxml-io";
import { renderMusicXmlDomToSvg } from "./verovio-out";

export type RenderScorePreviewParams = {
  renderSeq: number;
  isRenderSeqCurrent: (renderSeq: number) => boolean;
  xml: string;
  noteNodeIds: string[];
  setMetaText: (text: string) => void;
  setSvgHtml: (svgHtml: string) => void;
  setSvgIdMap: (map: Map<string, string>) => void;
  buildRenderXmlForVerovio: (xml: string) => RenderDocBundle | { renderDoc: Document | null; svgIdToNodeId: Map<string, string>; noteCount: number };
  deriveRenderedNoteIds: (root: Element) => string[];
  buildFallbackSvgIdMap: (noteNodeIds: string[], renderedNoteIds: string[]) => Map<string, string>;
  onRendered: () => void;
  debugLog: boolean;
  renderedRoot: Element;
};

export const renderScorePreview = async (params: RenderScorePreviewParams): Promise<void> => {
  if (!params.xml) {
    params.setMetaText("No XML to render.");
    params.setSvgHtml("");
    params.setSvgIdMap(new Map<string, string>());
    return;
  }

  const renderBundle = params.buildRenderXmlForVerovio(params.xml);
  const renderDoc = renderBundle.renderDoc;
  if (!renderDoc) {
    params.setMetaText("Render failed: invalid MusicXML.");
    params.setSvgHtml("");
    params.setSvgIdMap(new Map<string, string>());
    return;
  }

  params.setMetaText("Rendering with verovio...");
  try {
    const { svg, pageCount } = await renderMusicXmlDomToSvg(renderDoc, {
      pageWidth: 20000,
      pageHeight: 3000,
      scale: 40,
      breaks: "none",
      mnumInterval: 1,
      adjustPageHeight: 1,
      footer: "none",
      header: "none",
    });
    if (!params.isRenderSeqCurrent(params.renderSeq)) return;

    const measures = renderDoc.querySelectorAll("part > measure").length;
    params.setSvgHtml(svg);

    const renderedNoteIds = params.deriveRenderedNoteIds(params.renderedRoot);
    let mapMode = "direct";
    let map = renderBundle.svgIdToNodeId;
    if (renderedNoteIds.length > 0 && !renderedNoteIds.some((id) => id.startsWith("mks-"))) {
      map = params.buildFallbackSvgIdMap(params.noteNodeIds, renderedNoteIds);
      mapMode = "fallback-seq";
    }
    params.setSvgIdMap(map);
    if (params.debugLog) {
      console.warn("[mikuscore][click-map] render map prepared:", {
        mapMode,
        mappedNotes: map.size,
        renderedNoteIds: renderedNoteIds.slice(0, 20),
      });
    }
    params.onRendered();

    params.setMetaText(
      [
        "engine=verovio",
        "measures=" + measures,
        "mode=long-horizontal",
        "pages=" + pageCount,
        "click-map-notes=" + renderBundle.noteCount,
        "map-mode=" + mapMode,
      ].join(" ")
    );
  } catch (error: unknown) {
    if (!params.isRenderSeqCurrent(params.renderSeq)) return;
    const message = error instanceof Error ? error.message : String(error);
    params.setMetaText("Render failed: " + message);
    params.setSvgHtml("");
    params.setSvgIdMap(new Map<string, string>());
  }
};

export type RenderMeasureEditorPreviewParams = {
  hasDraft: boolean;
  xml: string;
  draftNoteNodeIds: string[];
  setHtml: (html: string) => void;
  setSvgIdMap: (map: Map<string, string>) => void;
  buildRenderDocWithNodeIds: (sourceDoc: Document, nodeIds: string[], idPrefix: string) => RenderDocBundle;
  parseMusicXmlDocument: (xml: string) => Document | null;
  deriveRenderedNoteIds: (root: Element) => string[];
  buildFallbackSvgIdMap: (noteNodeIds: string[], renderedNoteIds: string[]) => Map<string, string>;
  onRendered: () => void;
  renderedRoot: Element;
};

export const renderMeasureEditorPreview = async (
  params: RenderMeasureEditorPreviewParams
): Promise<void> => {
  if (!params.hasDraft || !params.xml) {
    params.setHtml("");
    params.setSvgIdMap(new Map<string, string>());
    return;
  }

  const sourceDoc = params.parseMusicXmlDocument(params.xml);
  if (!sourceDoc) {
    params.setHtml("Render failed: invalid MusicXML.");
    params.setSvgIdMap(new Map<string, string>());
    return;
  }

  const renderBundle = params.buildRenderDocWithNodeIds(
    sourceDoc,
    params.draftNoteNodeIds.slice(),
    "mks-draft"
  );
  const renderDoc = renderBundle.renderDoc;
  if (!renderDoc) {
    params.setHtml("Render failed: invalid MusicXML.");
    params.setSvgIdMap(new Map<string, string>());
    return;
  }

  params.setHtml("Rendering...");
  try {
    const { svg } = await renderMusicXmlDomToSvg(renderDoc, {
      pageWidth: 6000,
      pageHeight: 2200,
      scale: 58,
      breaks: "none",
      adjustPageHeight: 1,
      footer: "none",
      header: "none",
    });
    params.setHtml(svg);

    const renderedNoteIds = params.deriveRenderedNoteIds(params.renderedRoot);
    let map = renderBundle.svgIdToNodeId;
    if (renderedNoteIds.length > 0 && !renderedNoteIds.some((id) => id.startsWith("mks-"))) {
      map = params.buildFallbackSvgIdMap(params.draftNoteNodeIds, renderedNoteIds);
    }
    params.setSvgIdMap(map);
    params.onRendered();
  } catch (error: unknown) {
    params.setHtml(`Render failed: ${error instanceof Error ? error.message : String(error)}`);
    params.setSvgIdMap(new Map<string, string>());
  }
};
