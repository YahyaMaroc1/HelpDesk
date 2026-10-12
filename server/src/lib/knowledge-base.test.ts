import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadKnowledgeBase } from "./knowledge-base.ts";

// Each test points KNOWLEDGE_BASE_PATH at a file in a temporary directory.
let dir: string;
const savedPath = process.env.KNOWLEDGE_BASE_PATH;
let consoleWarn: ReturnType<typeof spyOn>;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "helpdesk-kb-"));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  if (savedPath === undefined) delete process.env.KNOWLEDGE_BASE_PATH;
  else process.env.KNOWLEDGE_BASE_PATH = savedPath;
});

beforeEach(() => {
  consoleWarn = spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => consoleWarn.mockRestore());

async function knowledgeBaseFile(name: string, content: string) {
  const path = join(dir, name);
  await writeFile(path, content);
  process.env.KNOWLEDGE_BASE_PATH = path;
  return path;
}

describe("loadKnowledgeBase", () => {
  test("returns the file's trimmed text", async () => {
    await knowledgeBaseFile("kb.md", "\n# Support\n\nClick Forgot Password.\n\n");

    expect(await loadKnowledgeBase()).toBe("# Support\n\nClick Forgot Password.");
  });

  test("reads the file again each time, so edits apply without a restart", async () => {
    const path = await knowledgeBaseFile("edited.md", "Old policy");
    await loadKnowledgeBase();
    await writeFile(path, "New policy");

    expect(await loadKnowledgeBase()).toBe("New policy");
  });

  test("returns null for an empty file", async () => {
    await knowledgeBaseFile("empty.md", "  \n ");

    expect(await loadKnowledgeBase()).toBeNull();
  });

  test("returns null and warns when the file is missing", async () => {
    const path = join(dir, "missing.md");
    process.env.KNOWLEDGE_BASE_PATH = path;

    expect(await loadKnowledgeBase()).toBeNull();
    expect(consoleWarn).toHaveBeenCalledWith(`No knowledge base at ${path}; new tickets aren't auto-resolved`);
  });

  test("throws other read errors, so the job is retried", async () => {
    // A directory can't be read as a file.
    process.env.KNOWLEDGE_BASE_PATH = dir;

    await expect(loadKnowledgeBase()).rejects.toThrow();
  });

  test("defaults to knowledge-base.md at the project root", async () => {
    delete process.env.KNOWLEDGE_BASE_PATH;
    const projectFile = Bun.file(join(import.meta.dir, "../../../knowledge-base.md"));
    if (!(await projectFile.exists())) return;

    expect(await loadKnowledgeBase()).toBe((await projectFile.text()).trim());
  });
});
