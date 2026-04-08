import { type Bot } from "grammy";
import { type BotContext } from "../bot.js";
import { config } from "../config.js";
import { getProjects } from "../projects/registry.js";
import { discoverPages } from "./discovery.js";
import { buildLinkMap, checkLinks } from "./checker.js";
import { loadLastReport, saveReport } from "./store.js";
import { formatReport } from "./reporter.js";
import type { SiteConfig, SiteScanResult, ScanReport } from "./types.js";

let running = false;

export async function runLinkCheck(
  bot: Bot<BotContext>,
  filterProjectId?: string,
): Promise<ScanReport> {
  const projects = await getProjects();
  const sites: SiteConfig[] = projects
    .filter((p) => p.siteUrl && (!filterProjectId || p.id === filterProjectId))
    .map((p) => ({
      projectId: p.id,
      name: p.name,
      emoji: p.emoji,
      siteUrl: p.siteUrl!,
    }));

  const results: SiteScanResult[] = [];

  for (const site of sites) {
    const start = Date.now();
    console.log(`🔗 [${site.name}] Discovering pages...`);

    const pageUrls = await discoverPages(site.siteUrl);
    if (pageUrls.length === 0) {
      console.warn(`🔗 [${site.name}] No pages found, skipping.`);
      results.push({
        projectId: site.projectId,
        siteUrl: site.siteUrl,
        name: site.name,
        emoji: site.emoji,
        pagesScanned: 0,
        linksChecked: 0,
        brokenLinks: [],
        scanDurationMs: Date.now() - start,
      });
      continue;
    }

    console.log(`🔗 [${site.name}] ${pageUrls.length} pages found. Extracting links...`);
    const linkMap = await buildLinkMap(pageUrls);
    console.log(`🔗 [${site.name}] ${linkMap.size} unique links. Checking...`);

    const brokenLinks = await checkLinks(linkMap);
    const elapsed = Date.now() - start;

    console.log(
      `🔗 [${site.name}] Done in ${Math.round(elapsed / 1000)}s — ${brokenLinks.length} broken link(s)`,
    );

    results.push({
      projectId: site.projectId,
      siteUrl: site.siteUrl,
      name: site.name,
      emoji: site.emoji,
      pagesScanned: pageUrls.length,
      linksChecked: linkMap.size,
      brokenLinks,
      scanDurationMs: elapsed,
    });
  }

  const report: ScanReport = {
    timestamp: new Date().toISOString(),
    sites: results,
    totalBrokenLinks: results.reduce((sum, s) => sum + s.brokenLinks.length, 0),
  };

  await saveReport(report);

  // Send Telegram alert only if broken links exist
  const chunks = formatReport(report);
  if (chunks) {
    for (const chunk of chunks) {
      try {
        await bot.api.sendMessage(config.ownerId, chunk, { parse_mode: "HTML" });
      } catch {
        await bot.api.sendMessage(config.ownerId, chunk);
      }
    }
  }

  return report;
}

export async function maybeRunLinkCheck(bot: Bot<BotContext>): Promise<void> {
  if (running) return;

  const lastReport = await loadLastReport();
  if (lastReport) {
    const elapsed = Date.now() - new Date(lastReport.timestamp).getTime();
    if (elapsed < 24 * 60 * 60 * 1000) return; // Less than 24h since last scan
  }

  running = true;
  try {
    console.log("🔗 Starting daily link check...");
    await runLinkCheck(bot);
    console.log("🔗 Daily link check complete.");
  } catch (err) {
    console.error("🔗 Link check failed:", err);
    try {
      await bot.api.sendMessage(
        config.ownerId,
        `🔗 ❌ Link check failed: ${(err as Error).message}`,
      );
    } catch { /* don't crash on notification failure */ }
  } finally {
    running = false;
  }
}
