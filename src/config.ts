import "dotenv/config";
import { join } from "node:path";

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const projectsDir = process.env.PROJECTS_DIR || join(process.env.HOME || "/home/debian", "projects");
const bridgeDir = process.env.BRIDGE_DIR || process.cwd();

export const config = {
  botToken: required("TELEGRAM_BOT_TOKEN"),
  ownerId: Number(required("TELEGRAM_OWNER_ID")),
  claudePath: process.env.CLAUDE_PATH || "claude",
  claudeTimeoutMs: Number(process.env.CLAUDE_TIMEOUT_MS) || 300_000,
  projectsDir,
  bridgeDir,
  memoryDir: process.env.MEMORY_DIR || join(projectsDir, ".provider", "memory"),
  cronDir: join(projectsDir, ".provider", "cron"),
  linkcheckDir: join(projectsDir, ".provider", "linkcheck"),
  projectsConfigPath: process.env.PROJECTS_CONFIG || join(bridgeDir, "projects.json"),
};
