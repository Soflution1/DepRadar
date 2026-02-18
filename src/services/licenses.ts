import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";

// ─── License Compliance Checker ────────────────────────────────────────

export interface LicenseInfo {
  package: string;
  version: string;
  license: string;
  status: "ok" | "warning" | "incompatible" | "unknown";
  note: string;
}

export interface LicenseResult {
  project: string;
  packages: LicenseInfo[];
  totalScanned: number;
  issues: number;
}

// Licenses safe for commercial/SaaS use
const PERMISSIVE_LICENSES = new Set([
  "MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0",
  "Unlicense", "0BSD", "CC0-1.0", "BlueOak-1.0.0",
  "Python-2.0", "PSF-2.0", "Zlib",
]);

// Licenses that require attribution but are OK for SaaS
const ATTRIBUTION_REQUIRED = new Set([
  "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause",
]);

// Copyleft licenses - problematic for proprietary/SaaS code
const COPYLEFT_LICENSES = new Set([
  "GPL-2.0", "GPL-2.0-only", "GPL-2.0-or-later",
  "GPL-3.0", "GPL-3.0-only", "GPL-3.0-or-later",
  "AGPL-3.0", "AGPL-3.0-only", "AGPL-3.0-or-later",
  "LGPL-2.1", "LGPL-2.1-only", "LGPL-2.1-or-later",
  "LGPL-3.0", "LGPL-3.0-only", "LGPL-3.0-or-later",
  "EUPL-1.1", "EUPL-1.2",
  "MPL-2.0", // Weak copyleft, but flag for review
  "CC-BY-SA-4.0", "CC-BY-NC-4.0", "CC-BY-NC-SA-4.0",
]);

// Licenses that are explicitly non-commercial
const NON_COMMERCIAL = new Set([
  "CC-BY-NC-4.0", "CC-BY-NC-SA-4.0", "CC-BY-NC-ND-4.0",
]);

function classifyLicense(license: string): LicenseInfo["status"] {
  if (!license || license === "UNKNOWN") return "unknown";

  // Handle compound licenses (MIT OR Apache-2.0)
  if (license.includes(" OR ")) {
    const parts = license.split(" OR ").map(l => l.trim().replace(/[()]/g, ""));
    // If any option is permissive, it's OK
    if (parts.some(p => PERMISSIVE_LICENSES.has(p))) return "ok";
  }

  const normalized = license.replace(/[()]/g, "").trim();
  if (PERMISSIVE_LICENSES.has(normalized)) return "ok";
  if (NON_COMMERCIAL.has(normalized)) return "incompatible";
  if (COPYLEFT_LICENSES.has(normalized)) return "warning";
  return "unknown";
}

function getLicenseNote(license: string, status: LicenseInfo["status"]): string {
  if (status === "ok") return "Permissive, safe for commercial use";
  if (status === "incompatible") return "Non-commercial license, cannot use in SaaS";
  if (status === "warning") {
    if (license.includes("AGPL")) return "AGPL: Network copyleft, requires source disclosure for SaaS";
    if (license.includes("GPL")) return "GPL: Copyleft, may require source disclosure";
    if (license.includes("LGPL")) return "LGPL: Weak copyleft, OK for linking but review usage";
    if (license.includes("MPL")) return "MPL: File-level copyleft, review modified files";
    return "Copyleft license, review for your use case";
  }
  return "Unknown license, review manually";
}

export function checkProjectLicenses(projectPath: string, projectName: string): LicenseResult {
  const nmDir = join(projectPath, "node_modules");
  if (!existsSync(nmDir)) {
    return { project: projectName, packages: [], totalScanned: 0, issues: 0 };
  }

  const packages: LicenseInfo[] = [];
  let totalScanned = 0;

  try {
    const entries = readdirSync(nmDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

      // Handle scoped packages (@scope/package)
      if (entry.name.startsWith("@")) {
        try {
          const scopedEntries = readdirSync(join(nmDir, entry.name), { withFileTypes: true });
          for (const scopedEntry of scopedEntries) {
            if (!scopedEntry.isDirectory()) continue;
            const fullName = `${entry.name}/${scopedEntry.name}`;
            const pkgDir = join(nmDir, entry.name, scopedEntry.name);
            const info = readPackageLicense(pkgDir, fullName);
            if (info) {
              totalScanned++;
              if (info.status !== "ok") packages.push(info);
            }
          }
        } catch { /* ignore */ }
        continue;
      }

      const pkgDir = join(nmDir, entry.name);
      const info = readPackageLicense(pkgDir, entry.name);
      if (info) {
        totalScanned++;
        if (info.status !== "ok") packages.push(info);
      }
    }
  } catch { /* ignore */ }

  return {
    project: projectName,
    packages,
    totalScanned,
    issues: packages.filter(p => p.status === "incompatible" || p.status === "warning").length,
  };
}

function readPackageLicense(pkgDir: string, name: string): LicenseInfo | null {
  const pkgPath = join(pkgDir, "package.json");
  if (!existsSync(pkgPath)) return null;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const license = typeof pkg.license === "string" ? pkg.license
      : typeof pkg.license === "object" && pkg.license?.type ? pkg.license.type
      : Array.isArray(pkg.licenses) ? pkg.licenses.map((l: any) => l.type || l).join(" OR ")
      : "UNKNOWN";

    const status = classifyLicense(license);
    return {
      package: name,
      version: pkg.version || "?",
      license,
      status,
      note: getLicenseNote(license, status),
    };
  } catch { return null; }
}

export function checkAllProjectLicenses(
  projects: Array<{ name: string; path: string }>
): LicenseResult[] {
  return projects
    .map(p => checkProjectLicenses(p.path, p.name))
    .filter(r => r.issues > 0 || r.packages.some(p => p.status === "unknown"));
}
