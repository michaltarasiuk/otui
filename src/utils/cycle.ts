export type Step = 1 | -1;

export function around<T>(items: readonly T[], item: T, step: Step) {
  const ordered = step === 1 ? items : items.toReversed();
  const index = ordered.indexOf(item);
  return [...ordered.slice(index + 1), ...ordered.slice(0, index + 1)];
}

export function cycle<T>(items: readonly [T, ...T[]], item: T, step: Step) {
  const [next] = around(items, item, step);
  return next as T;
}
