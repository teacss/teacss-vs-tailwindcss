import type { SubjectClient, SubjectFactory } from "../subject-client.ts";
import { subjectId } from "../subject-client.ts";

function fakeCss(candidates: readonly string[]): string {
  return candidates.map((candidate) => `.${candidate.replaceAll(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`)}{}`).join("");
}

export const fakeSubject: SubjectClient = {
  id: subjectId("fake"),
  describe: async () => ({ packages: { fake: "0.0.0" }, local: {} }),
  engine: async ({ candidates }) => ({ css: fakeCss(candidates) }),
  engineSession: async () => ({ generate: async (candidates) => ({ css: fakeCss(candidates) }) }),
  prepare: async (workspace, project) => {
    for (const [path, content] of project.files) workspace.write(path, content);
  },
  build: async (workspace) => ({ css: workspace.read("src/main.js").length > 0 ? ".built{}" : "" }),
  devServer: async () => {
    throw new Error("the fake subject has no development server");
  },
  moduleHeader: "",
  coverage: async (entries) => entries.map((entry) => ({ entry, served: !entry.includes("dynamic"), reason: entry.includes("dynamic") ? "rules" : undefined })),
};

export const createSubject: SubjectFactory = () => fakeSubject;
