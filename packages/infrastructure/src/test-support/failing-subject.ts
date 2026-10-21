import type { SubjectFactory } from "../subject-client.ts";
import { fakeSubject } from "./fake-subject.ts";

export const createSubject: SubjectFactory = () => ({
  ...fakeSubject,
  engine: async () => {
    throw new Error("planted engine failure");
  },
});
