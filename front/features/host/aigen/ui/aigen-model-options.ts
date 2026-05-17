/**
 * Model dropdown options for the AI session-generation flows (spec §7.1).
 *
 * The platform allowlist is server-driven; until a catalog endpoint exists,
 * the three known models are hardcoded here so that the upload form,
 * regenerate modal, and club-default settings share a single source.
 *
 * Each provider exposes one canonical default model id below. Tests import
 * these named constants instead of hardcoded strings, so swapping a model
 * for a newer provider release is a one-line change here plus the matching
 * pricing entry in `application.yml`.
 */

export type AigenModelOption = {
  value: string;
  label: string;
};

export const AIGEN_CLAUDE_DEFAULT_MODEL_ID = "claude-sonnet-4-6";
export const AIGEN_OPENAI_DEFAULT_MODEL_ID = "gpt-5.4-mini";
export const AIGEN_GEMINI_DEFAULT_MODEL_ID = "gemini-3-flash";

export const AIGEN_MODEL_OPTIONS: ReadonlyArray<AigenModelOption> = [
  { value: AIGEN_OPENAI_DEFAULT_MODEL_ID, label: "OpenAI GPT-5.4 mini" },
  { value: AIGEN_CLAUDE_DEFAULT_MODEL_ID, label: "Claude Sonnet 4.6" },
  { value: AIGEN_GEMINI_DEFAULT_MODEL_ID, label: "Gemini 3 Flash (Preview)" },
] as const;

export const AIGEN_DEFAULT_MODEL: string = AIGEN_OPENAI_DEFAULT_MODEL_ID;
