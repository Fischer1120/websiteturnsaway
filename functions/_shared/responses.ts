export type Env = {
  MEDIA_BUCKET?: R2Bucket;
  PUBLIC_MEDIA_BASE_URL?: string;
  ADMIN_TOKEN_SECRET?: string;
  ALLOWED_ORIGINS?: string;
};

export type FunctionContext = EventContext<Env, string, Record<string, unknown>>;

type ErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "payload_too_large"
  | "unsupported_media_type"
  | "storage_error"
  | "metadata_error"
  | "not_implemented";

function corsHeaders(request: Request, env: Env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
  });

  if (origin && allowed.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  }

  return headers;
}

export function ok(request: Request, env: Env, data: unknown, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }, null, 2), {
    status,
    headers: corsHeaders(request, env),
  });
}

export function fail(
  request: Request,
  env: Env,
  code: ErrorCode,
  message: string,
  status = 400,
  details: Record<string, unknown> = {},
) {
  return new Response(JSON.stringify({ ok: false, error: { code, message, details } }, null, 2), {
    status,
    headers: corsHeaders(request, env),
  });
}

export function options(request: Request, env: Env) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, env),
  });
}

export function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value || "";
}
