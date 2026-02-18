import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ─── Deprecated & Unmaintained Package Detector ────────────────────────

export interface DeprecatedPackage {
  name: string;
  version: string;
  reason: "deprecated" | "unmaintained" | "replaced";
  message: string;
  replacement: string | null;
}

export interface DeprecatedResult {
  project: string;
  deprecated: DeprecatedPackage[];
  scannedCount: number;
}

// Known deprecated/replaced packages
const KNOWN_REPLACEMENTS: Record<string, { replacement: string; reason: string }> = {
  "request": { replacement: "undici or fetch", reason: "Fully deprecated since 2020" },
  "moment": { replacement: "dayjs or date-fns", reason: "In maintenance mode, recommends alternatives" },
  "node-sass": { replacement: "sass (Dart Sass)", reason: "Deprecated, use Dart Sass" },
  "tslint": { replacement: "eslint with @typescript-eslint", reason: "Deprecated in favor of ESLint" },
  "svelte-preprocess": { replacement: "built-in Svelte 5 preprocessing", reason: "Not needed with Svelte 5" },
  "node-fetch": { replacement: "built-in fetch (Node 18+)", reason: "Native fetch available since Node 18" },
  "querystring": { replacement: "URLSearchParams", reason: "Deprecated Node.js core module" },
  "uuid": { replacement: "crypto.randomUUID()", reason: "Native alternative available since Node 19" },
  "chalk": { replacement: "picocolors", reason: "Works but bloated; picocolors is 14x smaller" },
  "lodash": { replacement: "native JS or lodash-es (tree-shakeable)", reason: "Not tree-shakeable, adds ~70KB" },
  "cors": { replacement: "built-in SvelteKit/Next.js CORS handling", reason: "Framework-specific alternatives preferred" },
  "dotenv": { replacement: "built-in Node 20.6+ --env-file flag", reason: "Native alternative available" },
  "rimraf": { replacement: "fs.rm with { recursive: true }", reason: "Native alternative since Node 14.14" },
  "mkdirp": { replacement: "fs.mkdir with { recursive: true }", reason: "Native alternative since Node 10.12" },
  "glob": { replacement: "fs.glob (Node 22+) or tinyglobby", reason: "Native or lighter alternatives" },
  "@types/express": { replacement: "express@5 has built-in types", reason: "Express 5 includes types" },
  "sveltekit-superforms": { replacement: "native SvelteKit form actions", reason: "Consider native form handling first" },
  "webpack": { replacement: "vite or rolldown", reason: "Vite/Rolldown preferred for new projects" },
  "create-react-app": { replacement: "vite or next.js", reason: "Deprecated by React team" },
};

function cmd(command: string, cwd: string): string | null {
  try {
    return execSync(command, {
      encoding: "utf-8", timeout: 30_000, cwd,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (e: any) {
    if (e.stdout) return e.stdout.toString().trim();
    return null;
  }
}

export function checkDeprecated(projectPath: string, projectName: string): DeprecatedResult {
  const pkgPath = join(projectPath, "package.json");
  if (!existsSync(pkgPath)) return { project: projectName, deprecated: [], scannedCount: 0 };

  let pkg: any;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch { return { project: projectName, deprecated: [], scannedCount: 0 }; }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const deprecated: DeprecatedPackage[] = [];

  for (const [name, specifier] of Object.entries(allDeps)) {
    const version = String(specifier).replace(/^[\^~>=<]+/, "");

    // 1. Check our known replacements database
    const known = KNOWN_REPLACEMENTS[name];
    if (known) {
      deprecated.push({
        name, version,
        reason: "replaced",
        message: known.reason,
        replacement: known.replacement,
      });
      continue;
    }

    // 2. Check npm registry deprecated flag (batch via npm view)
    const nmPkgPath = join(projectPath, "node_modules", name, "package.json");
    if (existsSync(nmPkgPath)) {
      try {
        const nmPkg = JSON.parse(readFileSync(nmPkgPath, "utf-8"));
        if (nmPkg.deprecated) {
          deprecated.push({
            name, version: nmPkg.version,
            reason: "deprecated",
            message: typeof nmPkg.deprecated === "string" ? nmPkg.deprecated : "Package is deprecated",
            replacement: null,
          });
        }
      } catch { /* ignore */ }
    }
  }

  return {
    project: projectName,
    deprecated,
    scannedCount: Object.keys(allDeps).length,
  };
}

export function checkAllDeprecated(
  projects: Array<{ name: string; path: string }>
): DeprecatedResult[] {
  return projects
    .map(p => checkDeprecated(p.path, p.name))
    .filter(r => r.deprecated.length > 0);
}
