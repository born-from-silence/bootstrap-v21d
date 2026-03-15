/**
 * Fixes non-standard JSON escapes in LLM-generated tool arguments.
 * LLMs sometimes produce ` or \$ (valid JS, invalid JSON).
 */
export function sanitizeJsonString(s: string): string {
  return s.replace(/\\(.)/g, (match, char) => {
    if ('nrtbf"\\/u'.includes(char)) return match;
    return char;
  });
}
