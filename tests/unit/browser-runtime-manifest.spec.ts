/*
 * Copyright 2026 Toshiki Iga
 * SPDX-License-Identifier: Apache-2.0
 */

import { appendFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "../..");
const packageVersion = String(JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")).version);
const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop() as string, { recursive: true, force: true });
});

describe("browser runtime manifest scripts", () => {
  it("creates a versioned lock and rejects a tampered runtime", () => {
    const tempDir = makeTempDir();
    const runtimePath = path.join(tempDir, `miku-score-runtime-${packageVersion}.mjs`);
    const manifestPath = path.join(tempDir, `miku-score-runtime-${packageVersion}.json`);
    writeFileSync(runtimePath, "export const version = '0.6.1';\n", "utf8");

    expect(runNode([
      "scripts/create-browser-runtime-manifest.mjs",
      runtimePath,
      "--release-tag",
      `v${packageVersion}`,
      "--out",
      manifestPath,
    ]).status).toBe(0);

    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toMatchObject({
      schema_version: "miku-score.browser-runtime-lock/v1",
      release_tag: `v${packageVersion}`,
      package_version: packageVersion,
      asset_name: path.basename(runtimePath),
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(runNode([
      "scripts/verify-browser-runtime-manifest.mjs",
      manifestPath,
      runtimePath,
      "--expected-release-tag",
      `v${packageVersion}`,
    ]).status).toBe(0);

    const originalManifest = readFileSync(manifestPath, "utf8");
    const packageMismatchManifest = JSON.parse(originalManifest);
    packageMismatchManifest.package_version = "0.0.0";
    writeFileSync(manifestPath, `${JSON.stringify(packageMismatchManifest, null, 2)}\n`, "utf8");
    const packageMismatch = runNode([
      "scripts/verify-browser-runtime-manifest.mjs",
      manifestPath,
      runtimePath,
    ]);
    expect(packageMismatch.status).not.toBe(0);
    expect(packageMismatch.stderr).toContain("package version mismatch");
    writeFileSync(manifestPath, originalManifest, "utf8");

    appendFileSync(runtimePath, "// tampered\n", "utf8");
    const tampered = runNode([
      "scripts/verify-browser-runtime-manifest.mjs",
      manifestPath,
      runtimePath,
    ]);
    expect(tampered.status).not.toBe(0);
    expect(tampered.stderr).toContain("runtime sha256 mismatch");
  });

  it("rejects a runtime filename that does not bind to the release tag", () => {
    const tempDir = makeTempDir();
    const runtimePath = path.join(tempDir, "unexpected-runtime.mjs");
    writeFileSync(runtimePath, "export const version = '0.6.1';\n", "utf8");

    const result = runNode([
      "scripts/create-browser-runtime-manifest.mjs",
      runtimePath,
      "--release-tag",
      `v${packageVersion}`,
      "--out",
      path.join(tempDir, "manifest.json"),
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("runtime asset name mismatch");

    const tagMismatch = runNode([
      "scripts/create-browser-runtime-manifest.mjs",
      runtimePath,
      "--release-tag",
      "v0.0.0",
      "--out",
      path.join(tempDir, "tag-mismatch.json"),
    ]);
    expect(tagMismatch.status).not.toBe(0);
    expect(tagMismatch.stderr).toContain("release tag version");
  });
});

function makeTempDir(): string {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "miku-score-runtime-manifest-"));
  tempDirs.push(tempDir);
  return tempDir;
}

function runNode(args: string[]) {
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
}
