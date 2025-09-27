/**
 * Replaces the block style of the YAML content with the flow style.
 * @param content The content to convert.
 * @returns The converted content.
 */
export function styleBlockToFlow(content: string): string {
  return content
    .replace(/-\s*{/g, '- ')
    .replace(/, /g, '\n    ')
    .replace(/:\s*{path:/g, ':\n      path:')
    .replace(/headers:\s*{/g, '  headers: {')
    .replace(/:\s*{Host:/g, ':\n        Host:')
    .replace(/}/g, '');
}
