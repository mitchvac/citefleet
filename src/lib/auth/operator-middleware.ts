import { createMiddleware } from "@tanstack/react-start";

/**
 * Dual client/server module (same shape as middleware.ts): the server-only
 * gate is imported lazily inside `.server` so Vite never ships the request
 * context to the browser.
 */
export const operatorMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { requireOperator } = await import("./operator.server");
  // The principal travels with the request. Passing nothing is why every server
  // fn could only know that SOMEONE was signed in — with no identity to scope a
  // request to, a single global workspace was the only thing that could be built.
  return next({ context: { principal: requireOperator() } });
});
