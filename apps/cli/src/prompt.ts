import { createInterface } from 'node:readline';
import type { Trace } from '../../local-ops-api/src/trace.js';

export type Ask = (question: string, options?: { secret?: boolean }) => Promise<string>;

/** Ctrl-C or Ctrl-D at a question: the command stops and saves nothing. */
export class Cancelled extends Error {
  constructor() {
    super('Cancelled. Nothing was changed.');
  }
}

/** The line the answer is typed on; any lines before it explain the question. */
const promptLine = (question: string): string => question.split('\n').pop() ?? '';

/** Traces which question is asked, never the answer. */
export function tracedAsk(ask: Ask, trace: Trace): Ask {
  return (question, options) => {
    trace(`Asking: ${promptLine(question).trim()}${options?.secret ? ' (answer hidden)' : ''}`);
    return ask(question, options);
  };
}

// Arrow keys and other escape sequences are ignored while typing a hidden answer.
const ESCAPES = /\x1b(?:\[[0-9;?]*[ -/]*[@-~]|O.|.)/g;

/**
 * Asks in a terminal. The explanation lines are printed as they are; the last line is the prompt,
 * given to readline so that editing the answer never erases it. A secret is read with nothing echoed.
 */
export function terminalAsk(
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout
): Ask {
  return (question, options = {}) => {
    const lines = question.split('\n');
    const prompt = lines.pop() ?? '';
    if (lines.length > 0) output.write(`${lines.join('\n')}\n`);
    return options.secret ? readHidden(input, output, prompt) : readLine(input, output, prompt);
  };
}

function readLine(
  input: NodeJS.ReadStream,
  output: NodeJS.WriteStream,
  prompt: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input, output, terminal: true, historySize: 0 });
    let answered = false;
    rl.on('SIGINT', () => {
      output.write('\n');
      rl.close();
    });
    rl.on('close', () => {
      if (!answered) reject(new Cancelled());
    });
    rl.question(prompt, (answer) => {
      answered = true;
      rl.close();
      resolve(answer);
    });
  });
}

function readHidden(
  input: NodeJS.ReadStream,
  output: NodeJS.WriteStream,
  prompt: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    output.write(prompt);
    let value = '';
    const finish = (error?: Error) => {
      input.off('data', onData);
      input.off('end', onEnd);
      input.setRawMode(false);
      input.pause();
      output.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onEnd = () => finish(new Cancelled());
    const onData = (chunk: Buffer | string) => {
      for (const char of String(chunk).replace(ESCAPES, '')) {
        if (char === '\r' || char === '\n') return finish();
        if (char === '\u0003' || (char === '\u0004' && value === ''))
          return finish(new Cancelled());
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char === '\u0015') value = '';
        else if (char >= ' ') value += char;
      }
    };
    input.setRawMode(true);
    input.on('data', onData);
    input.on('end', onEnd);
    input.resume();
  });
}
