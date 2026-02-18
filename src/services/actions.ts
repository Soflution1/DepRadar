import { existsSync, readFileSync, readdirSync } from "fs";
import { join, basename } from "path";

// ─── GitHub Actions Scanner ────────────────────────────────────────────

export interface ActionUsage {
  workflow: string;
  action: string;
  currentVersion: string;
  latestVersion: string | null;
  status: "current" | "outdated" | "deprecated" | "unknown";
  notes: string;
}

// Known latest versions for popular actions (updated Feb 2026)
const KNOWN_ACTIONS: Record<string, { latest: string; deprecated?: boolean; replacement?: string }> = {
  "actions/checkout": { latest: "v4" },
  "actions/setup-node": { latest: "v4" },
  "actions/setup-python": { latest: "v5" },
  "actions/setup-go": { latest: "v5" },
  "actions/setup-java": { latest: "v4" },
  "actions/setup-dotnet": { latest: "v4" },
  "actions/cache": { latest: "v4" },
  "actions/upload-artifact": { latest: "v4" },
  "actions/download-artifact": { latest: "v4" },
  "actions/github-script": { latest: "v7" },
  "actions/create-release": { latest: "v1", deprecated: true, replacement: "softprops/action-gh-release" },
  "actions/labeler": { latest: "v5" },
  "actions/stale": { latest: "v9" },
  "actions/dependency-review-action": { latest: "v4" },
  "actions/deploy-pages": { latest: "v4" },
  "actions/configure-pages": { latest: "v5" },

  // Popular third-party
  "softprops/action-gh-release": { latest: "v2" },
  "peaceiris/actions-gh-pages": { latest: "v4" },
  "docker/build-push-action": { latest: "v6" },
  "docker/setup-buildx-action": { latest: "v3" },
  "docker/login-action": { latest: "v3" },
  "docker/setup-qemu-action": { latest: "v3" },
  "codecov/codecov-action": { latest: "v5" },
  "JamesIves/github-pages-deploy-action": { latest: "v4" },
  "peter-evans/create-pull-request": { latest: "v7" },
  "dorny/paths-filter": { latest: "v3" },
  "ncipollo/release-action": { latest: "v1" },
  "superfly/flyctl-actions/setup-flyctl": { latest: "master" },
  "cloudflare/wrangler-action": { latest: "v3" },
  "amondnet/vercel-action": { latest: "v25" },

  // Deprecated actions
  // "actions/create-release" already listed above with deprecated flag
};

export function scanWorkflows(projectPath: string, projectName: string): ActionUsage[] {
  const workflowDir = join(projectPath, ".github", "workflows");
  if (!existsSync(workflowDir)) return [];

  const results: ActionUsage[] = [];

  try {
    const files = readdirSync(workflowDir).filter((f) =>
      f.endsWith(".yml") || f.endsWith(".yaml")
    );

    for (const file of files) {
      const content = readFileSync(join(workflowDir, file), "utf-8");
      const usages = extractActions(content, file);
      results.push(...usages);
    }
  } catch { /* ignore */ }

  return results;
}

function extractActions(content: string, workflowFile: string): ActionUsage[] {
  const results: ActionUsage[] = [];
  const usesRegex = /uses:\s*["']?([^"'\s]+?)(?:@([^"'\s]+))?["']?\s*$/gm;

  let match;
  while ((match = usesRegex.exec(content)) !== null) {
    const fullAction = match[1];
    const version = match[2] || "";

    // Skip local actions (./path)
    if (fullAction.startsWith("./") || fullAction.startsWith("docker://")) continue;

    const actionName = fullAction.replace(/@.*$/, "");
    const known = KNOWN_ACTIONS[actionName];

    if (known) {
      const currentMajor = extractMajor(version);
      const latestMajor = extractMajor(known.latest);

      let status: ActionUsage["status"] = "unknown";
      let notes = "";

      if (known.deprecated) {
        status = "deprecated";
        notes = `Deprecated. Use ${known.replacement || "alternative"} instead.`;
      } else if (currentMajor !== null && latestMajor !== null && currentMajor < latestMajor) {
        status = "outdated";
        notes = `Update to ${actionName}@${known.latest}`;
      } else if (currentMajor !== null && latestMajor !== null) {
        status = "current";
        notes = "Up to date.";
      }

      // Skip SHA pinned versions for now (they're usually intentional)
      if (version.length >= 40) {
        status = "unknown";
        notes = "SHA-pinned. Review manually.";
      }

      results.push({
        workflow: workflowFile,
        action: actionName,
        currentVersion: version || "unspecified",
        latestVersion: known.latest,
        status,
        notes,
      });
    } else {
      results.push({
        workflow: workflowFile,
        action: actionName,
        currentVersion: version || "unspecified",
        latestVersion: null,
        status: "unknown",
        notes: "Not in known database.",
      });
    }
  }

  return results;
}

function extractMajor(version: string): number | null {
  const match = version.match(/v?(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

export function scanAllProjectActions(
  projects: Array<{ name: string; path: string }>
): Array<{ project: string; actions: ActionUsage[] }> {
  const results: Array<{ project: string; actions: ActionUsage[] }> = [];

  for (const p of projects) {
    const actions = scanWorkflows(p.path, p.name);
    if (actions.length > 0) {
      results.push({ project: p.name, actions });
    }
  }

  return results;
}
