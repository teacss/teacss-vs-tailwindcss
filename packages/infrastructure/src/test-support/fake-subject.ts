import type { SubjectClient, SubjectFactory } from "../subject-client.ts";
import { subjectId } from "../subject-client.ts";

export const fakeSubject: SubjectClient = {
  id: subjectId("fake"),
  describe: async () => ({ packages: { fake: "0.0.0" }, local: {} }),
  engine: async ({ candidates }) => ({ css: candidates.map((candidate) => `.${candidate}{}`).join("") }),
  prepare: async (workspace, project) => {
    for (const [path, content] of project.files) workspace.write(path, content);
  },
  build: async (workspace) => ({ css: workspace.read("src/main.js").length > 0 ? ".built{}" : "" }),
};

export const createSubject: SubjectFactory = () => fakeSubject;
