export interface SafeLogger {
  info(message: string, context?: Record<string, string | number | boolean | undefined>): void;
  warn(message: string, context?: Record<string, string | number | boolean | undefined>): void;
  error(message: string, context?: Record<string, string | number | boolean | undefined>): void;
}

export interface MetricsSink {
  increment(name: string, labels?: Record<string, string | undefined>, value?: number): void;
}

export const consoleLogger: SafeLogger = {
  info: (message, context) => console.info(message, context ?? {}),
  warn: (message, context) => console.warn(message, context ?? {}),
  error: (message, context) => console.error(message, context ?? {})
};

export class InMemoryMetricsSink implements MetricsSink {
  readonly counters = new Map<string, number>();

  increment(name: string, labels: Record<string, string | undefined> = {}, value = 1): void {
    const labelString = Object.entries(labels)
      .filter(([, labelValue]) => labelValue !== undefined)
      .map(([key, labelValue]) => `${key}=${labelValue}`)
      .join(',');
    const counterKey = labelString ? `${name}{${labelString}}` : name;
    this.counters.set(counterKey, (this.counters.get(counterKey) ?? 0) + value);
  }
}
