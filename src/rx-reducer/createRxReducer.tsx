"use client";

import type { BehaviorSubject } from "rxjs";
import { makeBaseEntry, makeVolatileEntry, persistNextValue } from "../shared/entry";
import {
	clearNamedReturns,
	deleteDefaultStorageAlias,
	deleteNamedReturn,
	globalRxNamedReturnRegistry,
	globalRxRegistry,
	listDefaultStorageAliases,
	listRegisteredStorageOptions,
	makeNamedRegistryKey,
	resolveNamedStorageOptions,
} from "../shared/registry";
import {
	createStorageAdapter,
	findRxStorages,
	getPersistedItemKey,
	getRxStorageInfo,
	normalizeStorageOptions,
} from "../shared/storage";
import type { RxStateStorageOptions } from "../shared";
import type {
	NamedDispatch,
	NamedReducerGet,
	NamedReducerReady,
	NamedReducerSubject,
	NamedReducerUse,
	RxDispatch,
	RxReducer,
	RxReducerEntry,
} from "./types";

const KIND = "reducer" as const;

function cap(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Creates the internal entry for createRxReducer.
 *
 * When storageOptions is omitted, the entry is volatile: it is not registered
 * globally and does not persist. This is used by anonymous tuple mode.
 *
 * When storageOptions is provided, the reducer is stored in the dispatch closure.
 * Dispatch computes the next state from the current BehaviorSubject value,
 * publishes it immediately, and then persists it through the selected storage
 * adapter.
 */
function makeReducerEntry<S, A>(params: {
	initialState: S;
	reducer: RxReducer<S, A>;
	registryKey?: string;
	logicalKey?: string;
	storageOptions?: Required<RxStateStorageOptions>;
}): RxReducerEntry<S, A> {
	const changeRef = { current: 0 };
	const base = params.storageOptions
		? makeBaseEntry({
				kind: KIND,
				defaultValue: params.initialState,
				registryKey: params.registryKey ?? "",
				logicalKey: params.logicalKey ?? "",
				storageOptions: params.storageOptions,
				onChangeRef: changeRef,
			})
		: makeVolatileEntry({ kind: KIND, defaultValue: params.initialState });

	const dispatch: RxDispatch<A> = (action) => {
		const prev = base.subject.getValue();
		const next = params.reducer(prev, action);
		changeRef.current += 1;
		base.subject.next(next);

		if (params.storageOptions) {
			persistNextValue({
				storageOptions: params.storageOptions,
				storageKey: base.storageKey,
				value: next,
			});
		}
	};

	return { ...base, dispatch };
}

function getOrCreateNamedEntry<S, A>(
	initialState: S,
	reducer: RxReducer<S, A>,
	name: string,
	storageOptionsInput?: RxStateStorageOptions,
): RxReducerEntry<S, A> {
	const storageOptions = resolveNamedStorageOptions(KIND, name, storageOptionsInput);
	const registryKey = makeNamedRegistryKey(KIND, name, storageOptions);

	if (!globalRxRegistry.has(registryKey)) {
		globalRxRegistry.set(
			registryKey,
			makeReducerEntry({
				initialState,
				reducer,
				registryKey,
				logicalKey: name,
				storageOptions,
			}),
		);
	}

	return globalRxRegistry.get(registryKey) as RxReducerEntry<S, A>;
}

/**
 * RxJS-backed reducer primitive for React.
 *
 * Tuple mode without a name returns a fresh store for each call:
 *
 * ```ts
 * export const [dispatchCount, getCount, useCount, countSubject, countReady] =
 * 	createRxReducer(0, countReducer);
 * ```
 *
 * Tuple mode must be declared at module top-level and then imported by
 * components. Do not call tuple mode inside React components or other functions.
 * It is intentionally not cached by stack trace and does not accept storage
 * options because anonymous calls have no stable persistence key.
 */
export function createRxReducer<S, A>(
	initialState: S,
	reducer: RxReducer<S, A>,
): readonly [RxDispatch<A>, () => S, () => S, BehaviorSubject<S>, Promise<void>];

/**
 * Named mode with a global cache.
 *
 * The returned object has keys derived from the provided name:
 *
 * ```ts
 * const { dispatchCart, getCart, useCart, cartSubject, cartReady } =
 * 	createRxReducer(initialCart, cartReducer, "cart", { storage: "auto" });
 * ```
 *
 * Reusing the same name and storage points to the same BehaviorSubject. If the
 * storage option is omitted, the first registered storage alias for that name is
 * reused. If no alias exists yet, the name defaults to in-memory. The alias is
 * scoped to reducer entries, so createRxState("cart") and createRxReducer("cart")
 * do not collide.
 *
 * Named reducer mode is safe to call from React components. The named API object
 * is cached by registry key, so repeated calls with the same name/storage return
 * the same dispatch/getter/hook/subject references.
 */
export function createRxReducer<S, A, N extends string>(
	initialState: S,
	reducer: RxReducer<S, A>,
	name: N,
	storageOptions?: RxStateStorageOptions,
): NamedDispatch<N, A> &
	NamedReducerGet<N, S> &
	NamedReducerUse<N, S> &
	NamedReducerSubject<N, S> &
	NamedReducerReady<N>;

export function createRxReducer<S, A, N extends string>(
	initialState: S,
	reducer: RxReducer<S, A>,
	name?: N,
	storageOptions?: RxStateStorageOptions,
) {
	if (name !== undefined && typeof name !== "string") {
		throw new TypeError(
			"Anonymous tuple mode does not accept storage options. Use named mode or createRxReducerTuple for persisted tuple reducer state.",
		);
	}

	if (name) {
		const entry = getOrCreateNamedEntry(initialState, reducer, name, storageOptions);
		const cached = globalRxNamedReturnRegistry.get(entry.registryKey);

		if (cached) {
			return cached as NamedDispatch<N, A> &
				NamedReducerGet<N, S> &
				NamedReducerUse<N, S> &
				NamedReducerSubject<N, S> &
				NamedReducerReady<N>;
		}

		const obj: Record<string, unknown> = {};
		obj[`dispatch${cap(name)}`] = entry.dispatch;
		obj[`get${cap(name)}`] = entry.get;
		obj[`use${cap(name)}`] = entry.useValue;
		obj[`${name}Subject`] = entry.subject;
		obj[`${name}Ready`] = entry.ready;
		globalRxNamedReturnRegistry.set(entry.registryKey, obj);
		return obj as NamedDispatch<N, A> &
			NamedReducerGet<N, S> &
			NamedReducerUse<N, S> &
			NamedReducerSubject<N, S> &
			NamedReducerReady<N>;
	}

	const entry = makeReducerEntry({ initialState, reducer });
	return [entry.dispatch, entry.get, entry.useValue, entry.subject, entry.ready] as const;
}

/** Returns the BehaviorSubject for a named reducer entry, if it exists. */
export function getRxReducerSubject<S = unknown>(
	name: string,
	storageOptions?: RxStateStorageOptions,
) {
	const resolvedStorageOptions = resolveNamedStorageOptions(KIND, name, storageOptions);
	const registryKey = makeNamedRegistryKey(KIND, name, resolvedStorageOptions);
	const entry = globalRxRegistry.get(registryKey) as RxReducerEntry<S, never> | undefined;
	return entry?.subject;
}

/** Returns the concrete storage backends that currently contain a named reducer. */
export function findRxReducerStorages(name: string) {
	return findRxStorages(KIND, name, listRegisteredStorageOptions(KIND, name));
}

/** Returns every confirmed storage location for a named reducer. */
export function getRxReducerStorageInfo(
	name: string,
	storageOptions?: RxStateStorageOptions,
) {
	return getRxStorageInfo(
		KIND,
		name,
		listRegisteredStorageOptions(KIND, name),
		storageOptions,
	);
}

/** Clears a named reducer entry and removes its persisted value. */
export async function clearRxReducer(
	name: string,
	storageOptions?: RxStateStorageOptions,
) {
	const resolvedStorageOptions = resolveNamedStorageOptions(KIND, name, storageOptions);
	const registryKey = makeNamedRegistryKey(KIND, name, resolvedStorageOptions);
	const entry = globalRxRegistry.get(registryKey);

	if (entry) {
		entry.subject.complete();
		globalRxRegistry.delete(registryKey);
		deleteNamedReturn(registryKey);
	}

	const adapter = await createStorageAdapter(resolvedStorageOptions);
	await adapter.removeItem(`${resolvedStorageOptions.keyPrefix}${KIND}:${name}`);
	deleteDefaultStorageAlias(KIND, name, resolvedStorageOptions);
}

export async function hasRxReducer(
	name: string,
	storageOptions: RxStateStorageOptions,
) {
	const options = normalizeStorageOptions(storageOptions);
	const adapter = await createStorageAdapter(options);

	return adapter.hasItem(
		getPersistedItemKey(options.keyPrefix, KIND, name),
	);
}

/** Completes and removes every named reducer entry from the registry. */
export function clearRxReducerAll() {
	Array.from(globalRxRegistry.entries()).forEach(([key, entry]) => {
		if (key.startsWith(`${KIND}|`)) {
			entry.subject.complete();
			globalRxRegistry.delete(key);
		}
	});
	clearNamedReturns(KIND);
}

/** Lists currently registered named reducer entries with their storage metadata. */
export function listRxReducers() {
	return Array.from(globalRxRegistry.entries())
		.filter(([key]) => key.startsWith(`${KIND}|`))
		.map(([, entry]) => ({
			registryKey: entry.registryKey,
			storageKey: entry.storageKey,
			storage: entry.storage,
		}));
}

/** Lists name -> default storage aliases learned by createRxReducer named mode. */
export function listRxReducerDefaultStorageAliases() {
	return listDefaultStorageAliases(KIND);
}

/**
 * Named reducer helper that always returns the tuple shape.
 *
 * Use this when you want tuple ergonomics plus named global singleton behavior
 * and optional persistence.
 */
export function createRxReducerTuple<S, A>(
	initialState: S,
	reducer: RxReducer<S, A>,
	name: string,
	storageOptions?: RxStateStorageOptions,
) {
	const entry = getOrCreateNamedEntry(initialState, reducer, name, storageOptions);
	return [entry.dispatch, entry.get, entry.useValue, entry.subject, entry.ready] as const;
}
