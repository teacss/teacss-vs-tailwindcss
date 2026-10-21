import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface Workspace {
  readonly dir: string;
  write(relativePath: string, content: string): void;
  read(relativePath: string): string;
  remove(): void;
}

export function createWorkspace(prefix: string): Workspace {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  return {
    dir,
    write(relativePath, content) {
      const path = join(dir, relativePath);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    },
    read: (relativePath) => readFileSync(join(dir, relativePath), "utf8"),
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
}
