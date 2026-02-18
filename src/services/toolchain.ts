import { execSync } from "child_process";

// ─── Global Toolchain Version Checks ───────────────────────────────────

export interface ToolInfo {
  name: string;
  category: string;
  installed: string | null;
  latest: string | null;
  updateCmd: string | null;
  status: "current" | "outdated" | "missing" | "unknown";
}

function cmd(command: string): string | null {
  try {
    return execSync(command, {
      encoding: "utf-8",
      timeout: 15_000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function extractVersion(raw: string | null): string | null {
  if (!raw) return null;
  const match = raw.match(/(\d+\.\d+[\.\d]*)/);
  return match ? match[1] : null;
}

function majorMinor(v: string): [number, number] {
  const parts = v.split(".");
  return [parseInt(parts[0], 10) || 0, parseInt(parts[1], 10) || 0];
}

// ─── Package Managers ──────────────────────────────────────────────────

function checkNpm(): ToolInfo {
  const installed = extractVersion(cmd("npm --version"));
  if (!installed) return { name: "npm", category: "Package Managers", installed: null, latest: null, updateCmd: null, status: "missing" };
  const latest = extractVersion(cmd("npm view npm version 2>/dev/null"));
  return {
    name: "npm",
    category: "Package Managers",
    installed,
    latest,
    updateCmd: "npm install -g npm@latest",
    status: latest && installed !== latest ? "outdated" : latest ? "current" : "unknown",
  };
}

function checkPnpm(): ToolInfo {
  const installed = extractVersion(cmd("pnpm --version"));
  if (!installed) return { name: "pnpm", category: "Package Managers", installed: null, latest: null, updateCmd: null, status: "missing" };
  const latest = extractVersion(cmd("npm view pnpm version 2>/dev/null"));
  return {
    name: "pnpm",
    category: "Package Managers",
    installed,
    latest,
    updateCmd: "pnpm self-update",
    status: latest && installed !== latest ? "outdated" : latest ? "current" : "unknown",
  };
}

function checkYarn(): ToolInfo {
  const installed = extractVersion(cmd("yarn --version"));
  if (!installed) return { name: "yarn", category: "Package Managers", installed: null, latest: null, updateCmd: null, status: "missing" };
  return {
    name: "yarn",
    category: "Package Managers",
    installed,
    latest: null,
    updateCmd: "corepack prepare yarn@stable --activate",
    status: "unknown",
  };
}

function checkBun(): ToolInfo {
  const installed = extractVersion(cmd("bun --version"));
  if (!installed) return { name: "bun", category: "Package Managers", installed: null, latest: null, updateCmd: null, status: "missing" };
  return {
    name: "bun",
    category: "Package Managers",
    installed,
    latest: null,
    updateCmd: "bun upgrade",
    status: "unknown",
  };
}

function checkComposer(): ToolInfo {
  const installed = extractVersion(cmd("composer --version"));
  if (!installed) return { name: "composer", category: "Package Managers", installed: null, latest: null, updateCmd: null, status: "missing" };
  return {
    name: "composer",
    category: "Package Managers",
    installed,
    latest: null,
    updateCmd: "composer self-update",
    status: "unknown",
  };
}

function checkCargo(): ToolInfo {
  const installed = extractVersion(cmd("cargo --version"));
  if (!installed) return { name: "cargo", category: "Package Managers", installed: null, latest: null, updateCmd: null, status: "missing" };
  return {
    name: "cargo",
    category: "Package Managers",
    installed,
    latest: null,
    updateCmd: "rustup update",
    status: "unknown",
  };
}

function checkPip(): ToolInfo {
  const installed = extractVersion(cmd("pip3 --version") || cmd("pip --version"));
  if (!installed) return { name: "pip", category: "Package Managers", installed: null, latest: null, updateCmd: null, status: "missing" };
  // pip can self-check
  const check = cmd("pip3 list --outdated --format=json 2>/dev/null");
  let isOutdated = false;
  if (check) {
    try {
      const outdated = JSON.parse(check);
      isOutdated = outdated.some((p: { name: string }) => p.name === "pip");
    } catch { /* ignore */ }
  }
  return {
    name: "pip",
    category: "Package Managers",
    installed,
    latest: null,
    updateCmd: "pip3 install --upgrade pip",
    status: isOutdated ? "outdated" : "unknown",
  };
}

// ─── Build Tools ───────────────────────────────────────────────────────

function checkTypescript(): ToolInfo {
  const installed = extractVersion(cmd("npx tsc --version 2>/dev/null"));
  if (!installed) return { name: "typescript", category: "Build Tools", installed: null, latest: null, updateCmd: null, status: "missing" };
  const latest = extractVersion(cmd("npm view typescript version 2>/dev/null"));
  return {
    name: "typescript",
    category: "Build Tools",
    installed,
    latest,
    updateCmd: "npm install -g typescript@latest",
    status: latest && installed !== latest ? "outdated" : latest ? "current" : "unknown",
  };
}

// ─── Dev Tools ─────────────────────────────────────────────────────────

function checkGit(): ToolInfo {
  const installed = extractVersion(cmd("git --version"));
  if (!installed) return { name: "git", category: "Dev Tools", installed: null, latest: null, updateCmd: null, status: "missing" };
  const [major, minor] = majorMinor(installed);
  const outdated = major < 2 || (major === 2 && minor < 40);
  return {
    name: "git",
    category: "Dev Tools",
    installed,
    latest: null,
    updateCmd: "brew upgrade git",
    status: outdated ? "outdated" : "current",
  };
}

function checkDocker(): ToolInfo {
  const installed = extractVersion(cmd("docker --version"));
  if (!installed) return { name: "docker", category: "Dev Tools", installed: null, latest: null, updateCmd: null, status: "missing" };
  return {
    name: "docker",
    category: "Dev Tools",
    installed,
    latest: null,
    updateCmd: "Docker Desktop auto-updates",
    status: "unknown",
  };
}

function checkBrew(): ToolInfo {
  const installed = extractVersion(cmd("brew --version"));
  if (!installed) return { name: "homebrew", category: "Dev Tools", installed: null, latest: null, updateCmd: null, status: "missing" };
  return {
    name: "homebrew",
    category: "Dev Tools",
    installed,
    latest: null,
    updateCmd: "brew update && brew upgrade",
    status: "unknown",
  };
}

// ─── CLI Frameworks ────────────────────────────────────────────────────

function checkVercelCli(): ToolInfo {
  const installed = extractVersion(cmd("vercel --version 2>/dev/null"));
  if (!installed) return { name: "vercel-cli", category: "CLI Tools", installed: null, latest: null, updateCmd: null, status: "missing" };
  const latest = extractVersion(cmd("npm view vercel version 2>/dev/null"));
  return {
    name: "vercel-cli",
    category: "CLI Tools",
    installed,
    latest,
    updateCmd: "npm install -g vercel@latest",
    status: latest && installed !== latest ? "outdated" : latest ? "current" : "unknown",
  };
}

function checkSupabaseCli(): ToolInfo {
  const raw = cmd("supabase --version 2>/dev/null");
  const installed = extractVersion(raw);
  if (!installed) return { name: "supabase-cli", category: "CLI Tools", installed: null, latest: null, updateCmd: null, status: "missing" };
  return {
    name: "supabase-cli",
    category: "CLI Tools",
    installed,
    latest: null,
    updateCmd: "brew upgrade supabase",
    status: "unknown",
  };
}

function checkWranglerCli(): ToolInfo {
  const installed = extractVersion(cmd("wrangler --version 2>/dev/null"));
  if (!installed) return { name: "wrangler", category: "CLI Tools", installed: null, latest: null, updateCmd: null, status: "missing" };
  const latest = extractVersion(cmd("npm view wrangler version 2>/dev/null"));
  return {
    name: "wrangler",
    category: "CLI Tools",
    installed,
    latest,
    updateCmd: "npm install -g wrangler@latest",
    status: latest && installed !== latest ? "outdated" : latest ? "current" : "unknown",
  };
}

export function checkAllTools(): ToolInfo[] {
  const checkers = [
    // Package managers
    checkNpm, checkPnpm, checkYarn, checkBun, checkComposer, checkCargo, checkPip,
    // Build tools
    checkTypescript,
    // Dev tools
    checkGit, checkDocker, checkBrew,
    // CLI tools
    checkVercelCli, checkSupabaseCli, checkWranglerCli,
  ];

  return checkers
    .map((fn) => fn())
    .filter((t) => t.installed !== null); // only show installed tools
}
