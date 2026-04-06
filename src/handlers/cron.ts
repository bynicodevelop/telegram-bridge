import { type BotContext } from "../bot.js";
import { config } from "../config.js";
import { loadJobs, deleteJob, getJob, saveJobs } from "../cron/store.js";
import { computeNextRun } from "../cron/parser.js";
import { getProjects, getProject } from "../projects/registry.js";
import { executeAndReply } from "./project.js";

export async function handleCron(ctx: BotContext) {
  const text = ctx.message?.text?.replace(/^\/cron\s*/, "").trim() || "";
  const [subcommand, ...args] = text.split(/\s+/);

  switch (subcommand) {
    case "list":
      await handleList(ctx);
      return;
    case "delete":
      await handleDelete(ctx, args[0]);
      return;
    case "run":
      await handleRun(ctx, args[0]);
      return;
  }

  if (!text) {
    await handleHelp(ctx);
    return;
  }

  // Free text → Claude CLI manages jobs.json
  await handleFreeTextCron(ctx, text);
}

async function handleList(ctx: BotContext) {
  const jobs = await loadJobs();

  if (jobs.length === 0) {
    await ctx.reply("⏰ Aucun cron configuré.");
    return;
  }

  const lines = [`⏰ <b>Crons</b> (${jobs.length})`, ""];

  for (const job of jobs) {
    const icon = !job.enabled ? "⏸️" : job.lastStatus === "error" ? "🔴" : "🟢";
    const nextDate = new Date(job.nextRunAt);
    const nextStr = formatRelativeTime(nextDate);
    const project = await getProject(job.projectId);
    const emoji = project?.emoji || "❓";

    lines.push(
      `${icon} <b>${job.id}</b> | ${emoji} ${job.projectId}`,
      `    <code>${job.schedule}</code> → prochain: ${nextStr}`,
      `    <i>${job.prompt.slice(0, 60)}${job.prompt.length > 60 ? "..." : ""}</i>`,
      "",
    );
  }

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}

async function handleDelete(ctx: BotContext, id?: string) {
  if (!id) {
    await ctx.reply("Usage : <code>/cron delete &lt;id&gt;</code>", { parse_mode: "HTML" });
    return;
  }

  const deleted = await deleteJob(id);
  if (deleted) {
    await ctx.reply(`🗑️ Cron <b>${id}</b> supprimé.`, { parse_mode: "HTML" });
  } else {
    await ctx.reply(`❌ Cron <b>${id}</b> introuvable.`, { parse_mode: "HTML" });
  }
}

async function handleRun(ctx: BotContext, id?: string) {
  if (!id) {
    await ctx.reply("Usage : <code>/cron run &lt;id&gt;</code>", { parse_mode: "HTML" });
    return;
  }

  const job = await getJob(id);
  if (!job) {
    await ctx.reply(`❌ Cron <b>${id}</b> introuvable.`, { parse_mode: "HTML" });
    return;
  }

  const project = await getProject(job.projectId);
  if (!project) {
    await ctx.reply(`❌ Projet <b>${job.projectId}</b> introuvable.`, { parse_mode: "HTML" });
    return;
  }

  await executeAndReply(ctx, project.id, project.name, project.emoji, project.path, job.prompt);

  // Update job status
  const jobs = await loadJobs();
  const target = jobs.find((j) => j.id === id);
  if (target) {
    target.lastRunAt = new Date().toISOString();
    target.lastStatus = "ok";
    target.nextRunAt = computeNextRun(target.schedule);
    await saveJobs(jobs);
  }
}

async function handleFreeTextCron(ctx: BotContext, text: string) {
  const projects = await getProjects();
  const projectList = projects
    .map((p) => `- "${p.id}" — ${p.emoji} ${p.name}`)
    .join("\n");

  const jobsPath = `${config.cronDir}/jobs.json`;

  const systemPrompt = `Tu gères le fichier de jobs cron pour un bot Telegram.

## Fichier
Chemin absolu : ${jobsPath}

## Format du fichier
Le fichier contient un tableau JSON d'objets avec ce schéma :
\`\`\`json
[{
  "id": "string",          // identifiant court, slug, ex: "vl-article-daily"
  "schedule": "string",    // expression cron 5 champs: minute heure jour-mois mois jour-semaine
  "projectId": "string",   // un des projets disponibles (voir ci-dessous)
  "prompt": "string",      // le prompt à exécuter via Claude CLI
  "enabled": true,         // true/false
  "createdAt": "string",   // ISO 8601
  "lastRunAt": null,       // ISO 8601 ou null
  "lastStatus": null,      // "ok", "error", ou null
  "nextRunAt": number      // timestamp milliseconds de la prochaine exécution
}]
\`\`\`

## Projets disponibles
${projectList}

## Expressions cron (5 champs)
┌───────── minute (0-59)
│ ┌─────── heure (0-23)
│ │ ┌───── jour du mois (1-31)
│ │ │ ┌─── mois (1-12)
│ │ │ │ ┌─ jour de la semaine (0-7, 0 et 7 = dimanche, 1 = lundi)
│ │ │ │ │
* * * * *

Exemples : "0 8 * * 1-5" = 8h en semaine, "30 9 * * *" = 9h30 tous les jours

## Calcul de nextRunAt
Tu DOIS calculer nextRunAt comme le timestamp en millisecondes de la prochaine occurrence du schedule à partir de maintenant (${Date.now()}). Le fuseau horaire est Europe/Paris.

## Instructions
1. Lis le fichier jobs.json actuel (crée-le avec un tableau vide [] s'il n'existe pas)
2. Applique la modification demandée par l'utilisateur (ajouter, modifier, supprimer, activer/désactiver)
3. Écris le fichier modifié
4. Réponds avec un résumé concis de ce que tu as fait

## Demande de l'utilisateur
${text}`;

  await executeAndReply(ctx, "cron", "Cron", "⏰", config.projectsDir, systemPrompt);
}

async function handleHelp(ctx: BotContext) {
  const jobs = await loadJobs();
  const countLine = jobs.length > 0
    ? `\n📊 ${jobs.length} cron(s) configuré(s).\n`
    : "\n📊 Aucun cron configuré.\n";

  const lines = [
    "⏰ <b>Cron — Tâches planifiées</b>",
    countLine,
    "<b>Commandes :</b>",
    "<code>/cron list</code> — Lister les jobs",
    "<code>/cron delete &lt;id&gt;</code> — Supprimer un job",
    "<code>/cron run &lt;id&gt;</code> — Exécuter manuellement",
    "",
    "<b>Langage naturel :</b>",
    "<code>/cron [ta demande]</code> — Claude crée/modifie les jobs",
    "",
    "<i>Ex: /cron je veux un cron qui rédige un article pour VL tous les jours à 8h</i>",
  ];

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}

function formatRelativeTime(date: Date): string {
  const now = Date.now();
  const diff = date.getTime() - now;

  if (diff < 0) return "en retard";
  if (diff < 60_000) return "< 1 min";
  if (diff < 3_600_000) return `dans ${Math.round(diff / 60_000)} min`;
  if (diff < 86_400_000) return `dans ${Math.round(diff / 3_600_000)}h`;
  return `dans ${Math.round(diff / 86_400_000)}j`;
}
