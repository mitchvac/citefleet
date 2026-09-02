/**
 * Who may hold a console session. CiteFleet is an operator console, not a
 * public product: accounts are invite-only. CITEFLEET_OPERATOR_EMAILS is a
 * comma-separated list of emails; sign-up, email/password sign-in and OAuth
 * sign-in are refused for any other address. Fail closed: an empty list
 * refuses everyone (the server token on /login still works for ops).
 */
export function allowedEmails(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.CITEFLEET_OPERATOR_EMAILS || "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

export function isAllowedEmail(email: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!email) return false;
  const list = allowedEmails(env);
  if (list.length === 0) return false;
  return list.includes(email.trim().toLowerCase());
}
