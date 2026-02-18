import { CHARACTER_LIMIT, LANGUAGE_MARKERS } from "../constants.js";
import type { OutdatedPackage, HealthReport, CacheFile, Language } from "../types.js";
import { groupByEcosystem, isMajorUpdate } from "./project.js";
import type { RuntimeInfo, VersionMismatch } from "./runtimes.js";
import type { ToolInfo } from "./toolchain.js";
import type { ActionUsage } from "./actions.js";
import type { DockerImageInfo } from "./docker.js";
import type { EnvIssue } from "./envcheck.js";
import type { AuditResult } from "./audit.js";
import type { CveCheckResult, CveAdvisory } from "./cve.js";
import type { DeprecatedResult } from "./deprecated.js";
import type { SecretsResult } from "./secrets.js";
import type { LicenseResult } from "./licenses.js";

// ─── Outdated Formatter ────────────────────────────────────────────────

export function formatOutdated(
  outdated: Record<string, OutdatedPackage>,
  language: Language = "node"
): string {
  const count = Object.keys(outdated).length;
  if (count === 0) return "All dependencies are up to date. ✅";

  if (language === "node") {
    const groups = groupByEcosystem(outdated);
    const lines: string[] = [`${count} outdated package(s):\n`];

    for (const [ecosystem, pkgs] of Object.entries(groups)) {
      const label = ecosystem.charAt(0).toUpperCase() + ecosystem.slice(1);
      lines.push(`### ${label}`);
      for (const [name, info] of pkgs) {
        const major = isMajorUpdate(info.current, info.latest);
        lines.push(`- \`${name}\`: ${info.current} → ${info.latest}${major ? " ⚠️ MAJOR" : ""}`);
      }
      lines.push("");
    }
    return truncate(lines.join("\n"));
  }

  const langName = LANGUAGE_MARKERS[language]?.name || language;
  const lines: string[] = [`${count} outdated ${langName} package(s):\n`];
  for (const [name, info] of Object.entries(outdated)) {
    const major = isMajorUpdate(info.current, info.latest);
    lines.push(`- \`${name}\`: ${info.current} → ${info.latest}${major ? " ⚠️ MAJOR" : ""}`);
  }
  return truncate(lines.join("\n"));
}

// ─── Scan Summary ──────────────────────────────────────────────────────

export function formatScanSummary(
  results: Array<{
    name: string;
    language: Language;
    framework: string;
    pm: string;
    fwVersion: string | null;
    outdatedCount: number;
    hasMajor: boolean;
  }>
): string {
  let totalOutdated = 0;
  let projectsOk = 0;

  const rows: string[] = [];
  for (const r of results) {
    totalOutdated += r.outdatedCount;
    if (r.outdatedCount === 0) projectsOk++;

    const status =
      r.outdatedCount === 0
        ? "✅ up to date"
        : `⚠️ ${r.outdatedCount} outdated${r.hasMajor ? " (major)" : ""}`;

    const langName = LANGUAGE_MARKERS[r.language]?.name || r.language;
    const fw = r.fwVersion ? ` ${r.fwVersion}` : "";
    rows.push(`| ${r.name} | ${langName} | ${r.framework}${fw} | ${r.pm} | ${status} |`);
  }

  const header = [
    `# Project Scan Results\n`,
    `**${results.length}** projects | **${projectsOk}** up to date | **${totalOutdated}** total outdated\n`,
    `| Project | Language | Framework | PM | Status |`,
    `|---------|----------|-----------|-----|--------|`,
  ];

  const footer: string[] = [];
  if (totalOutdated > 0) {
    footer.push(`\n> Use \`depup_check\` for details, or \`depup_update_all\` to update everything.`);
  }

  return truncate([...header, ...rows, ...footer].join("\n"));
}

// ─── Health Report ─────────────────────────────────────────────────────

export function formatHealthReport(report: HealthReport): string {
  const scoreEmoji = report.score >= 80 ? "🟢" : report.score >= 50 ? "🟡" : "🔴";
  const langName = LANGUAGE_MARKERS[report.language]?.name || report.language;

  const lines = [
    `# Health: ${report.project}`,
    "",
    `**Score**: ${scoreEmoji} ${report.score}/100`,
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Language | ${langName} |`,
    `| Framework | ${report.framework} ${report.frameworkVersion || ""} |`,
    `| Package Manager | ${report.packageManager} |`,
    `| Lockfile | ${report.lockfileExists ? "✅" : "❌ missing"} |`,
    `| Outdated | ${report.outdatedCount} |`,
    `| Major pending | ${report.majorUpdates} |`,
    `| Security issues | ${report.securityIssues} |`,
  ];

  if (report.recommendations.length > 0) {
    lines.push("", "### Recommendations");
    for (const rec of report.recommendations) lines.push(`- ${rec}`);
  }

  return lines.join("\n");
}

// ─── Update Result ─────────────────────────────────────────────────────

export function formatUpdateResult(
  project: string,
  command: string,
  beforeCount: number,
  afterCount: number,
  remaining: Record<string, OutdatedPackage>
): string {
  const updated = beforeCount - afterCount;
  const lines = [
    `# Updated: ${project}`,
    "",
    `**Command**: \`${command}\``,
    `**Updated**: ${updated} package(s)`,
    `**Remaining**: ${afterCount} outdated`,
  ];

  if (afterCount > 0) {
    lines.push("", "### Still outdated");
    for (const [name, info] of Object.entries(remaining)) {
      const major = isMajorUpdate(info.current, info.latest);
      lines.push(`- \`${name}\`: ${info.current} → ${info.latest}${major ? " ⚠️ MAJOR" : ""}`);
    }
    lines.push("", "> Use `level: latest` for major updates (review changelogs first).");
  } else {
    lines.push("", "All dependencies are now up to date. ✅");
  }

  return lines.join("\n");
}

// ─── Batch Result ──────────────────────────────────────────────────────

export function formatBatchResult(
  results: Array<{ name: string; updated: number; remaining: number; error?: string }>,
  dryRun: boolean
): string {
  const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
  const errors = results.filter((r) => r.error);

  const lines = [
    `# ${dryRun ? "Preview" : "Batch Update"}\n`,
    `**${results.length}** projects | **${totalUpdated}** ${dryRun ? "to update" : "updated"}${errors.length > 0 ? ` | **${errors.length}** errors` : ""}\n`,
    `| Project | ${dryRun ? "Would update" : "Updated"} | Remaining | Status |`,
    `|---------|---------|-----------|--------|`,
  ];

  for (const r of results) {
    const status = r.error ? `❌ ${r.error}` : "✅";
    lines.push(`| ${r.name} | ${r.updated} | ${r.remaining} | ${status} |`);
  }

  if (dryRun) lines.push("", "> Set `dry_run: false` to apply.");

  return truncate(lines.join("\n"));
}

// ─── Cache Alerts ──────────────────────────────────────────────────────

export function formatCacheAlerts(cache: CacheFile): string {
  const outdatedProjects = cache.projects.filter((p) => p.outdatedCount > 0);
  if (outdatedProjects.length === 0) {
    return `# All Clear ✅\n\nAll ${cache.projects.length} projects are up to date.\n\nLast checked: ${cache.updatedAt}`;
  }

  const lines = [
    `# ⚠️ ${outdatedProjects.length} project(s) need attention\n`,
    `Last checked: ${cache.updatedAt}\n`,
    `| Project | Language | Outdated | Major | Score |`,
    `|---------|----------|----------|-------|-------|`,
  ];

  for (const p of outdatedProjects.sort((a, b) => a.score - b.score)) {
    const scoreEmoji = p.score >= 80 ? "🟢" : p.score >= 50 ? "🟡" : "🔴";
    const langName = LANGUAGE_MARKERS[p.language]?.name || p.language;
    lines.push(`| ${p.project} | ${langName} | ${p.outdatedCount} | ${p.majorCount} | ${scoreEmoji} ${p.score} |`);
  }

  lines.push("", "> Use `depup_check` for details or `depup_update_all` to update.");

  return lines.join("\n");
}

// ─── NEW v2 Formatters ─────────────────────────────────────────────────

export function formatRuntimes(runtimes: RuntimeInfo[], mismatches: VersionMismatch[]): string {
  const issues = runtimes.filter((r) => r.status !== "current");
  const lines = [
    `# Runtime Versions\n`,
    `| Runtime | Installed | Latest/LTS | Status |`,
    `|---------|-----------|------------|--------|`,
  ];

  for (const r of runtimes) {
    const emoji = r.status === "current" ? "✅" : r.status === "eol" ? "🔴 EOL" : r.status === "outdated" ? "🟡" : "❓";
    const latest = r.lts || r.latest || "—";
    lines.push(`| ${r.name} | ${r.installed} | ${latest} | ${emoji} |`);
  }

  if (issues.length > 0) {
    lines.push("", "### Action needed");
    for (const r of issues) {
      lines.push(`- **${r.name}**: ${r.notes}`);
    }
  }

  if (mismatches.length > 0) {
    lines.push("", "### Project version mismatches");
    for (const m of mismatches) {
      lines.push(`- **${m.project}** (${m.file}): expects ${m.expected}, installed ${m.installed}`);
    }
  }

  if (issues.length === 0 && mismatches.length === 0) {
    lines.push("", "All runtimes are up to date. ✅");
  }

  return lines.join("\n");
}

export function formatToolchain(tools: ToolInfo[]): string {
  const categories = [...new Set(tools.map((t) => t.category))];
  const outdated = tools.filter((t) => t.status === "outdated");

  const lines = [`# Global Toolchain\n`];

  for (const cat of categories) {
    const catTools = tools.filter((t) => t.category === cat);
    lines.push(`### ${cat}`);
    lines.push(`| Tool | Installed | Latest | Status |`);
    lines.push(`|------|-----------|--------|--------|`);

    for (const t of catTools) {
      const emoji = t.status === "current" ? "✅" : t.status === "outdated" ? "⚠️" : "—";
      lines.push(`| ${t.name} | ${t.installed} | ${t.latest || "—"} | ${emoji} |`);
    }
    lines.push("");
  }

  if (outdated.length > 0) {
    lines.push("### Update commands");
    for (const t of outdated) {
      if (t.updateCmd) lines.push(`- **${t.name}**: \`${t.updateCmd}\``);
    }
  } else {
    lines.push("All tools are up to date. ✅");
  }

  return truncate(lines.join("\n"));
}

export function formatActions(results: Array<{ project: string; actions: ActionUsage[] }>): string {
  if (results.length === 0) return "No GitHub Actions workflows found.";

  const allActions = results.flatMap((r) => r.actions);
  const outdated = allActions.filter((a) => a.status === "outdated" || a.status === "deprecated");

  const lines = [
    `# GitHub Actions Audit\n`,
    `**${results.length}** projects | **${allActions.length}** actions | **${outdated.length}** need updates\n`,
  ];

  for (const r of results) {
    const projectOutdated = r.actions.filter((a) => a.status === "outdated" || a.status === "deprecated");
    if (projectOutdated.length === 0 && r.actions.every((a) => a.status === "current")) continue;

    lines.push(`### ${r.project}`);
    lines.push(`| Action | Current | Latest | Status |`);
    lines.push(`|--------|---------|--------|--------|`);

    for (const a of r.actions) {
      const emoji = a.status === "current" ? "✅"
        : a.status === "outdated" ? "⚠️"
        : a.status === "deprecated" ? "🔴"
        : "—";
      lines.push(`| ${a.action} | ${a.currentVersion} | ${a.latestVersion || "?"} | ${emoji} |`);
    }

    for (const a of projectOutdated) {
      lines.push(`> ${a.notes}`);
    }
    lines.push("");
  }

  if (outdated.length === 0) {
    lines.push("All GitHub Actions are up to date. ✅");
  }

  return truncate(lines.join("\n"));
}

export function formatDocker(results: Array<{ project: string; images: DockerImageInfo[] }>): string {
  if (results.length === 0) return "No Docker configurations found.";

  const allImages = results.flatMap((r) => r.images);
  const issues = allImages.filter((i) => i.status !== "current" && i.status !== "unknown");

  const lines = [
    `# Docker Image Audit\n`,
    `**${results.length}** projects | **${allImages.length}** images | **${issues.length}** need updates\n`,
  ];

  for (const r of results) {
    lines.push(`### ${r.project}`);
    lines.push(`| Image | Tag | Status | Recommendation |`);
    lines.push(`|-------|-----|--------|----------------|`);

    for (const img of r.images) {
      const emoji = img.status === "current" ? "✅"
        : img.status === "eol" ? "🔴 EOL"
        : img.status === "outdated" ? "⚠️"
        : "—";
      lines.push(`| ${img.image} | ${img.tag} | ${emoji} | ${img.recommendation} |`);
    }
    lines.push("");
  }

  if (issues.length === 0) {
    lines.push("All Docker images look good. ✅");
  }

  return truncate(lines.join("\n"));
}

export function formatEnvCheck(results: Array<{ project: string; issues: EnvIssue[] }>): string {
  if (results.length === 0) return "No environment issues found. ✅";

  const allIssues = results.flatMap((r) => r.issues);
  const errors = allIssues.filter((i) => i.severity === "error");
  const warnings = allIssues.filter((i) => i.severity === "warning");

  const lines = [
    `# Environment & Config Check\n`,
    `**${results.length}** projects | **${errors.length}** errors | **${warnings.length}** warnings\n`,
  ];

  for (const r of results) {
    lines.push(`### ${r.project}`);
    for (const issue of r.issues) {
      const emoji = issue.severity === "error" ? "🔴"
        : issue.severity === "warning" ? "🟡"
        : "ℹ️";
      lines.push(`- ${emoji} ${issue.message}`);
    }
    lines.push("");
  }

  return truncate(lines.join("\n"));
}

// ─── Utils ─────────────────────────────────────────────────────────────

function truncate(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return text.slice(0, CHARACTER_LIMIT - 100) + "\n\n... (truncated)";
}

// ─── CVE Formatter ─────────────────────────────────────────────────────

export function formatCve(results: CveCheckResult[], dbStats?: { total: number; packages: string[]; lastUpdate: string }): string {
  const allAffected = results.flatMap(r => r.affected);

  if (allAffected.length === 0) {
    const lines = ["# CVE Check ✅\n", "No known CVE advisories affect your installed packages."];
    if (dbStats) {
      lines.push("", `Database: ${dbStats.total} advisories across ${dbStats.packages.length} packages.`);
      lines.push(`Last updated: ${dbStats.lastUpdate}`);
    }
    return lines.join("\n");
  }

  const critical = allAffected.filter(a => a.advisory.severity === "critical");
  const high = allAffected.filter(a => a.advisory.severity === "high");

  const lines = [
    `# 🚨 CVE Advisory Check\n`,
    `**${allAffected.length}** known CVE(s) affect your projects`,
    critical.length > 0 ? ` | **${critical.length} CRITICAL**` : "",
    high.length > 0 ? ` | **${high.length} HIGH**` : "",
    "\n",
  ];

  for (const result of results) {
    if (result.affected.length === 0) continue;

    lines.push(`### ${result.project}`);
    lines.push(`| CVE | Package | Installed | Severity | Patched | Fix |`);
    lines.push(`|-----|---------|-----------|----------|---------|-----|`);

    for (const match of result.affected) {
      const a = match.advisory;
      const emoji = a.severity === "critical" ? "🔴" : a.severity === "high" ? "🟠" : "🟡";
      lines.push(`| ${a.id} | ${a.package} | ${match.installedVersion} | ${emoji} ${a.severity} | ${a.patchedVersion} | Upgrade to ${a.patchedVersion} |`);
    }

    lines.push("");
    for (const match of result.affected) {
      lines.push(`> **${match.advisory.id}**: ${match.advisory.title}`);
    }
    lines.push("");
  }

  lines.push("> Fix: `depup_update` with the specific packages listed above.");

  return truncate(lines.join("\n"));
}

// ─── Deprecated Formatter ──────────────────────────────────────────────

export function formatDeprecated(results: DeprecatedResult[]): string {
  if (results.length === 0) return "# Deprecated Check ✅\n\nNo deprecated or replaced packages found.";

  const allDeps = results.flatMap(r => r.deprecated);
  const lines = [
    `# ⚠️ Deprecated & Replaced Packages\n`,
    `**${allDeps.length}** package(s) across ${results.length} project(s) should be reviewed.\n`,
  ];

  for (const result of results) {
    lines.push(`### ${result.project}`);
    lines.push(`| Package | Version | Status | Action |`);
    lines.push(`|---------|---------|--------|--------|`);

    for (const dep of result.deprecated) {
      const emoji = dep.reason === "deprecated" ? "🔴" : dep.reason === "replaced" ? "🟡" : "⚠️";
      const action = dep.replacement ? `Replace with \`${dep.replacement}\`` : dep.message;
      lines.push(`| ${dep.name} | ${dep.version} | ${emoji} ${dep.reason} | ${action} |`);
    }
    lines.push("");
  }

  return truncate(lines.join("\n"));
}

// ─── Secrets Formatter ─────────────────────────────────────────────────

export function formatSecrets(results: SecretsResult[]): string {
  if (results.length === 0) return "# Secret Scan ✅\n\nNo exposed secrets or tokens found.";

  const allFindings = results.flatMap(r => r.findings);
  const critical = allFindings.filter(f => f.severity === "critical");
  const high = allFindings.filter(f => f.severity === "high");

  const lines = [
    `# 🔐 Secret Scan Results\n`,
    `**${allFindings.length}** finding(s) across ${results.length} project(s)`,
    critical.length > 0 ? ` | **${critical.length} CRITICAL**` : "",
    high.length > 0 ? ` | **${high.length} HIGH**` : "",
    "\n",
  ];

  for (const result of results) {
    lines.push(`### ${result.project} (${result.filesScanned} files scanned)`);
    lines.push(`| File | Line | Type | Severity | Preview |`);
    lines.push(`|------|------|------|----------|---------|`);

    for (const f of result.findings.slice(0, 30)) {
      const emoji = f.severity === "critical" ? "🔴" : f.severity === "high" ? "🟠" : "🟡";
      lines.push(`| ${f.file} | ${f.line} | ${f.type} | ${emoji} ${f.severity} | \`${f.preview}\` |`);
    }

    if (result.findings.length > 30) {
      lines.push(`| ... | | ${result.findings.length - 30} more | | |`);
    }
    lines.push("");
  }

  lines.push("> Review findings and rotate any exposed credentials immediately.");

  return truncate(lines.join("\n"));
}

// ─── License Formatter ─────────────────────────────────────────────────

export function formatLicenses(results: LicenseResult[]): string {
  if (results.length === 0) return "# License Check ✅\n\nAll dependencies use permissive licenses (MIT, ISC, BSD, Apache-2.0).";

  const allIssues = results.flatMap(r => r.packages.filter(p => p.status !== "ok"));
  const incompatible = allIssues.filter(p => p.status === "incompatible");
  const warnings = allIssues.filter(p => p.status === "warning");
  const unknown = allIssues.filter(p => p.status === "unknown");

  const lines = [
    `# 📜 License Compliance\n`,
    `**${allIssues.length}** package(s) need review`,
    incompatible.length > 0 ? ` | **${incompatible.length} incompatible**` : "",
    warnings.length > 0 ? ` | **${warnings.length} copyleft**` : "",
    unknown.length > 0 ? ` | **${unknown.length} unknown**` : "",
    "\n",
  ];

  for (const result of results) {
    const issues = result.packages.filter(p => p.status !== "ok");
    if (issues.length === 0) continue;

    lines.push(`### ${result.project} (${result.totalScanned} packages scanned)`);
    lines.push(`| Package | License | Status | Note |`);
    lines.push(`|---------|---------|--------|------|`);

    for (const pkg of issues) {
      const emoji = pkg.status === "incompatible" ? "🔴"
        : pkg.status === "warning" ? "🟡"
        : "❓";
      lines.push(`| ${pkg.package} | ${pkg.license} | ${emoji} ${pkg.status} | ${pkg.note} |`);
    }
    lines.push("");
  }

  return truncate(lines.join("\n"));
}

// ─── Security Audit ────────────────────────────────────────────────────

export function formatAudit(results: AuditResult[]): string {
  const withVulns = results.filter(r => r.totalVulnerabilities > 0);
  const withErrors = results.filter(r => r.error && r.totalVulnerabilities === 0);
  const totalVulns = results.reduce((sum, r) => sum + r.totalVulnerabilities, 0);
  const totalCritical = results.reduce((sum, r) => sum + r.critical, 0);
  const totalHigh = results.reduce((sum, r) => sum + r.high, 0);

  if (withVulns.length === 0 && withErrors.length === 0) {
    return "# Security Audit ✅\n\nNo known vulnerabilities found across all scanned projects.";
  }

  const lines = [
    `# 🔒 Security Audit\n`,
    `**${results.length}** projects scanned | **${totalVulns}** vulnerabilities found`,
    totalCritical > 0 ? ` | **${totalCritical} CRITICAL**` : "",
    totalHigh > 0 ? ` | **${totalHigh} HIGH**` : "",
    "\n",
  ];

  for (const r of withVulns) {
    const emoji = r.critical > 0 ? "🔴" : r.high > 0 ? "🟠" : "🟡";
    lines.push(`### ${emoji} ${r.project} (${r.language})`);
    lines.push(`${r.totalVulnerabilities} vulnerabilities: ${r.critical} critical, ${r.high} high, ${r.moderate} moderate, ${r.low} low\n`);

    // Sort: critical first
    const sorted = [...r.vulnerabilities].sort((a, b) => {
      const order = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };
      return (order[a.severity] || 4) - (order[b.severity] || 4);
    });

    lines.push(`| Package | Severity | Issue | Fix |`);
    lines.push(`|---------|----------|-------|-----|`);

    for (const v of sorted.slice(0, 20)) {
      const sevEmoji = v.severity === "critical" ? "🔴" : v.severity === "high" ? "🟠" : v.severity === "moderate" ? "🟡" : "⚪";
      const fix = v.fixVersion ? `→ ${v.fixVersion}` : "no fix yet";
      lines.push(`| ${v.package} | ${sevEmoji} ${v.severity} | ${v.title} | ${fix} |`);
    }

    if (sorted.length > 20) lines.push(`| ... | | ${sorted.length - 20} more | |`);
    lines.push("");
  }

  if (withErrors.length > 0) {
    lines.push("### Audit errors");
    for (const r of withErrors) {
      lines.push(`- **${r.project}**: ${r.error}`);
    }
  }

  lines.push("", "> Fix vulnerabilities: `depup_update` with `level: patch` for security-only fixes.");

  return truncate(lines.join("\n"));
}

// ─── Full Infrastructure Report ────────────────────────────────────────

export function formatInfraReport(sections: {
  runtimes?: string;
  toolchain?: string;
  audit?: string;
  cve?: string;
  docker?: string;
  actions?: string;
  env?: string;
  secrets?: string;
  deprecated?: string;
  licenses?: string;
  deps?: string;
}): string {
  const lines = [
    "# 🏗️ Full Infrastructure Report\n",
    "Complete health check of your development environment and all projects.\n",
    "---",
  ];

  if (sections.runtimes) { lines.push("", sections.runtimes, "\n---"); }
  if (sections.toolchain) { lines.push("", sections.toolchain, "\n---"); }
  if (sections.audit) { lines.push("", sections.audit, "\n---"); }
  if (sections.cve) { lines.push("", sections.cve, "\n---"); }
  if (sections.docker) { lines.push("", sections.docker, "\n---"); }
  if (sections.actions) { lines.push("", sections.actions, "\n---"); }
  if (sections.env) { lines.push("", sections.env, "\n---"); }
  if (sections.secrets) { lines.push("", sections.secrets, "\n---"); }
  if (sections.deprecated) { lines.push("", sections.deprecated, "\n---"); }
  if (sections.licenses) { lines.push("", sections.licenses, "\n---"); }
  if (sections.deps) { lines.push("", sections.deps); }

  return truncate(lines.join("\n"));
}
