import { requireAdmin } from "../../_shared/auth";
import { deleteFolderRecord, listFolderRecords, saveFolderRecord, type FolderKind } from "../../_shared/content";
import { fail, ok, options, type FunctionContext } from "../../_shared/responses";
import { isSlug } from "../../_shared/validators";

function parseKind(value: unknown): FolderKind | undefined {
  return value === "articles" || value === "images" ? value : undefined;
}

export const onRequestOptions = async (context: FunctionContext) => {
  return options(context.request, context.env);
};

export const onRequestGet = async (context: FunctionContext) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  return ok(context.request, context.env, {
    articles: await listFolderRecords(context.env, "articles"),
    images: await listFolderRecords(context.env, "images"),
  });
};

export const onRequestPost = async (context: FunctionContext) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  const body = await context.request.json<Record<string, unknown>>().catch(() => undefined);
  const kind = parseKind(body?.kind);
  const slug = String(body?.slug || "");
  if (!body || !kind || !isSlug(slug)) {
    return fail(context.request, context.env, "invalid_request", "Expected kind and valid folder slug.", 400);
  }

  try {
    const folder = await saveFolderRecord(context.env, kind, {
      slug,
      label: String(body.label || slug),
      description: String(body.description || "未命名归档"),
      order: Number(body.order || 999),
    });
    return ok(context.request, context.env, folder, 201);
  } catch (error) {
    return fail(context.request, context.env, "invalid_request", error instanceof Error ? error.message : "Could not save folder.", 400);
  }
};

export const onRequestPatch = async (context: FunctionContext) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  const body = await context.request.json<Record<string, unknown>>().catch(() => undefined);
  const kind = parseKind(body?.kind);
  const slug = String(body?.slug || "");
  if (!body || !kind || !isSlug(slug)) {
    return fail(context.request, context.env, "invalid_request", "Expected kind and valid folder slug.", 400);
  }

  try {
    const folder = await saveFolderRecord(context.env, kind, {
      slug,
      label: String(body.label || slug),
      description: String(body.description || "未命名归档"),
      order: Number(body.order || 999),
    });
    return ok(context.request, context.env, folder);
  } catch (error) {
    return fail(context.request, context.env, "invalid_request", error instanceof Error ? error.message : "Could not update folder.", 400);
  }
};

export const onRequestDelete = async (context: FunctionContext) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  const body = await context.request.json<Record<string, unknown>>().catch(() => undefined);
  const kind = parseKind(body?.kind);
  const slug = String(body?.slug || "");
  if (!body || !kind || !isSlug(slug)) {
    return fail(context.request, context.env, "invalid_request", "Expected kind and valid folder slug.", 400);
  }

  try {
    await deleteFolderRecord(context.env, kind, slug);
    return ok(context.request, context.env, { kind, slug });
  } catch (error) {
    return fail(context.request, context.env, "invalid_request", error instanceof Error ? error.message : "Could not delete folder.", 400);
  }
};
