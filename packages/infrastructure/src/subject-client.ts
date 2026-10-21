import type { Workspace } from "./workspace.ts";

declare const subjectIdBrand: unique symbol;
export type SubjectId = string & { readonly [subjectIdBrand]: true };

const SUBJECT_ID = /^[a-z][a-z0-9-]*$/;

export function subjectId(raw: string): SubjectId {
  if (!SUBJECT_ID.test(raw)) throw new Error(`"${raw}" is not a subject id (lowercase letters, digits and dashes)`);
  return raw as SubjectId;
}

export interface SubjectVersions {
  readonly packages: Readonly<Record<string, string>>;
}

export interface EngineInput {
  /** Candidates in the subject's own syntax. */
  readonly candidates: readonly string[];
}

export interface EngineOutput {
  readonly css: string;
}

export interface ProjectFiles {
  /** The corpus modules in import order; the subject writes the entry module that imports them. */
  readonly modules: readonly string[];
  /** Relative path to content: the modules and index.html. */
  readonly files: ReadonlyMap<string, string>;
}

export interface BuildOutput {
  readonly css: string;
}

export interface SubjectClient {
  readonly id: SubjectId;
  describe(): Promise<SubjectVersions>;
  /** Candidates to CSS inside this process; a subject without an engine tier throws. */
  engine(input: EngineInput): Promise<EngineOutput>;
  /** Writes the subject's own config and entry beside the project files. */
  prepare(workspace: Workspace, project: ProjectFiles): Promise<void>;
  /** Runs the production build in the prepared workspace and returns its CSS asset. */
  build(workspace: Workspace): Promise<BuildOutput>;
}

/** What a subject module exports; the subject process imports one module and calls this once. */
export type SubjectFactory = () => SubjectClient;
