import { TypedEmitter, createEmitter } from "../src/index.js";

type TestEvents = {
  greet: [name: string];
  count: [value: number, delta: number];
  ready: [];
  error: [err: Error];
};

describe("TypedEmitter — on/off/emit", () => {
  it("calls listener on emit", () => {
    const ee = new TypedEmitter<TestEvents>();
    const calls: string[] = [];
    ee.on("greet", (name) => calls.push(name));
    ee.emit("greet", "Alice");
    ee.emit("greet", "Bob");
    expect(calls).toEqual(["Alice", "Bob"]);
  });

  it("on() returns unsubscribe function", () => {
    const ee = new TypedEmitter<TestEvents>();
    const calls: number[] = [];
    const unsub = ee.on("count", (v) => calls.push(v));
    ee.emit("count", 1, 1);
    unsub();
    ee.emit("count", 2, 1);
    expect(calls).toEqual([1]);
  });

  it("off() removes a specific listener", () => {
    const ee = new TypedEmitter<TestEvents>();
    const calls: string[] = [];
    const listener = (name: string) => calls.push(name);
    ee.on("greet", listener);
    ee.emit("greet", "before");
    ee.off("greet", listener);
    ee.emit("greet", "after");
    expect(calls).toEqual(["before"]);
  });

  it("multiple listeners for same event all fire", () => {
    const ee = new TypedEmitter<TestEvents>();
    const calls: string[] = [];
    ee.on("greet", (n) => calls.push(`a:${n}`));
    ee.on("greet", (n) => calls.push(`b:${n}`));
    ee.emit("greet", "X");
    expect(calls).toEqual(["a:X", "b:X"]);
  });

  it("emit returns true when listeners exist", () => {
    const ee = new TypedEmitter<TestEvents>();
    ee.on("ready", () => {});
    expect(ee.emit("ready")).toBe(true);
  });

  it("emit returns false with no listeners", () => {
    const ee = new TypedEmitter<TestEvents>();
    expect(ee.emit("ready")).toBe(false);
  });

  it("zero-arg event works", () => {
    const ee = new TypedEmitter<TestEvents>();
    let fired = false;
    ee.on("ready", () => { fired = true; });
    ee.emit("ready");
    expect(fired).toBe(true);
  });

  it("multi-arg event passes all args", () => {
    const ee = new TypedEmitter<TestEvents>();
    let received: [number, number] | null = null;
    ee.on("count", (v, d) => { received = [v, d]; });
    ee.emit("count", 42, 7);
    expect(received).toEqual([42, 7]);
  });
});

describe("TypedEmitter — once()", () => {
  it("fires once then auto-removes", () => {
    const ee = new TypedEmitter<TestEvents>();
    const calls: string[] = [];
    ee.once("greet", (n) => calls.push(n));
    ee.emit("greet", "first");
    ee.emit("greet", "second");
    expect(calls).toEqual(["first"]);
  });

  it("once() unsubscribe before fire", () => {
    const ee = new TypedEmitter<TestEvents>();
    const calls: string[] = [];
    const unsub = ee.once("greet", (n) => calls.push(n));
    unsub();
    ee.emit("greet", "nope");
    expect(calls).toEqual([]);
  });
});

describe("TypedEmitter — offAll()", () => {
  it("offAll(event) removes all listeners for that event", () => {
    const ee = new TypedEmitter<TestEvents>();
    const calls: string[] = [];
    ee.on("greet", (n) => calls.push(`a:${n}`));
    ee.on("greet", (n) => calls.push(`b:${n}`));
    ee.offAll("greet");
    ee.emit("greet", "X");
    expect(calls).toEqual([]);
    expect(ee.listenerCount("greet")).toBe(0);
  });

  it("offAll() with no arg removes all", () => {
    const ee = new TypedEmitter<TestEvents>();
    ee.on("greet", () => {});
    ee.on("ready", () => {});
    ee.offAll();
    expect(ee.eventNames()).toEqual([]);
  });
});

describe("TypedEmitter — onAny() wildcard", () => {
  it("receives all events", () => {
    const ee = new TypedEmitter<TestEvents>();
    const log: string[] = [];
    ee.onAny((event, ...args) => log.push(`${String(event)}:${JSON.stringify(args)}`));
    ee.emit("greet", "Alice");
    ee.emit("ready");
    expect(log).toEqual(['greet:["Alice"]', 'ready:[]']);
  });

  it("onAny unsubscribe works", () => {
    const ee = new TypedEmitter<TestEvents>();
    const log: string[] = [];
    const unsub = ee.onAny((event) => log.push(String(event)));
    ee.emit("greet", "A");
    unsub();
    ee.emit("greet", "B");
    expect(log).toEqual(["greet"]);
  });
});

describe("TypedEmitter — async emit", () => {
  it("emitAsync awaits all async handlers", async () => {
    const ee = new TypedEmitter<TestEvents>();
    const log: number[] = [];
    ee.on("count", async (v) => { await new Promise(r => setTimeout(r, 10)); log.push(v); });
    ee.on("count", async (v) => { await new Promise(r => setTimeout(r, 5));  log.push(v * 10); });
    await ee.emitAsync("count", 3, 0);
    expect(log).toEqual([3, 30]);
  });

  it("emitAsync throws AggregateError if any handler rejects", async () => {
    const ee = new TypedEmitter<TestEvents>();
    ee.on("ready", async () => { throw new Error("handler failed"); });
    await expect(ee.emitAsync("ready")).rejects.toBeInstanceOf(AggregateError);
  });

  it("emitAsync resolves when no listeners", async () => {
    const ee = new TypedEmitter<TestEvents>();
    await expect(ee.emitAsync("ready")).resolves.toBeUndefined();
  });

  it("emitAsync with mix of sync and async handlers", async () => {
    const ee = new TypedEmitter<TestEvents>();
    const log: string[] = [];
    ee.on("greet", (n) => log.push(`sync:${n}`));
    ee.on("greet", async (n) => { log.push(`async:${n}`); });
    await ee.emitAsync("greet", "Test");
    expect(log).toEqual(["sync:Test", "async:Test"]);
  });
});

describe("TypedEmitter — onceAsync()", () => {
  it("resolves with emitted args on next event", async () => {
    const ee = new TypedEmitter<TestEvents>();
    const p = ee.onceAsync("greet");
    ee.emit("greet", "Hello");
    const args = await p;
    expect(args).toEqual(["Hello"]);
  });

  it("only resolves once", async () => {
    const ee = new TypedEmitter<TestEvents>();
    const p = ee.onceAsync("count");
    ee.emit("count", 1, 0);
    ee.emit("count", 2, 0);
    const [v] = await p;
    expect(v).toBe(1);
  });

  it("rejects when AbortSignal is aborted", async () => {
    const ee = new TypedEmitter<TestEvents>();
    const ac = new AbortController();
    const p = ee.onceAsync("greet", ac.signal);
    ac.abort(new Error("cancelled"));
    await expect(p).rejects.toThrow("cancelled");
  });

  it("rejects immediately if signal already aborted", async () => {
    const ee = new TypedEmitter<TestEvents>();
    const ac = new AbortController();
    ac.abort(new Error("already done"));
    const p = ee.onceAsync("greet", ac.signal);
    await expect(p).rejects.toThrow("already done");
  });
});

describe("TypedEmitter — history / replay", () => {
  it("stores history when option is set", () => {
    const ee = new TypedEmitter<TestEvents>({ history: 3 });
    ee.emit("greet", "A");
    ee.emit("greet", "B");
    ee.emit("greet", "C");
    expect(ee.getHistory("greet")).toEqual([["A"], ["B"], ["C"]]);
  });

  it("caps history at maxHistory", () => {
    const ee = new TypedEmitter<TestEvents>({ history: 2 });
    ee.emit("greet", "A");
    ee.emit("greet", "B");
    ee.emit("greet", "C");
    expect(ee.getHistory("greet")).toEqual([["B"], ["C"]]);
  });

  it("no history stored by default", () => {
    const ee = new TypedEmitter<TestEvents>();
    ee.emit("greet", "A");
    expect(ee.getHistory("greet")).toEqual([]);
  });

  it("onWithReplay replays history then subscribes", () => {
    const ee = new TypedEmitter<TestEvents>({ history: 5 });
    ee.emit("greet", "past1");
    ee.emit("greet", "past2");
    const received: string[] = [];
    ee.onWithReplay("greet", (n) => received.push(n));
    ee.emit("greet", "future");
    expect(received).toEqual(["past1", "past2", "future"]);
  });

  it("clearHistory clears one event", () => {
    const ee = new TypedEmitter<TestEvents>({ history: 5 });
    ee.emit("greet", "A");
    ee.emit("ready");
    ee.clearHistory("greet");
    expect(ee.getHistory("greet")).toEqual([]);
    expect(ee.getHistory("ready")).toEqual([[]]);
  });

  it("clearHistory() clears all", () => {
    const ee = new TypedEmitter<TestEvents>({ history: 5 });
    ee.emit("greet", "A");
    ee.emit("ready");
    ee.clearHistory();
    expect(ee.getHistory("greet")).toEqual([]);
    expect(ee.getHistory("ready")).toEqual([]);
  });
});

describe("TypedEmitter — introspection", () => {
  it("listenerCount returns correct count", () => {
    const ee = new TypedEmitter<TestEvents>();
    ee.on("greet", () => {});
    ee.on("greet", () => {});
    expect(ee.listenerCount("greet")).toBe(2);
    expect(ee.listenerCount("ready")).toBe(0);
  });

  it("listeners() returns handler array", () => {
    const ee = new TypedEmitter<TestEvents>();
    const fn = (n: string) => n;
    ee.on("greet", fn);
    expect(ee.listeners("greet")).toContain(fn);
  });

  it("eventNames() returns registered events", () => {
    const ee = new TypedEmitter<TestEvents>();
    ee.on("greet", () => {});
    ee.on("ready", () => {});
    expect(ee.eventNames().sort()).toEqual(["greet", "ready"].sort());
  });

  it("setMaxListeners / getMaxListeners", () => {
    const ee = new TypedEmitter<TestEvents>();
    ee.setMaxListeners(5);
    expect(ee.getMaxListeners()).toBe(5);
  });
});

describe("TypedEmitter — createEmitter shorthand", () => {
  it("creates a working emitter", () => {
    type E = { ping: [msg: string] };
    const ee = createEmitter<E>();
    const calls: string[] = [];
    ee.on("ping", (m) => calls.push(m));
    ee.emit("ping", "hello");
    expect(calls).toEqual(["hello"]);
  });
});

describe("TypedEmitter — symbol event keys", () => {
  it("supports symbol keys", () => {
    const SYM = Symbol("my-event");
    type E = { [SYM]: [value: number] };
    const ee = new TypedEmitter<E>();
    const calls: number[] = [];
    ee.on(SYM, (v) => calls.push(v));
    ee.emit(SYM, 42);
    expect(calls).toEqual([42]);
  });
});

describe("TypedEmitter — practical: app lifecycle", () => {
  it("simulates a request pipeline with async handlers", async () => {
    type AppEvents = {
      request: [path: string, id: number];
      response: [id: number, status: number];
      error: [err: Error];
    };

    const bus = createEmitter<AppEvents>();
    const log: string[] = [];

    bus.on("request", async (path, id) => {
      log.push(`[${id}] received ${path}`);
      await new Promise(r => setTimeout(r, 5));
      bus.emit("response", id, 200);
    });

    bus.on("response", (id, status) => {
      log.push(`[${id}] responded ${status}`);
    });

    await bus.emitAsync("request", "/api/users", 1);
    expect(log).toEqual(["[1] received /api/users", "[1] responded 200"]);
  });

  it("onceAsync waits for next event in async flow", async () => {
    type E = { "data:ready": [rows: number] };
    const bus = createEmitter<E>();
    setTimeout(() => bus.emit("data:ready", 42), 10);
    const [rows] = await bus.onceAsync("data:ready");
    expect(rows).toBe(42);
  });
});
