/** Per-prefix counters so every id's variable part is a short, plain, sequential number (e.g.
 *  `assert_1`, `assert_2`) instead of a long random alphanumeric string — much easier to read,
 *  compare, and reference (e.g. in North Star chat) anywhere an id is shown in the UI. */
const counters = new Map<string, number>();

export function newId(prefix: string): string {
  const next = (counters.get(prefix) ?? 0) + 1;
  counters.set(prefix, next);
  return `${prefix}_${next}`;
}
