import { Bot, session, type Context, type SessionFlavor } from "grammy";
import { config } from "./config.js";
import { authGuard } from "./middleware/auth.js";
import { logging } from "./middleware/logging.js";

export interface SessionData {
  activeProject: string | null;
  awaitingArgsForSkill: string | null;
  awaitingArgsForProject: string | null;
  awaitingMemoryContent: { key: string; type?: "config" | "behavior" } | null;
}

export type BotContext = Context & SessionFlavor<SessionData>;

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.botToken);

  bot.use(session({
    initial: (): SessionData => ({
      activeProject: "bm",
      awaitingArgsForSkill: null,
      awaitingArgsForProject: null,
      awaitingMemoryContent: null,
    }),
  }));

  bot.use(logging);
  bot.use(authGuard);

  return bot;
}
