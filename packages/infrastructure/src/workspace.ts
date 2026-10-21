import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export interface Workspace {
  readonly dir: string;
  write(relativePath: string, content: string): void;
  read(relativePath: string): string;
  list(relativePath: string): string[];
  /** A symlink at `relativePath` to `target`, so a tool that resolves from the project finds a package. */
  link(relativePath: string, target: string): void;
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
    list: (relativePath) => (existsSync(join(dir, relativePath)) ? readdirSync(join(dir, relativePath)).sort() : []),
    link(relativePath, target) {
      const path = join(dir, relativePath);
      mkdirSync(dirname(path), { recursive: true });
      symlinkSync(target, path);
    },
    remove: () => rmSync(dir, { recursive: true, force: true }),
  };
}
