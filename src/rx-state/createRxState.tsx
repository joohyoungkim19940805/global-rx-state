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
	NamedGet,
	NamedReady,
	NamedSet,
	NamedSubject,
	NamedUse,
	RxStateEntry,
	Updater,
} from "./types";

const KIND = "state" as const;

function cap(s: string) {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Creates the internal entry for createRxState.
 *
 * When storageOptions is omitted, the entry is volatile: it is not registered
 * globally and does not persist. This is used by anonymous tuple mode.
 *
 * When storageOptions is provided, the entry extends the shared
 * BehaviorSubject-backed base with a React useState-like setter. Persistence is
 * handled after the BehaviorSubject is updated, so runtime state stays
 * responsive even when storage is slow or fails.
 */
function makeStateEntry<T>(params: {
	defaultValue: T;
	registryKey?: string;
	logicalKey?: string;
	storageOptions?: Required<RxStateStorageOptions>;
}): RxStateEntry<T> {
	const changeRef = { current: 0 };
	const base = params.storageOptions
		? makeBaseEntry({
				kind: KIND,
				defaultValue: params.defaultValue,
				registryKey: params.registryKey ?? "",
				logicalKey: params.logicalKey ?? "",
				storageOptions: params.storageOptions,
				onChangeRef: changeRef,
			})
		: makeVolatileEntry({ kind: KIND, defaultValue: params.defaultValue });

	const set = (u: Updater<T>) => {
		const prev = base.subject.getValue();
		const next = typeof u === "function" ? (u as (p: T) => T)(prev) : u;
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

	return { ...base, set };
}

function getOrCreateNamedEntry<T>(
	defaultValue: T,
	name: string,
	storageOptionsInput?: RxStateStorageOptions,
): RxStateEntry<T> {
	const storageOptions = resolveNamedStorageOptions(KIND, name, storageOptionsInput);
	const registryKey = makeNamedRegistryKey(KIND, name, storageOptions);

	if (!globalRxRegistry.has(registryKey)) {
		globalRxRegistry.set(
			registryKey,
			makeStateEntry({
				defaultValue,
				registryKey,
				logicalKey: name,
				storageOptions,
			}),
		);
	}

	return globalRxRegistry.get(registryKey) as RxStateEntry<T>;
}

/**
 * Generic RxJS-backed state primitive that feels like React useState, but can be
 * reused globally and optionally persisted.
 *
 * Tuple mode without a name returns a fresh store for each call:
 *
 * ```ts
 * export const [setCount, getCount, useCount, countSubject, countReady] =
 * 	createRxState(0);
 * ```
 *
 * Tuple mode must be declared at module top-level and then imported by
 * components. Do not call tuple mode inside React components or other functions.
 * It is intentionally not cached by stack trace and does not accept storage
 * options because anonymous calls have no stable persistence key.
 */
export function createRxState<T>(
	defaultValue: T,
): readonly [(u: Updater<T>) => void, () => T, () => T, BehaviorSubject<T>, Promise<void>];

/**
 * Named mode with a global cache.
 *
 * The returned object has keys derived from the provided name:
 *
 * ```ts
 * const { setCount, getCount, useCount, countSubject, countReady } =
 * 	createRxState(0, "count", { storage: "auto" });
 * ```
 *
 * Reusing the same name and storage points to the same BehaviorSubject. If the
 * storage option is omitted, the first registered storage alias for that name is
 * reused. If no alias exists yet, the name defaults to in-memory.
 *
 * Named mode is safe to call from React components. The named API object is
 * cached by registry key, so repeated calls with the same name/storage return
 * the same setter/getter/hook/subject references.
 */
export function createRxState<T, N extends string>(
	defaultValue: T,
	name: N,
	storageOptions?: RxStateStorageOptions,
): NamedSet<N, T> & NamedGet<N, T> & NamedUse<N, T> & NamedSubject<N, T> & NamedReady<N>;

export function createRxState<T, N extends string>(
	defaultValue: T,
	name?: N,
	storageOptions?: RxStateStorageOptions,
) {
	if (name !== undefined && typeof name !== "string") {
		throw new TypeError(
			"Anonymous tuple mode does not accept storage options. Use named mode or createRxStateTuple for persisted tuple state.",
		);
	}

	if (name) {
		const entry = getOrCreateNamedEntry(defaultValue, name, storageOptions);
		const cached = globalRxNamedReturnRegistry.get(entry.registryKey);

		if (cached) {
			return cached as NamedSet<N, T> &
				NamedGet<N, T> &
				NamedUse<N, T> &
				NamedSubject<N, T> &
				NamedReady<N>;
		}

		const obj: Record<string, unknown> = {};
		obj[`set${cap(name)}`] = entry.set;
		obj[`get${cap(name)}`] = entry.get;
		obj[`use${cap(name)}`] = entry.useValue;
		obj[`${name}Subject`] = entry.subject;
		obj[`${name}Ready`] = entry.ready;
		globalRxNamedReturnRegistry.set(entry.registryKey, obj);
		return obj as NamedSet<N, T> &
			NamedGet<N, T> &
			NamedUse<N, T> &
			NamedSubject<N, T> &
			NamedReady<N>;
	}

	const entry = makeStateEntry({ defaultValue });
	return [entry.set, entry.get, entry.useValue, entry.subject, entry.ready] as const;
}

/** Returns the BehaviorSubject for a named state entry, if it exists. */
export function getRxSubject<T = unknown>(
	name: string,
	storageOptions?: RxStateStorageOptions,
) {
	const resolvedStorageOptions = resolveNamedStorageOptions(KIND, name, storageOptions);
	const registryKey = makeNamedRegistryKey(KIND, name, resolvedStorageOptions);
	const entry = globalRxRegistry.get(registryKey) as RxStateEntry<T> | undefined;
	return entry?.subject;
}

/** Returns whether a named state exists in the specified storage. */
export async function hasRxState(
	name: string,
	storageOptions: RxStateStorageOptions,
) {
	const options = normalizeStorageOptions(storageOptions);
	const adapter = await createStorageAdapter(options);

	return adapter.hasItem(
		getPersistedItemKey(options.keyPrefix, KIND, name),
	);
}

/** Returns the concrete storage backends that currently contain a named state. */
export function findRxStateStorages(name: string) {
	return findRxStorages(KIND, name, listRegisteredStorageOptions(KIND, name));
}

/** Returns every confirmed storage location for a named state. */
export function getRxStateStorageInfo(
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

/** Clears a named state entry and removes its persisted value. */
export async function clearRxState(
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

/** Completes and removes every named state entry from the registry. */
export function clearRxStateAll() {
	Array.from(globalRxRegistry.entries()).forEach(([key, entry]) => {
		if (key.startsWith(`${KIND}|`)) {
			entry.subject.complete();
			globalRxRegistry.delete(key);
		}
	});
	clearNamedReturns(KIND);
}

/** Lists currently registered named state entries with their storage metadata. */
export function listRxStates() {
	return Array.from(globalRxRegistry.entries())
		.filter(([key]) => key.startsWith(`${KIND}|`))
		.map(([, entry]) => ({
			registryKey: entry.registryKey,
			storageKey: entry.storageKey,
			storage: entry.storage,
		}));
}

/** Lists name -> default storage aliases learned by createRxState named mode. */
export function listRxStateDefaultStorageAliases() {
	return listDefaultStorageAliases(KIND);
}

/**
 * Named state helper that always returns the tuple shape.
 *
 * Use this when you want tuple ergonomics plus named global singleton behavior
 * and optional persistence.
 */
export function createRxStateTuple<T>(
	defaultValue: T,
	name: string,
	storageOptions?: RxStateStorageOptions,
) {
	const entry = getOrCreateNamedEntry(defaultValue, name, storageOptions);
	return [entry.set, entry.get, entry.useValue, entry.subject, entry.ready] as const;
}
