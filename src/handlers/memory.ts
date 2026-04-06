import { type BotContext } from "../bot.js";
import {
  addMemory,
  getMemory,
  listMemories,
  deleteMemory,
  searchMemories,
  detectType,
} from "../memory/store.js";

export async function handleMemory(ctx: BotContext) {
  const text = ctx.message?.text?.replace(/^\/memory\s*/, "").trim() || "";
  const [subcommand, ...args] = text.split(/\s+/);

  switch (subcommand) {
    case "add":
      await handleAdd(ctx, args);
      return;
    case "list":
      await handleList(ctx);
      return;
    case "get":
      await handleGet(ctx, args);
      return;
    case "delete":
      await handleDelete(ctx, args);
      return;
    case "search":
      await handleSearch(ctx, args);
      return;
    default:
      await handleHelp(ctx);
      return;
  }
}

/** Called from freetext.ts when awaitingMemoryContent is set */
export async function addMemoryFromFreeText(ctx: BotContext, key: string, content: string, type?: "config" | "behavior") {
  try {
    const resolvedType = type || detectType(content);
    const slug = await addMemory(key, content, resolvedType);
    const emoji = resolvedType === "config" ? "🔧" : "🧠";
    await ctx.reply(
      `${emoji} Mémoire <b>${slug}</b> enregistrée (${resolvedType}).`,
      { parse_mode: "HTML" },
    );
  } catch (err) {
    await ctx.reply(`❌ Erreur : ${(err as Error).message}`);
  }
}

async function handleAdd(ctx: BotContext, args: string[]) {
  if (args.length === 0) {
    await ctx.reply(
      "Usage : <code>/memory add &lt;clé&gt; [contenu]</code>",
      { parse_mode: "HTML" },
    );
    return;
  }

  const key = args[0];

  // Parse optional --type flag
  let type: "config" | "behavior" | undefined;
  const typeArg = args.find((a) => a.startsWith("--type="));
  if (typeArg) {
    const val = typeArg.split("=")[1];
    if (val === "config" || val === "behavior") type = val;
    args = args.filter((a) => a !== typeArg);
  }

  // Inline content: everything after the key
  const inlineContent = args.slice(1).join(" ").trim();

  if (inlineContent) {
    await addMemoryFromFreeText(ctx, key, inlineContent, type);
    return;
  }

  // No inline content → await next message
  ctx.session.awaitingMemoryContent = { key, type };
  await ctx.reply(
    `📝 Envoie le contenu pour <b>${key}</b> :`,
    { parse_mode: "HTML" },
  );
}

async function handleList(ctx: BotContext) {
  const entries = await listMemories();

  if (entries.length === 0) {
    await ctx.reply("📝 Aucune mémoire enregistrée.");
    return;
  }

  const lines = [`📝 <b>Mémoires</b> (${entries.length} entrées)`, ""];
  for (const e of entries) {
    const emoji = e.type === "config" ? "🔧" : "🧠";
    const tags = e.tags.length > 0 ? ` — ${e.tags.join(", ")}` : "";
    lines.push(`${emoji} <b>${e.key}</b> [${e.type}]${tags}`);
  }

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}

async function handleGet(ctx: BotContext, args: string[]) {
  if (args.length === 0) {
    await ctx.reply(
      "Usage : <code>/memory get &lt;clé&gt;</code>",
      { parse_mode: "HTML" },
    );
    return;
  }

  const entry = await getMemory(args[0]);
  if (!entry) {
    await ctx.reply(`❌ Mémoire <b>${args[0]}</b> introuvable.`, { parse_mode: "HTML" });
    return;
  }

  const emoji = entry.type === "config" ? "🔧" : "🧠";
  const tags = entry.tags.length > 0 ? `Tags : ${entry.tags.join(", ")}\n` : "";
  const lines = [
    `${emoji} <b>${entry.key}</b> [${entry.type}]`,
    `${tags}Créé : ${entry.created}`,
    `Modifié : ${entry.updated}`,
    "",
    `<pre>${escapeHtml(entry.content)}</pre>`,
  ];

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}

async function handleDelete(ctx: BotContext, args: string[]) {
  if (args.length === 0) {
    await ctx.reply(
      "Usage : <code>/memory delete &lt;clé&gt;</code>",
      { parse_mode: "HTML" },
    );
    return;
  }

  const deleted = await deleteMemory(args[0]);
  if (deleted) {
    await ctx.reply(`🗑️ Mémoire <b>${args[0]}</b> supprimée.`, { parse_mode: "HTML" });
  } else {
    await ctx.reply(`❌ Mémoire <b>${args[0]}</b> introuvable.`, { parse_mode: "HTML" });
  }
}

async function handleSearch(ctx: BotContext, args: string[]) {
  if (args.length === 0) {
    await ctx.reply(
      "Usage : <code>/memory search &lt;terme&gt;</code>",
      { parse_mode: "HTML" },
    );
    return;
  }

  const query = args.join(" ");
  const results = await searchMemories(query);

  if (results.length === 0) {
    await ctx.reply(`🔍 Aucun résultat pour <b>${escapeHtml(query)}</b>.`, { parse_mode: "HTML" });
    return;
  }

  const lines = [`🔍 <b>Résultats pour "${escapeHtml(query)}"</b> (${results.length})`, ""];
  for (const e of results) {
    const emoji = e.type === "config" ? "🔧" : "🧠";
    const tags = e.tags.length > 0 ? ` — ${e.tags.join(", ")}` : "";
    lines.push(`${emoji} <b>${e.key}</b> [${e.type}]${tags}`);
  }

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}

async function handleHelp(ctx: BotContext) {
  const entries = await listMemories();
  const countLine = entries.length > 0
    ? `\n📊 ${entries.length} entrée(s) en mémoire.\n`
    : "\n📊 Aucune entrée en mémoire.\n";

  const lines = [
    "📝 <b>Mémoire Globale</b>",
    countLine,
    "<b>Commandes :</b>",
    "<code>/memory list</code> — Lister les entrées",
    "<code>/memory get &lt;clé&gt;</code> — Voir une entrée",
    "<code>/memory add &lt;clé&gt; [contenu]</code> — Ajouter",
    "<code>/memory delete &lt;clé&gt;</code> — Supprimer",
    "<code>/memory search &lt;terme&gt;</code> — Rechercher",
    "",
    "<b>Options :</b>",
    "<code>--type=config|behavior</code> — Forcer le type",
    "",
    "Les mémoires sont injectées automatiquement dans les exécutions Claude.",
  ];

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
