export type RenderDocBundle = {
  renderDoc: Document;
  svgIdToNodeId: Map<string, string>;
  noteCount: number;
};

export const parseMusicXmlDocument = (xml: string): Document | null => {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return doc.querySelector("parsererror") ? null : doc;
};

export const serializeMusicXmlDocument = (doc: Document): string => {
  return new XMLSerializer().serializeToString(doc);
};

const cloneXmlDocument = (doc: Document): Document => {
  const cloned = document.implementation.createDocument("", "", null);
  const root = cloned.importNode(doc.documentElement, true);
  cloned.appendChild(root);
  return cloned;
};

const findPartById = (doc: Document, partId: string): Element | null => {
  for (const part of Array.from(doc.querySelectorAll("score-partwise > part"))) {
    if ((part.getAttribute("id") ?? "") === partId) return part;
  }
  return null;
};

const findScorePartById = (doc: Document, partId: string): Element | null => {
  for (const scorePart of Array.from(doc.querySelectorAll("score-partwise > part-list > score-part"))) {
    if ((scorePart.getAttribute("id") ?? "") === partId) return scorePart;
  }
  return null;
};

const findMeasureByNumber = (part: Element, measureNumber: string): Element | null => {
  for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
    if ((measure.getAttribute("number") ?? "") === measureNumber) return measure;
  }
  return null;
};

export const buildRenderDocWithNodeIds = (
  sourceDoc: Document,
  nodeIds: string[],
  idPrefix: string
): RenderDocBundle => {
  const map = new Map<string, string>();
  if (nodeIds.length === 0) {
    return { renderDoc: sourceDoc, svgIdToNodeId: map, noteCount: 0 };
  }

  const doc = cloneXmlDocument(sourceDoc);
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
    renderDoc: doc,
    svgIdToNodeId: map,
    noteCount: count,
  };
};

export const extractMeasureEditorDocument = (
  sourceDoc: Document,
  partId: string,
  measureNumber: string
): Document | null => {
  const srcRoot = sourceDoc.querySelector("score-partwise");
  const srcPart = findPartById(sourceDoc, partId);
  if (!srcRoot || !srcPart) return null;
  const srcMeasure = findMeasureByNumber(srcPart, measureNumber);
  if (!srcMeasure) return null;

  const collectEffectiveAttributes = (part: Element, targetMeasure: Element): Element | null => {
    let divisions: Element | null = null;
    let key: Element | null = null;
    let time: Element | null = null;
    let staves: Element | null = null;
    const clefByNo = new Map<string, Element>();

    for (const measure of Array.from(part.querySelectorAll(":scope > measure"))) {
      const attrs = measure.querySelector(":scope > attributes");
      if (attrs) {
        const nextDivisions = attrs.querySelector(":scope > divisions");
        if (nextDivisions) divisions = nextDivisions.cloneNode(true) as Element;
        const nextKey = attrs.querySelector(":scope > key");
        if (nextKey) key = nextKey.cloneNode(true) as Element;
        const nextTime = attrs.querySelector(":scope > time");
        if (nextTime) time = nextTime.cloneNode(true) as Element;
        const nextStaves = attrs.querySelector(":scope > staves");
        if (nextStaves) staves = nextStaves.cloneNode(true) as Element;
        for (const clef of Array.from(attrs.querySelectorAll(":scope > clef"))) {
          const no = clef.getAttribute("number") ?? "1";
          clefByNo.set(no, clef.cloneNode(true) as Element);
        }
      }
      if (measure === targetMeasure) break;
    }

    const doc = targetMeasure.ownerDocument;
    const effective = doc.createElement("attributes");
    if (divisions) effective.appendChild(divisions);
    if (key) effective.appendChild(key);
    if (time) effective.appendChild(time);
    if (staves) effective.appendChild(staves);
    for (const no of Array.from(clefByNo.keys()).sort()) {
      const clef = clefByNo.get(no);
      if (clef) effective.appendChild(clef);
    }
    return effective.childElementCount > 0 ? effective : null;
  };

  const patchedMeasure = srcMeasure.cloneNode(true) as Element;
  const effectiveAttrs = collectEffectiveAttributes(srcPart, srcMeasure);
  if (effectiveAttrs) {
    const existing = patchedMeasure.querySelector(":scope > attributes");
    if (!existing) {
      patchedMeasure.insertBefore(effectiveAttrs, patchedMeasure.firstChild);
    } else {
      const ensureSingle = (selector: string): void => {
        if (existing.querySelector(`:scope > ${selector}`)) return;
        const src = effectiveAttrs.querySelector(`:scope > ${selector}`);
        if (src) existing.appendChild(src.cloneNode(true));
      };
      ensureSingle("divisions");
      ensureSingle("key");
      ensureSingle("time");
      ensureSingle("staves");

      const existingClefNos = new Set(
        Array.from(existing.querySelectorAll(":scope > clef")).map((c) => c.getAttribute("number") ?? "1")
      );
      for (const clef of Array.from(effectiveAttrs.querySelectorAll(":scope > clef"))) {
        const no = clef.getAttribute("number") ?? "1";
        if (existingClefNos.has(no)) continue;
        existing.appendChild(clef.cloneNode(true));
      }
    }
  }

  const dst = document.implementation.createDocument("", "score-partwise", null);
  const dstRoot = dst.documentElement;
  if (!dstRoot) return null;
  const version = srcRoot.getAttribute("version");
  if (version) dstRoot.setAttribute("version", version);

  const srcPartList = sourceDoc.querySelector("score-partwise > part-list");
  const srcScorePart = findScorePartById(sourceDoc, partId);
  if (srcPartList && srcScorePart) {
    const dstPartList = dst.importNode(srcPartList, false);
    const dstScorePart = dst.importNode(srcScorePart, true) as Element;
    const dstPartName = dstScorePart.querySelector(":scope > part-name");
    if (dstPartName) dstPartName.textContent = "";
    const dstPartAbbreviation = dstScorePart.querySelector(":scope > part-abbreviation");
    if (dstPartAbbreviation) dstPartAbbreviation.textContent = "";
    dstPartList.appendChild(dstScorePart);
    dstRoot.appendChild(dstPartList);
  }

  const dstPart = dst.importNode(srcPart, false) as Element;
  dstPart.appendChild(dst.importNode(patchedMeasure, true));
  dstRoot.appendChild(dstPart);
  return dst;
};

export const replaceMeasureInMainDocument = (
  mainDoc: Document,
  partId: string,
  measureNumber: string,
  measureDoc: Document
): Document | null => {
  const replacementMeasure = measureDoc.querySelector("part > measure");
  if (!replacementMeasure) return null;
  const targetPart = findPartById(mainDoc, partId);
  if (!targetPart) return null;
  const targetMeasure = findMeasureByNumber(targetPart, measureNumber);
  if (!targetMeasure) return null;

  const next = cloneXmlDocument(mainDoc);
  const nextPart = findPartById(next, partId);
  if (!nextPart) return null;
  const nextTargetMeasure = findMeasureByNumber(nextPart, measureNumber);
  if (!nextTargetMeasure) return null;
  nextTargetMeasure.replaceWith(next.importNode(replacementMeasure, true));
  return next;
};

