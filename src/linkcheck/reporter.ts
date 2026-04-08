import { splitMessage } from "../ui/formatter.js";
import type { ScanReport } from "./types.js";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function formatReport(report: ScanReport): string[] | null {
  const totalBroken = report.totalBrokenLinks;
  if (totalBroken === 0) return null; // No noise when everything is fine

  const date = new Date(report.timestamp).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const lines: string[] = [];
  lines.push(`\u{1F517} <b>Liens morts \u2014 ${date}</b>\n`);

  for (const site of report.sites) {
    const stats = `${site.pagesScanned} pages, ${site.linksChecked} liens`;

    if (site.brokenLinks.length === 0) {
      lines.push(`${site.emoji} <b>${escapeHtml(site.name)}</b> (${stats})`);
      lines.push(`  \u2705 Aucun lien mort\n`);
      continue;
    }

    lines.push(
      `${site.emoji} <b>${escapeHtml(site.name)}</b> (${stats}) \u2014 ${site.brokenLinks.length} mort(s)\n`,
    );

    for (const link of site.brokenLinks) {
      const status = link.statusCode ? `${link.statusCode}` : link.error;
      lines.push(`  \u{1F534} <code>${escapeHtml(link.url)}</code>`);
      lines.push(`     Status : ${escapeHtml(status)}`);
      lines.push(`     Trouv\u00e9 sur :`);
      for (const page of link.foundOnPages.slice(0, 5)) {
        lines.push(`     \u2022 ${escapeHtml(page)}`);
      }
      if (link.foundOnPages.length > 5) {
        lines.push(`     \u2022 ... et ${link.foundOnPages.length - 5} autres pages`);
      }
      lines.push("");
    }
  }

  const sitesBroken = report.sites.filter((s) => s.brokenLinks.length > 0).length;
  lines.push(
    `<b>R\u00e9sum\u00e9 :</b> ${totalBroken} lien(s) mort(s) sur ${sitesBroken} site(s)`,
  );

  return splitMessage(lines.join("\n"));
}

export function formatStatusReport(report: ScanReport): string {
  const date = new Date(report.timestamp).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const lines: string[] = [];
  lines.push(`\u{1F517} <b>Dernier scan :</b> ${date}\n`);

  for (const site of report.sites) {
    const duration = Math.round(site.scanDurationMs / 1000);
    const broken = site.brokenLinks.length;
    const icon = broken > 0 ? "\u{1F534}" : "\u{1F7E2}";
    lines.push(
      `${site.emoji} ${escapeHtml(site.name)} \u2014 ${icon} ${site.pagesScanned} pages, ${site.linksChecked} liens, ${broken} mort(s) (${duration}s)`,
    );
  }

  lines.push(`\n<b>Total :</b> ${report.totalBrokenLinks} lien(s) mort(s)`);
  return lines.join("\n");
}
