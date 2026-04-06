import "dotenv/config";

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  botToken: required("TELEGRAM_BOT_TOKEN"),
  ownerId: Number(required("TELEGRAM_OWNER_ID")),
  claudePath: process.env.CLAUDE_PATH || "claude",
  claudeTimeoutMs: Number(process.env.CLAUDE_TIMEOUT_MS) || 300_000,
  projectsDir: "/home/debian/projects",
} as const;
