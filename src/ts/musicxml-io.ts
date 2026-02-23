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

export const prettyPrintMusicXmlText = (xml: string): string => {
  const compact = String(xml || "").replace(/>\s+</g, "><").trim();
  const split = compact.replace(/(>)(<)(\/*)/g, "$1\n$2$3").split("\n");
  let indent = 0;
  const lines: string[] = [];
  for (const rawToken of split) {
    const token = rawToken.trim();
    if (!token) continue;
    if (/^<\//.test(token)) indent = Math.max(0, indent - 1);
    lines.push(`${" ".repeat(indent)}${token}`);
    const isOpening = /^<[^!?/][^>]*>$/.test(token);
    const isSelfClosing = /\/>$/.test(token);
    if (isOpening && !isSelfClosing) indent += 1;
  }
  return lines.join("\n");
};

const ensureTupletNotation = (
  note: Element,
  type: "start" | "stop",
  number: number,
  withDisplayAttrs: boolean
): void => {
  let notations = note.querySelector(":scope > notations");
  if (!notations) {
    notations = note.ownerDocument.createElement("notations");
    note.appendChild(notations);
  }
  const existing = notations.querySelector(`:scope > tuplet[type="${type}"]`);
  if (existing) {
    if (!existing.getAttribute("number")) existing.setAttribute("number", String(number));
    if (type === "start" && withDisplayAttrs) {
      if (!existing.getAttribute("bracket")) existing.setAttribute("bracket", "yes");
      if (!existing.getAttribute("show-number")) existing.setAttribute("show-number", "actual");
    }
    return;
  }
  const tuplet = note.ownerDocument.createElement("tuplet");
  tuplet.setAttribute("type", type);
  tuplet.setAttribute("number", String(number));
  if (type === "start" && withDisplayAttrs) {
    tuplet.setAttribute("bracket", "yes");
    tuplet.setAttribute("show-number", "actual");
  }
  notations.appendChild(tuplet);
};

const hasChordTag = (note: Element): boolean => note.querySelector(":scope > chord") !== null;
const laneKeyForNote = (note: Element): string => {
  const voice = note.querySelector(":scope > voice")?.textContent?.trim() ?? "1";
  const staff = note.querySelector(":scope > staff")?.textContent?.trim() ?? "1";
  return `${voice}::${staff}`;
};
const tupletSignatureForNote = (note: Element): string | null => {
  const tm = note.querySelector(":scope > time-modification");
  if (!tm) return null;
  const actual = Number(tm.querySelector(":scope > actual-notes")?.textContent?.trim() ?? "");
  const normal = Number(tm.querySelector(":scope > normal-notes")?.textContent?.trim() ?? "");
  if (!Number.isFinite(actual) || !Number.isFinite(normal) || actual <= 0 || normal <= 0) return null;
  return `${Math.round(actual)}/${Math.round(normal)}`;
};

const enrichTupletNotationsInDocument = (doc: Document): void => {
  for (const measure of Array.from(doc.querySelectorAll("part > measure"))) {
    const children = Array.from(measure.children);
    const activeByLane = new Map<string, { sig: string; notes: Element[] }>();
    const nextTupletNoByLane = new Map<string, number>();
    const flushLane = (lane: string): void => {
      const group = activeByLane.get(lane);
      activeByLane.delete(lane);
      if (!group || group.notes.length < 2) return;
      const number = nextTupletNoByLane.get(lane) ?? 1;
      nextTupletNoByLane.set(lane, number + 1);
      ensureTupletNotation(group.notes[0], "start", number, true);
      ensureTupletNotation(group.notes[group.notes.length - 1], "stop", number, false);
    };
    const flushAll = (): void => {
      for (const lane of Array.from(activeByLane.keys())) flushLane(lane);
    };

    for (const child of children) {
      if (child.tagName === "backup" || child.tagName === "forward") {
        flushAll();
        continue;
      }
      if (child.tagName !== "note") continue;
      const note = child as Element;
      if (hasChordTag(note)) continue;
      const lane = laneKeyForNote(note);
      const sig = tupletSignatureForNote(note);
      const current = activeByLane.get(lane);
      if (!sig) {
        flushLane(lane);
        continue;
      }
      if (!current || current.sig !== sig) {
        flushLane(lane);
        activeByLane.set(lane, { sig, notes: [note] });
      } else {
        current.notes.push(note);
      }
    }
    flushAll();
  }
};

const normalizePartListAndPartIds = (doc: Document): void => {
  const root = doc.querySelector("score-partwise");
  if (!root) return;
  const parts = Array.from(root.querySelectorAll(":scope > part"));
  if (parts.length === 0) return;

  const usedIds = new Set<string>();
  let seq = 1;
  const nextPartId = (): string => {
    while (usedIds.has(`P${seq}`)) seq += 1;
    const id = `P${seq}`;
    seq += 1;
    return id;
  };

  for (const part of parts) {
    const current = (part.getAttribute("id") ?? "").trim();
    if (!current || usedIds.has(current)) {
      const assigned = nextPartId();
      part.setAttribute("id", assigned);
      usedIds.add(assigned);
      continue;
    }
    usedIds.add(current);
  }

  let partList = root.querySelector(":scope > part-list");
  if (!partList) {
    partList = doc.createElement("part-list");
    root.insertBefore(partList, parts[0]);
  }

  const scorePartById = new Map<string, Element>();
  for (const scorePart of Array.from(partList.querySelectorAll(":scope > score-part"))) {
    const id = (scorePart.getAttribute("id") ?? "").trim();
    if (!id || scorePartById.has(id)) continue;
    scorePartById.set(id, scorePart);
  }

  for (const part of parts) {
    const id = (part.getAttribute("id") ?? "").trim();
    if (!id) continue;
    const existing = scorePartById.get(id);
    if (existing) {
      if (!existing.querySelector(":scope > part-name")) {
        const partName = doc.createElement("part-name");
        partName.textContent = "Music";
        existing.appendChild(partName);
      }
      continue;
    }
    const scorePart = doc.createElement("score-part");
    scorePart.setAttribute("id", id);
    const partName = doc.createElement("part-name");
    partName.textContent = "Music";
    scorePart.appendChild(partName);
    partList.appendChild(scorePart);
    scorePartById.set(id, scorePart);
  }
};

export const normalizeImportedMusicXmlText = (xml: string): string => {
  const doc = parseMusicXmlDocument(xml);
  if (!doc) return xml;
  normalizePartListAndPartIds(doc);
  enrichTupletNotationsInDocument(doc);
  return prettyPrintMusicXmlText(serializeMusicXmlDocument(doc));
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

  const replacementForMain = replacementMeasure.cloneNode(true) as Element;
  const replacementAttrs = replacementForMain.querySelector(":scope > attributes");
  const targetAttrs = targetMeasure.querySelector(":scope > attributes");
  // Editing preview injects effective attributes for rendering.
  // Do not introduce them into the main score when the original measure had none.
  if (replacementAttrs && !targetAttrs) {
    replacementAttrs.remove();
  }

  const next = cloneXmlDocument(mainDoc);
  const nextPart = findPartById(next, partId);
  if (!nextPart) return null;
  const nextTargetMeasure = findMeasureByNumber(nextPart, measureNumber);
  if (!nextTargetMeasure) return null;
  nextTargetMeasure.replaceWith(next.importNode(replacementForMain, true));
  return next;
};
