/** A recorded request to the stubbed Verifacti API. */
export interface StubRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  headers: Record<string, string>;
  body: unknown;
}

type Reply =
  | { status: number; body?: unknown }
  | 'timeout'
  | 'network-error'
  | ((request: StubRequest) => { status: number; body?: unknown });

/**
 * Stands in for api.verifacti.com at the HTTP boundary: pass `stub.fetch` to the adapter, program
 * replies by `METHOD /path` (without the query string), and read back the requests it got.
 */
export class VerifactiStub {
  readonly requests: StubRequest[] = [];
  private readonly replies = new Map<string, Reply[]>();

  /** Replies to the route; several replies are used in order, the last one sticks. */
  on(route: string, ...replies: Reply[]): this {
    this.replies.set(route, replies);
    return this;
  }

  last(route: string): StubRequest {
    const request = this.requests.findLast((request) => `${request.method} ${request.path}` === route);
    if (!request) throw new Error(`No request to ${route}`);
    return request;
  }

  fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = init.method ?? 'GET';
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const request: StubRequest = {
      method,
      path: url.pathname,
      query: url.searchParams,
      headers,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    this.requests.push(request);

    const route = `${method} ${url.pathname}`;
    const replies = this.replies.get(route);
    if (!replies?.length) throw new Error(`Unexpected request: ${route}`);
    const reply = replies.length > 1 ? replies.shift()! : replies[0]!;

    if (reply === 'network-error') throw new TypeError('fetch failed');
    if (reply === 'timeout') {
      return new Promise((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal!.reason));
      });
    }
    const { status, body } = typeof reply === 'function' ? reply(request) : reply;
    return new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
}
