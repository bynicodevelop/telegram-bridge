import { readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";

export interface SkillDef {
  name: string;
  description: string;
  argumentHint?: string;
}

export interface ProjectConfig {
  id: string;
  prefix: string;
  name: string;
  path: string;
  emoji: string;
  siteUrl?: string;
  skills: SkillDef[];
}

interface ProjectDef {
  id: string;
  prefix: string;
  name: string;
  dir: string;
  emoji: string;
  siteUrl?: string;
}

function loadProjectDefs(): Omit<ProjectConfig, "skills">[] {
  const raw = JSON.parse(readFileSync(config.projectsConfigPath, "utf-8")) as ProjectDef[];
  return raw.map((p) => ({
    id: p.id,
    prefix: p.prefix,
    name: p.name,
    path: join(config.projectsDir, p.dir),
    emoji: p.emoji,
    siteUrl: p.siteUrl,
  }));
}

async function scanSkills(projectPath: string): Promise<SkillDef[]> {
  const commandsDir = join(projectPath, ".claude", "commands");
  let files: string[];
  try {
    files = await readdir(commandsDir);
  } catch {
    return [];
  }

  const skills: SkillDef[] = [];
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    try {
      const content = await readFile(join(commandsDir, file), "utf-8");
      const frontmatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatch) continue;

      const fm = frontmatch[1];
      const desc = fm.match(/description:\s*["']?(.+?)["']?\s*$/m)?.[1] || "";
      const hint = fm.match(/argument-hint:\s*["']?(.+?)["']?\s*$/m)?.[1];

      skills.push({
        name: file.replace(".md", ""),
        description: desc,
        argumentHint: hint,
      });
    } catch {
      // skip unreadable files
    }
  }
  return skills;
}

let _projects: ProjectConfig[] | null = null;

export async function getProjects(): Promise<ProjectConfig[]> {
  if (_projects) return _projects;
  const defs = loadProjectDefs();
  _projects = await Promise.all(
    defs.map(async (def) => ({
      ...def,
      skills: await scanSkills(def.path),
    }))
  );
  return _projects;
}

export async function getProject(id: string): Promise<ProjectConfig | undefined> {
  const projects = await getProjects();
  return projects.find((p) => p.id === id);
}

export function reloadProjects() {
  _projects = null;
}
