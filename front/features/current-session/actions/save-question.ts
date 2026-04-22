import { readmatesFetchResponse } from "@/shared/api/readmates";

export async function saveQuestion(priority: number, text: string, draftThought: string) {
  return readmatesFetchResponse("/api/sessions/current/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ priority, text, draftThought }),
  });
}

export async function saveQuestions(questions: Array<{ text: string }>) {
  return readmatesFetchResponse("/api/sessions/current/questions", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questions }),
  });
}
