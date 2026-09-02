interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface D1Database {
  readonly __meantD1Brand?: unique symbol;
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
}

interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: { changes: number };
}

declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
  };
}
