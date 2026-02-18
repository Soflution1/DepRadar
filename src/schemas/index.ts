import { z } from "zod";

export const ProjectInputSchema = {
  project: z.string().describe(
    "Project name (e.g. 'my-app') or full absolute path."
  ),
};

export const CheckSchema = { ...ProjectInputSchema };

export const UpdateSchema = {
  ...ProjectInputSchema,
  packages: z.string().optional().describe(
    "Space-separated packages to update. Leave empty for all."
  ),
  level: z.enum(["patch", "minor", "latest"]).default("minor").describe(
    "'patch' (bugfixes), 'minor' (features, safe), 'latest' (major, review first)"
  ),
  dry_run: z.boolean().default(false).describe("Preview without changing anything."),
};

export const ScanSchema = {
  directory: z.string().optional().describe("Root directory to scan."),
  framework: z.string().optional().describe("Filter: 'SvelteKit', 'Next.js', 'Django', etc."),
  language: z.string().optional().describe("Filter: 'node', 'python', 'rust', 'go', 'php', 'ruby', 'dart', 'swift', 'kotlin'."),
};

export const UpdateAllSchema = {
  level: z.enum(["patch", "minor", "latest"]).default("minor"),
  framework: z.string().optional().describe("Only update this framework."),
  language: z.string().optional().describe("Only update this language."),
  dry_run: z.boolean().default(true).describe("Defaults to true (safe preview)."),
  directory: z.string().optional(),
};

export const HealthSchema = { ...ProjectInputSchema };

export const InstallSchema = {
  ...ProjectInputSchema,
  clean: z.boolean().default(false).describe("Delete node_modules/vendor before install."),
};

export const ConfigSchema = {
  projects_dir: z.string().optional().describe("Set root projects directory."),
  show: z.boolean().default(false).describe("Show current config."),
};

export const AlertsSchema = {};

export const SetupCronSchema = {
  interval_hours: z.number().default(6).describe("How often to check (in hours). Default: every 6 hours."),
  uninstall: z.boolean().default(false).describe("Remove the scheduled check."),
};

// ─── NEW v2 Schemas ────────────────────────────────────────────────────

export const RuntimesSchema = {
  filter: z.string().optional().describe("Filter by runtime name: 'node', 'python', 'rust', 'go', 'php', 'ruby', 'dart', 'swift'."),
  check_projects: z.boolean().default(true).describe("Also check project-level version files (.nvmrc, .python-version, etc.)."),
  directory: z.string().optional().describe("Project directory to scan for version files."),
};

export const ToolchainSchema = {
  category: z.string().optional().describe("Filter by category: 'Package Managers', 'Build Tools', 'Dev Tools', 'CLI Tools'."),
};

export const ActionsSchema = {
  project: z.string().optional().describe("Scan a specific project. Leave empty to scan all."),
  directory: z.string().optional().describe("Root directory to scan."),
};

export const DockerSchema = {
  project: z.string().optional().describe("Scan a specific project. Leave empty to scan all."),
  directory: z.string().optional().describe("Root directory to scan."),
};

export const EnvCheckSchema = {
  project: z.string().optional().describe("Check a specific project. Leave empty to check all."),
  directory: z.string().optional().describe("Root directory to scan."),
};

export const AuditSchema = {
  project: z.string().optional().describe("Audit a specific project. Leave empty to audit all."),
  directory: z.string().optional().describe("Root directory to scan."),
};

export const InfraSchema = {
  directory: z.string().optional().describe("Root directory to scan."),
  skip_deps: z.boolean().default(false).describe("Skip dependency checks (faster, infra-only)."),
};

// ─── v3 Schemas ────────────────────────────────────────────────────────

export const CveSchema = {
  project: z.string().optional().describe("Check a specific project. Leave empty to check all."),
  directory: z.string().optional().describe("Root directory to scan."),
  show_db: z.boolean().default(false).describe("Show the full CVE advisory database."),
};

export const DeprecatedSchema = {
  project: z.string().optional().describe("Check a specific project. Leave empty to check all."),
  directory: z.string().optional().describe("Root directory to scan."),
};

export const SecretsSchema = {
  project: z.string().optional().describe("Scan a specific project. Leave empty to scan all."),
  directory: z.string().optional().describe("Root directory to scan."),
};

export const LicensesSchema = {
  project: z.string().optional().describe("Check a specific project. Leave empty to check all."),
  directory: z.string().optional().describe("Root directory to scan."),
};
