import { createBot } from "./bot.js";
import { registerRoutes } from "./router.js";
import { getProjects } from "./projects/registry.js";
import { startScheduler, stopScheduler } from "./cron/scheduler.js";

async function startBot() {
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

  // Clear any stale polling sessions at Telegram's side
  await bot.api.deleteWebhook({ drop_pending_updates: false });

  // Handle middleware errors gracefully
  bot.catch((err) => {
    console.error("Bot middleware error (non-fatal):", err.message);
  });

  // Start scheduler once (independent of polling state)
  startScheduler(bot);

  console.log("Bot started. Listening for messages...");

  // Start polling — catch 409 conflicts and retry instead of crashing
  await startPollingWithRetry(bot, 3);
}

async function startPollingWithRetry(bot: ReturnType<typeof createBot>, maxRetries: number) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        bot.start({
          onStart: () => {
            console.log(attempt === 0 ? "Polling active." : `Polling active (retry #${attempt}).`);
            resolve();
          },
        }).catch(reject);
      });
      return; // onStart fired successfully, polling is running
    } catch (err: any) {
      const msg = err?.message || String(err);
      if ((msg.includes("409") || msg.includes("Conflict")) && attempt < maxRetries) {
        const waitSec = 30 * (attempt + 1);
        console.warn(`⚠️ Polling conflict (attempt ${attempt + 1}/${maxRetries + 1}): ${msg}`);
        console.warn(`Waiting ${waitSec}s for stale session to expire...`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        await bot.api.deleteWebhook({ drop_pending_updates: false });
        continue;
      }
      console.error("Fatal polling error:", msg);
      process.exit(1);
    }
  }
}

startBot().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
