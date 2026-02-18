export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

export type Language = "node" | "python" | "rust" | "go" | "php" | "ruby" | "dart" | "swift" | "kotlin";

export type UpdateLevel = "patch" | "minor" | "latest";

export interface OutdatedPackage {
  current: string;
  wanted: string;
  latest: string;
  dependent?: string;
  type?: string;
  location?: string;
}

export interface ProjectInfo {
  name: string;
  path: string;
  language: Language;
  framework: string;
  packageManager: PackageManager;
  nodeVersion?: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export interface ScanResult {
  project: string;
  path: string;
  language: Language;
  framework: string;
  packageManager: PackageManager;
  outdatedCount: number;
  outdated: Record<string, OutdatedPackage>;
  securityIssues: number;
}

export interface UpdateResult {
  project: string;
  before: number;
  after: number;
  updated: number;
  errors: string[];
}

export interface HealthReport {
  project: string;
  language: Language;
  framework: string;
  frameworkVersion: string | null;
  nodeVersion: string | null;
  packageManager: PackageManager;
  lockfileExists: boolean;
  outdatedCount: number;
  majorUpdates: number;
  securityIssues: number;
  score: number;
  recommendations: string[];
}

export interface CacheEntry {
  project: string;
  path: string;
  language: Language;
  framework: string;
  outdatedCount: number;
  majorCount: number;
  securityIssues: number;
  score: number;
  checkedAt: string; // ISO timestamp
}

export interface CacheFile {
  version: string;
  updatedAt: string;
  projects: CacheEntry[];
}
