import { fail, type FunctionContext } from "../_shared/responses";

function mediaKey(value: string | string[] | undefined) {
  const parts = Array.isArray(value) ? value : value ? [value] : [];
  const key = parts.join("/");
  if (!key || key.startsWith("/") || key.includes("..") || key.includes("\\")) return "";
  return key;
}

export const onRequestGet = async (context: FunctionContext) => {
  if (!context.env.MEDIA_BUCKET) {
    return fail(context.request, context.env, "storage_error", "MEDIA_BUCKET binding is not configured.", 503);
  }

  const key = mediaKey(context.params.path as string | string[] | undefined);
  if (!key) {
    return fail(context.request, context.env, "invalid_request", "Invalid media path.", 400);
  }

  const object = await context.env.MEDIA_BUCKET.get(key);
  if (!object) {
    return fail(context.request, context.env, "not_found", "Media object not found.", 404, { key });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
};
