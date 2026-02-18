import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, basename, extname } from "path";

// ─── Secret & Token Scanner ────────────────────────────────────────────

export interface SecretFinding {
  file: string;
  line: number;
  type: string;
  severity: "critical" | "high" | "warning";
  preview: string; // masked preview
}

export interface SecretsResult {
  project: string;
  findings: SecretFinding[];
  filesScanned: number;
}

// Patterns to detect secrets
const SECRET_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
  severity: SecretFinding["severity"];
}> = [
  { name: "AWS Access Key", pattern: /AKIA[0-9A-Z]{16}/g, severity: "critical" },
  { name: "AWS Secret Key", pattern: /[A-Za-z0-9/+=]{40}(?=.*aws)/gi, severity: "critical" },
  { name: "GitHub Token", pattern: /gh[ps]_[A-Za-z0-9_]{36,}/g, severity: "critical" },
  { name: "GitHub Fine-grained Token", pattern: /github_pat_[A-Za-z0-9_]{22,}/g, severity: "critical" },
  { name: "Supabase Key", pattern: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{50,}/g, severity: "high" },
  { name: "Stripe Secret Key", pattern: /sk_live_[A-Za-z0-9]{24,}/g, severity: "critical" },
  { name: "Stripe Publishable Key (live)", pattern: /pk_live_[A-Za-z0-9]{24,}/g, severity: "high" },
  { name: "Slack Token", pattern: /xox[bpsar]-[A-Za-z0-9-]{10,}/g, severity: "critical" },
  { name: "OpenAI API Key", pattern: /sk-[A-Za-z0-9]{20,}T3BlbkFJ[A-Za-z0-9]{20,}/g, severity: "critical" },
  { name: "Anthropic API Key", pattern: /sk-ant-[A-Za-z0-9_-]{90,}/g, severity: "critical" },
  { name: "Private Key", pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g, severity: "critical" },
  { name: "Vercel Token", pattern: /[A-Za-z0-9]{24}(?=.*vercel)/gi, severity: "high" },
  { name: "Generic API Key Assignment", pattern: /(?:api[_-]?key|apikey|api_secret)\s*[:=]\s*['"][A-Za-z0-9_\-]{20,}['"]/gi, severity: "high" },
  { name: "Generic Secret Assignment", pattern: /(?:secret|password|passwd|token)\s*[:=]\s*['"][^'"]{8,}['"]/gi, severity: "warning" },
  { name: "Database URL with credentials", pattern: /(?:postgres|mysql|mongodb):\/\/[^:]+:[^@]+@[^/]+/gi, severity: "critical" },
  { name: "Bearer Token Hardcoded", pattern: /['"]Bearer\s+[A-Za-z0-9._\-]{20,}['"]/g, severity: "high" },
];

// Files to skip
const SKIP_DIRS = new Set([
  "node_modules", ".git", ".svelte-kit", ".next", ".nuxt", ".output",
  "dist", "build", ".vercel", ".cache", "vendor", "target",
  "__pycache__", ".venv", "venv", ".dart_tool",
]);

const SKIP_FILES = new Set([
  "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb",
  "Cargo.lock", "composer.lock", "Gemfile.lock", "pubspec.lock",
]);

const SCAN_EXTENSIONS = new Set([
  ".ts", ".js", ".tsx", ".jsx", ".svelte", ".vue", ".py",
  ".rb", ".php", ".go", ".rs", ".env", ".yaml", ".yml",
  ".json", ".toml", ".conf", ".cfg", ".ini", ".sh",
  ".html", ".md", ".sql",
]);

function shouldScan(filePath: string, fileName: string): boolean {
  if (SKIP_FILES.has(fileName)) return false;
  // Always scan .env files (even without extension match)
  if (fileName.startsWith(".env")) return true;
  const ext = extname(fileName).toLowerCase();
  return SCAN_EXTENSIONS.has(ext);
}

function maskSecret(value: string): string {
  if (value.length <= 8) return "***";
  return value.slice(0, 4) + "..." + value.slice(-4);
}

function scanFile(filePath: string, relativePath: string): SecretFinding[] {
  const findings: SecretFinding[] = [];

  try {
    const stat = statSync(filePath);
    if (stat.size > 500_000) return []; // Skip large files (>500KB)

    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments
      if (line.trim().startsWith("//") && !line.includes("=")) continue;
      if (line.trim().startsWith("#") && !relativePath.includes(".env")) continue;

      for (const rule of SECRET_PATTERNS) {
        rule.pattern.lastIndex = 0; // Reset regex state
        const match = rule.pattern.exec(line);
        if (match) {
          findings.push({
            file: relativePath,
            line: i + 1,
            type: rule.name,
            severity: rule.severity,
            preview: maskSecret(match[0]),
          });
        }
      }
    }
  } catch { /* ignore unreadable files */ }

  return findings;
}

function walkDir(dir: string, projectRoot: string, maxDepth = 5, depth = 0): string[] {
  if (depth > maxDepth) return [];
  const files: string[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env" &&
          !entry.name.startsWith(".env.")) continue;
      if (SKIP_DIRS.has(entry.name)) continue;

      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...walkDir(fullPath, projectRoot, maxDepth, depth + 1));
      } else if (entry.isFile() && shouldScan(fullPath, entry.name)) {
        files.push(fullPath);
      }
    }
  } catch { /* ignore */ }

  return files;
}

// Check if .env is properly gitignored
function checkEnvGitignore(projectPath: string): SecretFinding[] {
  const gitignorePath = join(projectPath, ".gitignore");
  const envPath = join(projectPath, ".env");

  if (!existsSync(envPath)) return [];

  if (!existsSync(gitignorePath)) {
    return [{
      file: ".gitignore",
      line: 0,
      type: "Missing .gitignore",
      severity: "critical",
      preview: ".env exists but no .gitignore found",
    }];
  }

  const gitignore = readFileSync(gitignorePath, "utf-8");
  const lines = gitignore.split("\n").map(l => l.trim());
  const hasEnvIgnore = lines.some(l =>
    l === ".env" || l === ".env*" || l === ".env.*" || l === "*.env" || l === ".env.local"
  );

  if (!hasEnvIgnore) {
    return [{
      file: ".gitignore",
      line: 0,
      type: ".env not gitignored",
      severity: "critical",
      preview: ".env exists but is not in .gitignore",
    }];
  }

  return [];
}

export function scanProjectSecrets(projectPath: string, projectName: string): SecretsResult {
  const files = walkDir(projectPath, projectPath);
  let allFindings: SecretFinding[] = [];

  // Check .env gitignore status
  allFindings.push(...checkEnvGitignore(projectPath));

  // Scan all files for secrets
  for (const file of files) {
    const relativePath = file.replace(projectPath + "/", "");
    allFindings.push(...scanFile(file, relativePath));
  }

  // Deduplicate by file+line+type
  const seen = new Set<string>();
  allFindings = allFindings.filter(f => {
    const key = `${f.file}:${f.line}:${f.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { project: projectName, findings: allFindings, filesScanned: files.length };
}

export function scanAllProjectSecrets(
  projects: Array<{ name: string; path: string }>
): SecretsResult[] {
  return projects
    .map(p => scanProjectSecrets(p.path, p.name))
    .filter(r => r.findings.length > 0);
}
