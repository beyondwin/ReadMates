import type { QuestionInput } from "@/features/current-session/components/current-session-question-editor";
import type { CurrentSession } from "@/features/current-session/components/current-session-types";

export function initialQuestionInputs(questions: CurrentSession["myQuestions"]): QuestionInput[] {
  const inputs = [...questions]
    .sort((first, second) => first.priority - second.priority)
    .slice(0, 5)
    .map((question) => ({
      clientId: `saved-${question.priority}`,
      text: question.text,
    }));

  while (inputs.length < 2) {
    inputs.push({ clientId: `empty-${inputs.length + 1}`, text: "" });
  }

  return inputs;
}
