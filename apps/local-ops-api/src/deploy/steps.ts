export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';
export type Step = { id: string; label: string; status: StepStatus; error?: string };

/** Builds a run's step list directly (not by parsing printed output), so it stays a plain, typed record. */
export class StepTracker {
  readonly steps: Step[] = [];
  private index = new Map<string, number>();

  constructor(ids: ReadonlyArray<{ id: string; label: string }>) {
    for (const { id, label } of ids) {
      this.index.set(id, this.steps.length);
      this.steps.push({ id, label, status: 'pending' });
    }
  }

  start(id: string): void {
    this.set(id, 'running');
  }

  finish(id: string): void {
    this.set(id, 'done');
  }

  skip(id: string): void {
    this.set(id, 'skipped');
  }

  fail(id: string, error: Error): void {
    const at = this.index.get(id);
    if (at === undefined) return;
    this.steps[at]!.status = 'failed';
    this.steps[at]!.error = error.message;
  }

  private set(id: string, status: StepStatus): void {
    const at = this.index.get(id);
    if (at !== undefined) this.steps[at]!.status = status;
  }
}
