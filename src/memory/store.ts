import { readdir, readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.js";

export interface MemoryEntry {
  key: string;
  type: "config" | "behavior";
  tags: string[];
  created: string;
  updated: string;
  content: string;
}

// --- Helpers ---

function slugify(key: string): string {
  return key
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function filePath(key: string): string {
  return join(config.memoryDir, `${slugify(key)}.md`);
}

async function ensureDir() {
  if (!existsSync(config.memoryDir)) {
    await mkdir(config.memoryDir, { recursive: true });
  }
}

function buildFrontmatter(type: string, tags: string[], created: string, updated: string): string {
  return [
    "---",
    `type: ${type}`,
    `tags: ${tags.join(", ")}`,
    `created: ${created}`,
    `updated: ${updated}`,
    "---",
  ].join("\n");
}

function parseEntry(filename: string, raw: string): MemoryEntry | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const fm = match[1];
  const type = (fm.match(/type:\s*(.+)/)?.[1]?.trim() as "config" | "behavior") || "config";
  const tags = (fm.match(/tags:\s*(.+)/)?.[1] || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const created = fm.match(/created:\s*(.+)/)?.[1]?.trim() || "";
  const updated = fm.match(/updated:\s*(.+)/)?.[1]?.trim() || "";
  const content = raw.slice(match[0].length).trim();

  return {
    key: filename.replace(/\.md$/, ""),
    type,
    tags,
    created,
    updated,
    content,
  };
}

/** Detect type from content: single-line or key=value → config, else behavior */
export function detectType(content: string): "config" | "behavior" {
  const lines = content.trim().split("\n");
  if (lines.length === 1) return "config";
  if (lines.every((l) => /^[\w.-]+\s*=/.test(l.trim()) || l.trim() === "")) return "config";
  return "behavior";
}

// --- Public API ---

export async function addMemory(
  key: string,
  content: string,
  type?: "config" | "behavior",
  tags: string[] = [],
): Promise<string> {
  await ensureDir();
  const slug = slugify(key);
  if (!slug) throw new Error("Clé invalide.");

  const now = new Date().toISOString();
  const resolvedType = type || detectType(content);
  const fm = buildFrontmatter(resolvedType, tags, now, now);
  await writeFile(filePath(slug), `${fm}\n\n${content}\n`);
  return slug;
}

export async function getMemory(key: string): Promise<MemoryEntry | null> {
  const path = filePath(key);
  try {
    const raw = await readFile(path, "utf-8");
    return parseEntry(`${slugify(key)}.md`, raw);
  } catch {
    return null;
  }
}

export async function listMemories(): Promise<MemoryEntry[]> {
  await ensureDir();
  let files: string[];
  try {
    files = await readdir(config.memoryDir);
  } catch {
    return [];
  }

  const entries: MemoryEntry[] = [];
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    try {
      const raw = await readFile(join(config.memoryDir, file), "utf-8");
      const entry = parseEntry(file, raw);
      if (entry) entries.push(entry);
    } catch { /* skip unreadable */ }
  }

  return entries.sort((a, b) => a.key.localeCompare(b.key));
}

export async function deleteMemory(key: string): Promise<boolean> {
  const path = filePath(key);
  try {
    await unlink(path);
    return true;
  } catch {
    return false;
  }
}

export async function searchMemories(query: string): Promise<MemoryEntry[]> {
  const all = await listMemories();
  const q = query.toLowerCase();
  return all.filter(
    (e) =>
      e.key.toLowerCase().includes(q) ||
      e.tags.some((t) => t.toLowerCase().includes(q)) ||
      e.content.toLowerCase().includes(q),
  );
}

export async function buildMemoryPrompt(): Promise<string> {
  const entries = await listMemories();
  if (entries.length === 0) return "";

  const configs = entries.filter((e) => e.type === "config");
  const behaviors = entries.filter((e) => e.type === "behavior");

  const sections: string[] = [];

  if (configs.length > 0) {
    sections.push("## Configuration");
    for (const e of configs) {
      sections.push(`### ${e.key}`);
      sections.push(e.content);
      sections.push("");
    }
  }

  if (behaviors.length > 0) {
    sections.push("## Comportements");
    for (const e of behaviors) {
      sections.push(`### ${e.key}`);
      sections.push(e.content);
      sections.push("");
    }
  }

  return sections.join("\n");
}
