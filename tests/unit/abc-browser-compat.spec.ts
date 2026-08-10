/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { AbcCommon, AbcCompatParser } from "../../src/ts/abc-io";
import {
  installAbcBrowserCompatibility,
  installAbcBrowserCompatibilityOnWindow,
  type AbcBrowserCompatibilityTarget,
} from "../../src/ts/abc-browser-compat";

const initialAbcCommon = window.AbcCommon;
const initialAbcCompatParser = window.AbcCompatParser;

afterEach(() => {
  if (initialAbcCommon === undefined) delete window.AbcCommon;
  else window.AbcCommon = initialAbcCommon;
  if (initialAbcCompatParser === undefined) delete window.AbcCompatParser;
  else window.AbcCompatParser = initialAbcCompatParser;
});

describe("ABC browser compatibility publication", () => {
  it("keeps compatibility publication explicit for a supplied target", () => {
    const target: AbcBrowserCompatibilityTarget = {};
    delete window.AbcCommon;
    delete window.AbcCompatParser;

    installAbcBrowserCompatibility(target);

    expect(target.AbcCommon).toBe(AbcCommon);
    expect(target.AbcCompatParser).toBe(AbcCompatParser);
    expect(window.AbcCommon).toBeUndefined();
    expect(window.AbcCompatParser).toBeUndefined();
  });

  it("installs the legacy names on window only when requested", () => {
    delete window.AbcCommon;
    delete window.AbcCompatParser;

    expect(installAbcBrowserCompatibilityOnWindow()).toBe(true);
    expect(window.AbcCommon).toBe(AbcCommon);
    expect(window.AbcCompatParser).toBe(AbcCompatParser);
  });
});
