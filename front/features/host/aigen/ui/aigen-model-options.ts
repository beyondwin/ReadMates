/**
 * Model dropdown options for the AI session-generation flows (spec §7.1).
 *
 * The platform allowlist is server-driven; until a catalog endpoint exists,
 * the three known models are hardcoded here so that the upload form,
 * regenerate modal, and club-default settings share a single source.
 */

export type AigenModelOption = {
  value: string;
  label: string;
};

export const AIGEN_MODEL_OPTIONS: ReadonlyArray<AigenModelOption> = [
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "gpt-4.1", label: "OpenAI GPT-4.1" },
  { value: "gemini-2-5-pro", label: "Gemini 2.5 Pro" },
] as const;

export const AIGEN_DEFAULT_MODEL = AIGEN_MODEL_OPTIONS[0].value;
