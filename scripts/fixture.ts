import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

type Files = Readonly<Record<string, string>>;

const tsconfig = JSON.stringify({ extends: "../../tsconfig.base.json", include: ["src"] });

function manifest(name: string, dependencies: Readonly<Record<string, string>> = {}): string {
  return JSON.stringify({ name, version: "0.0.0", private: true, type: "module", dependencies });
}

export function validWorkspace(): Files {
  return {
    "package.json": manifest("teacss-vs-tailwindcss"),
    "tsconfig.base.json": "{}",
    "apps/bench/package.json": manifest("@bench/bench", { "@bench/benchmark": "workspace:*" }),
    "apps/bench/tsconfig.json": tsconfig,
    "apps/bench/src/main.ts": "",
    "packages/benchmark/package.json": manifest("@bench/benchmark", { "@bench/infrastructure": "workspace:*", "@bench/subject-fake": "workspace:*" }),
    "packages/benchmark/tsconfig.json": tsconfig,
    "packages/infrastructure/package.json": manifest("@bench/infrastructure"),
    "packages/infrastructure/tsconfig.json": tsconfig,
    "packages/subject-fake/package.json": manifest("@bench/subject-fake", { "@bench/infrastructure": "workspace:*" }),
    "packages/subject-fake/tsconfig.json": tsconfig,
  };
}

export function withWorkspace<T>(files: Files, run: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "bench-check-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), content);
    }
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
