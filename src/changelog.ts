import { appendFile, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

const CHANGELOG_DIR = join(config.projectsDir, ".provider", "changelogs");

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function now(): string {
  return new Date().toISOString().slice(11, 16); // HH:MM
}

export async function logExecution(entry: {
  projectId: string;
  projectName: string;
  prompt: string;
  success: boolean;
  durationMs: number;
  numTurns: number;
  resultPreview: string;
}) {
  const date = today();
  const file = join(CHANGELOG_DIR, `${date}.md`);

  // Ensure directory exists
  if (!existsSync(CHANGELOG_DIR)) {
    await mkdir(CHANGELOG_DIR, { recursive: true });
  }

  // Create file with header if it doesn't exist
  if (!existsSync(file)) {
    await writeFile(file, `# Changelog �� ${date}\n\n`);
  }

  const status = entry.success ? "OK" : "ERREUR";
  const duration = Math.round(entry.durationMs / 1000);
  const preview = entry.resultPreview.slice(0, 150).replace(/\n/g, " ");

  const line = [
    `- **${now()}** | ${entry.projectName} | \`${entry.prompt.slice(0, 80)}\` | ${status} | ${duration}s | ${entry.numTurns} turns`,
    preview ? `  > ${preview}` : "",
    "",
  ].filter(Boolean).join("\n");

  await appendFile(file, line + "\n");
}
