import { createMiddleware } from "@tanstack/react-start";

/**
 * Dual client/server module (same shape as middleware.ts): the server-only
 * gate is imported lazily inside `.server` so Vite never ships the request
 * context to the browser.
 */
export const operatorMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { requireOperator } = await import("./operator.server");
  requireOperator();
  return next();
});
