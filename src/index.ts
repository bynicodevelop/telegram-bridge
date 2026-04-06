import { createBot } from "./bot.js";
import { registerRoutes } from "./router.js";
import { getProjects } from "./projects/registry.js";
import { startScheduler, stopScheduler } from "./cron/scheduler.js";

async function main() {
  console.log("Starting Telegram Bridge...");

  // Pre-load projects and skills
  const projects = await getProjects();
  for (const p of projects) {
    console.log(`  ${p.emoji} ${p.name}: ${p.skills.length} skills [${p.skills.map((s) => s.name).join(", ")}]`);
  }

  const bot = createBot();
  registerRoutes(bot);

  // Graceful shutdown
  const shutdown = () => {
    console.log("Shutting down...");
    stopScheduler();
    bot.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("Bot started. Listening for messages...");
  bot.start();
  startScheduler(bot);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
