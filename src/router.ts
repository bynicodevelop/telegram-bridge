import { type Bot } from "grammy";
import { type BotContext } from "./bot.js";
import { getProjects } from "./projects/registry.js";
import { handleProjectCommand } from "./handlers/project.js";
import { handleBotManager } from "./handlers/botmanager.js";
import { handleSkillCallback } from "./handlers/skill.js";
import { handleFreeText } from "./handlers/freetext.js";
import { handleMemory } from "./handlers/memory.js";
import { handleCron } from "./handlers/cron.js";

export function registerRoutes(bot: Bot<BotContext>) {
  // Project commands
  bot.command("nexpips", (ctx) => handleProjectCommand(ctx, "nexpips"));
  bot.command("prompticon", (ctx) => handleProjectCommand(ctx, "prompticon"));
  bot.command("vl", (ctx) => handleProjectCommand(ctx, "vl"));

  // Bot manager
  bot.command("bm", handleBotManager);

  // Memory
  bot.command("memory", handleMemory);

  // Cron
  bot.command("cron", handleCron);

  // Start & help
  bot.command("start", async (ctx) => {
    const projects = await getProjects();
    const lines = [
      "<b>Telegram Bridge</b> \u{1F916}\u{1F517}",
      "",
      "Pont Telegram \u2192 Claude CLI pour g\u00e9rer tes projets.",
      "",
      "<b>Projets :</b>",
      ...projects.map((p) => `  /${p.prefix} \u2014 ${p.emoji} ${p.name}`),
      "",
      "<b>Gestion :</b>",
      "  /bm status \u2014 \u00C9tat des projets",
      "  /bm cost \u2014 Suivi des co\u00FBts",
      "  /bm health \u2014 Sant\u00E9 du syst\u00E8me",
      "",
      "<b>Mémoire :</b>",
      "  /memory \u2014 \uD83D\uDCDD Mémoire globale",
      "",
      "<b>Cron :</b>",
      "  /cron \u2014 \u23F0 Tâches planifiées",
      "",
      "Tape une commande projet pour voir les skills disponibles.",
    ];
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  bot.command("help", async (ctx) => {
    const lines = [
      "<b>Utilisation :</b>",
      "",
      "<code>/nexpips</code> \u2014 Dashboard + skills NexPips",
      "<code>/nexpips /provider</code> \u2014 Ex\u00E9cute le provider",
      "<code>/nexpips question libre</code> \u2014 Envoie \u00E0 Claude",
      "",
      "<code>/bm status|cost|health|kill</code> \u2014 Gestion bot",
      "",
      "<code>/memory list|get|add|delete|search</code> \u2014 Mémoire globale",
      "",
      "<code>/cron list|delete|run</code> \u2014 Tâches planifiées",
      "<code>/cron [demande en texte libre]</code> \u2014 Gérer via Claude",
      "",
      "Apr\u00E8s avoir s\u00E9lectionn\u00E9 un projet, tes messages libres y sont envoy\u00E9s automatiquement.",
    ];
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  // Callback queries (inline keyboard buttons)
  bot.on("callback_query:data", handleSkillCallback);

  // Free text (routed to active project)
  bot.on("message:text", handleFreeText);

  // Register commands with BotFather (non-blocking — rate-limit must not crash the bot)
  bot.api.setMyCommands([
    { command: "nexpips", description: "\u{1F4C8} NexPips" },
    { command: "prompticon", description: "\u{1F916} Prompticon" },
    { command: "vl", description: "\u{1F3DB}\uFE0F Vision Lib\u00e9rale" },
    { command: "bot_trading", description: "\u{1F916} Bot Trading" },
    { command: "bm", description: "\u{2699}\uFE0F Bot Manager" },
    { command: "memory", description: "\uD83D\uDCDD Mémoire globale" },
    { command: "cron", description: "\u23F0 Tâches planifiées" },
    { command: "help", description: "\u{2753} Aide" },
  ]).catch((err) => console.warn("⚠️ setMyCommands failed (non-fatal):", err.message));
}
