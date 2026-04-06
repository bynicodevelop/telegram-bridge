import { type Context, type NextFunction } from "grammy";
import { config } from "../config.js";

export async function authGuard(ctx: Context, next: NextFunction) {
  if (ctx.from?.id !== config.ownerId) {
    return; // silently ignore unauthorized users
  }
  await next();
}
