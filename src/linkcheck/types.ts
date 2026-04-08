export interface SiteConfig {
  projectId: string;
  name: string;
  emoji: string;
  siteUrl: string;
}

export interface BrokenLink {
  url: string;
  statusCode: number | null;
  error: string;
  foundOnPages: string[];
}

export interface SiteScanResult {
  projectId: string;
  siteUrl: string;
  name: string;
  emoji: string;
  pagesScanned: number;
  linksChecked: number;
  brokenLinks: BrokenLink[];
  scanDurationMs: number;
}

export interface ScanReport {
  timestamp: string;
  sites: SiteScanResult[];
  totalBrokenLinks: number;
}
