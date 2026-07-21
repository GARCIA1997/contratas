import "fake-indexeddb/auto";

if (!("randomUUID" in crypto)) {
  let counter = 0;
  // @ts-expect-error - polyfill mínimo para entornos de test sin crypto.randomUUID
  crypto.randomUUID = () => `test-uuid-${++counter}`;
}
