import { describe, expect, it, vi } from 'vitest';
import { CommandStack, type Command } from './commandStack.js';

// Pure CommandStack mechanics, isolated from domain complexity via simple counter commands:
// `do()` adds `delta` to the value captured at construction time, `undo()` returns that captured
// prior value — the same "old VO already in the command's memory" shape every real command in
// commands/*.ts uses (14 §3 / ADR-001).

function makeAddCommand(before: number, delta: number): Command<number> {
  return { target: 'surface1', label: `Add(${delta})`, do: () => before + delta, undo: () => before };
}

function makeThrowingCommand(before: number): Command<number> {
  return {
    target: 'surface1',
    label: 'Throwing',
    do: () => {
      throw new Error('boom');
    },
    undo: () => before,
  };
}

describe('CommandStack — single command (undo след единична команда)', () => {
  it('execute mutates, undo restores the exact prior value', () => {
    const stack = new CommandStack();
    const result = stack.execute(makeAddCommand(0, 5));
    expect(result).toBe(5);
    expect(stack.canUndo()).toBe(true);
    const restored = stack.undo<number>();
    expect(restored).toBe(0);
    expect(stack.canUndo()).toBe(false);
  });
});

describe('CommandStack — sequence of commands (поредица от команди)', () => {
  it('undoes a sequence of 3 commands back to the exact original value, one step at a time', () => {
    const stack = new CommandStack();
    let value = 0;
    value = stack.execute(makeAddCommand(value, 1)); // 1
    value = stack.execute(makeAddCommand(value, 2)); // 3
    value = stack.execute(makeAddCommand(value, 3)); // 6
    expect(value).toBe(6);

    expect(stack.undo<number>()).toBe(3); // back to state before the +3
    expect(stack.undo<number>()).toBe(1); // back to state before the +2
    expect(stack.undo<number>()).toBe(0); // back to state before the +1 — exact original
    expect(stack.canUndo()).toBe(false);
  });

  it('redo replays the same sequence forward, exactly', () => {
    const stack = new CommandStack();
    let value = 0;
    value = stack.execute(makeAddCommand(value, 1));
    value = stack.execute(makeAddCommand(value, 2));
    expect(value).toBe(3);

    stack.undo();
    stack.undo();
    expect(stack.redo<number>()).toBe(1);
    expect(stack.redo<number>()).toBe(3);
    expect(stack.canRedo()).toBe(false);
  });
});

describe('CommandStack — redo stack invalidation след нова команда', () => {
  it('a fresh command after undo clears the redo history', () => {
    const stack = new CommandStack();
    stack.execute(makeAddCommand(0, 1));
    stack.execute(makeAddCommand(1, 2));
    stack.undo(); // back to 1, "add 2" now sits in future
    expect(stack.canRedo()).toBe(true);

    stack.execute(makeAddCommand(1, 99)); // a genuinely new command
    expect(stack.canRedo()).toBe(false); // the old "add 2" redo is gone
  });
});

describe('CommandStack — bounded Undo (ADR-001, достигане на undo лимита)', () => {
  it('evicts the oldest command (FIFO) once past the configured depth', () => {
    const stack = new CommandStack({ maxDepth: 3 });
    let value = 0;
    for (const delta of [1, 2, 3, 4, 5]) {
      value = stack.execute(makeAddCommand(value, delta));
    }
    expect(value).toBe(15); // 0+1+2+3+4+5
    expect(stack.undoDepth).toBe(3); // only the 3 most recent commands are retained

    // undo all 3 retained commands
    expect(stack.undo<number>()).toBe(10); // undid +5
    expect(stack.undo<number>()).toBe(6); // undid +4
    expect(stack.undo<number>()).toBe(3); // undid +3
    expect(stack.canUndo()).toBe(false);

    // the two EVICTED commands (+1, +2) are permanently unreachable — their effects remain
    // applied. This is the documented, correct behavior of bounded eviction (ADR-001), not a
    // bug: the current value is 3 (= 1 + 2), never 0.
  });

  it('does not evict anything while under the configured depth', () => {
    const stack = new CommandStack({ maxDepth: 10 });
    for (const delta of [1, 2, 3]) {
      stack.execute(makeAddCommand(0, delta));
    }
    expect(stack.undoDepth).toBe(3);
  });
});

describe('CommandStack — failed command да не замърсява stack-а', () => {
  it('a throwing do() leaves past/future/canUndo/canRedo completely untouched', () => {
    const stack = new CommandStack();
    stack.execute(makeAddCommand(0, 1));
    const depthBefore = stack.undoDepth;
    const canUndoBefore = stack.canUndo();

    expect(() => stack.execute(makeThrowingCommand(1))).toThrow('boom');

    expect(stack.undoDepth).toBe(depthBefore);
    expect(stack.canUndo()).toBe(canUndoBefore);
    expect(stack.canRedo()).toBe(false); // still nothing to redo — the failed command never entered future either
  });

  it('a failed command does not clear a pre-existing redo history', () => {
    const stack = new CommandStack();
    stack.execute(makeAddCommand(0, 1));
    stack.undo();
    expect(stack.canRedo()).toBe(true);

    expect(() => stack.execute(makeThrowingCommand(0))).toThrow();

    expect(stack.canRedo()).toBe(true); // untouched — only a *successful* execute() clears future
  });
});

describe('CommandStack — deterministic redo', () => {
  it('redo() reproduces byte-identical results, run after run', () => {
    const stack = new CommandStack();
    const first = stack.execute(makeAddCommand(0, 7));
    stack.undo();
    const second = stack.redo<number>();
    expect(second).toBe(first);

    stack.undo();
    const third = stack.redo<number>();
    expect(third).toBe(first);
    expect(third).toBe(second);
  });

  it('does not rely on ambient state (Date.now/Math.random) inside do()', () => {
    // A command whose `do` reads only its captured closure — never `Date.now()`/`Math.random()`
    // — is redo-deterministic by construction. This test documents the property with a spy: if
    // do() is called twice (once by execute, once by redo), both calls must be side-effect-free
    // with respect to global time/randomness sources.
    const dateSpy = vi.spyOn(Date, 'now');
    const stack = new CommandStack();
    stack.execute(makeAddCommand(0, 3));
    stack.undo();
    stack.redo();
    expect(dateSpy).not.toHaveBeenCalled();
    dateSpy.mockRestore();
  });
});
