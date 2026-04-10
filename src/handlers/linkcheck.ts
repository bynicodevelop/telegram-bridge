import { type Bot } from "grammy";
import { type BotContext } from "../bot.js";
import { runLinkCheck } from "../linkcheck/index.js";
import { loadLastReport } from "../linkcheck/store.js";
import { formatStatusReport } from "../linkcheck/reporter.js";

let _bot: Bot<BotContext> | null = null;

export function initLinkCheckHandler(bot: Bot<BotContext>) {
  _bot = bot;
}

export async function handleLinkCheck(ctx: BotContext) {
  const text = ctx.message?.text || "";
  const args = text.replace(/^\/linkcheck\s*/, "").trim();

  // /linkcheck status — show last report
  if (args === "status") {
    const report = await loadLastReport();
    if (!report) {
      await ctx.reply("🔗 Aucun scan précédent. Lance /linkcheck pour scanner.");
      return;
    }
    await ctx.reply(formatStatusReport(report), { parse_mode: "HTML" });
    return;
  }

  // /linkcheck help
  if (args === "help") {
    await ctx.reply(
      [
        "🔗 <b>Link Checker</b>",
        "",
        "<code>/linkcheck</code> — Scanner tous les sites",
        "<code>/linkcheck [projet]</code> — Scanner un site par ID",
        "<code>/linkcheck status</code> — Dernier rapport",
        "<code>/linkcheck help</code> — Cette aide",
      ].join("\n"),
      { parse_mode: "HTML" },
    );
    return;
  }

  if (!_bot) {
    await ctx.reply("🔗 ❌ Bot non initialisé.");
    return;
  }

  // /linkcheck or /linkcheck [projectId] — run scan
  const filterProject = args || undefined;
  await ctx.reply("🔗 Scan en cours...");

  try {
    const report = await runLinkCheck(_bot, filterProject);

    // If no broken links, send a confirmation (the reporter stays silent)
    if (report.totalBrokenLinks === 0) {
      const total = report.sites.reduce((s, r) => s + r.linksChecked, 0);
      const pages = report.sites.reduce((s, r) => s + r.pagesScanned, 0);
      await ctx.reply(
        `🔗 ✅ Scan terminé — ${pages} pages, ${total} liens vérifiés. Aucun lien mort.`,
      );
    }
  } catch (err) {
    await ctx.reply(`🔗 ❌ Erreur : ${(err as Error).message}`);
  }
}
