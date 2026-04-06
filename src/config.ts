import "dotenv/config";
import { join } from "node:path";

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const projectsDir = "/home/debian/projects";

export const config = {
  botToken: required("TELEGRAM_BOT_TOKEN"),
  ownerId: Number(required("TELEGRAM_OWNER_ID")),
  claudePath: process.env.CLAUDE_PATH || "claude",
  claudeTimeoutMs: Number(process.env.CLAUDE_TIMEOUT_MS) || 300_000,
  projectsDir,
  memoryDir: process.env.MEMORY_DIR || join(projectsDir, ".provider", "memory"),
};
