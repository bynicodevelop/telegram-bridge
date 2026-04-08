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
import { maybeRunLinkCheck } from "../linkcheck/index.js";

let timer: ReturnType<typeof setTimeout> | null = null;

const CRON_SUMMARY_SUFFIX = `

---
IMPORTANT — Notification Telegram : ta réponse finale sera envoyée directement sur Telegram comme notification. Elle doit être CONCISE (max 10 lignes). Termine TOUJOURS par un résumé structuré de ce format :

**Résultat :** [succès/échec]
**Action :** [ce qui a été fait en 1 ligne]
**Détails :** [2-3 points clés — titre d'article publié, mot-clé ciblé, score qualité, URL modifiée, etc.]
**Git :** [commit + push effectué / aucun changement]

Ne renvoie PAS le contenu complet de l'article ou du rapport. Juste ce résumé.`;

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
    maybeRunLinkCheck(bot).catch((err) => console.error("🔗 LinkCheck error:", err));
    timer = setTimeout(() => scheduleTick(bot), 60_000);
  });
}

async function tick(bot: Bot<BotContext>) {
  const jobs = await loadJobs();
  const now = Date.now();
  const dueJobs = jobs.filter((j) => j.enabled && j.nextRunAt <= now);

  if (dueJobs.length === 0) return;

  console.log(`⏰ ${dueJobs.length} cron job(s) due.`);

  // Group jobs by project for parallel execution across projects
  const byProject = new Map<string, typeof dueJobs>();
  for (const job of dueJobs) {
    if (!byProject.has(job.projectId)) byProject.set(job.projectId, []);
    byProject.get(job.projectId)!.push(job);
  }

  // Run projects in parallel, jobs within a project sequentially
  await Promise.all(
    [...byProject.values()].map(async (projectJobs) => {
      for (const job of projectJobs) {
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
            // Append notification summary instruction to cron prompts
            const cronPrompt = job.prompt + CRON_SUMMARY_SUFFIX;

            const startTime = Date.now();
            console.log(`⏰ [${job.id}] Démarrage...`);

            const result = await executeClaude(job.projectId, {
              prompt: cronPrompt,
              cwd: project.path,
              timeoutMs: 1_800_000, // 30 min — crons do research + write + image + git
            });

            const elapsed = Math.round((Date.now() - startTime) / 1000);
            const status = result.success ? "✅" : "❌";
            console.log(`⏰ [${job.id}] ${status} Terminé en ${elapsed}s | ${result.numTurns} turns | $${result.costUsd.toFixed(2)}`);

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
            const errorsText = result.errors.length > 0
              ? `\n\n<b>Erreurs :</b>\n<pre>${escapeHtml(result.errors.join("\n").slice(0, 500))}</pre>`
              : "";
            const header = `⏰ <b>Cron: ${job.id}</b> | ${project.emoji} ${project.name}\n\n`;
            const body = result.success
              ? markdownToHtml(responseText)
              : `❌ Erreur :\n<pre>${escapeHtml(responseText.slice(0, 1000))}</pre>${errorsText}`;
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
    }),
  );

  await saveJobs(jobs);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
