import { type Bot } from "grammy";
import { type BotContext } from "./bot.js";
import { getProjects } from "./projects/registry.js";
import { handleProjectCommand } from "./handlers/project.js";
import { handleBotManager } from "./handlers/botmanager.js";
import { handleSkillCallback } from "./handlers/skill.js";
import { handleFreeText } from "./handlers/freetext.js";

export function registerRoutes(bot: Bot<BotContext>) {
  // Project commands
  bot.command("nexpips", (ctx) => handleProjectCommand(ctx, "nexpips"));
  bot.command("prompticon", (ctx) => handleProjectCommand(ctx, "prompticon"));
  bot.command("vl", (ctx) => handleProjectCommand(ctx, "vl"));

  // Bot manager
  bot.command("bm", handleBotManager);

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
      "Apr\u00E8s avoir s\u00E9lectionn\u00E9 un projet, tes messages libres y sont envoy\u00E9s automatiquement.",
    ];
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  // Callback queries (inline keyboard buttons)
  bot.on("callback_query:data", handleSkillCallback);

  // Free text (routed to active project)
  bot.on("message:text", handleFreeText);

  // Register commands with BotFather
  bot.api.setMyCommands([
    { command: "nexpips", description: "\u{1F4C8} NexPips" },
    { command: "prompticon", description: "\u{1F916} Prompticon" },
    { command: "vl", description: "\u{1F3DB}\uFE0F Vision Lib\u00e9rale" },
    { command: "bm", description: "\u{2699}\uFE0F Bot Manager" },
    { command: "help", description: "\u{2753} Aide" },
  ]);
}
