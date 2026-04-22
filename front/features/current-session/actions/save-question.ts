import { saveCurrentSessionQuestion, saveCurrentSessionQuestions } from "@/features/current-session/api/current-session-api";

export async function saveQuestion(priority: number, text: string, draftThought: string) {
  return saveCurrentSessionQuestion(priority, text, draftThought);
}

export async function saveQuestions(questions: Array<{ text: string }>) {
  return saveCurrentSessionQuestions(questions);
}
