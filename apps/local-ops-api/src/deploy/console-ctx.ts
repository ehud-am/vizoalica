import type { Ctx, OpsError, Run } from '@vizoalica/ops-core';
import { buildRunner } from '@vizoalica/ops-core';
import { pinnedWrangler } from './wrangler.js';

export type StepStatus = 'pending' | 'running' | 'done' | 'failed';
export type Step = { id: string; label: string; status: StepStatus; error?: string };

/**
 * Turns the guided commands' `ctx.out` calls into a step list a console can poll. Those commands
 * mark a step with `step(ctx, "…")` (rendered here as `▸ …`) and finish one with `done(ctx, "…")`
 * (`✔ …`); anything else is a detail line kept for the last step's log.
 */
export class StepLog {
  readonly steps: Step[] = [];
  readonly lines: string[] = [];

  push(line: string): void {
    this.lines.push(line);
    const step = /^▸\s*(.+)$/.exec(line);
    if (step) {
      if (this.steps.length && this.steps[this.steps.length - 1]!.status === 'running')
        this.steps[this.steps.length - 1]!.status = 'done';
      this.steps.push({
        id: `step-${this.steps.length + 1}`,
        label: step[1]!.trim(),
        status: 'running'
      });
      return;
    }
    if (/^✔/.test(line) && this.steps.length) this.steps[this.steps.length - 1]!.status = 'done';
  }

  fail(error: Error): void {
    if (this.steps.length) {
      const last = this.steps[this.steps.length - 1]!;
      if (last.status === 'running') {
        last.status = 'failed';
        last.error = error.message;
        return;
      }
    }
    this.steps.push({
      id: `step-${this.steps.length + 1}`,
      label: 'Failed',
      status: 'failed',
      error: error.message
    });
  }

  finish(): void {
    for (const step of this.steps) if (step.status === 'running') step.status = 'done';
  }
}

export type ConsoleCtxOptions = {
  cwd: string;
  /** Replaced in tests; the real one runs the pinned Wrangler fetched on demand via `npm exec`. */
  run?: Run;
  /** The values a plan already decided, so nothing prompts. */
  answers?: { accountIndex?: string; workerUrl?: string; adminSecret?: string };
  /** Whether a failed first install should remove the empty resources it just created. */
  cleanupOnFailure?: boolean;
};

/**
 * A `Ctx` for the guided CLI functions (`setUpBackend`, `connectConsole`, …) driven by the console
 * instead of a terminal: every question that would normally prompt is answered from `answers` or a
 * safe default, and `run`/`build` talk to the real tool unless a test replaces them.
 */
export function consoleCtx(options: ConsoleCtxOptions): { ctx: Ctx; log: StepLog } {
  const log = new StepLog();
  const ctx: Ctx = {
    run: options.run ?? pinnedWrangler(options.cwd),
    build: buildRunner(options.cwd),
    fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
    cwd: options.cwd,
    out: (text: string) => log.push(text),
    sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    clear: () => undefined,
    prompt: {
      async text(_question, fallback) {
        return options.answers?.accountIndex ?? fallback ?? '1';
      },
      async hidden() {
        throw new Error('The console never asks for a secret through this path.');
      },
      async confirm(_question, fallback) {
        return options.cleanupOnFailure ?? fallback;
      },
      async typeToContinue() {
        // The console reveals secrets through its own single-use endpoint; there is no screen to clear.
      }
    }
  };
  return { ctx, log };
}

export type { OpsError };
