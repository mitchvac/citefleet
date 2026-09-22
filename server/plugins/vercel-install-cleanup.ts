import { definePlugin } from "nitro";
import { cleanupExpiredVercelInstalls } from "../../src/lib/citefleet/vercel-install.server";

export default definePlugin((nitro) => {
  if (!process.env.DATABASE_URL) return;
  let running = false;
  const cleanup = async () => {
    if (running) return;
    running = true;
    try {
      await cleanupExpiredVercelInstalls();
    } catch {
      console.error("Vercel installation expiry cleanup failed; it will retry.");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void cleanup(), 60_000);
  timer.unref();
  nitro.hooks.hook("close", () => {
    clearInterval(timer);
  });
});
