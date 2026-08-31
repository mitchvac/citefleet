import { useState } from "react";
import { grokBrief } from "@/lib/citefleet/grokBriefs";
import type { Site, Task } from "@/lib/citefleet/types";

export function GrokHandoff({
  site,
  task,
  botName,
}: {
  site: Site;
  task: Task;
  botName?: string;
}) {
  const [copied, setCopied] = useState(false);
  const brief = grokBrief(site, task, botName);

  async function send() {
    await navigator.clipboard.writeText(brief);
    setCopied(true);
    window.open("https://grok.com", "_blank", "noopener,noreferrer");
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <button
      type="button"
      onClick={send}
      className="rounded-full border border-[#9b7dff]/40 bg-[#9b7dff]/15 px-3 py-1.5 text-xs text-[#d4c6ff]"
    >
      {copied ? "Brief copied — paste in Grok" : "Send to Grok"}
    </button>
  );
}
