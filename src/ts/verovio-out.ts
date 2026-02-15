export type VerovioToolkitApi = {
  setOptions: (options: Record<string, unknown>) => void;
  loadData: (xml: string) => boolean;
  getPageCount: () => number;
  renderToSVG: (page: number, options: Record<string, unknown>) => string;
};

type VerovioRuntime = {
  module?: {
    calledRun?: boolean;
    cwrap?: unknown;
    onRuntimeInitialized?: (() => void) | null;
  };
  toolkit?: new () => VerovioToolkitApi;
};

export type VerovioRenderResult = {
  svg: string;
  pageCount: number;
};

let verovioToolkit: VerovioToolkitApi | null = null;
let verovioInitPromise: Promise<VerovioToolkitApi | null> | null = null;

const cloneXmlDocument = (doc: Document): Document => {
  const cloned = document.implementation.createDocument("", "", null);
  const root = cloned.importNode(doc.documentElement, true);
  cloned.appendChild(root);
  return cloned;
};

const pruneEmptyNotations = (notations: Element | null): void => {
  if (!notations || notations.tagName !== "notations") return;
  if (notations.children.length > 0) return;
  notations.remove();
};

const sanitizeSlursForRender = (doc: Document): void => {
  const parts = Array.from(doc.querySelectorAll("score-partwise > part"));
  for (const part of parts) {
    const openSlurs = new Map<string, Element[]>();
    const measures = Array.from(part.querySelectorAll(":scope > measure"));
    for (const measure of measures) {
      const notes = Array.from(measure.querySelectorAll(":scope > note"));
      for (const note of notes) {
        const slurs = Array.from(note.querySelectorAll(":scope > notations > slur"));
        for (const slur of slurs) {
          const number = (slur.getAttribute("number") ?? "1").trim() || "1";
          const type = (slur.getAttribute("type") ?? "").trim().toLowerCase();
          const stack = openSlurs.get(number) ?? [];
          if (type === "start") {
            stack.push(slur);
            openSlurs.set(number, stack);
            continue;
          }
          if (type === "stop") {
            if (stack.length > 0) {
              stack.pop();
            } else {
              const notations = slur.parentElement;
              slur.remove();
              pruneEmptyNotations(notations);
            }
            continue;
          }
          if (type === "continue") {
            if (stack.length === 0) {
              const notations = slur.parentElement;
              slur.remove();
              pruneEmptyNotations(notations);
              continue;
            }
            stack.pop();
            stack.push(slur);
            openSlurs.set(number, stack);
          }
        }
      }
    }
    for (const danglingStarts of openSlurs.values()) {
      for (const startSlur of danglingStarts) {
        const notations = startSlur.parentElement;
        startSlur.remove();
        pruneEmptyNotations(notations);
      }
    }
  }
};

const getVerovioRuntime = (): VerovioRuntime | null => {
  return (window as unknown as { verovio?: VerovioRuntime }).verovio ?? null;
};

const ensureVerovioToolkit = async (): Promise<VerovioToolkitApi | null> => {
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
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const timeoutId = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error("verovio 初期化待機がタイムアウトしました。"));
        }, 8000);

        const complete = () => {
          if (settled) return;
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

export const renderMusicXmlDomToSvg = async (
  doc: Document,
  options: Record<string, unknown>
): Promise<VerovioRenderResult> => {
  const toolkit = await ensureVerovioToolkit();
  if (!toolkit) {
    throw new Error("verovio toolkit の初期化に失敗しました。");
  }
  // Keep source DOM intact and only sanitize slur mismatch on render copy.
  const renderDoc = cloneXmlDocument(doc);
  sanitizeSlursForRender(renderDoc);
  const xml = new XMLSerializer().serializeToString(renderDoc);
  toolkit.setOptions(options);
  const loaded = toolkit.loadData(xml);
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
  return { svg, pageCount };
};
