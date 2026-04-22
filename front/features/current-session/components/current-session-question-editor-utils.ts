import type { QuestionInput } from "@/features/current-session/components/current-session-question-editor";
import {
  normalizeInitialQuestionInputs,
  type CurrentSessionQuestionRecord,
} from "@/features/current-session/model/current-session-form-model";

export function initialQuestionInputs(questions: readonly CurrentSessionQuestionRecord[]): QuestionInput[] {
  return normalizeInitialQuestionInputs(questions);
}
