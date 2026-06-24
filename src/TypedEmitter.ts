/**
 * TypedEmitter<Events> — a fully-typed async event emitter.
 *
 * Events is a record mapping event names to their argument tuples:
 *   type Events = {
 *     login:  [user: User];
 *     error:  [err: Error, context: string];
 *     ready:  [];
 *   };
 *
 * All event names and payload types are checked at compile time.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventMap = Record<string | symbol, any[]>;

export type Listener<Args extends unknown[]> = (...args: Args) => void | Promise<void>;

// Internal wildcard listener type — receives (eventName, ...args)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WildcardListener = (event: string | symbol, ...args: any[]) => void | Promise<void>;

export interface EmitterOptions {
  /**
   * Maximum number of past events to store per event name for late replay.
   * 0 = no history (default).
   */
  history?: number;
  /**
   * Maximum listeners per event before a warning is printed.
   * Default: 10. Set to 0 to disable.
   */
  maxListeners?: number;
}

interface ListenerEntry<Args extends unknown[]> {
  fn: Listener<Args>;
  once: boolean;
}

interface HistoryEntry<Args extends unknown[]> {
  args: Args;
}

export class TypedEmitter<Events extends EventMap> {
  private readonly _listeners = new Map<keyof Events, ListenerEntry<Events[keyof Events]>[]>();
  private readonly _wildcards: Set<WildcardListener> = new Set();
  private readonly _history = new Map<keyof Events, HistoryEntry<Events[keyof Events]>[]>();
  private readonly _maxHistory: number;
  private _maxListeners: number;

  constructor(options: EmitterOptions = {}) {
    this._maxHistory = options.history ?? 0;
    this._maxListeners = options.maxListeners ?? 10;
  }

  // ── Subscribe ────────────────────────────────────────────────────────────────

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let entries = this._listeners.get(event);
    if (!entries) { entries = []; this._listeners.set(event, entries); }
    entries.push({ fn: listener as Listener<Events[keyof Events]>, once: false });
    if (this._maxListeners > 0 && entries.length > this._maxListeners) {
      console.warn(`TypedEmitter: possible memory leak — ${entries.length} listeners for event "${String(event)}"`);
    }
    return () => this.off(event, listener);
  }

  /** Subscribe once — auto-removed after first call. */
  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let entries = this._listeners.get(event);
    if (!entries) { entries = []; this._listeners.set(event, entries); }
    entries.push({ fn: listener as Listener<Events[keyof Events]>, once: true });
    return () => this.off(event, listener);
  }

  /**
   * Subscribe to an event and replay all stored history to the listener first.
   * Useful for "late" subscribers that missed earlier events.
   */
  onWithReplay<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const history = this._history.get(event) ?? [];
    for (const entry of history) {
      (listener as Listener<unknown[]>)(...entry.args);
    }
    return this.on(event, listener);
  }

  /**
   * Subscribe to ALL events. The listener receives (eventName, ...args).
   * Returns an unsubscribe function.
   */
  onAny(listener: (event: keyof Events, ...args: Events[keyof Events]) => void | Promise<void>): () => void {
    const wl = listener as WildcardListener;
    this._wildcards.add(wl);
    return () => this._wildcards.delete(wl);
  }

  // ── Unsubscribe ──────────────────────────────────────────────────────────────

  /** Remove a specific listener. */
  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this {
    const entries = this._listeners.get(event);
    if (!entries) return this;
    const idx = entries.findIndex(e => e.fn === (listener as Listener<Events[keyof Events]>));
    if (idx !== -1) entries.splice(idx, 1);
    if (entries.length === 0) this._listeners.delete(event);
    return this;
  }

  /** Remove all listeners for a given event, or all events if no argument. */
  offAll(event?: keyof Events): this {
    if (event === undefined) {
      this._listeners.clear();
      this._wildcards.clear();
    } else {
      this._listeners.delete(event);
    }
    return this;
  }

  // ── Emit ────────────────────────────────────────────────────────────────────

  /**
   * Synchronous emit — calls all handlers in registration order.
   * Async handlers are NOT awaited. Use emitAsync() if you need to await them.
   * Returns true if at least one listener was called.
   */
  emit<K extends keyof Events>(event: K, ...args: Events[K]): boolean {
    this._recordHistory(event, args);
    let fired = false;
    const entries = this._listeners.get(event);
    if (entries && entries.length > 0) {
      fired = true;
      const snapshot = [...entries];
      for (const entry of snapshot) {
        entry.fn(...args as Events[keyof Events]);
        if (entry.once) this.off(event, entry.fn as Listener<Events[K]>);
      }
    }
    if (this._wildcards.size > 0) {
      fired = true;
      for (const wl of this._wildcards) {
        wl(event as string | symbol, ...(args as unknown[]));
      }
    }
    return fired;
  }

  /**
   * Async emit — awaits all handlers sequentially.
   * Returns a promise that resolves when all handlers have settled.
   * Rejects if any handler rejects (others are still awaited via Promise.allSettled).
   */
  /**
   * Async emit — awaits handlers **sequentially** in registration order.
   * This preserves ordering guarantees: handler N+1 always starts after handler N resolves.
   * Collects all errors and throws a single AggregateError at the end.
   */
  async emitAsync<K extends keyof Events>(event: K, ...args: Events[K]): Promise<void> {
    this._recordHistory(event, args);
    const errors: unknown[] = [];
    const entries = this._listeners.get(event);
    if (entries && entries.length > 0) {
      const snapshot = [...entries];
      for (const entry of snapshot) {
        try {
          const result = entry.fn(...args as Events[keyof Events]);
          if (result instanceof Promise) await result;
        } catch (e) { errors.push(e); }
        if (entry.once) this.off(event, entry.fn as Listener<Events[K]>);
      }
    }
    for (const wl of this._wildcards) {
      try {
        const result = wl(event as string | symbol, ...(args as unknown[]));
        if (result instanceof Promise) await result;
      } catch (e) { errors.push(e); }
    }
    if (errors.length > 0) throw new AggregateError(errors, `emitAsync: ${errors.length} handler(s) rejected`);
  }

  // ── Promise-based once ───────────────────────────────────────────────────────

  /**
   * Returns a Promise that resolves with the next emission of `event`.
   * Resolves with a tuple of the emitted arguments.
   * Optional AbortSignal to cancel waiting.
   */
  onceAsync<K extends keyof Events>(event: K, signal?: AbortSignal): Promise<Events[K]> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(signal.reason); return; }

      const listener = (...args: Events[K]) => {
        signal?.removeEventListener("abort", onAbort);
        resolve(args);
      };

      const onAbort = () => {
        this.off(event, listener);
        reject((signal as AbortSignal).reason);
      };

      this.once(event, listener);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }

  // ── Introspection ────────────────────────────────────────────────────────────

  listenerCount(event: keyof Events): number {
    return this._listeners.get(event)?.length ?? 0;
  }

  listeners<K extends keyof Events>(event: K): Listener<Events[K]>[] {
    return (this._listeners.get(event) ?? []).map(e => e.fn as Listener<Events[K]>);
  }

  eventNames(): (keyof Events)[] {
    return [...this._listeners.keys()];
  }

  setMaxListeners(n: number): this { this._maxListeners = n; return this; }
  getMaxListeners(): number { return this._maxListeners; }

  // ── History ──────────────────────────────────────────────────────────────────

  /** Return stored event history for an event, oldest-first. */
  getHistory<K extends keyof Events>(event: K): Events[K][] {
    return (this._history.get(event) ?? []).map(e => e.args as Events[K]);
  }

  /** Clear stored history for an event, or all history if no argument. */
  clearHistory(event?: keyof Events): this {
    if (event === undefined) this._history.clear();
    else this._history.delete(event);
    return this;
  }

  private _recordHistory<K extends keyof Events>(event: K, args: Events[K]): void {
    if (this._maxHistory === 0) return;
    let hist = this._history.get(event);
    if (!hist) { hist = []; this._history.set(event, hist); }
    hist.push({ args: [...args] as Events[K] });
    if (hist.length > this._maxHistory) hist.shift();
  }
}

/**
 * Create a TypedEmitter instance. Shorthand for `new TypedEmitter<Events>(opts)`.
 */
export function createEmitter<Events extends EventMap>(options?: EmitterOptions): TypedEmitter<Events> {
  return new TypedEmitter<Events>(options);
}
