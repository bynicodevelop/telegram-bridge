import { type BotContext } from "../bot.js";
import { getProject } from "../projects/registry.js";
import { executeClaude } from "../claude/executor.js";
import { projectQueue } from "../claude/queue.js";
import { buildSkillKeyboard } from "../ui/keyboards.js";
import { markdownToHtml, splitMessage, formatCostFooter } from "../ui/formatter.js";
import { trackCost } from "./botmanager.js";
import { logExecution } from "../changelog.js";

export async function handleProjectCommand(ctx: BotContext, projectId: string) {
  const project = await getProject(projectId);
  if (!project) {
    await ctx.reply("Projet inconnu.");
    return;
  }

  // Set active project for free text routing
  ctx.session.activeProject = projectId;
  ctx.session.awaitingArgsForSkill = null;
  ctx.session.awaitingArgsForProject = null;

  // Extract text after the command
  const text = ctx.message?.text?.replace(/^\/\w+\s*/, "").trim() || "";

  // No text → show dashboard with skill buttons
  if (!text) {
    const skillList = project.skills.length > 0
      ? `\n\n<b>Skills :</b>\n${project.skills.map((s) => `  /${s.name} \u2014 ${s.description}`).join("\n")}`
      : "\n\n<i>Aucun skill d\u00e9tect\u00e9.</i>";

    await ctx.reply(
      `${project.emoji} <b>${project.name}</b>${skillList}\n\nChoisis un skill ou envoie un message libre :`,
      { parse_mode: "HTML", reply_markup: buildSkillKeyboard(project) }
    );
    return;
  }

  // Has text → execute Claude
  await executeAndReply(ctx, project.id, project.name, project.emoji, project.path, text);
}

export async function executeAndReply(
  ctx: BotContext,
  projectId: string,
  projectName: string,
  emoji: string,
  projectPath: string,
  prompt: string
) {
  // Check queue status
  const status = projectQueue.getStatus(projectId);
  if (status.busy) {
    await ctx.reply(`\u{23F3} ${projectName} est occup\u00E9. Ta demande est en file d'attente (position ${status.waiting + 1})...`);
  }

  const release = await projectQueue.acquire(projectId);

  // Send progress message
  const progressMsg = await ctx.reply(`\u{23F3} ${emoji} <b>${projectName}</b> \u2014 Ex\u00E9cution en cours...`, { parse_mode: "HTML" });

  // Progress timer
  let elapsed = 0;
  const progressInterval = setInterval(async () => {
    elapsed += 15;
    const timeStr = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m${elapsed % 60}s` : `${elapsed}s`;
    try {
      await ctx.api.editMessageText(
        progressMsg.chat.id,
        progressMsg.message_id,
        `\u{23F3} ${emoji} <b>${projectName}</b> \u2014 Ex\u00E9cution en cours... (${timeStr})`,
        { parse_mode: "HTML" }
      );
    } catch { /* ignore edit errors */ }
  }, 15_000);

  try {
    const result = await executeClaude(projectId, { prompt, cwd: projectPath });

    clearInterval(progressInterval);

    // Delete progress message
    try { await ctx.api.deleteMessage(progressMsg.chat.id, progressMsg.message_id); } catch { /* ignore */ }

    // Track cost
    trackCost(projectId, result.costUsd);

    // Log to meta changelog
    logExecution({
      projectId,
      projectName,
      prompt,
      success: result.success,
      durationMs: result.durationMs,
      numTurns: result.numTurns,
      resultPreview: result.result,
    }).catch(() => { /* don't block on log failure */ });

    if (!result.success && result.errors.length > 0) {
      const errText = result.errors.join("\n").slice(0, 1000);
      await ctx.reply(
        `\u{274C} ${emoji} <b>${projectName}</b> \u2014 Erreur :\n<pre>${escapeHtml(errText)}</pre>${formatCostFooter(result.costUsd, result.durationMs, result.numTurns)}`,
        { parse_mode: "HTML" }
      );
      return;
    }

    const responseText = result.result || "(pas de r\u00E9ponse)";
    const html = markdownToHtml(responseText) + formatCostFooter(result.costUsd, result.durationMs, result.numTurns);
    const chunks = splitMessage(html);

    for (const chunk of chunks) {
      try {
        await ctx.reply(chunk, { parse_mode: "HTML" });
      } catch {
        // If HTML parse fails, send as plain text
        await ctx.reply(chunk);
      }
    }
  } finally {
    clearInterval(progressInterval);
    release();
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
