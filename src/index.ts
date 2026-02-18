#!/usr/bin/env node

import { SERVER_NAME, SERVER_VERSION } from "./constants.js";

const args = process.argv.slice(2);

if (args.includes("--check") || args.includes("-c")) {
  // Background checker mode: scan, write cache, exit
  // Dynamic import to keep the MCP server startup lean
  const { main } = await import("./checker.js");
} else if (args.includes("--version") || args.includes("-v")) {
  console.log(`${SERVER_NAME} v${SERVER_VERSION}`);
} else if (args.includes("--help") || args.includes("-h")) {
  console.log(`${SERVER_NAME} v${SERVER_VERSION}

Usage:
  depup-mcp              Start MCP server (for Cursor/Claude)
  depup-mcp --check      Run background scan (for cron/launchd)
  depup-mcp --version    Show version
  depup-mcp --help       Show this help

MCP Tools:
  depup_alerts           Show pending alerts from background scans
  depup_scan             Scan all projects for outdated deps
  depup_check            Check a specific project
  depup_update           Update a project's dependencies
  depup_update_all       Batch update all projects
  depup_health           Health score for a project
  depup_install          Fresh install dependencies
  depup_audit            Security vulnerability scan (CVEs)
  depup_runtimes         Check runtime versions (Node, Python, Rust...)
  depup_toolchain        Check global tool versions (npm, pnpm, git...)
  depup_docker           Audit Docker images for outdated/EOL
  depup_actions          Audit GitHub Actions versions
  depup_envcheck         Validate .env, lockfiles, configs
  depup_infra            Full infrastructure report (everything)
  depup_setup_checker    Setup automatic background scanning
  depup_config           View/edit configuration

Supported: Node.js, Python, Rust, Go, PHP, Ruby, Dart/Flutter, Swift, Kotlin/Java
Frameworks: SvelteKit, React, Next.js, Solid.js, Vue/Nuxt, Astro, Django, Laravel, Express
`);
} else {
  // Default: MCP server mode
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { registerTools } = await import("./tools/index.js");

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
}
