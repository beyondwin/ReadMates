export const MIN_QUESTION_INPUT_COUNT = 2;
export const MAX_QUESTION_INPUT_COUNT = 5;

export const QUESTION_FORM_VALIDATION_MESSAGES = {
  maxQuestionCount: `최대 ${MAX_QUESTION_INPUT_COUNT}개까지 작성할 수 있어요.`,
  minQuestionInputCount: `질문 입력칸은 최소 ${MIN_QUESTION_INPUT_COUNT}개가 필요해요.`,
} as const;

export type CurrentSessionQuestionRecord = {
  priority: number;
  text: string;
};

export type CurrentSessionQuestionInput = {
  clientId: string;
  text: string;
};

export type CurrentSessionQuestionPayloadItem = {
  priority: number;
  text: string;
};

export function normalizeInitialQuestionInputs(
  questions: readonly CurrentSessionQuestionRecord[],
): CurrentSessionQuestionInput[] {
  const savedByPriority = new Map(
    [...questions]
      .filter((question) => question.priority >= 1 && question.priority <= MAX_QUESTION_INPUT_COUNT)
      .sort((first, second) => first.priority - second.priority)
      .map((question) => [question.priority, question.text] as const),
  );
  const highestSavedPriority = [...savedByPriority.keys()].at(-1) ?? 0;
  const inputCount = Math.max(MIN_QUESTION_INPUT_COUNT, highestSavedPriority);
  const inputs = Array.from({ length: inputCount }, (_, index) => {
    const priority = index + 1;
    const savedText = savedByPriority.get(priority);

    return {
      clientId: savedText === undefined ? `empty-${priority}` : `saved-${priority}`,
      text: savedText ?? "",
    };
  });

  return inputs.slice(0, MAX_QUESTION_INPUT_COUNT);
}

export function countWrittenQuestions(inputs: readonly CurrentSessionQuestionInput[]) {
  return inputs.filter((input) => input.text.trim()).length;
}

export function canAddQuestionInput(inputs: readonly CurrentSessionQuestionInput[]) {
  return inputs.length < MAX_QUESTION_INPUT_COUNT;
}

export function getAddQuestionValidationMessage(inputs: readonly CurrentSessionQuestionInput[]) {
  return canAddQuestionInput(inputs) ? "" : QUESTION_FORM_VALIDATION_MESSAGES.maxQuestionCount;
}

export function createAddedQuestionInput(currentLength: number, createdAt: number): CurrentSessionQuestionInput {
  return { clientId: `added-${createdAt}-${currentLength}`, text: "" };
}

export function canRemoveQuestionInput(inputs: readonly CurrentSessionQuestionInput[]) {
  return inputs.length > MIN_QUESTION_INPUT_COUNT;
}

export function getRemoveQuestionValidationMessage(inputs: readonly CurrentSessionQuestionInput[]) {
  return canRemoveQuestionInput(inputs) ? "" : QUESTION_FORM_VALIDATION_MESSAGES.minQuestionInputCount;
}

export function buildQuestionPayload(
  inputs: readonly CurrentSessionQuestionInput[],
): CurrentSessionQuestionPayloadItem[] {
  return inputs
    .map((input, index) => ({ priority: index + 1, text: input.text.trim() }))
    .filter((input) => input.text);
}

export function getQuestionPayloadValidationMessage(payload: readonly CurrentSessionQuestionPayloadItem[]) {
  return payload.length > MAX_QUESTION_INPUT_COUNT ? QUESTION_FORM_VALIDATION_MESSAGES.maxQuestionCount : "";
}
