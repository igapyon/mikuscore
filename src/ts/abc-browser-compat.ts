/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import { AbcCommon, AbcCompatParser } from "./abc-io";

export type AbcBrowserCompatibilityTarget = {
  AbcCommon?: typeof AbcCommon;
  AbcCompatParser?: typeof AbcCompatParser;
};

declare global {
  interface Window extends AbcBrowserCompatibilityTarget {}
}

export const installAbcBrowserCompatibility = (
  target: AbcBrowserCompatibilityTarget
): void => {
  target.AbcCommon = AbcCommon;
  target.AbcCompatParser = AbcCompatParser;
};

export const installAbcBrowserCompatibilityOnWindow = (): boolean => {
  if (typeof window === "undefined") return false;
  installAbcBrowserCompatibility(window);
  return true;
};
