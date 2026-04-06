export interface CronJob {
  id: string;
  schedule: string;
  projectId: string;
  prompt: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt: string | null;
  lastStatus: "ok" | "error" | null;
  nextRunAt: number;
}
