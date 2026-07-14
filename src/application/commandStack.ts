import type { ProjectId, SurfaceId } from '../core/domain/entities.js';
import type { DomainEvent, DomainEventBus } from './domainEvents.js';

// docs/21_ARCHITECTURE.md §4, docs/26_ADR/ADR-001-command-stack-undo.md — Command Pattern with
// explicit inverse, bounded, global per Project session. Core (17/18) is never imported here for
// anything beyond the pure Shape/Calibration types a Command's do/undo closures happen to
// return — CommandStack itself contains no geometry, no rendering, no UI state, and reaches
// persistence only through whatever Repository the *caller* chose to use around it (this class
// does not touch a Repository at all; see docs/APPLICATION_LAYER_REVIEW.md for the boundary).

/**
 * 23_API.md §3.2 sketched `undo(): void`. This implementation deliberately returns the restored
 * value from `undo()` (and from `redo()`'s `do()` call) instead: `Command<T>` operates on
 * explicit, comparable state rather than a hidden mutable reference, which is what makes the
 * round-trip tests required by this task ("undo → exact initial state") assertable with plain
 * domain equality. This is a disclosed Phase 4 implementation refinement (PD-018: "Engineering
 * may optimize implementation"), not a silent contradiction of the API sketch — the contract's
 * *shape* (throws on failure, never mutates persisted state directly, target-scoped) is
 * unchanged.
 */
export interface Command<T> {
  readonly target: SurfaceId | ProjectId;
  readonly label: string;
  readonly do: () => T;
  readonly undo: () => T;
  /** optional — not every command has a modeled domain event yet (deferred ones stay undefined) */
  readonly event?: DomainEvent;
}

const DEFAULT_MAX_UNDO_DEPTH = 200;

/**
 * ADR-001 "Constraint: Bounded Undo" — count-based bound (the ADR permits either count or a
 * memory budget; count is chosen here for determinism and testability). On overflow, the
 * *oldest* command is evicted first (FIFO from the bottom of `past`), silently, per the ADR.
 * Eviction never revokes undo-ability for anything still in the stack — it just shortens how
 * far back Undo can reach, which is the whole point of the bound.
 */
export class CommandStack {
  private past: Array<Command<unknown>> = [];
  private future: Array<Command<unknown>> = [];
  private readonly maxDepth: number;
  private readonly eventBus: DomainEventBus | undefined;

  constructor(options?: { maxDepth?: number; eventBus?: DomainEventBus }) {
    this.maxDepth = options?.maxDepth ?? DEFAULT_MAX_UNDO_DEPTH;
    this.eventBus = options?.eventBus;
  }

  /**
   * Runs `command.do()`. If it throws, the stacks are left completely untouched — a failed
   * command never enters `past` and never invalidates `future` (a validation error must not
   * change state, and must not silently discard redo history for an unrelated prior action).
   */
  execute<T>(command: Command<T>): T {
    const result = command.do();
    this.pushToPast(command as Command<unknown>);
    this.future = [];
    if (command.event) this.eventBus?.publish(command.event);
    return result;
  }

  /** Returns the restored value, or undefined if there is nothing to undo. */
  undo<T = unknown>(): T | undefined {
    const command = this.past.pop();
    if (!command) return undefined;
    const result = command.undo();
    this.future.push(command);
    return result as T;
  }

  /**
   * Re-runs `command.do()` — deterministically, since a Command's do() is a pure function of
   * its (already-fixed-at-construction) parameters, never of ambient state like `Date.now()` or
   * a random id generator (ids are supplied by the caller when the command is built, precisely
   * so redo reproduces byte-identical results).
   */
  redo<T = unknown>(): T | undefined {
    const command = this.future.pop();
    if (!command) return undefined;
    const result = command.do();
    this.pushToPast(command);
    if (command.event) this.eventBus?.publish(command.event);
    return result as T;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  get undoDepth(): number {
    return this.past.length;
  }

  get redoDepth(): number {
    return this.future.length;
  }

  private pushToPast(command: Command<unknown>): void {
    this.past.push(command);
    if (this.past.length > this.maxDepth) {
      this.past.shift(); // FIFO eviction of the oldest command — ADR-001
    }
  }
}
