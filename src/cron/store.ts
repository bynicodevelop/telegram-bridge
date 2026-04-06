import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.js";
import { type CronJob } from "./types.js";

function getJobsPath(): string {
  return join(config.cronDir, "jobs.json");
}

async function ensureDir() {
  if (!existsSync(config.cronDir)) {
    await mkdir(config.cronDir, { recursive: true });
  }
}

export async function loadJobs(): Promise<CronJob[]> {
  const path = getJobsPath();
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw) as CronJob[];
  } catch {
    return [];
  }
}

export async function saveJobs(jobs: CronJob[]): Promise<void> {
  await ensureDir();
  await writeFile(getJobsPath(), JSON.stringify(jobs, null, 2) + "\n");
}

export async function getJob(id: string): Promise<CronJob | null> {
  const jobs = await loadJobs();
  return jobs.find((j) => j.id === id) || null;
}

export async function deleteJob(id: string): Promise<boolean> {
  const jobs = await loadJobs();
  const filtered = jobs.filter((j) => j.id !== id);
  if (filtered.length === jobs.length) return false;
  await saveJobs(filtered);
  return true;
}
