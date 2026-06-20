import { spawn } from "node:child_process";

export interface HookResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: string;
}

export async function runHookScript(
  scriptPath: string,
  input?: Record<string, unknown>,
  timeoutMs?: number,
): Promise<HookResult> {
  return new Promise((resolve) => {
    const child = spawn("bash", [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: timeoutMs ?? 30000,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    if (input) {
      child.stdin?.write(JSON.stringify(input));
      child.stdin?.end();
    } else {
      child.stdin?.end();
    }

    child.on("close", (code) => {
      resolve({ exitCode: code ?? -1, stdout: stdout.trim(), stderr: stderr.trim() });
    });

    child.on("error", (err) => {
      resolve({ exitCode: -1, stdout, stderr, error: err.message });
    });
  });
}
