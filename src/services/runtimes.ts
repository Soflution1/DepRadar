import { execSync } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// ─── Runtime Version Detection ─────────────────────────────────────────

export interface RuntimeInfo {
  name: string;
  installed: string | null;
  latest: string | null;
  lts: string | null;
  status: "current" | "outdated" | "eol" | "missing";
  notes: string;
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
  const match = raw.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : raw.replace(/^v/, "").trim();
}

function majorVersion(version: string): number {
  return parseInt(version.split(".")[0], 10) || 0;
}

export function checkNodeRuntime(): RuntimeInfo {
  const installed = extractVersion(cmd("node --version"));
  if (!installed) return { name: "Node.js", installed: null, latest: null, lts: null, status: "missing", notes: "Node.js not found. Install via nvm or nodejs.org" };

  // Try nvm for latest LTS
  let lts: string | null = null;
  const nvmLatest = cmd("bash -c 'source ~/.nvm/nvm.sh 2>/dev/null && nvm ls-remote --lts | tail -1'");
  if (nvmLatest) lts = extractVersion(nvmLatest);

  // Try n for latest
  if (!lts) {
    const nLatest = cmd("n --lts 2>/dev/null");
    if (nLatest) lts = extractVersion(nLatest);
  }

  const major = majorVersion(installed);
  // Node.js even versions are LTS. Known EOL schedule:
  const eolVersions = [12, 14, 16, 17, 19, 21]; // odd = never LTS, old even = EOL
  const status = eolVersions.includes(major) ? "eol"
    : lts && majorVersion(lts) > major ? "outdated"
    : "current";

  const notes = status === "eol" ? `Node ${major} is End of Life. Upgrade to latest LTS.`
    : status === "outdated" ? `LTS ${lts} available.`
    : "Up to date.";

  return { name: "Node.js", installed, latest: lts, lts, status, notes };
}

export function checkPythonRuntime(): RuntimeInfo {
  const installed = extractVersion(cmd("python3 --version") || cmd("python --version"));
  if (!installed) return { name: "Python", installed: null, latest: null, lts: null, status: "missing", notes: "Python not found." };

  const major = majorVersion(installed);
  const minor = parseInt(installed.split(".")[1] || "0", 10);
  // Python EOL: 3.8 (2024-10), 3.9 (2025-10)
  const eol = (major === 3 && minor <= 9) || major < 3;
  const outdated = major === 3 && minor < 12;

  return {
    name: "Python",
    installed,
    latest: null, // no easy CLI way to check
    lts: null,
    status: eol ? "eol" : outdated ? "outdated" : "current",
    notes: eol ? `Python ${major}.${minor} is End of Life. Upgrade to 3.12+.`
      : outdated ? `Python 3.13+ recommended.`
      : "Up to date.",
  };
}

export function checkRustRuntime(): RuntimeInfo {
  const installed = extractVersion(cmd("rustc --version"));
  if (!installed) return { name: "Rust", installed: null, latest: null, lts: null, status: "missing", notes: "Rust not found. Install via rustup.rs" };

  // rustup check shows available updates
  const check = cmd("rustup check 2>/dev/null");
  const hasUpdate = check?.includes("Update available");
  const latestMatch = check?.match(/stable.*?(\d+\.\d+\.\d+)/);
  const latest = latestMatch ? latestMatch[1] : null;

  return {
    name: "Rust",
    installed,
    latest,
    lts: null,
    status: hasUpdate ? "outdated" : "current",
    notes: hasUpdate ? `Update available: rustup update` : "Up to date.",
  };
}

export function checkGoRuntime(): RuntimeInfo {
  const installed = extractVersion(cmd("go version"));
  if (!installed) return { name: "Go", installed: null, latest: null, lts: null, status: "missing", notes: "Go not found." };

  const minor = parseInt(installed.split(".")[1] || "0", 10);
  const outdated = minor < 22;

  return {
    name: "Go",
    installed,
    latest: null,
    lts: null,
    status: outdated ? "outdated" : "current",
    notes: outdated ? "Go 1.22+ recommended." : "Up to date.",
  };
}

export function checkPhpRuntime(): RuntimeInfo {
  const installed = extractVersion(cmd("php --version"));
  if (!installed) return { name: "PHP", installed: null, latest: null, lts: null, status: "missing", notes: "PHP not found." };

  const major = majorVersion(installed);
  const minor = parseInt(installed.split(".")[1] || "0", 10);
  const eol = major < 8 || (major === 8 && minor < 2);
  const outdated = major === 8 && minor < 3;

  return {
    name: "PHP",
    installed,
    latest: null,
    lts: null,
    status: eol ? "eol" : outdated ? "outdated" : "current",
    notes: eol ? `PHP ${major}.${minor} is End of Life. Upgrade to 8.3+.`
      : outdated ? "PHP 8.3+ recommended."
      : "Up to date.",
  };
}

export function checkRubyRuntime(): RuntimeInfo {
  const installed = extractVersion(cmd("ruby --version"));
  if (!installed) return { name: "Ruby", installed: null, latest: null, lts: null, status: "missing", notes: "Ruby not found." };

  const major = majorVersion(installed);
  const minor = parseInt(installed.split(".")[1] || "0", 10);
  const eol = major < 3 || (major === 3 && minor < 1);

  return {
    name: "Ruby",
    installed,
    latest: null,
    lts: null,
    status: eol ? "eol" : "current",
    notes: eol ? `Ruby ${major}.${minor} is End of Life. Upgrade to 3.2+.` : "Up to date.",
  };
}

export function checkDartRuntime(): RuntimeInfo {
  const installed = extractVersion(cmd("dart --version"));
  if (!installed) return { name: "Dart", installed: null, latest: null, lts: null, status: "missing", notes: "Dart not found." };

  return { name: "Dart", installed, latest: null, lts: null, status: "current", notes: "Installed." };
}

export function checkSwiftRuntime(): RuntimeInfo {
  const installed = extractVersion(cmd("swift --version"));
  if (!installed) return { name: "Swift", installed: null, latest: null, lts: null, status: "missing", notes: "Swift not found." };

  const major = majorVersion(installed);
  return {
    name: "Swift",
    installed,
    latest: null,
    lts: null,
    status: major < 5 ? "eol" : "current",
    notes: major < 5 ? "Swift 5.9+ recommended." : "Up to date.",
  };
}

export function checkAllRuntimes(): RuntimeInfo[] {
  const checkers = [
    checkNodeRuntime, checkPythonRuntime, checkRustRuntime,
    checkGoRuntime, checkPhpRuntime, checkRubyRuntime,
    checkDartRuntime, checkSwiftRuntime,
  ];
  return checkers.map((fn) => fn()).filter((r) => r.installed !== null || r.status !== "missing");
}

// ─── Project Version File Alignment ────────────────────────────────────

export interface VersionMismatch {
  project: string;
  file: string;
  expected: string;
  installed: string;
  runtime: string;
}

export function checkProjectVersionFiles(projectPath: string, projectName: string): VersionMismatch[] {
  const mismatches: VersionMismatch[] = [];
  const nodeInstalled = extractVersion(cmd("node --version"));

  // .nvmrc
  const nvmrc = join(projectPath, ".nvmrc");
  if (existsSync(nvmrc) && nodeInstalled) {
    const expected = readFileSync(nvmrc, "utf-8").trim().replace(/^v/, "");
    if (expected && !nodeInstalled.startsWith(expected.split(".")[0])) {
      mismatches.push({ project: projectName, file: ".nvmrc", expected, installed: nodeInstalled, runtime: "Node.js" });
    }
  }

  // .node-version
  const nodeVersion = join(projectPath, ".node-version");
  if (existsSync(nodeVersion) && nodeInstalled) {
    const expected = readFileSync(nodeVersion, "utf-8").trim().replace(/^v/, "");
    if (expected && !nodeInstalled.startsWith(expected.split(".")[0])) {
      mismatches.push({ project: projectName, file: ".node-version", expected, installed: nodeInstalled, runtime: "Node.js" });
    }
  }

  // .python-version
  const pyVersion = join(projectPath, ".python-version");
  const pyInstalled = extractVersion(cmd("python3 --version"));
  if (existsSync(pyVersion) && pyInstalled) {
    const expected = readFileSync(pyVersion, "utf-8").trim();
    if (expected && !pyInstalled.startsWith(expected)) {
      mismatches.push({ project: projectName, file: ".python-version", expected, installed: pyInstalled, runtime: "Python" });
    }
  }

  // rust-toolchain.toml
  const rustToolchain = join(projectPath, "rust-toolchain.toml");
  const rustInstalled = extractVersion(cmd("rustc --version"));
  if (existsSync(rustToolchain) && rustInstalled) {
    const content = readFileSync(rustToolchain, "utf-8");
    const channelMatch = content.match(/channel\s*=\s*"([^"]+)"/);
    if (channelMatch && channelMatch[1] !== "stable" && channelMatch[1] !== "nightly") {
      const expected = channelMatch[1];
      if (!rustInstalled.startsWith(expected)) {
        mismatches.push({ project: projectName, file: "rust-toolchain.toml", expected, installed: rustInstalled, runtime: "Rust" });
      }
    }
  }

  // package.json engines.node
  const pkgPath = join(projectPath, "package.json");
  if (existsSync(pkgPath) && nodeInstalled) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const enginesNode = pkg.engines?.node;
      if (enginesNode) {
        // Simple check: extract minimum version
        const minMatch = enginesNode.match(/>=?\s*(\d+)/);
        if (minMatch) {
          const minMajor = parseInt(minMatch[1], 10);
          const installedMajor = majorVersion(nodeInstalled);
          if (installedMajor < minMajor) {
            mismatches.push({
              project: projectName,
              file: "package.json (engines.node)",
              expected: `>=${minMajor}`,
              installed: nodeInstalled,
              runtime: "Node.js",
            });
          }
        }
      }
    } catch { /* ignore */ }
  }

  return mismatches;
}
