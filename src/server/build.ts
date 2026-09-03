// Runs a project's build/test command to derive build status. Read-only w.r.t.
// wiwo's own state; it shells out to whatever the user configured.
import { exec } from 'child_process';
import type { BuildStatus } from '../types.js';

export interface BuildResult {
  status: BuildStatus;
  code: number | null;
  output: string;
}

/** Run buildCmd in repoPath and map its exit code to a status. */
export function runBuild(repoPath: string, buildCmd: string): Promise<BuildResult> {
  return new Promise((resolve) => {
    const child = exec(
      buildCmd,
      { cwd: repoPath, timeout: 1000 * 120, maxBuffer: 1024 * 1024 * 8 },
      (err, stdout, stderr) => {
        const output = `${stdout}\n${stderr}`.trim().slice(-4000);
        const code = err && typeof (err as any).code === 'number' ? (err as any).code : 0;
        resolve({
          status: code === 0 ? 'passing' : 'failing',
          code,
          output,
        });
      },
    );
    child.on('error', () => resolve({ status: 'unknown', code: null, output: 'failed to start build command' }));
  });
}
