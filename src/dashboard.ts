#!/usr/bin/env node
/**
 * depsonar dashboard v3: Full dependency management interface
 * http://127.0.0.1:24681
 */
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverProjects, getOutdated, isMajorUpdate,
  groupByEcosystem, buildUpdateCommand, getSecurityIssues,
  computeHealthReport, run, loadConfig, saveConfig,
  getFrameworkVersion, writeCache,
} from "./services/project.js";
import type { CacheEntry } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 24681;
const CACHE_PATH = join(homedir(), ".depsonar-cache.json");

// ─── Scan Progress State ───────────────────────────────────────────────
let scanning = false;
let scanProgress = { current: 0, total: 0, currentProject: "", percent: 0 };

function readCacheFile() {
  if (!existsSync(CACHE_PATH)) return null;
  try { return JSON.parse(readFileSync(CACHE_PATH, "utf-8")); } catch { return null; }
}

function jsonRes(res: ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c: Buffer) => { body += c.toString(); });
    req.on("end", () => resolve(body));
  });
}

let htmlCache: string | null = null;
function getHtml(): string {
  if (htmlCache) return htmlCache;
  const htmlPath = join(__dirname, "..", "dashboard.html");
  if (existsSync(htmlPath)) {
    htmlCache = readFileSync(htmlPath, "utf-8");
    return htmlCache;
  }
  return "<h1>dashboard.html not found</h1>";
}

// ─── Inline scan with progress tracking ────────────────────────────────
// getOutdated uses execSync, so we yield the event loop between each project
function yieldEvent(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

async function runScanWithProgress() {
  const projects = discoverProjects();
  if (projects.length === 0) return;

  scanProgress = { current: 0, total: projects.length, currentProject: "", percent: 0 };
  const entries: CacheEntry[] = [];

  for (let i = 0; i < projects.length; i++) {
    const info = projects[i];
    scanProgress.current = i;
    scanProgress.currentProject = info.name;
    scanProgress.percent = Math.round((i / projects.length) * 100);

    // Yield so HTTP server can respond to progress polls
    await yieldEvent();

    try {
      const outdated = getOutdated(info.path, info);
      const outdatedCount = Object.keys(outdated).length;
      const majorCount = Object.entries(outdated).filter(([, pkg]) =>
        isMajorUpdate(pkg.current, pkg.latest)
      ).length;

      let score = 100;
      score -= Math.min(outdatedCount * 3, 40);
      score -= majorCount * 10;
      score = Math.max(0, Math.min(100, score));

      entries.push({
        project: info.name, path: info.path, language: info.language,
        framework: info.framework, outdatedCount, majorCount,
        securityIssues: 0, score, checkedAt: new Date().toISOString(),
      });
    } catch {}

    scanProgress.current = i + 1;
    scanProgress.percent = Math.round(((i + 1) / projects.length) * 100);
  }

  writeCache(entries);
  scanProgress = { current: projects.length, total: projects.length, currentProject: "Done", percent: 100 };
}

// ─── Request Handler ───────────────────────────────────────────────────
async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || "/";

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  // API: Overview + progress
  if (url === "/api/status") {
    const cache = readCacheFile();
    const base = cache || { projects: [], updatedAt: null };
    return jsonRes(res, { ...base, scanning, scanProgress });
  }

  // API: Scan progress only (lightweight poll)
  if (url === "/api/scan/progress") {
    return jsonRes(res, { scanning, ...scanProgress });
  }

  // API: Project detail (live scan)
  if (url.startsWith("/api/project/")) {
    const projectName = decodeURIComponent(url.replace("/api/project/", "").split("?")[0]);
    const projects = discoverProjects();
    const info = projects.find(p => p.name === projectName);
    if (!info) return jsonRes(res, { error: "Project not found" }, 404);

    try {
      const outdated = getOutdated(info.path, info);
      const grouped = groupByEcosystem(outdated);
      const security = getSecurityIssues(info.path, info);
      const health = computeHealthReport(info);

      const enrichedGroups: Record<string, any[]> = {};
      for (const [ecosystem, items] of Object.entries(grouped)) {
        enrichedGroups[ecosystem] = items.map(([name, pkg]) => ({
          name, ...pkg,
          updateType: isMajorUpdate(pkg.current, pkg.latest) ? "major"
            : pkg.current !== pkg.wanted ? "minor" : "patch",
        }));
      }

      return jsonRes(res, {
        project: info.name, path: info.path,
        language: info.language, framework: info.framework,
        packageManager: info.packageManager,
        outdatedCount: Object.keys(outdated).length,
        majorCount: Object.values(outdated).filter(p => isMajorUpdate(p.current, p.latest)).length,
        securityIssues: security, health, groups: enrichedGroups,
        updateCommands: {
          safe: buildUpdateCommand(info, undefined, "minor"),
          latest: buildUpdateCommand(info, undefined, "latest"),
        },
      });
    } catch (err: any) {
      return jsonRes(res, { error: err.message }, 500);
    }
  }

  // API: Trigger scan
  if (url === "/api/scan" && req.method === "POST") {
    if (scanning) return jsonRes(res, { error: "Scan already in progress" }, 409);
    scanning = true;
    jsonRes(res, { started: true });
    try { await runScanWithProgress(); } catch (e) { console.error("[dashboard] Scan error:", e); }
    scanning = false;
    return;
  }

  // API: Update dependencies
  if (url === "/api/update" && req.method === "POST") {
    const body = JSON.parse(await readBody(req));
    const { project, packages, level = "minor", dryRun = false } = body;
    const projects = discoverProjects();
    const info = projects.find(p => p.name === project);
    if (!info) return jsonRes(res, { error: "Project not found" }, 404);
    const cmd = buildUpdateCommand(info, packages, level);
    if (dryRun) return jsonRes(res, { command: cmd, dryRun: true });
    try {
      const output = run(cmd, info.path);
      return jsonRes(res, { command: cmd, output, success: true });
    } catch (err: any) {
      return jsonRes(res, { command: cmd, error: err.message, success: false });
    }
  }

  // API: Get auto-update config
  if (url === "/api/autoupdate" && req.method === "GET") {
    const config = loadConfig() as any;
    return jsonRes(res, { autoUpdate: config.autoUpdate || [] });
  }

  // API: Toggle auto-update
  if (url === "/api/autoupdate" && req.method === "POST") {
    const body = JSON.parse(await readBody(req));
    const { project, enabled } = body;
    const config = loadConfig() as any;
    const list: string[] = config.autoUpdate || [];
    if (enabled && !list.includes(project)) list.push(project);
    else if (!enabled) { const idx = list.indexOf(project); if (idx >= 0) list.splice(idx, 1); }
    saveConfig({ autoUpdate: list });
    return jsonRes(res, { autoUpdate: list });
  }

  // Serve HTML
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(getHtml());
}

const server = createServer(handleRequest);
server.listen(PORT, "127.0.0.1", () => {
  console.error("[depsonar] Dashboard v3 running on http://127.0.0.1:" + PORT);

  // ─── Built-in Background Scheduler ─────────────────────────────────
  const SCAN_INTERVAL = 12 * 60 * 60 * 1000; // 12h
  const UPDATE_INTERVAL = 24 * 60 * 60 * 1000; // 24h

  async function backgroundScan() {
    if (scanning) return;
    console.error("[depsonar] Background scan starting...");
    scanning = true;
    try { await runScanWithProgress(); } catch (e) { console.error("[depsonar] Background scan error:", e); }
    scanning = false;
    console.error("[depsonar] Background scan complete.");
  }

  async function backgroundAutoUpdate() {
    const config = loadConfig() as any;
    const autoList: string[] = config.autoUpdate || [];
    if (!autoList.length) return;
    console.error(`[depsonar] Auto-updating ${autoList.length} projects (minor+patch only)...`);
    const projects = discoverProjects();
    let ok = 0, fail = 0;
    for (const name of autoList) {
      const info = projects.find(p => p.name === name);
      if (!info) continue;
      const cmd = buildUpdateCommand(info, undefined, "minor");
      try {
        run(cmd, info.path);
        ok++;
        console.error(`[depsonar]   ✓ ${name}`);
      } catch (e: any) {
        fail++;
        console.error(`[depsonar]   ✗ ${name}: ${e.message}`);
      }
    }
    console.error(`[depsonar] Auto-update done: ${ok} updated, ${fail} failed.`);
    // Rescan after updates
    if (ok > 0) await backgroundScan();
  }

  // Initial scan on startup (after 10s to let things settle)
  setTimeout(backgroundScan, 10_000);

  // Periodic scan every 12h
  setInterval(backgroundScan, SCAN_INTERVAL);

  // Periodic auto-update every 24h (only projects with auto-update toggle ON)
  setInterval(backgroundAutoUpdate, UPDATE_INTERVAL);
});
