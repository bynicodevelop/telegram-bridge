import { type BotContext } from "../bot.js";
import { getProject } from "../projects/registry.js";
import { executeAndReply } from "./project.js";
import { addMemoryFromFreeText } from "./memory.js";
import { config } from "../config.js";

export async function handleFreeText(ctx: BotContext) {
  const text = ctx.message?.text?.trim();
  if (!text) return;

  // If awaiting memory content
  if (ctx.session.awaitingMemoryContent) {
    const { key, type } = ctx.session.awaitingMemoryContent;
    ctx.session.awaitingMemoryContent = null;
    await addMemoryFromFreeText(ctx, key, text, type);
    return;
  }

  // If awaiting skill arguments
  if (ctx.session.awaitingArgsForSkill && ctx.session.awaitingArgsForProject) {
    const project = await getProject(ctx.session.awaitingArgsForProject);
    if (!project) return;

    const skillName = ctx.session.awaitingArgsForSkill;
    ctx.session.awaitingArgsForSkill = null;
    ctx.session.awaitingArgsForProject = null;

    await executeAndReply(ctx, project.id, project.name, project.emoji, project.path, `/${skillName} ${text}`);
    return;
  }

  // If active project is "bm" → execute in projects root
  if (ctx.session.activeProject === "bm") {
    await executeAndReply(ctx, "bm", "Bot Manager", "\u{2699}\uFE0F", config.projectsDir, text);
    return;
  }

  // If active project set, route there
  if (ctx.session.activeProject) {
    const project = await getProject(ctx.session.activeProject);
    if (!project) {
      ctx.session.activeProject = null;
      await ctx.reply("Projet actif invalide. Utilise /nexpips, /prompticon ou /vl.");
      return;
    }

    await executeAndReply(ctx, project.id, project.name, project.emoji, project.path, text);
    return;
  }

  // No active project
  await ctx.reply(
    "Aucun projet actif. Utilise une commande projet d'abord :\n/nexpips \u2014 /prompticon \u2014 /vl \u2014 /bm"
  );
}
