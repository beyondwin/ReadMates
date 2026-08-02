export function memoizeRouteModule<T>(load: () => Promise<T>) {
  let modulePromise: Promise<T> | null = null;

  return () => {
    if (!modulePromise) {
      modulePromise = load().catch((error: unknown) => {
        modulePromise = null;
        throw error;
      });
    }
    return modulePromise;
  };
}
