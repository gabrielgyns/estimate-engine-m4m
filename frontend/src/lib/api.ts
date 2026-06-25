// Thin fetch wrapper for the app's own REST endpoints (everything that isn't
// better-auth). Requests are same-origin — Vite proxies the backend in dev — so
// cookies ride along with `credentials: "include"`. Non-2xx responses are
// turned into a thrown `ApiError` carrying the server message when present.

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function extractMessage(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const msg = record.message ?? record.error;
    if (typeof msg === "string" && msg.trim()) {
      return msg;
    }
  }
  if (typeof body === "string" && body.trim()) {
    return body;
  }
  return `Erro ${status}. Tente novamente.`;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const raw = await response.text();
  let body: unknown = null;
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = raw;
    }
  }

  if (!response.ok) {
    throw new ApiError(extractMessage(body, response.status), response.status);
  }
  return body as T;
}
