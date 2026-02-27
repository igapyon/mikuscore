import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { convertMeiToMusicXml } from "../../src/ts/mei-io";
import { parseMusicXmlDocument } from "../../src/ts/musicxml-io";

const run = (cmd: string, args: string[], allowNonZero = false): { stdout: string; stderr: string; status: number } => {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (!allowNonZero && (r.status ?? 1) !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed: ${r.stderr || r.stdout}`);
  }
  return { stdout: r.stdout ?? "", stderr: r.stderr ?? "", status: r.status ?? 1 };
};

const imageArea = (magick: string, path: string): number => {
  const out = run(magick, ["identify", "-format", "%[fx:w*h]", path]).stdout.trim();
  return Number(out);
};

const changedPixelRatio = (magick: string, path: string): { changed: number; total: number; ratio: number } => {
  const total = imageArea(magick, path);
  const hist = run(magick, [path, "-format", "%c", "histogram:info:-"]).stdout;
  const m = hist.match(/^\s*([0-9]+):/m);
  const dominant = m ? Number(m[1]) : 0;
  const changed = total - dominant;
  const ratio = total > 0 ? changed / total : Number.NaN;
  return { changed, total, ratio };
};

const trimGeometry = (magick: string, path: string): string => {
  return run(magick, [path, "-fuzz", "0%", "-trim", "-format", "%wx%h+%X+%Y", "info:"]).stdout.trim();
};

const waitForToolkit = async (Verovio: { toolkit: new () => unknown }): Promise<unknown> => {
  for (let i = 0; i < 50; i += 1) {
    try {
      return new Verovio.toolkit();
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("Timed out while waiting for verovio toolkit initialization.");
};

const assertStructuralSemantics = (fixtureId: string, musicXml: string): void => {
  const doc = parseMusicXmlDocument(musicXml);
  expect(doc).not.toBeNull();
  if (!doc) return;
  expect(doc.querySelectorAll("part > measure > note").length).toBeGreaterThan(0);

  const mustContain = (selector: string): void => {
    expect(doc.querySelector(selector)).not.toBeNull();
  };

  switch (fixtureId) {
    case "beam-grace":
      mustContain("part > measure > note > grace");
      break;
    case "beam-secondary":
      mustContain("part > measure > note > beam[number=\"2\"]");
      break;
    case "beamspan-min":
      mustContain("part > measure > note > beam");
      break;
    case "tie-crossbar-min":
      mustContain("part > measure > note > tie[type=\"start\"]");
      mustContain("part > measure > note > tie[type=\"stop\"]");
      break;
    case "slur-min":
      mustContain("part > measure > note > notations > slur[type=\"start\"]");
      mustContain("part > measure > note > notations > slur[type=\"stop\"]");
      break;
    case "hairpin-min":
      expect(
        doc.querySelector("part > measure > direction > direction-type > wedge[type=\"start\"]")
        || doc.querySelector("part > measure > direction > direction-type > wedge[type=\"crescendo\"]")
        || doc.querySelector("part > measure > direction > direction-type > wedge[type=\"diminuendo\"]")
      ).not.toBeNull();
      mustContain("part > measure > direction > direction-type > wedge[type=\"stop\"]");
      break;
    case "dynam-min":
      expect(
        doc.querySelector("part > measure > direction > direction-type > dynamics")
        || doc.querySelector("part > measure > direction > direction-type > words")
      ).not.toBeNull();
      break;
    case "tuplet-min":
      mustContain("part > measure > note > time-modification");
      break;
    case "fermata-min":
      mustContain("part > measure > note > notations > fermata");
      break;
    case "gliss-min":
      mustContain("part > measure > note > notations > glissando[type=\"start\"]");
      mustContain("part > measure > note > notations > glissando[type=\"stop\"]");
      break;
    default:
      break;
  }
};

describe("local mei official visual compare", () => {
  const localFixtureRoot = resolve(process.cwd(), "tests", "fixtures-local", "mei-official");
  const requiredFixturePaths = [
    resolve(localFixtureRoot, "beam-grace", "source-listing-132-snippet.mei"),
    resolve(localFixtureRoot, "beam-secondary", "source-listing-142-snippet.mei"),
    resolve(localFixtureRoot, "beamspan-min", "source-listing-147-inspired.mei"),
    resolve(localFixtureRoot, "tie-crossbar-min", "source-listing-148-inspired.mei"),
    resolve(localFixtureRoot, "slur-min", "source-listing-152-inspired.mei"),
    resolve(localFixtureRoot, "hairpin-min", "source-hairpin-inspired.mei"),
    resolve(localFixtureRoot, "dynam-min", "source-dynam-inspired.mei"),
    resolve(localFixtureRoot, "tuplet-min", "source-tuplet-inspired.mei"),
    resolve(localFixtureRoot, "fermata-min", "source-fermata-inspired.mei"),
    resolve(localFixtureRoot, "gliss-min", "source-gliss-inspired.mei"),
  ];
  const itWithLocalFixtures = requiredFixturePaths.every((p) => existsSync(p)) ? it : it.skip;

  itWithLocalFixtures("converts official MEI fixtures and compares rendered images", async () => {
    const magick = run("which", ["magick"], true).stdout.trim();
    const rsvgConvert = run("which", ["rsvg-convert"], true).stdout.trim();
    if (!magick || !rsvgConvert) {
      return;
    }

    const root = process.cwd();
    const fixtures = [
      {
        id: "beam-grace",
        meiFile: "source-listing-132-snippet.mei",
        refImages: ["grace-300.png", "grace-300-v4.png"],
        w: 673,
        h: 110,
        semanticThreshold: 0.08,
      },
      {
        id: "beam-secondary",
        meiFile: "source-listing-142-snippet.mei",
        refImages: ["beam-a-20100510.png"],
        w: 640,
        h: 160,
        semanticThreshold: 0.14,
      },
      {
        id: "beamspan-min",
        meiFile: "source-listing-147-inspired.mei",
        refImages: [],
        w: 800,
        h: 160,
        semanticThreshold: 0.1,
      },
      {
        id: "tie-crossbar-min",
        meiFile: "source-listing-148-inspired.mei",
        refImages: [],
        w: 800,
        h: 160,
        semanticThreshold: 0.1,
      },
      {
        id: "slur-min",
        meiFile: "source-listing-152-inspired.mei",
        refImages: [],
        w: 800,
        h: 160,
        semanticThreshold: 0.1,
      },
      {
        id: "hairpin-min",
        meiFile: "source-hairpin-inspired.mei",
        refImages: [],
        w: 800,
        h: 180,
        semanticThreshold: 0.1,
      },
      {
        id: "dynam-min",
        meiFile: "source-dynam-inspired.mei",
        refImages: [],
        w: 800,
        h: 180,
        semanticThreshold: 0.1,
      },
      {
        id: "tuplet-min",
        meiFile: "source-tuplet-inspired.mei",
        refImages: [],
        w: 800,
        h: 180,
        semanticThreshold: 0.1,
      },
      {
        id: "fermata-min",
        meiFile: "source-fermata-inspired.mei",
        refImages: [],
        w: 800,
        h: 180,
        semanticThreshold: 0.1,
      },
      {
        id: "gliss-min",
        meiFile: "source-gliss-inspired.mei",
        refImages: [],
        w: 800,
        h: 180,
        semanticThreshold: 0.1,
      },
    ] as const;

    for (const fixture of fixtures) {
      const fixtureDir = resolve(root, "tests/fixtures-local/mei-official", fixture.id);
      const outDir = resolve(root, "tests/tmp/mei-official", fixture.id);
      mkdirSync(outDir, { recursive: true });

      const meiPath = resolve(fixtureDir, fixture.meiFile);
      const mxPath = resolve(outDir, "converted.musicxml");
      const svgPath = resolve(outDir, "converted.svg");
      const meiSvgPath = resolve(outDir, "original-mei.svg");
      const renderedPngPath = resolve(outDir, "converted.png");
      const meiRenderedPngPath = resolve(outDir, "original-mei.png");
      const diffSemanticPngPath = resolve(outDir, "diff-semantic.png");
      const reportPath = resolve(outDir, "report.txt");

      const mei = readFileSync(meiPath, "utf8");
      const musicXml = convertMeiToMusicXml(mei);
      assertStructuralSemantics(fixture.id, musicXml);
      writeFileSync(mxPath, musicXml, "utf8");

      const verovioCjsPath = resolve(outDir, "verovio.cjs");
      copyFileSync(resolve(root, "src/js/verovio.js"), verovioCjsPath);
      const require = createRequire(import.meta.url);
      const verovio = require(verovioCjsPath) as { toolkit: new () => { loadData: (data: string, options: Record<string, unknown>) => number; renderToSVG: (page: number, options: Record<string, unknown>) => string } };
      const toolkit = (await waitForToolkit(verovio)) as {
        loadData: (data: string, options: Record<string, unknown>) => number;
        renderToSVG: (page: number, options: Record<string, unknown>) => string;
      };

      const loadedMei = toolkit.loadData(mei, { inputFrom: "mei" });
      expect(loadedMei).toBe(1);
      const meiSvg = toolkit.renderToSVG(1, {});
      writeFileSync(meiSvgPath, meiSvg, "utf8");

      const loadedMx = toolkit.loadData(musicXml, { inputFrom: "musicxml" });
      expect(loadedMx).toBe(1);
      const mxSvg = toolkit.renderToSVG(1, {});
      writeFileSync(svgPath, mxSvg, "utf8");

      run(rsvgConvert, ["-w", String(fixture.w), "-h", String(fixture.h), meiSvgPath, "-o", meiRenderedPngPath]);
      run(rsvgConvert, ["-w", String(fixture.w), "-h", String(fixture.h), svgPath, "-o", renderedPngPath]);
      run(magick, [meiRenderedPngPath, "-background", "white", "-alpha", "remove", "-alpha", "off", "-colorspace", "sRGB", meiRenderedPngPath]);
      run(magick, [renderedPngPath, "-background", "white", "-alpha", "remove", "-alpha", "off", "-colorspace", "sRGB", renderedPngPath]);

      const officialLines: string[] = [];
      if (fixture.refImages.length === 0) {
        officialLines.push("official_status=no-official-reference\n");
      }
      for (const refImage of fixture.refImages) {
        const refPngPath = resolve(fixtureDir, refImage);
        const identify = run(magick, ["identify", refPngPath], true);
        if (identify.status !== 0) {
          officialLines.push(`official_ref=${refImage}\nofficial_status=skip-invalid-image\n`);
          continue;
        }
        const refNormPngPath = resolve(outDir, `reference-${refImage}`);
        const refDiffPngPath = resolve(outDir, `diff-official-${refImage}`);
        const refVsMeiDiffPngPath = resolve(outDir, `diff-official-vs-original-${refImage}`);
        run(magick, [refPngPath, "-colorspace", "sRGB", refNormPngPath]);
        const cmp = run(magick, ["compare", "-metric", "AE", refNormPngPath, renderedPngPath, refDiffPngPath], true);
        const cmpRefVsMei = run(magick, ["compare", "-metric", "AE", refNormPngPath, meiRenderedPngPath, refVsMeiDiffPngPath], true);
        const metricRaw = (cmp.stderr || cmp.stdout).trim().split(/\s+/)[0] ?? "";
        const metric = Number(metricRaw);
        const ratio = Number.isFinite(metric) ? metric / (fixture.w * fixture.h) : Number.NaN;
        const baselineRaw = (cmpRefVsMei.stderr || cmpRefVsMei.stdout).trim().split(/\s+/)[0] ?? "";
        const baseline = Number(baselineRaw);
        const baselineRatio = Number.isFinite(baseline) ? baseline / (fixture.w * fixture.h) : Number.NaN;
        const conversionDelta = Number.isFinite(ratio) && Number.isFinite(baselineRatio) ? ratio - baselineRatio : Number.NaN;
        const offChanged = changedPixelRatio(magick, refDiffPngPath);
        const offVsMeiChanged = changedPixelRatio(magick, refVsMeiDiffPngPath);
        const offBBox = trimGeometry(magick, refDiffPngPath);
        const offVsMeiBBox = trimGeometry(magick, refVsMeiDiffPngPath);
        officialLines.push(
          `official_ref=${refImage}\nofficial_metricAE=${metricRaw}\nofficial_ratio=${ratio}\nofficial_status=${cmp.status}\n` +
            `official_vs_original_metricAE=${baselineRaw}\nofficial_vs_original_ratio=${baselineRatio}\nofficial_vs_original_status=${cmpRefVsMei.status}\n` +
            `official_conversion_delta_ratio=${conversionDelta}\n` +
            `official_changed_pixels=${offChanged.changed}\nofficial_changed_total=${offChanged.total}\nofficial_changed_ratio=${offChanged.ratio}\n` +
            `official_bbox=${offBBox}\n` +
            `official_vs_original_changed_pixels=${offVsMeiChanged.changed}\nofficial_vs_original_changed_total=${offVsMeiChanged.total}\nofficial_vs_original_changed_ratio=${offVsMeiChanged.ratio}\n` +
            `official_vs_original_bbox=${offVsMeiBBox}\n` +
            `reference=${refNormPngPath}\ndiff_official=${refDiffPngPath}\ndiff_official_vs_original=${refVsMeiDiffPngPath}\n`
        );
      }

      const cmpSemantic = run(magick, ["compare", "-metric", "AE", meiRenderedPngPath, renderedPngPath, diffSemanticPngPath], true);
      const semanticRaw = (cmpSemantic.stderr || cmpSemantic.stdout).trim().split(/\s+/)[0] ?? "";
      const semanticMetric = Number(semanticRaw);
      const semanticRatio = Number.isFinite(semanticMetric) ? semanticMetric / (fixture.w * fixture.h) : Number.NaN;
      const semChanged = changedPixelRatio(magick, diffSemanticPngPath);
      const semBBox = trimGeometry(magick, diffSemanticPngPath);
      writeFileSync(
        reportPath,
        `${officialLines.join("")}` +
          `semantic_metricAE=${semanticRaw}\nsemantic_ratio=${semanticRatio}\nsemantic_status=${cmpSemantic.status}\n` +
          `semantic_changed_pixels=${semChanged.changed}\nsemantic_changed_total=${semChanged.total}\nsemantic_changed_ratio=${semChanged.ratio}\n` +
          `semantic_bbox=${semBBox}\n` +
          `rendered=${renderedPngPath}\noriginalMeiRendered=${meiRenderedPngPath}\n` +
          `diff_semantic=${diffSemanticPngPath}\n`,
        "utf8"
      );

      expect(officialLines.length).toBeGreaterThan(0);
      expect(existsSync(diffSemanticPngPath)).toBe(true);
      expect(Number.isFinite(semanticMetric)).toBe(true);
      expect(semanticRatio).toBeLessThanOrEqual(fixture.semanticThreshold);
    }
  }, 30000);
});
