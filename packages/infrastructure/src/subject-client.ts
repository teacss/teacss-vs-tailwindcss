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
  /** Packages resolved outside the lockfile's store, by package name to their real directory. Empty for a reproducible run. */
  readonly local: Readonly<Record<string, string>>;
  /** The native binary the subject loads, if any; absent before spec v02.1. */
  readonly native?: NativeArtifact;
}

export interface NativeArtifact {
  /** The platform package installed for this machine, such as `@teacss/engine-darwin-arm64`. */
  readonly package: string;
  readonly file: string;
  /** Absolute path of the `.node` file, so a fresh process can load it without importing the tool. */
  readonly path: string;
  readonly bytes: number;
  /** Platform packages the tool publishes, from its `optionalDependencies`. */
  readonly platformPackages: number;
}

export interface CoverageResult {
  readonly entry: string;
  readonly served: boolean;
  /** Why the native engine cannot serve the configuration, as the engine reports it. */
  readonly reason: string | undefined;
}

export interface EngineInput {
  /** Candidates in the subject's own syntax. */
  readonly candidates: readonly string[];
}

export interface EngineOutput {
  readonly css: string;
}

export interface EngineSession {
  generate(candidates: readonly string[]): Promise<EngineOutput>;
}

export interface ProjectFiles {
  /** The corpus modules in import order; the subject writes the entry module that imports them. */
  readonly modules: readonly string[];
  /** Relative path to content: the modules and index.html. */
  readonly files: ReadonlyMap<string, string>;
}

export interface DevServer {
  /** `http://host:port` of the running development server. */
  readonly origin: string;
  close(): Promise<void>;
}

export interface BuildOutput {
  readonly css: string;
}

export interface SubjectClient {
  readonly id: SubjectId;
  describe(): Promise<SubjectVersions>;
  /** Candidates to CSS inside this process; a subject without an engine tier throws. */
  engine(input: EngineInput): Promise<EngineOutput>;
  /** One generator or compiler kept across calls, so a later call pays only for what changed. */
  engineSession(): Promise<EngineSession>;
  /** Writes the subject's own config and entry beside the project files. */
  prepare(workspace: Workspace, project: ProjectFiles): Promise<void>;
  /** Runs the production build in the prepared workspace and returns its CSS asset. */
  build(workspace: Workspace): Promise<BuildOutput>;
  /** Starts the tool's development server on the prepared workspace, listening on a free local port. */
  devServer(workspace: Workspace): Promise<DevServer>;
  /** Text the tool needs at the top of a source module before it reads the classes in it. */
  readonly moduleHeader: string;
  /**
   * The utilities this tool recognises in the source files under `dirs`, with how often each occurs;
   * empty for a tool that cannot scan another tool's syntax.
   */
  extract(dirs: readonly string[]): Promise<readonly (readonly [string, number])[]>;
  /** Whether the native engine can serve each entry stylesheet's configuration; empty for a subject without one. */
  coverage(entries: readonly string[]): Promise<readonly CoverageResult[]>;
}

/** What a subject module exports; the subject process imports one module and calls this once. */
export type SubjectFactory = () => SubjectClient;
