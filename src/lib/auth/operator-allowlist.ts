/** Renewal-notice recipients. This list does not control account access. */
export function allowedEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.CITEFLEET_OPERATOR_EMAILS || "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}
