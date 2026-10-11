/**
 * Explicit street-name aliases used by Near Me search.
 *
 * Keys are canonical street names.
 * Values are confirmed alternative names.
 *
 * Do not add guesses: different streets can share
 * similar names, even in different areas.
 */

export const STREET_ALIASES: Record<
  string,
  readonly string[]
> = {
  /*
   * Add verified street aliases here.
   *
   * Example structure only:
   *
   * "canonical street name": [
   *   "verified alternative name",
   *   "verified local name",
   * ],
   */
};