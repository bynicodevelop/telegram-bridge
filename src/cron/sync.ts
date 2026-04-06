import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getProjects } from "../projects/registry.js";
import { loadJobs, saveJobs } from "./store.js";
import { isValidCron, computeNextRun } from "./parser.js";
import { type CronJob } from "./types.js";

interface ParsedCron {
  id: string;
  schedule: string;
  prompt: string;
  title: string;
}

export interface SyncResult {
  created: { id: string; projectId: string; schedule: string; title: string }[];
  skipped: { id: string; reason: string }[];
  total: number;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function extractTitle(line: string): string {
  return (
    line
      .replace(/^###\s*/, "")
      .replace(/^\d+\.\s*/, "")
      .replace(/^Cron\s*\d+\s*[—–\-]\s*/i, "")
      .replace(/^Provider\s*[—–\-]+\s*/i, "")
      .replace(/\s*\(.*?\)\s*$/, "")
      .trim() || "untitled"
  );
}

function extractCronExpression(block: string): string | null {
  const match = block.match(/[`"]([\d*,\/-]+(?:\s+[\d*,\/-]+){4})[`"]/);
  if (match && isValidCron(match[1])) return match[1];
  return null;
}

function extractPrompt(block: string): string | null {
  // Format 1: NexPips — **Prompt** : (possibly multi-line)
  const promptMatch = block.match(/\*\*Prompt\*\*\s*:\s*([\s\S]+?)$/);
  if (promptMatch) {
    return promptMatch[1].trim();
  }

  // Format 2: VL — code block with skill: + context:
  const skillMatch = block.match(/skill:\s*(\S+)/);
  const contextMatch = block.match(/context:\s*"(.+?)"/s);
  if (skillMatch && contextMatch) {
    return `Execute ${skillMatch[1]}. ${contextMatch[1]}`;
  }

  // Format 3: Prompticon — **Action**: + **Output**:
  const actionMatch = block.match(/\*\*Action\*\*\s*:\s*(.+)/);
  if (actionMatch) {
    let prompt = actionMatch[1].trim();
    const outputMatch = block.match(/\*\*Output\*\*\s*:\s*(.+)/);
    if (outputMatch) {
      prompt += `. ${outputMatch[1].trim()}`;
    }
    if (!/^execute\s/i.test(prompt)) {
      prompt = `Execute /provider. ${prompt}`;
    }
    if (!/autonome|aucune confirmation|no confirmation/i.test(prompt)) {
      prompt += ". Ne demande aucune confirmation, exécution autonome.";
    }
    return prompt;
  }

  return null;
}

function parseCronsFromConfig(
  content: string,
  projectId: string,
): ParsedCron[] {
  // Find cron section: ## Cron... until next ## (non-sub) or --- or EOF
  // No /m flag: $ must match end-of-string so the lazy quantifier extends fully
  const sectionMatch = content.match(
    /(?:^|\n)(## Cron[^\n]*\n[\s\S]*?)(?=\n## [^#]|\n---\s*\n|$)/,
  );
  if (!sectionMatch) return [];

  const section = sectionMatch[1];
  const blocks = section
    .split(/(?=^### )/m)
    .filter((b) => b.startsWith("### "));

  const results: ParsedCron[] = [];

  for (const block of blocks) {
    const firstLine = block.split("\n")[0];

    // Skip non-cron blocks (summaries, notes, rules)
    if (/notes|resume|regle|summary|daily|rules/i.test(firstLine)) continue;

    const title = extractTitle(firstLine);
    const schedule = extractCronExpression(block);
    if (!schedule) continue;

    const prompt = extractPrompt(block);
    if (!prompt) continue;

    const slug = slugify(title);
    if (!slug) continue;

    results.push({ id: `${projectId}-${slug}`, schedule, prompt, title });
  }

  return results;
}

export async function syncAllFromConfigs(): Promise<SyncResult> {
  const projects = await getProjects();
  const existingJobs = await loadJobs();
  const existingIds = new Set(existingJobs.map((j) => j.id));
  const existingKeys = new Set(
    existingJobs.map((j) => `${j.projectId}:${j.schedule}`),
  );

  const created: SyncResult["created"] = [];
  const skipped: SyncResult["skipped"] = [];
  const newJobs: CronJob[] = [];

  for (const project of projects) {
    const configPath = join(project.path, ".provider", "config.md");
    let content: string;
    try {
      content = await readFile(configPath, "utf-8");
    } catch {
      continue;
    }

    const parsed = parseCronsFromConfig(content, project.id);

    for (const cron of parsed) {
      // Dedup by ID
      if (existingIds.has(cron.id)) {
        skipped.push({ id: cron.id, reason: "déjà existant" });
        continue;
      }

      // Dedup by schedule + project (same time slot)
      const key = `${project.id}:${cron.schedule}`;
      if (existingKeys.has(key)) {
        skipped.push({ id: cron.id, reason: "même horaire déjà configuré" });
        continue;
      }

      const job: CronJob = {
        id: cron.id,
        schedule: cron.schedule,
        projectId: project.id,
        prompt: cron.prompt,
        enabled: true,
        createdAt: new Date().toISOString(),
        lastRunAt: null,
        lastStatus: null,
        nextRunAt: computeNextRun(cron.schedule),
      };

      newJobs.push(job);
      existingIds.add(cron.id);
      existingKeys.add(key);
      created.push({
        id: cron.id,
        projectId: project.id,
        schedule: cron.schedule,
        title: cron.title,
      });
    }
  }

  if (newJobs.length > 0) {
    await saveJobs([...existingJobs, ...newJobs]);
  }

  return { created, skipped, total: existingJobs.length + newJobs.length };
}
