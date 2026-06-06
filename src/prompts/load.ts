/**
 * Loader for the agent's editable instruction files (PRD §4.3). Reads a template
 * from prompts/<name>.md and fills {{placeholders}} with the run's dynamic values.
 * If the file is missing (e.g. deleted), it falls back to a built-in default so a
 * scheduled run never breaks — the contract (always loaded) still carries the rules.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PROMPTS_DIR } from "../config.js";

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => vars[key] ?? "");
}

/**
 * Render the named prompt template with `vars`. `fallback` is the built-in template
 * used when prompts/<name>.md can't be read.
 */
export async function renderPrompt(
  name: string,
  vars: Record<string, string>,
  fallback: string,
): Promise<string> {
  let template = fallback;
  try {
    template = await readFile(resolve(PROMPTS_DIR, `${name}.md`), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    console.warn(`[prompts] ${name}.md missing — using built-in fallback`);
  }
  return fill(template, vars).trim();
}
