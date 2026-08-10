/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

export type VerovioToolkitApi = {
  setOptions: (options: Record<string, unknown>) => void;
  loadData: (xml: string) => boolean;
  getPageCount: () => number;
  renderToSVG: (page: number, options: Record<string, unknown>) => string;
};

export type VerovioRenderResult = {
  svg: string;
  pageCount: number;
};

export type XmlDocumentSerializer = (doc: Document) => string;

type OpenSlurStacks = Map<string, Element[]>;

const DEFAULT_SLUR_NUMBER = "1";

const cloneXmlDocument = (doc: Document): Document => {
  const cloned = doc.implementation.createDocument("", "", null);
  const root = cloned.importNode(doc.documentElement, true);
  cloned.appendChild(root);
  return cloned;
};

const childElementsBySelector = (parent: ParentNode, selector: string): Element[] => {
  return Array.from(parent.querySelectorAll(selector));
};

const pruneEmptyNotations = (notations: Element | null): void => {
  if (!notations || notations.tagName !== "notations") return;
  if (notations.children.length > 0) return;
  notations.remove();
};

const removeSlurAndPruneNotations = (slur: Element): void => {
  const notations = slur.parentElement;
  slur.remove();
  pruneEmptyNotations(notations);
};

const getSlurNumber = (slur: Element): string => {
  return (slur.getAttribute("number") ?? DEFAULT_SLUR_NUMBER).trim() || DEFAULT_SLUR_NUMBER;
};

const getSlurType = (slur: Element): string => {
  return (slur.getAttribute("type") ?? "").trim().toLowerCase();
};

const openSlurStack = (openSlurs: OpenSlurStacks, number: string): Element[] => {
  const stack = openSlurs.get(number) ?? [];
  openSlurs.set(number, stack);
  return stack;
};

const processSlurForRender = (slur: Element, openSlurs: OpenSlurStacks): void => {
  const number = getSlurNumber(slur);
  const type = getSlurType(slur);
  const stack = openSlurStack(openSlurs, number);

  if (type === "start") {
    stack.push(slur);
    return;
  }
  if (type === "stop") {
    if (stack.length > 0) {
      stack.pop();
    } else {
      removeSlurAndPruneNotations(slur);
    }
    return;
  }
  if (type === "continue") {
    if (stack.length === 0) {
      removeSlurAndPruneNotations(slur);
      return;
    }
    stack.pop();
    stack.push(slur);
  }
};

const sanitizeSlursForRender = (doc: Document): void => {
  const parts = childElementsBySelector(doc, "score-partwise > part");
  for (const part of parts) {
    const openSlurs: OpenSlurStacks = new Map();
    const measures = childElementsBySelector(part, ":scope > measure");
    for (const measure of measures) {
      const notes = childElementsBySelector(measure, ":scope > note");
      for (const note of notes) {
        const slurs = childElementsBySelector(note, ":scope > notations > slur");
        for (const slur of slurs) processSlurForRender(slur, openSlurs);
      }
    }
    for (const danglingStarts of openSlurs.values()) {
      for (const startSlur of danglingStarts) removeSlurAndPruneNotations(startSlur);
    }
  }
};

export const prepareMusicXmlDomForVerovio = (doc: Document): Document => {
  const renderDoc = cloneXmlDocument(doc);
  sanitizeSlursForRender(renderDoc);
  return renderDoc;
};

export const renderMusicXmlWithVerovioToolkit = (
  xml: string,
  options: Record<string, unknown>,
  toolkit: VerovioToolkitApi
): VerovioRenderResult => {
  toolkit.setOptions(options);
  if (!toolkit.loadData(xml)) {
    throw new Error("verovio loadData failed.");
  }
  const pageCount = toolkit.getPageCount();
  if (!Number.isFinite(pageCount) || pageCount < 1) {
    throw new Error("verovio returned an invalid pageCount.");
  }
  const svg = toolkit.renderToSVG(1, {});
  if (!svg) {
    throw new Error("Failed to generate SVG with verovio.");
  }
  return { svg, pageCount };
};

export const renderMusicXmlDomWithVerovioToolkit = (
  doc: Document,
  options: Record<string, unknown>,
  toolkit: VerovioToolkitApi,
  serializeDocument: XmlDocumentSerializer
): VerovioRenderResult => {
  const renderDoc = prepareMusicXmlDomForVerovio(doc);
  return renderMusicXmlWithVerovioToolkit(
    serializeDocument(renderDoc),
    options,
    toolkit
  );
};
