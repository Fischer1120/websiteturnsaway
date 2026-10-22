import { onRequestGet as onHomeGet } from "./index";
import type { FunctionContext } from "./_shared/responses";

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  if (context.request.method === "GET" && url.pathname === "/") {
    return onHomeGet(context as FunctionContext);
  }
  return context.next();
};
