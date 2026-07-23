export type ReleaseHealthCheckId =
  "private-memory" | "score-ledger" | "media-storage" | "ai-runtime";

export type ReleaseHealthCheck = {
  id: ReleaseHealthCheckId;
  ready: boolean;
  title: string;
  detail: string;
};

export type ReleaseHealthReport = {
  status: "ready" | "degraded";
  checkedAt: number;
  checks: ReleaseHealthCheck[];
};

export type ReleaseHealthProbes = {
  privateMemory: boolean;
  scoreLedger: boolean;
  mediaStorage: boolean;
  aiRuntime: boolean;
};

export function buildReleaseHealth(
  probes: ReleaseHealthProbes,
  checkedAt = Date.now(),
): ReleaseHealthReport {
  const checks: ReleaseHealthCheck[] = [
    {
      id: "private-memory",
      ready: probes.privateMemory,
      title: "Private party memory",
      detail: probes.privateMemory
        ? "Private story records are available."
        : "Apply migration 20260715143000 before the live party.",
    },
    {
      id: "score-ledger",
      ready: probes.scoreLedger,
      title: "Score ledger",
      detail: probes.scoreLedger
        ? "Server-authoritative scoring is available."
        : "Apply migration 20260715151500 before the live party.",
    },
    {
      id: "media-storage",
      ready: probes.mediaStorage,
      title: "Private media storage",
      detail: probes.mediaStorage
        ? "The recordings bucket exists and is private."
        : "Apply migration 20260716120000 to restore the private recordings bucket.",
    },
    {
      id: "ai-runtime",
      ready: probes.aiRuntime,
      title: "AI runtime",
      detail: probes.aiRuntime
        ? "The server AI credential is configured."
        : "Configure OPENAI_API_KEY or plan to run manual fallbacks.",
    },
  ];

  return {
    status: checks.every((check) => check.ready) ? "ready" : "degraded",
    checkedAt,
    checks,
  };
}

export function releaseHealthSummaryLines(report: ReleaseHealthReport): string[] {
  return [
    `Backend release preflight: ${report.status.toUpperCase()}`,
    ...report.checks.map(
      (check) => `${check.ready ? "PASS" : "FAIL"} ${check.title} — ${check.detail}`,
    ),
  ];
}
