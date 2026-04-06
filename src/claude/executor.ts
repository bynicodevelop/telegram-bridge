import { spawn, type ChildProcess } from "node:child_process";
import { config } from "../config.js";
import { buildMemoryPrompt } from "../memory/store.js";

export interface ClaudeExecOptions {
  prompt: string;
  cwd: string;
  timeoutMs?: number;
  injectMemory?: boolean;
}

export interface ClaudeExecResult {
  success: boolean;
  result: string;
  costUsd: number;
  durationMs: number;
  numTurns: number;
  sessionId: string;
  errors: string[];
}

// Track running processes for kill support
const runningProcesses = new Map<string, ChildProcess>();

export function getRunningProcess(projectId: string): ChildProcess | undefined {
  return runningProcesses.get(projectId);
}

export async function executeClaude(projectId: string, opts: ClaudeExecOptions): Promise<ClaudeExecResult> {
  const timeout = opts.timeoutMs || config.claudeTimeoutMs;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);

  // Inject memory context into prompt
  let finalPrompt = opts.prompt;
  if (opts.injectMemory !== false) {
    const memBlock = await buildMemoryPrompt();
    if (memBlock) {
      finalPrompt = `<memory>\n${memBlock}\n</memory>\n\n${finalPrompt}`;
    }
  }

  const args = [
    "-p", finalPrompt,
    "--output-format", "json",
    "--dangerously-skip-permissions",
  ];

  return new Promise((resolve) => {
    const child = spawn(config.claudePath, args, {
      cwd: opts.cwd,
      signal: ac.signal,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    runningProcesses.set(projectId, child);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on("close", (code) => {
      clearTimeout(timer);
      runningProcesses.delete(projectId);

      if (stderr) {
        console.error(`[claude:${projectId}] stderr: ${stderr.slice(0, 500)}`);
      }

      try {
        const json = JSON.parse(stdout);
        if (json.is_error) {
          console.error(`[claude:${projectId}] is_error=true, result=${JSON.stringify(json.result?.slice(0, 200))}, errors=${JSON.stringify(json.errors)}`);
        }
        resolve({
          success: !json.is_error,
          result: json.result || "",
          costUsd: json.total_cost_usd || 0,
          durationMs: json.duration_ms || 0,
          numTurns: json.num_turns || 0,
          sessionId: json.session_id || "",
          errors: json.errors || [],
        });
      } catch {
        // JSON parse failed — return raw output
        console.error(`[claude:${projectId}] JSON parse failed, code=${code}, stdout=${stdout.slice(0, 300)}, stderr=${stderr.slice(0, 300)}`);
        resolve({
          success: code === 0,
          result: stdout || stderr || `Process exited with code ${code}`,
          costUsd: 0,
          durationMs: 0,
          numTurns: 0,
          sessionId: "",
          errors: stderr ? [stderr.slice(0, 500)] : [],
        });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      runningProcesses.delete(projectId);
      resolve({
        success: false,
        result: "",
        costUsd: 0,
        durationMs: 0,
        numTurns: 0,
        sessionId: "",
        errors: [err.message],
      });
    });
  });
}
