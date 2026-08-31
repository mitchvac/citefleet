import { grokBrief } from "./grokBriefs";
import type { Site, Task } from "./types";

export function grokConfigured() {
  return Boolean(process.env.XAI_API_KEY);
}

export async function askGrok(site: Site, task: Task, botName?: string) {
  const key = process.env.XAI_API_KEY;
  if (!key) {
    return {
      ok: false as const,
      text: "Grok drafts unavailable in this environment. Live audits still run.",
    };
  }

  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "grok-4.5",
      temperature: 0.3,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content:
            "You are a CiteFleet specialist. Return a short execution report: verify-first, exact URLs, draft copy if the task is X/directories/press. Do not claim you submitted a webmaster form unless you only produced the draft.",
        },
        { role: "user", content: grokBrief(site, task, botName) },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return { ok: false as const, text: `Grok API ${res.status}: ${err.slice(0, 280)}` };
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim() || "(empty Grok reply)";
  return { ok: true as const, text };
}
