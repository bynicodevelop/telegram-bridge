import { type Context, type NextFunction } from "grammy";

export async function logging(ctx: Context, next: NextFunction) {
  const start = Date.now();
  const text = ctx.message?.text || ctx.callbackQuery?.data || "unknown";
  const user = ctx.from?.username || ctx.from?.id || "unknown";

  console.log(JSON.stringify({ event: "incoming", user, text, ts: new Date().toISOString() }));

  await next();

  const duration = Date.now() - start;
  console.log(JSON.stringify({ event: "handled", user, text, duration, ts: new Date().toISOString() }));
}
