import { type Bot } from "grammy";
import { type BotContext } from "../bot.js";
import { config } from "../config.js";
import { loadJobs, saveJobs } from "./store.js";
import { computeNextRun } from "./parser.js";
import { executeClaude } from "../claude/executor.js";
import { projectQueue } from "../claude/queue.js";
import { getProject } from "../projects/registry.js";
import { trackCost } from "../handlers/botmanager.js";
import { logExecution } from "../changelog.js";
import { markdownToHtml, splitMessage, formatCostFooter } from "../ui/formatter.js";

let timer: ReturnType<typeof setTimeout> | null = null;

export function startScheduler(bot: Bot<BotContext>) {
  console.log("⏰ Cron scheduler started.");
  scheduleTick(bot);
}

export function stopScheduler() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  console.log("⏰ Cron scheduler stopped.");
}

function scheduleTick(bot: Bot<BotContext>) {
  tick(bot).finally(() => {
    timer = setTimeout(() => scheduleTick(bot), 60_000);
  });
}

async function tick(bot: Bot<BotContext>) {
  const jobs = await loadJobs();
  const now = Date.now();
  const dueJobs = jobs.filter((j) => j.enabled && j.nextRunAt <= now);

  if (dueJobs.length === 0) return;

  console.log(`⏰ ${dueJobs.length} cron job(s) due.`);

  for (const job of dueJobs) {
    try {
      const project = await getProject(job.projectId);
      if (!project) {
        console.warn(`⏰ Cron ${job.id}: project "${job.projectId}" not found, skipping.`);
        job.lastStatus = "error";
        job.lastRunAt = new Date().toISOString();
        job.nextRunAt = computeNextRun(job.schedule);
        continue;
      }

      const release = await projectQueue.acquire(job.projectId);

      try {
        const result = await executeClaude(job.projectId, {
          prompt: job.prompt,
          cwd: project.path,
        });

        job.lastRunAt = new Date().toISOString();
        job.lastStatus = result.success ? "ok" : "error";
        job.nextRunAt = computeNextRun(job.schedule);

        trackCost(job.projectId, result.costUsd);

        logExecution({
          projectId: job.projectId,
          projectName: project.name,
          prompt: `[cron:${job.id}] ${job.prompt}`,
          success: result.success,
          durationMs: result.durationMs,
          numTurns: result.numTurns,
          resultPreview: result.result,
        }).catch(() => {});

        // Send result to owner
        const responseText = result.result || "(pas de réponse)";
        const header = `⏰ <b>Cron: ${job.id}</b> | ${project.emoji} ${project.name}\n\n`;
        const body = result.success
          ? markdownToHtml(responseText)
          : `❌ Erreur :\n<pre>${escapeHtml(responseText.slice(0, 1000))}</pre>`;
        const footer = formatCostFooter(result.costUsd, result.durationMs, result.numTurns);
        const chunks = splitMessage(header + body + footer);

        for (const chunk of chunks) {
          try {
            await bot.api.sendMessage(config.ownerId, chunk, { parse_mode: "HTML" });
          } catch {
            await bot.api.sendMessage(config.ownerId, chunk);
          }
        }
      } finally {
        release();
      }
    } catch (err) {
      console.error(`⏰ Cron ${job.id} failed:`, err);
      job.lastStatus = "error";
      job.lastRunAt = new Date().toISOString();
      job.nextRunAt = computeNextRun(job.schedule);

      try {
        await bot.api.sendMessage(
          config.ownerId,
          `⏰ ❌ Cron <b>${job.id}</b> a échoué : ${escapeHtml((err as Error).message)}`,
          { parse_mode: "HTML" },
        );
      } catch { /* don't crash on notification failure */ }
    }
  }

  await saveJobs(jobs);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
