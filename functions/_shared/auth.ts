import { fail, type FunctionContext } from "./responses";

async function timingSafeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  const paddedLeft = new Uint8Array(length);
  const paddedRight = new Uint8Array(length);
  paddedLeft.set(leftBytes);
  paddedRight.set(rightBytes);

  const leftDigest = await crypto.subtle.digest("SHA-256", paddedLeft);
  const rightDigest = await crypto.subtle.digest("SHA-256", paddedRight);
  const leftHash = new Uint8Array(leftDigest);
  const rightHash = new Uint8Array(rightDigest);
  let diff = 0;
  for (let index = 0; index < leftHash.length; index += 1) {
    diff |= leftHash[index] ^ rightHash[index];
  }
  return diff === 0 && leftBytes.length === rightBytes.length;
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
