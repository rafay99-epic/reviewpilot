// `.reviewpilot.yml` at the repo root. Every key is optional; a repo without the file runs
// on the defaults below. Read from the base branch, so a PR cannot loosen its own review.

import { matchesGlob } from "node:path";
import { type } from "arktype";
import { parse } from "yaml";
import { SEVERITIES } from "./state.ts";

const Severity = type.enumerated(...SEVERITIES);

const Rule = type({
  id: "string",
  rule: "string",
  "severity?": Severity,
  "paths?": "string[]",
});

/**
 * The UI lens: a second reviewer that checks UI files against the repo's own design system
 * (its components, tokens and design docs) instead of for bugs. Off unless `ui` is set.
 */
const Ui = type({
  /** Files the UI lens reviews, e.g. ["apps/mobile/src/**\/*.tsx"]. */
  paths: "string[] > 0",
  /** Where the shared components live; their exports become the catalog the lens checks against. */
  "components?": "string[]",
  /** Theme and token files (colors, spacing, type scale). */
  "tokens?": "string[]",
  /** Markdown that states the UI rules, under any name (DESIGN.md, docs/ui-consistency.md). */
  "docs?": "string[]",
  /** The score at which the ReviewPilot UI check passes. */
  "pass_score?": "1 | 2 | 3 | 4 | 5",
});

const FileConfig = type({
  "model?": {
    "name?": "string",
    "verify?": "string",
    "effort?": "'none' | 'low' | 'medium' | 'high'",
  },
  "review?": {
    "ignore?": "string[]",
    "min_severity?": Severity,
    /** New findings on a push after the first review must be at least this severe, so fixes converge. */
    "follow_up_min_severity?": Severity,
    "max_findings?": "0 < number.integer <= 50",
    /** On a push: `changed` reviews only the lines changed since the last review, `all` the whole PR. */
    "scope?": "'changed' | 'all'",
    /** A finding on code the PR does not change: `drop` it, or list it in the `summary`. */
    "outside_diff?": "'drop' | 'summary'",
    /** The score at which the ReviewPilot check passes. */
    "pass_score?": "1 | 2 | 3 | 4 | 5",
  },
  "rules?": Rule.array(),
  "ui?": Ui,
  "instructions?": "string",
  "context_files?": "string[]",
  /** A model key sealed for the hosted bot. Only the server reads it; the action ignores it. */
  "sealed_key?": "string",
  // A typo like `min_severty` must be reported, not silently ignored.
}).onDeepUndeclaredKey("reject");

export type Rule = typeof Rule.infer;
export type UiConfig = Required<typeof Ui.infer>;

export const DEFAULTS = {
  model: { name: "z-ai/glm-5.3-flash", verify: "z-ai/glm-5.3-flash", effort: "medium" },
  review: {
    ignore: [
      "**/pnpm-lock.yaml", "**/package-lock.json", "**/yarn.lock", "**/bun.lock", "**/Cargo.lock",
      "**/*.min.js", "**/*.map", "**/dist/**", "**/build/**", "**/__snapshots__/**",
      "**/*.png", "**/*.jpg", "**/*.svg", "**/*.ico", "**/*.lottie",
    ],
    min_severity: "minor",
    follow_up_min_severity: "major",
    max_findings: 20,
    scope: "changed",
    outside_diff: "drop",
    pass_score: 5,
  },
  rules: [],
  instructions: "",
  context_files: ["AGENTS.md", "CLAUDE.md"],
} satisfies typeof FileConfig.infer;

export type Config = {
  model: { name: string; verify: string; effort: "none" | "low" | "medium" | "high" };
  review: {
    ignore: string[];
    min_severity: (typeof SEVERITIES)[number];
    follow_up_min_severity: (typeof SEVERITIES)[number];
    max_findings: number;
    scope: "changed" | "all";
    outside_diff: "drop" | "summary";
    pass_score: 1 | 2 | 3 | 4 | 5;
  };
  rules: Rule[];
  ui?: UiConfig;
  instructions: string;
  context_files: string[];
};

/** Parses the file text over the defaults. Lists replace the default lists, except `ignore`, which adds. */
export function loadConfig(text: string | undefined): { config: Config; warning?: string } {
  if (!text?.trim()) return { config: DEFAULTS };
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (e) {
    return { config: DEFAULTS, warning: `.reviewpilot.yml is not valid YAML, using defaults: ${String(e)}` };
  }
  const file = FileConfig(raw ?? {});
  if (file instanceof type.errors) {
    return { config: DEFAULTS, warning: `.reviewpilot.yml has errors, using defaults: ${file.summary}` };
  }
  return {
    config: {
      model: { ...DEFAULTS.model, ...file.model },
      review: {
        ...DEFAULTS.review,
        ...file.review,
        ignore: [...DEFAULTS.review.ignore, ...(file.review?.ignore ?? [])],
      },
      rules: file.rules ?? DEFAULTS.rules,
      ...(file.ui ? { ui: { components: [], tokens: [], docs: [], pass_score: 5, ...file.ui } } : {}),
      instructions: file.instructions ?? DEFAULTS.instructions,
      context_files: file.context_files ?? DEFAULTS.context_files,
    },
  };
}

export const ignored = (config: Config, path: string) =>
  config.review.ignore.some((glob) => matchesGlob(path, glob));

/** Rules whose paths match at least one changed file. A rule with no paths applies everywhere. */
export const rulesFor = (config: Config, paths: readonly string[]) =>
  config.rules.filter((r) => !r.paths?.length || paths.some((p) => r.paths?.some((g) => matchesGlob(p, g))));
