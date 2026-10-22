import { fail, type FunctionContext } from "./responses";

async function timingSafeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual(left: ArrayBuffer, right: ArrayBuffer): boolean;
  };
  const [leftDigest, rightDigest] = await Promise.all([
    subtle.digest("SHA-256", encoder.encode(left)),
    subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  return subtle.timingSafeEqual(leftDigest, rightDigest);
}

export async function requireAdmin(context: FunctionContext) {
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
  if (!(await timingSafeEqual(token, secret))) {
    return fail(context.request, context.env, "unauthorized", "Missing or invalid admin token.", 401);
  }

  return undefined;
}
