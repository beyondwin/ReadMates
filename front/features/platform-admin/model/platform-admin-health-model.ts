export type HealthCardStatus = "OK" | "WARN" | "CRIT" | "UNKNOWN";
export type HealthCardSource = "IN_PROCESS" | "PROMETHEUS" | "FILE";
export type DeployAttemptFinalStatus = "SUCCEEDED" | "FAILED" | "RUNNING";

export type HealthCardMetric = {
  value: number | null;
  unit: string;
  label: string | null;
};

export type HealthCardThresholds = {
  warn: number | null;
  crit: number | null;
};

export type HealthCardDrill = {
  kind: "ADMIN_ROUTE";
  target: string;
};

export type DeployAttemptStripEntry = {
  attemptId: string;
  startedAt: string;
  endedAt: string | null;
  finalStatus: DeployAttemptFinalStatus;
  imageTag: string | null;
  durationSeconds: number | null;
};

export type HealthCard = {
  id: string;
  title: string;
  status: HealthCardStatus;
  metric: HealthCardMetric | null;
  thresholds: HealthCardThresholds | null;
  lastCheckedAt: string;
  source: HealthCardSource;
  drill: HealthCardDrill | null;
  reason: string | null;
  deployStrip: DeployAttemptStripEntry[] | null;
};

export type PlatformHealthSnapshot = {
  schema: "platform.health_snapshot.v1";
  generatedAt: string;
  cards: HealthCard[];
};
