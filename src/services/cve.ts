import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ─── Framework-Specific CVE Advisory Database ──────────────────────────
// Updated: Feb 2026. Known CVEs for popular frameworks.
// These are checked BEYOND what npm audit catches (which relies on lockfile).

export interface CveAdvisory {
  id: string;
  package: string;
  severity: "critical" | "high" | "moderate" | "low";
  title: string;
  affectedVersions: string; // semver range description
  patchedVersion: string;
  url: string;
  date: string; // ISO date
}

export interface CveCheckResult {
  project: string;
  affected: CveMatch[];
  scannedPackages: number;
}

export interface CveMatch {
  advisory: CveAdvisory;
  installedVersion: string;
  isAffected: boolean;
}

// ─── Known CVE Database ────────────────────────────────────────────────
// We maintain this manually for frameworks where npm audit may lag or miss.
// Format: package → array of known CVEs with affected/patched versions.

const CVE_DATABASE: CveAdvisory[] = [
  // Svelte Ecosystem (Jan 2026)
  {
    id: "CVE-2026-22775",
    package: "devalue",
    severity: "high",
    title: "DoS via memory/CPU exhaustion in devalue.parse",
    affectedVersions: ">=5.1.0 <5.6.2",
    patchedVersion: "5.6.2",
    url: "https://github.com/sveltejs/devalue/security/advisories/GHSA-g2pg-6438-jwpf",
    date: "2026-01-15",
  },
  {
    id: "CVE-2026-22774",
    package: "devalue",
    severity: "high",
    title: "DoS via memory exhaustion in devalue.parse",
    affectedVersions: ">=5.3.0 <5.6.2",
    patchedVersion: "5.6.2",
    url: "https://github.com/sveltejs/devalue/security/advisories/GHSA-vw5p-8cq8-m7mv",
    date: "2026-01-15",
  },
  {
    id: "CVE-2026-22803",
    package: "@sveltejs/kit",
    severity: "high",
    title: "Memory amplification DoS in Remote Functions binary form deserializer",
    affectedVersions: ">=2.49.0 <2.49.5",
    patchedVersion: "2.49.5",
    url: "https://github.com/sveltejs/kit/security/advisories/GHSA-j2f3-wq62-6q46",
    date: "2026-01-15",
  },
  {
    id: "CVE-2025-67647",
    package: "@sveltejs/kit",
    severity: "critical",
    title: "DoS and SSRF via prerendering",
    affectedVersions: ">=2.19.0 <2.49.5",
    patchedVersion: "2.49.5",
    url: "https://github.com/sveltejs/kit/security/advisories/GHSA-j62c-4x62-9r35",
    date: "2026-01-15",
  },
  {
    id: "CVE-2025-67647",
    package: "@sveltejs/adapter-node",
    severity: "high",
    title: "DoS and SSRF when using prerendering without ORIGIN env var",
    affectedVersions: "<5.5.1",
    patchedVersion: "5.5.1",
    url: "https://github.com/sveltejs/kit/security/advisories/GHSA-j62c-4x62-9r35",
    date: "2026-01-15",
  },
  {
    id: "CVE-2025-15265",
    package: "svelte",
    severity: "moderate",
    title: "XSS via hydratable with unsanitized user-controlled keys",
    affectedVersions: ">=5.46.0 <5.46.4",
    patchedVersion: "5.46.4",
    url: "https://github.com/sveltejs/svelte/security/advisories/GHSA-6738-r8g5-qwp3",
    date: "2026-01-15",
  },

  // Next.js
  {
    id: "CVE-2025-29927",
    package: "next",
    severity: "critical",
    title: "Authorization bypass via x-middleware-subrequest header",
    affectedVersions: ">=12.0.0 <14.2.25",
    patchedVersion: "14.2.25",
    url: "https://github.com/vercel/next.js/security/advisories/GHSA-f82v-jh2m-4xrg",
    date: "2025-03-21",
  },
  {
    id: "CVE-2024-56332",
    package: "next",
    severity: "high",
    title: "DoS via image optimization",
    affectedVersions: ">=10.0.0 <14.2.21",
    patchedVersion: "14.2.21",
    url: "https://github.com/vercel/next.js/security/advisories/GHSA-gp8f-8m3g-qvj9",
    date: "2024-12-17",
  },
  // Express.js
  {
    id: "CVE-2024-29041",
    package: "express",
    severity: "moderate",
    title: "Open redirect in express.response.redirect",
    affectedVersions: "<4.19.2",
    patchedVersion: "4.19.2",
    url: "https://github.com/expressjs/express/security/advisories/GHSA-rv95-896h-c2vc",
    date: "2024-03-25",
  },

  // Vite
  {
    id: "CVE-2025-30208",
    package: "vite",
    severity: "high",
    title: "Arbitrary file access via special URL characters",
    affectedVersions: ">=6.0.0 <6.0.12",
    patchedVersion: "6.0.12",
    url: "https://github.com/vitejs/vite/security/advisories/GHSA-x574-m823-4c42",
    date: "2025-03-24",
  },

  // Axios
  {
    id: "CVE-2025-27152",
    package: "axios",
    severity: "high",
    title: "SSRF and credential leakage via absolute URL override",
    affectedVersions: ">=1.0.0 <1.8.2",
    patchedVersion: "1.8.2",
    url: "https://github.com/axios/axios/security/advisories/GHSA-jr45-m27q-7655",
    date: "2025-03-07",
  },
];

// ─── Version Comparison ────────────────────────────────────────────────

function parseVersion(v: string): number[] {
  return v.replace(/^[^0-9]*/, "").split(".").map(n => parseInt(n, 10) || 0);
}

function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}

function isInRange(version: string, range: string): boolean {
  // Parse ranges like ">=5.1.0 <5.6.2" or "<5.5.1"
  const parts = range.split(/\s+/);
  for (const part of parts) {
    const match = part.match(/^([><=!]+)(.+)$/);
    if (!match) continue;
    const [, op, target] = match;
    const cmp = compareVersions(version, target);
    switch (op) {
      case ">=": if (cmp < 0) return false; break;
      case ">":  if (cmp <= 0) return false; break;
      case "<=": if (cmp > 0) return false; break;
      case "<":  if (cmp >= 0) return false; break;
      case "=":
      case "==": if (cmp !== 0) return false; break;
    }
  }
  return true;
}

// ─── CVE Checking Logic ────────────────────────────────────────────────

function getInstalledVersions(projectPath: string): Record<string, string> {
  const versions: Record<string, string> = {};

  // Node.js: read package.json + node_modules
  const pkgPath = join(projectPath, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

      for (const [name, specifier] of Object.entries(allDeps)) {
        // Try to get actual installed version from node_modules
        const nmPkgPath = join(projectPath, "node_modules", name, "package.json");
        if (existsSync(nmPkgPath)) {
          try {
            const nmPkg = JSON.parse(readFileSync(nmPkgPath, "utf-8"));
            versions[name] = nmPkg.version;
          } catch {
            // Use specifier as fallback (strip ^~>=)
            versions[name] = String(specifier).replace(/^[\^~>=<]+/, "");
          }
        } else {
          versions[name] = String(specifier).replace(/^[\^~>=<]+/, "");
        }
      }
    } catch { /* ignore */ }
  }

  return versions;
}

export function checkProjectCves(projectPath: string, projectName: string): CveCheckResult {
  const installed = getInstalledVersions(projectPath);
  const affected: CveMatch[] = [];

  for (const advisory of CVE_DATABASE) {
    const version = installed[advisory.package];
    if (!version) continue;

    const isAffected = isInRange(version, advisory.affectedVersions);
    if (isAffected) {
      affected.push({ advisory, installedVersion: version, isAffected: true });
    }
  }

  return {
    project: projectName,
    affected,
    scannedPackages: Object.keys(installed).length,
  };
}

export function checkAllProjectCves(
  projects: Array<{ name: string; path: string }>
): CveCheckResult[] {
  return projects
    .map(p => checkProjectCves(p.path, p.name))
    .filter(r => r.affected.length > 0);
}

export function getCveDatabase(): CveAdvisory[] {
  return CVE_DATABASE;
}

export function getCveDatabaseStats(): { total: number; packages: string[]; lastUpdate: string } {
  const packages = [...new Set(CVE_DATABASE.map(c => c.package))];
  const dates = CVE_DATABASE.map(c => c.date).sort();
  return {
    total: CVE_DATABASE.length,
    packages,
    lastUpdate: dates[dates.length - 1] || "unknown",
  };
}
