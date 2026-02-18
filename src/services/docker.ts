import { existsSync, readFileSync } from "fs";
import { join } from "path";

// ─── Docker Image Scanner ──────────────────────────────────────────────

export interface DockerImageInfo {
  project: string;
  file: string;
  image: string;
  tag: string;
  status: "current" | "outdated" | "eol" | "unknown";
  recommendation: string;
}

// Known base image recommendations (updated Feb 2026)
const IMAGE_RECOMMENDATIONS: Record<string, { minTag: string; recommended: string; eol?: string[] }> = {
  node: {
    minTag: "20",
    recommended: "22-alpine",
    eol: ["12", "14", "16", "17", "19", "21"],
  },
  python: {
    minTag: "3.12",
    recommended: "3.13-slim",
    eol: ["3.7", "3.8", "3.9"],
  },
  ruby: {
    minTag: "3.2",
    recommended: "3.3-slim",
    eol: ["2.7", "3.0", "3.1"],
  },
  php: {
    minTag: "8.2",
    recommended: "8.3-fpm-alpine",
    eol: ["7.4", "8.0", "8.1"],
  },
  golang: {
    minTag: "1.22",
    recommended: "1.23-alpine",
    eol: ["1.19", "1.20"],
  },
  rust: {
    minTag: "1.75",
    recommended: "1-slim",
    eol: [],
  },
  nginx: {
    minTag: "1.25",
    recommended: "1.27-alpine",
    eol: ["1.22", "1.23", "1.24"],
  },
  postgres: {
    minTag: "15",
    recommended: "17-alpine",
    eol: ["11", "12", "13", "14"],
  },
  redis: {
    minTag: "7",
    recommended: "7-alpine",
    eol: ["5", "6"],
  },
  ubuntu: {
    minTag: "22.04",
    recommended: "24.04",
    eol: ["18.04", "20.04"],
  },
  alpine: {
    minTag: "3.19",
    recommended: "3.21",
    eol: ["3.15", "3.16", "3.17"],
  },
};

export function scanDockerfiles(projectPath: string, projectName: string): DockerImageInfo[] {
  const results: DockerImageInfo[] = [];

  // Check Dockerfile
  const dockerfile = join(projectPath, "Dockerfile");
  if (existsSync(dockerfile)) {
    const content = readFileSync(dockerfile, "utf-8");
    results.push(...parseFromStatements(content, "Dockerfile", projectName));
  }

  // Check docker-compose.yml
  for (const name of ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"]) {
    const composePath = join(projectPath, name);
    if (existsSync(composePath)) {
      const content = readFileSync(composePath, "utf-8");
      results.push(...parseComposeImages(content, name, projectName));
    }
  }

  return results;
}

function parseFromStatements(content: string, file: string, project: string): DockerImageInfo[] {
  const results: DockerImageInfo[] = [];
  const fromRegex = /^FROM\s+(?:--platform=\S+\s+)?(\S+?)(?::(\S+?))?(?:\s+(?:AS|as)\s+\S+)?$/gm;

  let match;
  while ((match = fromRegex.exec(content)) !== null) {
    const image = match[1].toLowerCase();
    const tag = match[2] || "latest";

    // Skip scratch, local builds, ARG refs
    if (image === "scratch" || image.startsWith("$") || image.includes("${")) continue;

    const baseImage = image.split("/").pop() || image;
    results.push(evaluateImage(project, file, baseImage, tag));
  }

  return results;
}

function parseComposeImages(content: string, file: string, project: string): DockerImageInfo[] {
  const results: DockerImageInfo[] = [];
  const imageRegex = /image:\s*["']?(\S+?)(?::(\S+?))?["']?\s*$/gm;

  let match;
  while ((match = imageRegex.exec(content)) !== null) {
    const image = match[1].toLowerCase();
    const tag = match[2] || "latest";

    if (image.startsWith("$") || image.includes("${")) continue;

    const baseImage = image.split("/").pop() || image;
    results.push(evaluateImage(project, file, baseImage, tag));
  }

  return results;
}

function evaluateImage(project: string, file: string, image: string, tag: string): DockerImageInfo {
  const rec = IMAGE_RECOMMENDATIONS[image];

  if (!rec) {
    return { project, file, image, tag, status: "unknown", recommendation: "Not in known database." };
  }

  // Extract major version from tag
  const tagVersion = tag.match(/^(\d+[\.\d]*)/)?.[1] || "";

  if (rec.eol?.some((v) => tagVersion.startsWith(v))) {
    return {
      project, file, image, tag,
      status: "eol",
      recommendation: `${image}:${tag} is End of Life. Upgrade to ${image}:${rec.recommended}`,
    };
  }

  if (tagVersion && rec.minTag) {
    const tagMajor = parseFloat(tagVersion);
    const minMajor = parseFloat(rec.minTag);
    if (!isNaN(tagMajor) && !isNaN(minMajor) && tagMajor < minMajor) {
      return {
        project, file, image, tag,
        status: "outdated",
        recommendation: `Upgrade to ${image}:${rec.recommended}`,
      };
    }
  }

  if (tag === "latest") {
    return {
      project, file, image, tag,
      status: "unknown",
      recommendation: `Pin to a specific version. Recommended: ${image}:${rec.recommended}`,
    };
  }

  return { project, file, image, tag, status: "current", recommendation: "Up to date." };
}

export function scanAllProjectDocker(
  projects: Array<{ name: string; path: string }>
): Array<{ project: string; images: DockerImageInfo[] }> {
  const results: Array<{ project: string; images: DockerImageInfo[] }> = [];

  for (const p of projects) {
    const images = scanDockerfiles(p.path, p.name);
    if (images.length > 0) {
      results.push({ project: p.name, images });
    }
  }

  return results;
}
