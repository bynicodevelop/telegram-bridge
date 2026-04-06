import { InlineKeyboard } from "grammy";
import { type ProjectConfig } from "../projects/registry.js";

export function buildSkillKeyboard(project: ProjectConfig): InlineKeyboard {
  const kb = new InlineKeyboard();
  const skills = project.skills;

  for (let i = 0; i < skills.length; i++) {
    const skill = skills[i];
    const label = skill.name
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    kb.text(label, `skill:${project.id}:${skill.name}`);

    // 2 buttons per row
    if (i % 2 === 1 && i < skills.length - 1) kb.row();
  }

  kb.row().text("\u{270F}\uFE0F Texte libre", `freetext:${project.id}`);
  return kb;
}
