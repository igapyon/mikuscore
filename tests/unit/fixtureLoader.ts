import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const loadFixture = (name: string): string =>
  readFileSync(resolve(process.cwd(), "tests", "fixtures", name), "utf-8");
