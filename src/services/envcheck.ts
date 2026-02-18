import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ─── Environment & Config File Checker ─────────────────────────────────

export interface EnvIssue {
  project: string;
  type: "missing_key" | "extra_key" | "no_example" | "no_env" | "stale_lockfile" | "config_issue";
  severity: "warning" | "error" | "info";
  message: string;
}

export function checkProjectEnv(projectPath: string, projectName: string): EnvIssue[] {
  const issues: EnvIssue[] = [];

  // 1. Check .env.example vs .env sync
  const envExample = join(projectPath, ".env.example");
  const envLocal = join(projectPath, ".env");
  const envLocalAlt = join(projectPath, ".env.local");

  if (existsSync(envExample)) {
    const exampleKeys = parseEnvKeys(readFileSync(envExample, "utf-8"));
    const envFile = existsSync(envLocal) ? envLocal : existsSync(envLocalAlt) ? envLocalAlt : null;

    if (!envFile) {
      issues.push({
        project: projectName,
        type: "no_env",
        severity: "warning",
        message: ".env.example exists but no .env or .env.local found. Copy and fill values.",
      });
    } else {
      const localKeys = parseEnvKeys(readFileSync(envFile, "utf-8"));
      const missing = exampleKeys.filter((k) => !localKeys.includes(k));
      const extra = localKeys.filter((k) => !exampleKeys.includes(k));

      for (const key of missing) {
        issues.push({
          project: projectName,
          type: "missing_key",
          severity: "error",
          message: `\`${key}\` in .env.example but missing from .env`,
        });
      }
      for (const key of extra) {
        if (!key.startsWith("#")) {
          issues.push({
            project: projectName,
            type: "extra_key",
            severity: "info",
            message: `\`${key}\` in .env but not in .env.example (undocumented)`,
          });
        }
      }
    }
  }

  // 2. Check lockfile freshness
  checkLockfileSync(projectPath, projectName, issues);

  // 3. Check TypeScript config
  checkTsConfig(projectPath, projectName, issues);

  // 4. Check Svelte config
  checkSvelteConfig(projectPath, projectName, issues);

  return issues;
}

function parseEnvKeys(content: string): string[] {
  return content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("=")[0].trim())
    .filter(Boolean);
}

function checkLockfileSync(projectPath: string, projectName: string, issues: EnvIssue[]): void {
  const pkgPath = join(projectPath, "package.json");
  if (!existsSync(pkgPath)) return;

  const lockfiles = [
    { name: "pnpm-lock.yaml", pm: "pnpm" },
    { name: "package-lock.json", pm: "npm" },
    { name: "yarn.lock", pm: "yarn" },
    { name: "bun.lockb", pm: "bun" },
  ];

  const found = lockfiles.find((lf) => existsSync(join(projectPath, lf.name)));
  if (!found) {
    issues.push({
      project: projectName,
      type: "stale_lockfile",
      severity: "warning",
      message: "No lockfile found. Run install to generate one.",
    });
    return;
  }

  // Check if lockfile is older than package.json
  try {
    const { statSync } = require("fs");
    const pkgStat = statSync(pkgPath);
    const lockStat = statSync(join(projectPath, found.name));

    if (pkgStat.mtimeMs > lockStat.mtimeMs + 60_000) { // 1 min grace
      issues.push({
        project: projectName,
        type: "stale_lockfile",
        severity: "warning",
        message: `${found.name} is older than package.json. Run \`${found.pm} install\` to sync.`,
      });
    }
  } catch { /* ignore */ }

  // Check for multiple lockfiles (common mistake)
  const multipleLocks = lockfiles.filter((lf) => existsSync(join(projectPath, lf.name)));
  if (multipleLocks.length > 1) {
    issues.push({
      project: projectName,
      type: "config_issue",
      severity: "warning",
      message: `Multiple lockfiles found: ${multipleLocks.map((l) => l.name).join(", ")}. Keep only one.`,
    });
  }
}

function checkTsConfig(projectPath: string, projectName: string, issues: EnvIssue[]): void {
  const tsconfigPath = join(projectPath, "tsconfig.json");
  if (!existsSync(tsconfigPath)) return;

  try {
    // Read raw to handle comments (JSON5-style)
    const raw = readFileSync(tsconfigPath, "utf-8");
    // Strip single-line comments for basic parsing
    const cleaned = raw.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const config = JSON.parse(cleaned);

    const co = config.compilerOptions || {};

    // Check for strict mode
    if (co.strict !== true) {
      issues.push({
        project: projectName,
        type: "config_issue",
        severity: "info",
        message: 'tsconfig.json: `"strict": true` recommended for better type safety.',
      });
    }

    // Check target
    if (co.target && ["es5", "es6", "es2015", "es2016", "es2017"].includes(co.target.toLowerCase())) {
      issues.push({
        project: projectName,
        type: "config_issue",
        severity: "info",
        message: `tsconfig.json: target "${co.target}" is old. Consider "es2022" or "esnext".`,
      });
    }
  } catch { /* ignore parse errors, tsconfig can have comments */ }
}

function checkSvelteConfig(projectPath: string, projectName: string, issues: EnvIssue[]): void {
  // Check if using Svelte 5 but still has old config patterns
  const pkgPath = join(projectPath, "package.json");
  if (!existsSync(pkgPath)) return;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

    // Svelte-specific checks
    if (allDeps["svelte"]) {
      const svelteVersion = allDeps["svelte"].replace(/[\^~>=<]/g, "");
      const major = parseInt(svelteVersion.split(".")[0], 10);

      if (major >= 5 && allDeps["svelte-preprocess"]) {
        issues.push({
          project: projectName,
          type: "config_issue",
          severity: "warning",
          message: "svelte-preprocess is not needed with Svelte 5. Remove it.",
        });
      }

      if (major < 5 && allDeps["@sveltejs/kit"]) {
        issues.push({
          project: projectName,
          type: "config_issue",
          severity: "warning",
          message: `Using Svelte ${svelteVersion} with SvelteKit. Upgrade to Svelte 5 for latest features and security patches.`,
        });
      }
    }

    // Check for deprecated SvelteKit adapters
    if (allDeps["@sveltejs/adapter-static"] && allDeps["@sveltejs/adapter-auto"]) {
      issues.push({
        project: projectName,
        type: "config_issue",
        severity: "info",
        message: "Both adapter-static and adapter-auto installed. Pick one.",
      });
    }
  } catch { /* ignore */ }
}

export function checkAllProjectEnvs(
  projects: Array<{ name: string; path: string }>
): Array<{ project: string; issues: EnvIssue[] }> {
  const results: Array<{ project: string; issues: EnvIssue[] }> = [];

  for (const p of projects) {
    const issues = checkProjectEnv(p.path, p.name);
    if (issues.length > 0) {
      results.push({ project: p.name, issues });
    }
  }

  return results;
}
