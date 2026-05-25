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
  kind: "admin_route";
  target: string;
};

export type DeployAttemptStripEntry = {
  attempt_id: string;
  started_at: string;
  ended_at: string | null;
  final_status: DeployAttemptFinalStatus;
  image_tag: string | null;
  duration_seconds: number | null;
};

export type HealthCard = {
  id: string;
  title: string;
  status: HealthCardStatus;
  metric: HealthCardMetric | null;
  thresholds: HealthCardThresholds | null;
  last_checked_at: string;
  source: HealthCardSource;
  drill: HealthCardDrill | null;
  reason: string | null;
  deploy_strip: DeployAttemptStripEntry[] | null;
};

export type PlatformHealthSnapshot = {
  schema: "platform.health_snapshot.v1";
  generated_at: string;
  cards: HealthCard[];
};
