import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// The knowledge base the AI resolves new tickets from (lib/auto-resolve-ticket.ts): a Markdown file,
// knowledge-base.md at the project root unless KNOWLEDGE_BASE_PATH points to another one. It's read for every ticket,
// so edits apply without restarting the server.
const defaultPath = fileURLToPath(new URL("../../../knowledge-base.md", import.meta.url));

// Returns the knowledge base's text, or null when the file is missing or empty: then every ticket goes to the agents.
export async function loadKnowledgeBase() {
  const path = process.env.KNOWLEDGE_BASE_PATH || defaultPath;
  try {
    return (await readFile(path, "utf8")).trim() || null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    console.warn(`No knowledge base at ${path}; new tickets aren't auto-resolved`);
    return null;
  }
}
