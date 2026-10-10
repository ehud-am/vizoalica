import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { Cancelled, terminalAsk, tracedAsk } from '../src/prompt.js';

/** A terminal pair: what is typed goes into `input`; everything written to `output` is kept. */
function terminal() {
  const input = Object.assign(new PassThrough(), {
    isTTY: true,
    raw: false,
    setRawMode(mode: boolean) {
      input.raw = mode;
      return input;
    }
  });
  const written: string[] = [];
  const output = Object.assign(new PassThrough(), { isTTY: true, columns: 80 });
  output.on('data', (chunk: Buffer) => written.push(chunk.toString('utf8')));
  const ask = terminalAsk(input as never, output as never);
  const type = (text: string) => setImmediate(() => input.write(text));
  return { ask, input, type, shown: () => written.join('') };
}

describe('terminalAsk', () => {
  it('prints the explanation, keeps the prompt, and returns the line typed', async () => {
    const t = terminal();
    const answer = t.ask('\nWhat this is for.\nName: ');
    t.type('prod\r');
    expect(await answer).toBe('prod');
    expect(t.shown()).toContain('\nWhat this is for.\n');
    expect(t.shown()).toContain('Name: ');
    expect(t.shown()).toContain('prod');
  });

  it('reads a secret with nothing shown, handling backspace, Ctrl-U, and arrow keys', async () => {
    const t = terminal();
    const answer = t.ask('Secret: ', { secret: true });
    t.type('wrong\u0015ab\u007fc\u001b[Dd\r');
    expect(await answer).toBe('acd');
    expect(t.shown()).toBe('Secret: \n');
    expect(t.input.raw).toBe(false);
  });

  it('stops with Cancelled on Ctrl-C, Ctrl-D, or the end of input', async () => {
    const plain = terminal();
    const line = plain.ask('Name: ');
    plain.type('\u0003');
    await expect(line).rejects.toBeInstanceOf(Cancelled);

    for (const keys of ['\u0003', '\u0004']) {
      const t = terminal();
      const secret = t.ask('Secret: ', { secret: true });
      t.type(keys);
      await expect(secret).rejects.toBeInstanceOf(Cancelled);
      expect(t.input.raw).toBe(false);
    }

    const ended = terminal();
    const secret = ended.ask('Secret: ', { secret: true });
    setImmediate(() => ended.input.end());
    await expect(secret).rejects.toBeInstanceOf(Cancelled);

    const closed = terminal();
    const answer = closed.ask('Name: ');
    setImmediate(() => closed.input.end());
    await expect(answer).rejects.toBeInstanceOf(Cancelled);
  });

  it('keeps Ctrl-D as a character once a secret has been typed', async () => {
    const t = terminal();
    const answer = t.ask('Secret: ', { secret: true });
    t.type('ab\u0004c\n');
    expect(await answer).toBe('abc');
  });
});

describe('tracedAsk', () => {
  it('traces only the prompt line, marks hidden answers, and never the answer', async () => {
    const lines: string[] = [];
    const ask = tracedAsk(
      async () => 'the-answer',
      (line) => void lines.push(line)
    );
    expect(await ask('\nAbout it.\nName: ')).toBe('the-answer');
    await ask('Secret: ', { secret: true });
    expect(lines).toEqual(['Asking: Name:', 'Asking: Secret: (answer hidden)']);
  });
});
