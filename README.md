# depup-mcp

> Like WordPress auto-updates, but for all your dev projects.

**depup-mcp** is an MCP server that keeps your projects' dependencies up to date, directly from Cursor, Claude, or any MCP-compatible AI assistant.

Supports **Node.js**, **Python**, **Rust**, **Go**, **PHP**, **Ruby**, and **Dart/Flutter**.

With AI-generated "vibe coding" projects, dependency maintenance is an afterthought. WordPress solved this with one-click updates. **depup-mcp** brings the same experience to modern development.

---

## Features

- **Multi-language**: Node.js, Python, Rust, Go, PHP, Ruby, Dart/Flutter
- **Auto-detect** framework (SvelteKit, Next.js, Nuxt, Astro, Django, Laravel...) and package manager (pnpm, npm, yarn, bun, pip, cargo, composer...)
- **Background checker**: Scheduled scans via macOS launchd or Linux cron. Zero RAM between runs, zero tokens, zero cost
- **Alerts**: Instant notification of outdated deps from cached scan results
- **Health scores**: 0-100 rating per project based on outdated deps, security, lockfile
- **Safe updates**: 3 levels (patch/minor/latest) with dry-run preview
- **Batch operations**: Update all projects at once
- **Ecosystem grouping**: Results grouped by Svelte, Supabase, Tailwind, Vite, etc.

---

## Quick Start

### Option 1: npx (zero install)

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "depup": {
      "command": "npx",
      "args": ["-y", "depup-mcp"]
    }
  }
}
```

### Option 2: Global install

```bash
npm install -g depup-mcp
```

```json
{
  "mcpServers": {
    "depup": {
      "command": "depup-mcp"
    }
  }
}
```

### Option 3: Clone

```bash
git clone https://github.com/Soflution1/depup-mcp.git
cd depup-mcp
npm install && npm run build
```

```json
{
  "mcpServers": {
    "depup": {
      "command": "node",
      "args": ["/path/to/depup-mcp/dist/index.js"]
    }
  }
}
```

Restart Cursor after editing the config.

---

## Background Checker

The background checker scans your projects on a schedule and caches the results. When you open Cursor, you get instant alerts without waiting for a live scan.

**How it works:**

1. A lightweight script runs every N hours via macOS launchd or Linux cron
2. It scans all your projects, compares versions with registries
3. Results are written to `~/.depup-cache.json`
4. The process exits immediately (zero RAM between runs)
5. No AI API calls (zero tokens)
6. Next time you ask Cursor, `depup_alerts` reads the cache instantly

**Setup from Cursor:**

> "Setup background dependency checking every 6 hours"

Or manually:

```bash
# macOS (launchd)
depup-mcp --check    # run once manually
# Then use depup_setup_checker tool from Cursor

# Linux (cron)
# Add to crontab:
0 */6 * * * npx --yes depup-mcp --check 2>> ~/.depup-checker.log
```

**Remove:**

> "Remove the background checker"

---

## Configuration

### Projects Directory

By default, depup looks in (first match):

- `~/Cursor/App`
- `~/Projects`
- `~/Developer`
- `~/Code`
- `~/dev`

**Set custom directory:**

```json
// ~/.depuprc.json
{
  "projectsDir": "/Users/me/my-projects"
}
```

Or via environment variable:

```json
{
  "mcpServers": {
    "depup": {
      "command": "npx",
      "args": ["-y", "depup-mcp"],
      "env": {
        "DEPUP_PROJECTS_DIR": "/Users/me/my-projects"
      }
    }
  }
}
```

Or from Cursor: *"Set my projects directory to ~/Code"*

---

## Tools

### `depup_alerts`
Instant alerts from background scans (reads cache, no live scan).
```
"Any dependency alerts?"
"Do my projects need updates?"
```

### `depup_scan`
Live scan of all projects with language/framework detection.
```
"Scan all my projects"
"Which Python projects need updates?"
"Show all SvelteKit projects"
```

### `depup_check`
Deep-dive into one project's outdated deps.
```
"Check JobPin for outdated deps"
"What needs updating in my Django app?"
```

### `depup_update`
Update a single project.
```
"Update JobPin"                              → minor (safe)
"Update svelte in Showly to latest"          → specific package
"Dry run update for my Rust project"         → preview only
```

| Param | Default | Description |
|-------|---------|-------------|
| `project` | required | Name or path |
| `packages` | all | Space-separated names |
| `level` | `minor` | `patch`, `minor`, `latest` |
| `dry_run` | `false` | Preview mode |

### `depup_update_all`
Batch update all projects.
```
"Update all my projects"                     → dry run by default
"Update all SvelteKit projects, apply"       → filtered + applied
"Preview updates for Python projects"        → language filter
```

| Param | Default | Description |
|-------|---------|-------------|
| `level` | `minor` | Update level |
| `framework` | all | Filter by framework |
| `language` | all | Filter by language |
| `dry_run` | `true` | Safe by default |

### `depup_health`
Health score 0-100 for a project.
```
"How healthy is JobPin?"
"Health report for my Go service"
```

Scoring: -3/outdated (max -40), -10/major behind, -15 missing lockfile, -5/vulnerability (max -30).

### `depup_install`
Fresh install with optional clean mode.
```
"Install deps for JobPin"
"Clean install my project"
```

### `depup_setup_checker`
Install/remove background scheduled scans.
```
"Setup background checking every 6 hours"
"Remove the background checker"
```

### `depup_config`
View or edit configuration.
```
"Show depup config"
"Set projects directory to ~/Code"
```

---

## Supported Languages

| Language | Detected by | Outdated command | Update command |
|----------|------------|------------------|----------------|
| Node.js | `package.json` | `npm/pnpm/yarn outdated` | `npm/pnpm/yarn update` |
| Python | `requirements.txt`, `pyproject.toml`, `Pipfile` | `pip list --outdated` | `pip install --upgrade` |
| Rust | `Cargo.toml` | `cargo outdated` | `cargo update` |
| Go | `go.mod` | `go list -m -u all` | `go get -u ./...` |
| PHP | `composer.json` | `composer outdated` | `composer update` |
| Ruby | `Gemfile` | `bundle outdated` | `bundle update` |
| Dart/Flutter | `pubspec.yaml` | `dart pub outdated` | `dart pub upgrade` |

## Framework Detection

| Framework | Config file |
|-----------|------------|
| SvelteKit | `svelte.config.js/ts` |
| Next.js | `next.config.js/ts/mjs` |
| Nuxt | `nuxt.config.ts/js` |
| Astro | `astro.config.mjs/ts` |
| Remix | `remix.config.js/ts` |
| Django | `manage.py` |
| Flask | `wsgi.py` |
| Laravel | `artisan` |
| Express/Fastify/Hono | package.json deps |

## Package Manager Detection

| PM | Lockfile |
|----|----------|
| pnpm | `pnpm-lock.yaml` |
| yarn | `yarn.lock` |
| bun | `bun.lockb` |
| npm | `package-lock.json` |
| pip | `requirements.txt` |
| cargo | `Cargo.lock` |
| composer | `composer.lock` |
| bundler | `Gemfile.lock` |
| pub | `pubspec.lock` |

---

## CLI Usage

```bash
depup-mcp              # Start MCP server (for Cursor)
depup-mcp --check      # Run background scan (for cron/launchd)
depup-mcp --version    # Show version
depup-mcp --help       # Show help
```

---

## Architecture

```
depup-mcp/
├── src/
│   ├── index.ts              # Entry: MCP server or --check mode
│   ├── checker.ts            # Background scanner (cron/launchd)
│   ├── constants.ts          # Language markers, ecosystem patterns
│   ├── types.ts              # TypeScript interfaces
│   ├── schemas/index.ts      # Zod input validation
│   ├── services/
│   │   ├── project.ts        # Multi-lang detection, outdated parsing, cache
│   │   └── formatter.ts      # Tables, reports, alerts formatting
│   └── tools/index.ts        # 9 MCP tools
├── .github/workflows/
│   ├── ci.yml                # CI: Node 18/20/22
│   └── publish.yml           # npm publish on GitHub Release
├── package.json
├── tsconfig.json
├── LICENSE (MIT)
└── README.md
```

---

## Contributing

```bash
git clone https://github.com/Soflution1/depup-mcp.git
cd depup-mcp
npm install
npm run dev    # watch mode
```

Test with MCP Inspector:
```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

---

## License

MIT - [Soflution Ltd](https://soflution.com)
