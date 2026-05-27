# @byeolnaerim/global-rx-state

A tiny global React state primitive powered by RxJS, with named singleton stores, reducer support, and optional persistence.

## Install

```bash
npm install @byeolnaerim/global-rx-state rxjs react
```

## Anonymous tuple mode

Anonymous tuple mode creates a fresh store for each call. Declare it at module top-level and export the returned functions.

```ts
// ./state
import { createRxState } from "@byeolnaerim/global-rx-state";

export const [setCount, getCount, useCount, countSubject, countReady] =
	createRxState(0);
```

Then import the exported functions from React components.

```tsx
import { useCount } from "./state";

export function Counter() {
	const count = useCount();
	return <div>{count}</div>;
}
```

Do not call anonymous tuple mode inside React components or other functions. It creates a new store for each call.

```tsx
function Counter() {
	// Do not do this.
	const [setCount, getCount, useCount] = createRxState(0);
	return <div>{useCount()}</div>;
}
```

Anonymous tuple mode does not accept storage options. It has no stable persistence key and does not generate or use hidden, random keys.

## Named state mode

Named mode uses a global singleton registry keyed by name and storage options.

```tsx
import { createRxState } from "@byeolnaerim/global-rx-state";

export const { setCount, getCount, useCount, countSubject, countReady } =
	createRxState(0, "count", { storage: "auto" });

//OR

function A_Component(){
	const {setCountInner} = createRxState(0, "countInner"{storage:"auto"});
	return (
		<div>
			<button onClick={() => setCountInner((prev) => prev + 1)}>
				{countInner}
			</button>
		</div>
	);
}

function B_Component(){
	const {useCountInner} = createRxState(0, "countInner")// is A_Component countInner

	const countInner = useCountInner();

	return (
		<div><span>current count : {countInner}</span></div>
	)
}
```

If storage is omitted, the first registered storage alias for the same name is reused. If no alias exists yet, it defaults to in-memory.

To prevent confusion, it is recommended to explicitly specify the storage whenever possible.

```ts
createRxState(0, "count", { storage: "auto" });
createRxState(0, "count"); // reuses auto for count

createRxState(0, "count", { storage: "in-memory" }); // separate store

createRxState(0, "clickCount"); // defaults to 'in-memory' if no storage alias exists
createRxState(0, "clickCount", { storage: "auto" }); // separate store
```

## Named tuple helper

Use `createRxStateTuple` when you want tuple ergonomics plus named singleton behavior and optional persistence.

If you already know the static name, using the named mode is generally more readable.

createRxStateTuple is particularly useful when the name is determined at runtime. For example, you can use it when you need to separate state based on a key that cannot be determined in advance—such as a workspace ID received from a server, a tab name selected by the user, or a route parameter.

```ts
import { createRxStateTuple } from "@byeolnaerim/global-rx-state";

export const [setCount, getCount, useCount, countSubject, countReady] =
	createRxStateTuple(0, "count", { storage: "auto" });
```

## Reducer mode

Anonymous reducer tuple mode is also module-top-level only.

```ts
import { createRxReducer } from "@byeolnaerim/global-rx-state";

type CountAction = { type: "increment" } | { type: "reset" };

function countReducer(state: number, action: CountAction) {
	switch (action.type) {
		case "increment":
			return state + 1;
		case "reset":
			return 0;
		default:
			return state;
	}
}

export const [dispatchCount, getCount, useCount] = createRxReducer(
	0,
	countReducer,
);
```

Named reducer mode supports persistence.

```ts
export const { dispatchCount, getCount, useCount, countSubject, countReady } =
	createRxReducer(0, countReducer, "count", { storage: "auto" });
```

Named reducer tuple helper:

```ts
export const [dispatchCount, getCount, useCount, countSubject, countReady] =
	createRxReducerTuple(0, countReducer, "count", { storage: "auto" });
```

## Storage

Supported storage values:

- `in-memory`
- `auto`
- `indexeddb`
- `websql`
- `localstorage`
- `sessionstorage`

`auto` uses localForage with this driver order:

```txt
IndexedDB > WebSQL > localStorage
```

`ready` is a Promise that resolves after persistent storage hydration finishes. React hooks update automatically after hydration; use `ready` only when code must wait for the restored value before continuing.

## ESLint rule

The package includes a small ESLint rule that prevents anonymous tuple mode inside functions/components.

```js
const globalRxState = require("@byeolnaerim/global-rx-state/eslint-rules");

module.exports = {
	plugins: {
		"global-rx-state": globalRxState,
	},
	rules: {
		"global-rx-state/no-tuple-global-rx-state-in-function": "error",
	},
};
```

For legacy `.eslintrc` setups, you can also use ESLint `--rulesdir` with `eslint-rules/no-tuple-global-rx-state-in-function.cjs`.
