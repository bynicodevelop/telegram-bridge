import { type Bot } from "grammy";
import { type BotContext } from "./bot.js";
import { getProjects } from "./projects/registry.js";
import { handleProjectCommand } from "./handlers/project.js";
import { handleBotManager } from "./handlers/botmanager.js";
import { handleSkillCallback } from "./handlers/skill.js";
import { handleFreeText } from "./handlers/freetext.js";
import { handleMemory } from "./handlers/memory.js";
import { handleCron } from "./handlers/cron.js";
import { handleLinkCheck, initLinkCheckHandler } from "./handlers/linkcheck.js";

export async function registerRoutes(bot: Bot<BotContext>) {
  const projects = await getProjects();

  // Link checker
  initLinkCheckHandler(bot);
  bot.command("linkcheck", handleLinkCheck);

  // Project commands — dynamically registered from projects.json
  for (const project of projects) {
    bot.command(project.prefix, (ctx) => handleProjectCommand(ctx, project.id));
  }

  // Bot manager
  bot.command("bm", handleBotManager);

  // Memory
  bot.command("memory", handleMemory);

  // Cron
  bot.command("cron", handleCron);

  // Start & help
  bot.command("start", async (ctx) => {
    const currentProjects = await getProjects();
    const lines = [
      "<b>Telegram Bridge</b> \u{1F916}\u{1F517}",
      "",
      "Pont Telegram \u2192 Claude CLI pour g\u00e9rer tes projets.",
      "",
      "<b>Projets :</b>",
      ...currentProjects.map((p) => `  /${p.prefix} \u2014 ${p.emoji} ${p.name}`),
      "",
      "<b>Gestion :</b>",
      "  /bm status \u2014 \u00C9tat des projets",
      "  /bm cost \u2014 Suivi des co\u00FBts",
      "  /bm health \u2014 Sant\u00E9 du syst\u00E8me",
      "",
      "<b>M\u00e9moire :</b>",
      "  /memory \u2014 \uD83D\uDCDD M\u00e9moire globale",
      "",
      "<b>Cron :</b>",
      "  /cron \u2014 \u23F0 T\u00e2ches planifi\u00e9es",
      "",
      "<b>Liens :</b>",
      "  /linkcheck \u2014 \u{1F517} V\u00e9rifier les liens morts",
      "",
      "Tape une commande projet pour voir les skills disponibles.",
    ];
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  bot.command("help", async (ctx) => {
    const currentProjects = await getProjects();
    const first = currentProjects[0];
    const prefixList = currentProjects.map((p) => `/${p.prefix}`).join(" \u2014 ");
    const lines = [
      "<b>Utilisation :</b>",
      "",
      ...(first ? [
        `<code>/${first.prefix}</code> \u2014 Dashboard + skills ${first.name}`,
        `<code>/${first.prefix} /provider</code> \u2014 Ex\u00e9cute le provider`,
        `<code>/${first.prefix} question libre</code> \u2014 Envoie \u00e0 Claude`,
      ] : []),
      "",
      `<b>Projets :</b> ${prefixList}`,
      "",
      "<code>/bm status|cost|health|kill</code> \u2014 Gestion bot",
      "",
      "<code>/memory list|get|add|delete|search</code> \u2014 M\u00e9moire globale",
      "",
      "<code>/cron list|delete|run</code> \u2014 T\u00e2ches planifi\u00e9es",
      "<code>/cron [demande en texte libre]</code> \u2014 G\u00e9rer via Claude",
      "",
      "Apr\u00e8s avoir s\u00e9lectionn\u00e9 un projet, tes messages libres y sont envoy\u00e9s automatiquement.",
    ];
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  // Callback queries (inline keyboard buttons)
  bot.on("callback_query:data", handleSkillCallback);

  // Free text (routed to active project)
  bot.on("message:text", handleFreeText);

  // Register commands with BotFather (non-blocking)
  const botCommands = [
    ...projects.map((p) => ({ command: p.prefix, description: `${p.emoji} ${p.name}` })),
    { command: "bm", description: "\u{2699}\uFE0F Bot Manager" },
    { command: "memory", description: "\uD83D\uDCDD M\u00e9moire globale" },
    { command: "cron", description: "\u23F0 T\u00e2ches planifi\u00e9es" },
    { command: "linkcheck", description: "\u{1F517} V\u00e9rifier les liens morts" },
    { command: "help", description: "\u{2753} Aide" },
  ];
  bot.api.setMyCommands(botCommands).catch((err) => console.warn("\u26A0\uFE0F setMyCommands failed (non-fatal):", err.message));
}
