/** Browser-safe installation progress; credentials never enter this contract. */
export type VercelInstallStatus =
  | "authorization-pending"
  | "authorized"
  | "installing"
  | "building"
  | "verifying"
  | "verified"
  | "failed";
export interface VercelInstallJob {
  operationId: string;
  status: VercelInstallStatus;
  message: string;
  projectName?: string;
  deploymentUrl?: string;
  verifiedPaths: string[];
}
export interface VercelInstallResponse {
  configured: boolean;
  githubConnected: boolean;
  job: VercelInstallJob | null;
}
