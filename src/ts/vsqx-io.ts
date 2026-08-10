/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  convertMusicXmlToVsqxWithBridge,
  convertVsqxToMusicXmlWithBridge,
  type MusicXmlToVsqxOptions,
  type MusicXmlToVsqxResult,
  type VsqxConversionBridge,
  type VsqxToMusicXmlOptions,
  type VsqxToMusicXmlResult,
} from "./vsqx-conversion";

export type {
  MusicXmlToVsqxOptions,
  MusicXmlToVsqxResult,
  VsqxConversionBridge,
  VsqxDiagnostic,
  VsqxIssue,
  VsqxIssueLevel,
  VsqxToMusicXmlOptions,
  VsqxToMusicXmlReport,
  VsqxToMusicXmlResult,
} from "./vsqx-conversion";

type UtaFormatixHooks = {
  normalizeImportedMusicXmlText?: (xml: string) => string;
};

declare global {
  interface Window {
    UtaFormatix3TsPlusMikuscore?: VsqxConversionBridge;
    __utaformatix3TsPlusMikuscoreHooks?: UtaFormatixHooks;
  }
}

const bridge = (): VsqxConversionBridge | null => {
  if (typeof window === "undefined") return null;
  return window.UtaFormatix3TsPlusMikuscore ?? null;
};

export const installVsqxMusicXmlNormalizationHook = (
  normalizeImportedMusicXmlText: (xml: string) => string
): void => {
  if (typeof window === "undefined") return;
  window.__utaformatix3TsPlusMikuscoreHooks = {
    ...(window.__utaformatix3TsPlusMikuscoreHooks ?? {}),
    normalizeImportedMusicXmlText,
  };
};

export const isVsqxBridgeAvailable = (): boolean => bridge() !== null;

export const convertVsqxToMusicXml = (
  vsqxText: string,
  options?: VsqxToMusicXmlOptions
): VsqxToMusicXmlResult => {
  return convertVsqxToMusicXmlWithBridge(bridge(), vsqxText, options);
};

export const convertMusicXmlToVsqx = (
  musicXmlText: string,
  options?: MusicXmlToVsqxOptions
): MusicXmlToVsqxResult => {
  return convertMusicXmlToVsqxWithBridge(bridge(), musicXmlText, options);
};
