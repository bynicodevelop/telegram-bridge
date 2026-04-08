const USER_AGENT = "TelegramBridge-LinkChecker/1.0";
const FETCH_TIMEOUT = 15_000;

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      redirect: "follow",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractLocs(xml: string): string[] {
  const urls: string[] = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    urls.push(m[1].trim());
  }
  return urls;
}

export async function discoverPages(siteUrl: string): Promise<string[]> {
  const base = siteUrl.replace(/\/$/, "");

  // Try sitemap-index.xml first, then sitemap.xml, then sitemap-0.xml
  const candidates = [
    `${base}/sitemap-index.xml`,
    `${base}/sitemap.xml`,
    `${base}/sitemap-0.xml`,
  ];

  for (const url of candidates) {
    const xml = await fetchText(url);
    if (!xml) continue;

    const locs = extractLocs(xml);
    if (locs.length === 0) continue;

    // Check if this is a sitemap index (contains references to other sitemaps)
    const isSitemapIndex = xml.includes("<sitemapindex");

    if (isSitemapIndex) {
      // Fetch each sub-sitemap and collect page URLs
      const pages: string[] = [];
      for (const subUrl of locs) {
        const subXml = await fetchText(subUrl);
        if (subXml) {
          pages.push(...extractLocs(subXml));
        }
      }
      if (pages.length > 0) return pages;
    } else {
      // This is a direct sitemap with page URLs
      return locs;
    }
  }

  console.warn(`🔗 No sitemap found for ${siteUrl}`);
  return [];
}
