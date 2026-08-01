export function memoizeRouteModule<T>(load: () => Promise<T>) {
  let modulePromise: Promise<T> | null = null;

  return () => (modulePromise ??= load());
}
