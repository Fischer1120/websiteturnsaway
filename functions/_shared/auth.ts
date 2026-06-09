import { fail, type FunctionContext } from "./responses";

export function requireAdmin(context: FunctionContext) {
  const secret = context.env.ADMIN_TOKEN_SECRET;
  if (!secret) {
    return fail(
      context.request,
      context.env,
      "unauthorized",
      "ADMIN_TOKEN_SECRET is not configured.",
      401,
    );
  }

  const authorization = context.request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (token !== secret) {
    return fail(context.request, context.env, "unauthorized", "Missing or invalid admin token.", 401);
  }

  return undefined;
}
