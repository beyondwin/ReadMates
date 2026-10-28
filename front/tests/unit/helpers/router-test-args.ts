import { RouterContextProvider, type LoaderFunctionArgs } from "react-router";

type LoaderTestInput = Pick<LoaderFunctionArgs, "request" | "params" | "pattern"> &
  Partial<Pick<LoaderFunctionArgs, "context">>;

export function createLoaderArgs(input: LoaderTestInput): LoaderFunctionArgs {
  return {
    ...input,
    url: new URL(input.request.url),
    context: input.context ?? new RouterContextProvider(),
  };
}
