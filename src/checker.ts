#!/usr/bin/env node

/**
 * depup-checker: Lightweight background scanner
 *
 * Runs via cron/launchd, scans all projects for outdated deps,
 * writes results to ~/.depup-cache.json, and exits.
 *
 * - Zero RAM between runs (process exits)
 * - Zero tokens (no AI API calls)
 * - Zero network except package registry queries (npm outdated, pip list, etc.)
 * - Typically completes in 10-30 seconds
 */

import {
  discoverProjects,
  getOutdated,
  isMajorUpdate,
  getSecurityIssues,
  writeCache,
  getFrameworkVersion,
} from "./services/project.js";
import type { CacheEntry } from "./types.js";

export async function main() {
  const start = Date.now();
  const projects = discoverProjects();

  if (projects.length === 0) {
    console.error("[depup] No projects found. Configure with ~/.depuprc.json");
    process.exit(0);
  }

  console.error(`[depup] Scanning ${projects.length} projects...`);

  const entries: CacheEntry[] = [];

  for (const info of projects) {
    try {
      const outdated = getOutdated(info.path, info);
      const outdatedCount = Object.keys(outdated).length;
      const majorCount = Object.entries(outdated).filter(([, pkg]) =>
        isMajorUpdate(pkg.current, pkg.latest)
      ).length;

      // Simple score without full audit (faster)
      let score = 100;
      score -= Math.min(outdatedCount * 3, 40);
      score -= majorCount * 10;
      score = Math.max(0, Math.min(100, score));

      entries.push({
        project: info.name,
        path: info.path,
        language: info.language,
        framework: info.framework,
        outdatedCount,
        majorCount,
        securityIssues: 0, // skip audit in background (slow)
        score,
        checkedAt: new Date().toISOString(),
      });

      const status = outdatedCount === 0 ? "✅" : `⚠️ ${outdatedCount} outdated`;
      console.error(`  ${info.name}: ${status}`);
    } catch (err) {
      console.error(`  ${info.name}: ❌ error`);
    }
  }

  writeCache(entries);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const alerts = entries.filter((e) => e.outdatedCount > 0).length;

  console.error(
    `[depup] Done in ${elapsed}s. ${entries.length} projects, ${alerts} need attention.`
  );
  console.error(`[depup] Cache written to ~/.depup-cache.json`);
}

main().catch((err) => {
  console.error("[depup] Fatal:", err.message);
  process.exit(1);
});
