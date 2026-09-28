type Json = Record<string, unknown>;

/**
 * Keeps only what the demo video shows from a `claude -p --output-format stream-json` recording:
 * the tool calls, their results, the answer text, and the final result. Session details (ids,
 * model, usage, thinking, local settings) are dropped, so the saved transcript holds nothing about
 * the machine or account that recorded it.
 */
export function sanitizeTranscript(raw: string): string {
  const kept: string[] = [];
  for (const line of raw.split('\n').filter(Boolean)) {
    const event = JSON.parse(line) as Json;
    if (event.type === 'assistant' || event.type === 'user') {
      const content = ((event.message as Json | undefined)?.content as Json[] | undefined) ?? [];
      const items = content
        .filter((item) => ['text', 'tool_use', 'tool_result'].includes(String(item.type)))
        .map((item) =>
          item.type === 'text'
            ? { type: 'text', text: item.text }
            : item.type === 'tool_use'
              ? { type: 'tool_use', id: item.id, name: item.name, input: item.input }
              : { type: 'tool_result', tool_use_id: item.tool_use_id, content: item.content }
        );
      if (items.length)
        kept.push(JSON.stringify({ type: event.type, message: { content: items } }));
    } else if (event.type === 'result')
      kept.push(JSON.stringify({ type: 'result', result: event.result }));
  }
  return `${kept.join('\n')}\n`;
}
