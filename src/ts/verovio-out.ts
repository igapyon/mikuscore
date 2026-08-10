/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  renderMusicXmlDomWithVerovioToolkit,
  type VerovioRenderResult,
  type VerovioToolkitApi,
  type XmlDocumentSerializer,
} from "./verovio-render";

export type { VerovioRenderResult, VerovioToolkitApi, XmlDocumentSerializer } from "./verovio-render";

type VerovioRuntime = {
  module?: {
    calledRun?: boolean;
    cwrap?: unknown;
    onRuntimeInitialized?: (() => void) | null;
  };
  toolkit?: new () => VerovioToolkitApi;
};

const VEROVIO_INIT_TIMEOUT_MS = 8000;

let verovioToolkit: VerovioToolkitApi | null = null;
let verovioInitPromise: Promise<VerovioToolkitApi | null> | null = null;

const getVerovioRuntime = (): VerovioRuntime | null => {
  return (window as unknown as { verovio?: VerovioRuntime }).verovio ?? null;
};

const isVerovioRuntimeReady = (moduleObj: NonNullable<VerovioRuntime["module"]>): boolean => {
  return Boolean(moduleObj.calledRun && typeof moduleObj.cwrap === "function");
};

const waitForVerovioRuntime = async (
  moduleObj: NonNullable<VerovioRuntime["module"]>
): Promise<void> => {
  if (isVerovioRuntimeReady(moduleObj)) return;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Timed out while waiting for verovio initialization."));
    }, VEROVIO_INIT_TIMEOUT_MS);

    const complete = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve();
    };

    const previous = moduleObj.onRuntimeInitialized;
    moduleObj.onRuntimeInitialized = () => {
      if (typeof previous === "function") previous();
      complete();
    };

    if (isVerovioRuntimeReady(moduleObj)) complete();
  });
};

const ensureVerovioToolkit = async (): Promise<VerovioToolkitApi | null> => {
  if (verovioToolkit) return verovioToolkit;
  if (verovioInitPromise) return verovioInitPromise;

  verovioInitPromise = (async () => {
    const runtime = getVerovioRuntime();
    if (!runtime || typeof runtime.toolkit !== "function") {
      throw new Error("verovio.js is not loaded.");
    }
    const moduleObj = runtime.module;
    if (!moduleObj) {
      throw new Error("verovio module was not found.");
    }

    await waitForVerovioRuntime(moduleObj);
    verovioToolkit = new runtime.toolkit();
    return verovioToolkit;
  })().catch((error) => {
    verovioInitPromise = null;
    throw error;
  });

  return verovioInitPromise;
};

export type BrowserVerovioCapability = {
  toolkit: BrowserVerovioToolkit;
  serializeDocument: XmlDocumentSerializer;
};

export class BrowserVerovioToolkit implements VerovioToolkitApi {
  private toolkit: VerovioToolkitApi | null = null;

  public setToolkit(toolkit: VerovioToolkitApi): void {
    this.toolkit = toolkit;
  }

  public setOptions(options: Record<string, unknown>): void {
    this.requireToolkit().setOptions(options);
  }

  public loadData(xml: string): boolean {
    return this.requireToolkit().loadData(xml);
  }

  public getPageCount(): number {
    return this.requireToolkit().getPageCount();
  }

  public renderToSVG(page: number, options: Record<string, unknown>): string {
    return this.requireToolkit().renderToSVG(page, options);
  }

  private requireToolkit(): VerovioToolkitApi {
    if (!this.toolkit) {
      throw new Error("verovio toolkit is not initialized.");
    }
    return this.toolkit;
  }
}

/**
 * Adapts a browser-global Verovio runtime for an explicit consumer. The
 * returned toolkit is a deferred proxy when Verovio is still initializing;
 * callers that need rendering must await initializeBrowserVerovioCapability.
 */
export const createBrowserVerovioCapability = (): BrowserVerovioCapability | null => {
  const runtime = getVerovioRuntime();
  if (!runtime || typeof runtime.toolkit !== "function" || !runtime.module) return null;
  const toolkit = new BrowserVerovioToolkit();
  if (isVerovioRuntimeReady(runtime.module)) toolkit.setToolkit(new runtime.toolkit());
  return {
    toolkit,
    serializeDocument: (renderDoc) => new XMLSerializer().serializeToString(renderDoc),
  };
};

export const initializeBrowserVerovioCapability = async (
  capability: BrowserVerovioCapability | null
): Promise<void> => {
  if (!capability) {
    throw new Error("verovio.js is not loaded.");
  }
  const toolkit = await ensureVerovioToolkit();
  if (!toolkit) throw new Error("Failed to initialize verovio toolkit.");
  capability.toolkit.setToolkit(toolkit);
};

export const renderMusicXmlDomToSvg = async (
  doc: Document,
  options: Record<string, unknown>
): Promise<VerovioRenderResult> => {
  const toolkit = await ensureVerovioToolkit();
  if (!toolkit) {
    throw new Error("Failed to initialize verovio toolkit.");
  }
  return renderMusicXmlDomWithVerovioToolkit(
    doc,
    options,
    toolkit,
    (renderDoc) => new XMLSerializer().serializeToString(renderDoc)
  );
};
