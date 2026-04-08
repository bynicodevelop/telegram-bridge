import type { BrokenLink } from "./types.js";

const USER_AGENT =
  "Mozilla/5.0 (compatible; TelegramBridge-LinkChecker/1.0)";
const PAGE_TIMEOUT = 15_000;
const LINK_TIMEOUT = 10_000;
const MAX_GLOBAL_CONCURRENCY = 10;
const MAX_DOMAIN_CONCURRENCY = 3;
const DOMAIN_DELAY_MS = 200;

const SKIP_PROTOCOLS = ["mailto:", "tel:", "javascript:", "data:"];
const SKIP_PATH_PATTERNS = ["/cdn-cgi/"];

// ---------------------------------------------------------------------------
// Semaphore
// ---------------------------------------------------------------------------
class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;
  constructor(private max: number) {}

  async acquire(): Promise<() => void> {
    if (this.active >= this.max) {
      await new Promise<void>((r) => this.queue.push(r));
    }
    this.active++;
    return () => {
      this.active--;
      this.queue.shift()?.();
    };
  }
}

// ---------------------------------------------------------------------------
// Per-domain throttle
// ---------------------------------------------------------------------------
class DomainThrottle {
  private semaphores = new Map<string, Semaphore>();
  private lastRequest = new Map<string, number>();

  async acquire(domain: string): Promise<() => void> {
    if (!this.semaphores.has(domain)) {
      this.semaphores.set(domain, new Semaphore(MAX_DOMAIN_CONCURRENCY));
    }
    const release = await this.semaphores.get(domain)!.acquire();

    // Enforce delay between requests to the same domain
    const last = this.lastRequest.get(domain) ?? 0;
    const wait = Math.max(0, last + DOMAIN_DELAY_MS - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequest.set(domain, Date.now());

    return release;
  }
}

// ---------------------------------------------------------------------------
// Link extraction from HTML
// ---------------------------------------------------------------------------
function extractLinks(html: string, pageUrl: string): string[] {
  const links: string[] = [];
  const re = /<a[^>]+href=["']([^"']+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();

    // Skip non-http protocols
    if (SKIP_PROTOCOLS.some((p) => raw.toLowerCase().startsWith(p))) continue;
    // Skip fragment-only
    if (raw.startsWith("#")) continue;

    try {
      const resolved = new URL(raw, pageUrl);
      // Only keep http(s)
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") continue;
      // Strip fragment
      resolved.hash = "";
      // Skip Cloudflare internal paths and similar
      if (SKIP_PATH_PATTERNS.some((p) => resolved.pathname.includes(p))) continue;
      links.push(resolved.href);
    } catch {
      // Malformed URL — skip
    }
  }
  return links;
}

// ---------------------------------------------------------------------------
// Phase 1 — Fetch pages & build link map
// ---------------------------------------------------------------------------
export async function buildLinkMap(
  pageUrls: string[],
): Promise<Map<string, Set<string>>> {
  const linkMap = new Map<string, Set<string>>();
  const sem = new Semaphore(MAX_GLOBAL_CONCURRENCY);

  await Promise.all(
    pageUrls.map(async (pageUrl) => {
      const release = await sem.acquire();
      try {
        const res = await fetch(pageUrl, {
          headers: { "User-Agent": USER_AGENT },
          signal: AbortSignal.timeout(PAGE_TIMEOUT),
          redirect: "follow",
        });
        if (!res.ok) return;
        const html = await res.text();
        const links = extractLinks(html, pageUrl);
        for (const link of links) {
          if (!linkMap.has(link)) linkMap.set(link, new Set());
          linkMap.get(link)!.add(pageUrl);
        }
      } catch {
        // Page fetch failed — skip silently
      } finally {
        release();
      }
    }),
  );

  return linkMap;
}

// ---------------------------------------------------------------------------
// Phase 2 — Check each unique link
// ---------------------------------------------------------------------------
const DEAD_STATUSES = new Set([404, 410, 500, 502, 504]);
const TRANSIENT_STATUSES = new Set([503, 429]);

async function checkSingleLink(
  url: string,
  globalSem: Semaphore,
  domainThrottle: DomainThrottle,
): Promise<{ dead: boolean; statusCode: number | null; error: string }> {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    return { dead: true, statusCode: null, error: "Invalid URL" };
  }

  const globalRelease = await globalSem.acquire();
  const domainRelease = await domainThrottle.acquire(hostname);

  try {
    return await attemptCheck(url);
  } finally {
    domainRelease();
    globalRelease();
  }
}

async function attemptCheck(
  url: string,
  retry = true,
): Promise<{ dead: boolean; statusCode: number | null; error: string }> {
  try {
    // Try HEAD first
    let res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(LINK_TIMEOUT),
      redirect: "follow",
    });

    // Fallback to GET if HEAD not allowed
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(LINK_TIMEOUT),
        redirect: "follow",
      });
    }

    if (DEAD_STATUSES.has(res.status)) {
      return { dead: true, statusCode: res.status, error: `${res.status} ${res.statusText}` };
    }

    if (TRANSIENT_STATUSES.has(res.status) && retry) {
      // Wait and retry once for transient errors
      const retryAfter = Number(res.headers.get("Retry-After")) || 2;
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 5) * 1000));
      return attemptCheck(url, false);
    }

    if (TRANSIENT_STATUSES.has(res.status)) {
      // After retry, 429 is not reported as dead, 503 is
      if (res.status === 429) {
        return { dead: false, statusCode: 429, error: "" };
      }
      return { dead: true, statusCode: res.status, error: `${res.status} ${res.statusText}` };
    }

    // Everything else (200, 301, 302, etc.) is OK
    return { dead: false, statusCode: res.status, error: "" };
  } catch (err) {
    const msg = (err as Error).message || String(err);

    // Retry once on transient network errors
    if (retry && /ECONNRESET|ETIMEDOUT|UND_ERR/.test(msg)) {
      await new Promise((r) => setTimeout(r, 2000));
      return attemptCheck(url, false);
    }

    const errorLabel = /ENOTFOUND/.test(msg)
      ? "DNS_ERROR"
      : /timeout|abort/i.test(msg)
        ? "TIMEOUT"
        : /certificate|ssl|tls/i.test(msg)
          ? "SSL_ERROR"
          : msg.slice(0, 80);

    return { dead: true, statusCode: null, error: errorLabel };
  }
}

export async function checkLinks(
  linkMap: Map<string, Set<string>>,
): Promise<BrokenLink[]> {
  const globalSem = new Semaphore(MAX_GLOBAL_CONCURRENCY);
  const domainThrottle = new DomainThrottle();
  const broken: BrokenLink[] = [];

  const entries = [...linkMap.entries()];

  await Promise.all(
    entries.map(async ([url, pages]) => {
      const result = await checkSingleLink(url, globalSem, domainThrottle);
      if (result.dead) {
        broken.push({
          url,
          statusCode: result.statusCode,
          error: result.error,
          foundOnPages: [...pages],
        });
      }
    }),
  );

  // Sort by number of affected pages (most impactful first)
  broken.sort((a, b) => b.foundOnPages.length - a.foundOnPages.length);
  return broken;
}
