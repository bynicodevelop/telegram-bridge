import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type BotContext } from "../bot.js";
import { getProjects } from "../projects/registry.js";
import { projectQueue } from "../claude/queue.js";
import { getRunningProcess } from "../claude/executor.js";
import { config } from "../config.js";
import { reloadProjects } from "../projects/registry.js";

const startTime = Date.now();

interface CostEntry {
  total: number;
  last: number;
  count: number;
}

const costs = new Map<string, CostEntry>();
let totalCost = 0;

export function trackCost(projectId: string, costUsd: number) {
  totalCost += costUsd;
  const entry = costs.get(projectId) || { total: 0, last: 0, count: 0 };
  entry.total += costUsd;
  entry.last = costUsd;
  entry.count++;
  costs.set(projectId, entry);
}

export async function handleBotManager(ctx: BotContext) {
  const text = ctx.message?.text?.replace(/^\/bm\s*/, "").trim() || "";
  const [subcommand, ...args] = text.split(/\s+/);

  // Built-in subcommands
  switch (subcommand) {
    case "status":
      await handleStatus(ctx);
      return;
    case "cost":
      await handleCost(ctx);
      return;
    case "health":
      await handleHealth(ctx);
      return;
    case "kill":
      await handleKill(ctx, args[0]);
      return;
    case "reload":
      reloadProjects();
      await ctx.reply("\u{2705} Skills recharg\u00E9es.");
      return;
  }

  // No text → show help + set active project to "bm" for free text
  if (!text) {
    ctx.session.activeProject = "bm";
    ctx.session.awaitingArgsForSkill = null;
    ctx.session.awaitingArgsForProject = null;

    await ctx.reply(
      [
        "\u{2699}\uFE0F <b>Bot Manager</b> \u2014 Mode interactif",
        "",
        "Envoie un message et il sera ex\u00E9cut\u00E9 via Claude CLI dans le contexte global (<code>/home/debian/projects/</code>).",
        "",
        "<b>Commandes rapides :</b>",
        "<code>/bm status</code> \u2014 \u00C9tat des queues",
        "<code>/bm cost</code> \u2014 Suivi des co\u00FBts",
        "<code>/bm health</code> \u2014 Sant\u00E9 syst\u00E8me",
        "<code>/bm kill [projet]</code> \u2014 Kill un process",
        "<code>/bm reload</code> \u2014 Recharger les skills",
      ].join("\n"),
      { parse_mode: "HTML" }
    );
    return;
  }

  // Free text → execute via Claude CLI in projects root
  const { executeAndReply } = await import("./project.js");
  await executeAndReply(ctx, "bm", "Bot Manager", "\u{2699}\uFE0F", config.projectsDir, text);
}

async function handleStatus(ctx: BotContext) {
  const projects = await getProjects();
  const uptimeSecs = Math.round((Date.now() - startTime) / 1000);
  const uptime = uptimeSecs >= 3600
    ? `${Math.floor(uptimeSecs / 3600)}h${Math.floor((uptimeSecs % 3600) / 60)}m`
    : uptimeSecs >= 60
      ? `${Math.floor(uptimeSecs / 60)}m${uptimeSecs % 60}s`
      : `${uptimeSecs}s`;

  const lines = [
    `\u{1F4CA} <b>Status</b> \u2014 Uptime: ${uptime}`,
    "",
  ];

  for (const project of projects) {
    const status = projectQueue.getStatus(project.id);
    const icon = status.busy ? "\u{1F534}" : "\u{1F7E2}";
    const state = status.busy ? `occup\u00E9 (${status.waiting} en attente)` : "libre";
    const cost = costs.get(project.id);
    const costStr = cost ? ` | $${cost.total.toFixed(2)} (${cost.count} runs)` : "";
    lines.push(`${icon} ${project.emoji} <b>${project.name}</b> \u2014 ${state}${costStr}`);
  }

  lines.push("", `\u{1F4B0} Total: $${totalCost.toFixed(2)}`);
  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}

async function handleCost(ctx: BotContext) {
  const projects = await getProjects();
  const lines = ["\u{1F4B0} <b>Co\u00FBts</b>", ""];

  for (const project of projects) {
    const cost = costs.get(project.id);
    if (cost) {
      lines.push(`${project.emoji} <b>${project.name}</b>: $${cost.total.toFixed(2)} (${cost.count} runs, dernier: $${cost.last.toFixed(2)})`);
    } else {
      lines.push(`${project.emoji} <b>${project.name}</b>: -`);
    }
  }

  lines.push("", `<b>Total session:</b> $${totalCost.toFixed(2)}`);
  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}

async function handleHealth(ctx: BotContext) {
  const lines = ["\u{1F3E5} <b>Health Check</b>", ""];

  // Claude CLI
  try {
    const version = execSync(`${config.claudePath} --version 2>&1`, { timeout: 5000 }).toString().trim();
    lines.push(`\u{2705} Claude CLI: ${version}`);
  } catch {
    lines.push("\u{274C} Claude CLI: introuvable");
  }

  // Projects
  const projects = await getProjects();
  for (const project of projects) {
    const dirOk = existsSync(project.path);
    const providerOk = existsSync(join(project.path, ".provider", "memory.md"));
    const claudeOk = existsSync(join(project.path, "CLAUDE.md"));
    const skillCount = project.skills.length;

    const icon = dirOk && claudeOk ? "\u{2705}" : "\u{274C}";
    lines.push(`${icon} ${project.emoji} ${project.name}: ${skillCount} skills, provider: ${providerOk ? "ok" : "missing"}, CLAUDE.md: ${claudeOk ? "ok" : "missing"}`);
  }

  // System
  try {
    const mem = execSync("free -h | grep Mem | awk '{print $3\"/\"$2}'", { timeout: 5000 }).toString().trim();
    lines.push("", `\u{1F4BB} M\u00E9moire: ${mem}`);
  } catch { /* ignore */ }

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}

async function handleKill(ctx: BotContext, projectId?: string) {
  if (!projectId) {
    await ctx.reply("Usage: <code>/bm kill [nexpips|prompticon|vl]</code>", { parse_mode: "HTML" });
    return;
  }

  const proc = getRunningProcess(projectId);
  if (!proc) {
    await ctx.reply(`Aucun process en cours pour <b>${projectId}</b>.`, { parse_mode: "HTML" });
    return;
  }

  proc.kill("SIGTERM");
  await ctx.reply(`\u{1F6D1} Process <b>${projectId}</b> termin\u00E9.`, { parse_mode: "HTML" });
}
