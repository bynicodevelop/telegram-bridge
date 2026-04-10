import { readFileSync, writeFileSync } from "fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { google } from "googleapis";
import { z } from "zod";

// --- Shared quota tracker (200/day across all projects on same GCP project) ---

const defaultProjectsDir = `${process.env.HOME || "/home/debian"}/projects`;
const GSC_QUOTA_FILE = process.env.GSC_QUOTA_FILE || `${process.env.PROJECTS_DIR || defaultProjectsDir}/.provider/gsc-quota.json`;
const GSC_DAILY_LIMIT = 190; // safety margin on Google's 200/day

function checkAndIncrementQuota() {
  const today = new Date().toISOString().slice(0, 10);
  let data = { date: today, count: 0 };

  try {
    data = JSON.parse(readFileSync(GSC_QUOTA_FILE, "utf-8"));
    if (data.date !== today) data = { date: today, count: 0 };
  } catch { /* file missing or corrupt — start fresh */ }

  if (data.count >= GSC_DAILY_LIMIT) {
    return { allowed: false, remaining: 0, used: data.count };
  }

  data.count++;
  writeFileSync(GSC_QUOTA_FILE, JSON.stringify(data), "utf-8");
  return { allowed: true, remaining: GSC_DAILY_LIMIT - data.count, used: data.count };
}

// --- Google OAuth2 client (shared across all sites) ---

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const refreshToken = process.env.GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN;
const siteUrl = process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL;

if (!clientId || !clientSecret || !refreshToken || !siteUrl) {
  console.error(
    "Missing env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN, GOOGLE_SEARCH_CONSOLE_SITE_URL",
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
oauth2Client.setCredentials({ refresh_token: refreshToken });

const searchConsole = google.searchconsole({ version: "v1", auth: oauth2Client });

// --- MCP Server ---

const server = new McpServer({
  name: "search-console",
  version: "2.0.0",
});

// Tool: query_analytics
server.tool(
  "query_analytics",
  "Requeter les donnees Search Analytics de Google Search Console (clics, impressions, CTR, position). Permet de filtrer par query, page, pays, device, date.",
  {
    startDate: z.string().describe("Date de debut au format YYYY-MM-DD"),
    endDate: z.string().describe("Date de fin au format YYYY-MM-DD"),
    dimensions: z
      .array(z.enum(["query", "page", "country", "device", "date", "searchAppearance"]))
      .optional()
      .describe("Dimensions a inclure dans les resultats (ex: ['query', 'page'])"),
    searchType: z
      .enum(["web", "image", "video", "news", "discover", "googleNews"])
      .optional()
      .describe("Type de recherche (defaut: web)"),
    rowLimit: z
      .number()
      .min(1)
      .max(25000)
      .optional()
      .describe("Nombre max de lignes (defaut: 1000, max: 25000)"),
    startRow: z.number().min(0).optional().describe("Offset pour la pagination"),
    queryFilter: z.string().optional().describe("Filtre sur les requetes (contains)"),
    pageFilter: z.string().optional().describe("Filtre sur les pages (contains)"),
  },
  async ({ startDate, endDate, dimensions, searchType, rowLimit, startRow, queryFilter, pageFilter }) => {
    const dimensionFilterGroups = [];
    const filters = [];

    if (queryFilter) {
      filters.push({ dimension: "query", operator: "contains", expression: queryFilter });
    }
    if (pageFilter) {
      filters.push({ dimension: "page", operator: "contains", expression: pageFilter });
    }
    if (filters.length > 0) {
      dimensionFilterGroups.push({ groupType: "and", filters });
    }

    const res = await searchConsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: dimensions ?? ["query", "page"],
        type: searchType ?? "web",
        rowLimit: rowLimit ?? 1000,
        startRow: startRow ?? 0,
        ...(dimensionFilterGroups.length > 0 ? { dimensionFilterGroups } : {}),
      },
    });

    const rows = (res.data.rows ?? []).map((row) => ({
      keys: row.keys ?? [],
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: Math.round((row.ctr ?? 0) * 10000) / 100,
      position: Math.round((row.position ?? 0) * 100) / 100,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              site: siteUrl,
              totalRows: rows.length,
              aggregationType: res.data.responseAggregationType,
              rows,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// Tool: inspect_url
server.tool(
  "inspect_url",
  "Inspecter une URL dans l'index Google. Retourne le statut d'indexation, le dernier crawl, la compatibilite mobile.",
  {
    url: z.string().url().describe("L'URL a inspecter"),
  },
  async ({ url }) => {
    const res = await searchConsole.urlInspection.index.inspect({
      requestBody: {
        inspectionUrl: url,
        siteUrl,
      },
    });

    const result = res.data.inspectionResult;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              site: siteUrl,
              indexStatus: result?.indexStatusResult
                ? {
                    verdict: result.indexStatusResult.verdict,
                    coverageState: result.indexStatusResult.coverageState,
                    robotsTxtState: result.indexStatusResult.robotsTxtState,
                    indexingState: result.indexStatusResult.indexingState,
                    lastCrawlTime: result.indexStatusResult.lastCrawlTime,
                    pageFetchState: result.indexStatusResult.pageFetchState,
                    crawledAs: result.indexStatusResult.crawledAs,
                  }
                : null,
              mobileUsability: result?.mobileUsabilityResult
                ? { verdict: result.mobileUsabilityResult.verdict }
                : null,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// Tool: list_sitemaps
server.tool(
  "list_sitemaps",
  "Lister tous les sitemaps soumis pour le site dans Google Search Console.",
  {},
  async () => {
    const res = await searchConsole.sitemaps.list({ siteUrl });

    const sitemaps = (res.data.sitemap ?? []).map((s) => ({
      path: s.path,
      lastSubmitted: s.lastSubmitted,
      isPending: s.isPending,
      isSitemapsIndex: s.isSitemapsIndex,
      lastDownloaded: s.lastDownloaded,
      warnings: s.warnings,
      errors: s.errors,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ site: siteUrl, total: sitemaps.length, sitemaps }, null, 2),
        },
      ],
    };
  },
);

// Tool: submit_sitemap
server.tool(
  "submit_sitemap",
  "Soumettre un sitemap a Google Search Console.",
  {
    feedpath: z.string().url().describe("URL complete du sitemap a soumettre"),
  },
  async ({ feedpath }) => {
    await searchConsole.sitemaps.submit({ siteUrl, feedpath });

    return {
      content: [
        {
          type: "text",
          text: `Sitemap soumis avec succes : ${feedpath} (site: ${siteUrl})`,
        },
      ],
    };
  },
);

// Tool: request_indexing
server.tool(
  "request_indexing",
  "Demander a Google de crawler/indexer une URL specifique. Quota limite (~200/jour).",
  {
    url: z.string().url().describe("L'URL a soumettre au crawl Google"),
  },
  async ({ url }) => {
    const quota = checkAndIncrementQuota();
    if (!quota.allowed) {
      return {
        content: [
          {
            type: "text",
            text: `QUOTA EPUISE : ${quota.used}/${GSC_DAILY_LIMIT} requetes utilisees aujourd'hui. URL NON soumise : ${url}`,
          },
        ],
      };
    }

    const indexing = google.indexing({ version: "v3", auth: oauth2Client });

    await indexing.urlNotifications.publish({
      requestBody: {
        url,
        type: "URL_UPDATED",
      },
    });

    return {
      content: [
        {
          type: "text",
          text: `URL soumise au crawl avec succes : ${url} (site: ${siteUrl}) [quota: ${quota.used}/${GSC_DAILY_LIMIT}]`,
        },
      ],
    };
  },
);

// --- Start ---

const transport = new StdioServerTransport();
await server.connect(transport);
