export type ClubAiModelOption = {
  value: string;
  label: string;
};

export const CLUB_AI_OPENAI_DEFAULT_MODEL_ID = "gpt-5.4-mini";
export const CLUB_AI_GEMINI_DEFAULT_MODEL_ID = "gemini-3-flash-preview";
export const CLUB_AI_MODEL_OPTIONS: ReadonlyArray<ClubAiModelOption> = [
  { value: CLUB_AI_OPENAI_DEFAULT_MODEL_ID, label: "OpenAI GPT-5.4 mini" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: CLUB_AI_GEMINI_DEFAULT_MODEL_ID, label: "Gemini 3 Flash (Preview)" },
] as const;
