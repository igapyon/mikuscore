#!/usr/bin/env node
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const baseDir = resolve(root, "tests/tmp/mei-official");

if (!existsSync(baseDir)) {
  console.error("No report directory:", baseDir);
  process.exit(1);
}

const parseReport = (text) => {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let cur = {};
  for (const line of lines) {
    if (!line.trim()) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const k = line.slice(0, idx);
    const v = line.slice(idx + 1);
    if (k === "official_ref" && Object.keys(cur).length > 0) {
      blocks.push(cur);
      cur = {};
    }
    cur[k] = v;
  }
  if (Object.keys(cur).length > 0) blocks.push(cur);
  return blocks;
};

const dirs = readdirSync(baseDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const rows = [];
for (const id of dirs) {
  const reportPath = resolve(baseDir, id, "report.txt");
  if (!existsSync(reportPath)) continue;
  const blocks = parseReport(readFileSync(reportPath, "utf8"));
  const semantics = blocks.find((b) => b.semantic_ratio !== undefined) ?? {};
  const officials = blocks.filter((b) => b.official_ref !== undefined);
  const officialBest = officials
    .filter((b) => b.official_ratio !== undefined)
    .map((b) => ({ ref: b.official_ref, ratio: Number(b.official_ratio), delta: Number(b.official_conversion_delta_ratio ?? "NaN") }))
    .sort((a, b) => a.ratio - b.ratio)[0];

  rows.push({
    id,
    semanticRatio: Number(semantics.semantic_ratio ?? "NaN"),
    semanticChanged: Number(semantics.semantic_changed_ratio ?? "NaN"),
    bestOfficialRef: officialBest?.ref ?? "-",
    bestOfficialRatio: officialBest?.ratio ?? Number.NaN,
    bestOfficialDelta: officialBest?.delta ?? Number.NaN,
    skippedOfficial: officials.filter((b) => b.official_status === "skip-invalid-image").length,
  });
}

console.log("MEI Official Visual Compare Summary");
console.log("fixture\tsemantic_ratio\tsemantic_changed_ratio\tbest_official_ref\tbest_official_ratio\tconversion_delta\tskipped_official");
for (const r of rows) {
  console.log(
    [
      r.id,
      Number.isFinite(r.semanticRatio) ? r.semanticRatio.toFixed(6) : "NaN",
      Number.isFinite(r.semanticChanged) ? r.semanticChanged.toFixed(6) : "NaN",
      r.bestOfficialRef,
      Number.isFinite(r.bestOfficialRatio) ? r.bestOfficialRatio.toFixed(6) : "NaN",
      Number.isFinite(r.bestOfficialDelta) ? r.bestOfficialDelta.toFixed(6) : "NaN",
      r.skippedOfficial,
    ].join("\t")
  );
}

