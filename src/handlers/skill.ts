import { type BotContext } from "../bot.js";
import { getProject } from "../projects/registry.js";
import { executeAndReply } from "./project.js";

export async function handleSkillCallback(ctx: BotContext) {
  const data = ctx.callbackQuery?.data;
  if (!data) return;
  await ctx.answerCallbackQuery();

  // Handle "freetext:<projectId>" button
  if (data.startsWith("freetext:")) {
    const projectId = data.split(":")[1];
    const project = await getProject(projectId);
    if (!project) return;

    ctx.session.activeProject = projectId;
    ctx.session.awaitingArgsForSkill = null;
    ctx.session.awaitingArgsForProject = null;

    await ctx.reply(
      `${project.emoji} <b>${project.name}</b> \u2014 Mode texte libre.\nEnvoie ton message, il sera transmis \u00E0 Claude.`,
      { parse_mode: "HTML" }
    );
    return;
  }

  // Handle "skill:<projectId>:<skillName>"
  if (data.startsWith("skill:")) {
    const [, projectId, skillName] = data.split(":");
    const project = await getProject(projectId);
    if (!project) return;

    const skill = project.skills.find((s) => s.name === skillName);
    if (!skill) {
      await ctx.reply("Skill introuvable.");
      return;
    }

    // If skill has argument hint, ask for args
    if (skill.argumentHint) {
      ctx.session.activeProject = projectId;
      ctx.session.awaitingArgsForSkill = skillName;
      ctx.session.awaitingArgsForProject = projectId;

      await ctx.reply(
        `${project.emoji} <b>${skill.name}</b> \u2014 Envoie les arguments :\n<i>Ex: ${skill.argumentHint}</i>`,
        { parse_mode: "HTML" }
      );
      return;
    }

    // No args needed → execute immediately
    await executeAndReply(ctx, project.id, project.name, project.emoji, project.path, `/${skillName}`);
    return;
  }
}
