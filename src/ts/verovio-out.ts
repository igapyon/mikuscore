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
  const xml = new XMLSerializer().serializeToString(doc);
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

