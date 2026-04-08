import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";
import type { ScanReport } from "./types.js";

const RESULTS_FILE = join(config.linkcheckDir, "results.json");

export async function loadLastReport(): Promise<ScanReport | null> {
  try {
    const data = await readFile(RESULTS_FILE, "utf-8");
    return JSON.parse(data) as ScanReport;
  } catch {
    return null;
  }
}

export async function saveReport(report: ScanReport): Promise<void> {
  await mkdir(config.linkcheckDir, { recursive: true });
  await writeFile(RESULTS_FILE, JSON.stringify(report, null, 2), "utf-8");
}
