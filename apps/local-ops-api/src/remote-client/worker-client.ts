export class WorkerClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string
  ) {}
  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const signal = AbortSignal.timeout(10_000);
    try {
      return await fetch(new URL(path, this.baseUrl), {
        ...init,
        signal,
        redirect: 'error',
        headers: {
          authorization: `Bearer ${this.secret}`,
          accept: 'application/json',
          ...init.headers
        }
      });
    } catch {
      throw new Error('remote_unavailable');
    }
  }
}
