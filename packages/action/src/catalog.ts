// The design-system catalog the UI lens reviews against: what shared components and tokens
// exist and what the repo's UI docs say. Read from the default branch, so a PR cannot rewrite
// the rules it is checked against. Kept short: the agent opens a file when it needs the detail.

import { matchesGlob } from "node:path";
import type { UiConfig } from "./config.ts";
import { filesAt, readAt } from "./git.ts";
import { pool } from "./review.ts";

/** Characters per section, so a big component library cannot crowd out the tokens or docs. */
const BUDGET = { components: 9_000, tokens: 3_000, docs: 4_000 };
const MAX_FILES = 400;
const CODE = /\.(tsx?|jsx?|vue|svelte|css|scss)$/;
const TEST = /(^|\/)__tests__\/|\.(test|spec|stories)\.\w+$/;

/** Exported names in a source file: components, hooks, tokens, prop types. */
export function exportsOf(text: string): string[] {
  const names = [...text.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1] ?? "");
  const lists = [...text.matchAll(/^export\s*(?:type\s*)?\{([^}]*)\}/gm)].flatMap((m) =>
    (m[1] ?? "").split(",").map((part) => part.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop()?.trim() ?? ""),
  );
  // CSS custom properties count as tokens.
  const vars = [...text.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1] ?? "");
  return [...new Set([...names, ...lists, ...vars].filter((n) => n && n !== "default"))];
}

/** Whole lines up to `budget` characters, with a note on how many did not fit. */
export function fit(lines: readonly string[], budget: number): string {
  let used = 0;
  const kept = lines.filter((l) => (used += l.length + 1) <= budget);
  return kept.join("\n") + (kept.length < lines.length ? `\n(${lines.length - kept.length} more files not listed; search the repository for them)` : "");
}

/** One line per file, "path: A, B, C", for the source files matching any glob. Tests are skipped. */
async function section(root: string, ref: string, all: readonly string[], globs: readonly string[], budget: number): Promise<string> {
  const files = all.filter((f) => CODE.test(f) && !TEST.test(f) && globs.some((g) => matchesGlob(f, g))).slice(0, MAX_FILES);
  // A few git processes at a time, not one per file at once.
  const lines = await pool(files, 16, async (f) => {
    const names = exportsOf((await readAt(root, ref, f)) ?? "");
    return names.length ? `- ${f}: ${names.join(", ")}` : "";
  });
  return fit(lines.filter(Boolean), budget);
}

/**
 * The catalog text, and which configured `ui` keys matched nothing usable (a typo in a glob,
 * or token files with no exports the catalog can read), so the run can say so.
 */
export async function uiCatalog(root: string, ref: string, ui: UiConfig): Promise<{ catalog: string; empty: string[] }> {
  const all = await filesAt(root, ref);
  const [components, tokens, docs] = await Promise.all([
    section(root, ref, all, ui.components, BUDGET.components),
    section(root, ref, all, ui.tokens, BUDGET.tokens),
    Promise.all(
      all
        .filter((f) => ui.docs.some((g) => f === g || matchesGlob(f, g)))
        .map(async (f) => `--- ${f} ---\n${(await readAt(root, ref, f)) ?? ""}`),
    ).then((parts) => parts.join("\n").slice(0, BUDGET.docs)),
  ]);
  const catalog = [
    components && `Shared components (path: exports):\n${components}`,
    tokens && `Design tokens (path: exports):\n${tokens}`,
    docs && `UI docs:\n${docs}`,
  ].filter(Boolean).join("\n\n");
  const empty = [
    ui.components.length && !components ? "ui.components" : "",
    ui.tokens.length && !tokens ? "ui.tokens" : "",
    ui.docs.length && !docs ? "ui.docs" : "",
  ].filter(Boolean);
  return { catalog, empty };
}
