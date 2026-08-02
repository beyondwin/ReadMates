const sourceIds = new WeakMap<object, number>();
let nextSourceId = 1;

export function guestLoaderSourceKey(clubSlug: string, loaderData: object) {
  let id = sourceIds.get(loaderData);
  if (!id) {
    id = nextSourceId++;
    sourceIds.set(loaderData, id);
  }
  return `${clubSlug}:${id}`;
}
