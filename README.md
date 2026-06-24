# eventkit

[![All Contributors](https://img.shields.io/badge/all_contributors-1-orange.svg?style=flat-square)](#contributors-)

> Zero-dependency typed async EventEmitter. Compile-time event type safety, `async` dispatch (await all handlers in order), Promise-based `once`, event history + late-subscriber replay, wildcard listeners. Port of Java Guava EventBus / Python blinker.

[![npm](https://img.shields.io/npm/v/eventkit)](https://www.npmjs.com/package/eventkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Install

```bash
npm install eventkit
```

## Why

`eventemitter3` (17M/week) and `mitt` (4M/week) are great but they lack:
- `emitAsync()` — await all handlers in registration order
- `onceAsync()` — Promise that resolves on next emit (AbortSignal support)
- Event history with late-subscriber replay (`onWithReplay`)
- Wildcard `onAny` listener

## Quick start

```typescript
import { createEmitter } from "eventkit";

// Declare your event map — names → argument tuples
type AppEvents = {
  login:   [user: { id: number; name: string }];
  logout:  [userId: number];
  error:   [err: Error];
  ready:   [];
};

const bus = createEmitter<AppEvents>();

// TypeScript knows `name` is a string here
bus.on("login", (user) => console.log(`Welcome ${user.name}`));

// Async handler — properly awaited by emitAsync()
bus.on("login", async (user) => {
  await saveToDatabase(user);
});

// Emit (sync — async handlers start but are NOT awaited)
bus.emit("login", { id: 1, name: "Alice" });

// Emit async — awaits all handlers in registration order
await bus.emitAsync("login", { id: 1, name: "Alice" });
```

## Promise-based once

```typescript
// Wait for the next "ready" event
const [] = await bus.onceAsync("ready");

// With AbortSignal (cancel waiting)
const ac = new AbortController();
setTimeout(() => ac.abort(), 5000); // cancel after 5s
try {
  const [user] = await bus.onceAsync("login", ac.signal);
  console.log(`Logged in: ${user.name}`);
} catch {
  console.log("Timed out waiting for login");
}
```

## Event history + late-subscriber replay

```typescript
const bus = createEmitter<AppEvents>({ history: 10 });

bus.emit("login", { id: 1, name: "Alice" });
bus.emit("login", { id: 2, name: "Bob" });

// Late subscriber gets past events replayed first, then future ones
bus.onWithReplay("login", (user) => console.log(user.name));
// prints: Alice, Bob  (replayed)

bus.emit("login", { id: 3, name: "Carol" });
// prints: Carol  (new event)

// Inspect history
bus.getHistory("login");  // [[{id:1,name:"Alice"}], [{id:2,...}]]
bus.clearHistory("login");
```

## Wildcard listener

```typescript
bus.onAny((eventName, ...args) => {
  console.log(`[${String(eventName)}]`, args);
});

bus.emit("login", { id: 1, name: "Alice" });
// → [login] [{id:1,name:"Alice"}]
```

## Unsubscribe patterns

```typescript
// Pattern 1: unsubscribe function
const unsub = bus.on("login", handler);
unsub();  // removes this listener

// Pattern 2: off()
bus.off("login", handler);

// Pattern 3: remove all for one event
bus.offAll("login");

// Pattern 4: remove everything
bus.offAll();
```

## Async error handling

```typescript
bus.on("login", async () => { throw new Error("DB down"); });
bus.on("login", async () => { /* this still runs */ });

try {
  await bus.emitAsync("login", user);
} catch (e) {
  // AggregateError — all handler errors collected
  if (e instanceof AggregateError) {
    console.log(e.errors); // [Error("DB down")]
  }
}
```

## API

```typescript
new TypedEmitter<Events>(options?: { history?: number; maxListeners?: number })
createEmitter<Events>(options?)  // shorthand

// Subscribe
.on(event, listener): () => void          // returns unsub fn
.once(event, listener): () => void
.onWithReplay(event, listener): () => void // replays history first
.onAny(listener): () => void              // wildcard — all events
.off(event, listener): this
.offAll(event?): this

// Emit
.emit(event, ...args): boolean            // sync; true if any listener
.emitAsync(event, ...args): Promise<void> // awaits handlers sequentially

// Promise-based
.onceAsync(event, signal?): Promise<args tuple>

// History
.getHistory(event): args[][]
.clearHistory(event?): this

// Introspection
.listenerCount(event): number
.listeners(event): Listener[]
.eventNames(): (keyof Events)[]
.setMaxListeners(n): this
.getMaxListeners(): number
```

## Comparison

| | eventkit | eventemitter3 | mitt |
|---|---|---|---|
| TypeScript types | ✅ generics | ✅ | ✅ |
| `emitAsync` (await handlers) | ✅ | ❌ | ❌ |
| `onceAsync` (Promise) | ✅ | ❌ | ❌ |
| Event history + replay | ✅ | ❌ | ❌ |
| Wildcard `onAny` | ✅ | ❌ | ✅ |
| AbortSignal support | ✅ | ❌ | ❌ |
| Zero dependencies | ✅ | ✅ | ✅ |

## Contributors ✨

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind are welcome — code, docs, bug reports, ideas, reviews! See the [emoji key](https://allcontributors.org/docs/en/emoji-key) for how each contribution is recognized, and open a PR or issue to get involved.

Thanks goes to these wonderful people:

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/trananhtung"><img src="https://avatars.githubusercontent.com/u/30992229?v=4?s=100" width="100px;" alt="Tung Tran"/><br /><sub><b>Tung Tran</b></sub></a><br /><a href="https://github.com/trananhtung/eventkit/commits?author=trananhtung" title="Code">💻</a> <a href="#maintenance-trananhtung" title="Maintenance">🚧</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

## License

MIT © [trananhtung](https://github.com/trananhtung)
