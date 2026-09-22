const REVEAL_TTL_MS = 10 * 60_000;

type Entry = { secrets: Record<string, string>; expiresAt: number };

/**
 * Generated secrets, held in memory only and never written to a run record. A run's secrets can be
 * read exactly once (`reveal`); after that, or after ten minutes unread, they are gone for good.
 */
export class SecretVault {
  private readonly entries = new Map<string, Entry>();

  store(runId: string, secrets: Record<string, string>): void {
    if (Object.keys(secrets).length === 0) return;
    this.entries.set(runId, { secrets, expiresAt: Date.now() + REVEAL_TTL_MS });
  }

  /** `undefined` when there is nothing to reveal (never generated, already revealed, or expired). */
  reveal(runId: string): Record<string, string> | undefined {
    const entry = this.entries.get(runId);
    this.entries.delete(runId);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) return undefined;
    return entry.secrets;
  }

  has(runId: string): boolean {
    const entry = this.entries.get(runId);
    if (!entry) return false;
    if (entry.expiresAt < Date.now()) {
      this.entries.delete(runId);
      return false;
    }
    return true;
  }
}
