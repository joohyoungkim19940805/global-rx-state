"use client";

import { useSyncExternalStore } from "react";
import { BehaviorSubject } from "rxjs";
import type { RxBaseEntry, RxRegistryKind, RxStateStorageOptions } from "./types";
import { createStorageAdapter, getPersistedItemKey } from "./storage";

function createUseValue<T>(subject: BehaviorSubject<T>) {
	const get = () => subject.getValue();

	const subscribe = (onStoreChange: () => void) => {
		const sub = subject.subscribe(() => {
			onStoreChange();
		});

		return () => {
			sub.unsubscribe();
		};
	};

	const useValue = () => {
		return useSyncExternalStore(subscribe, get, get);
	};

	return { get, useValue };
}

/**
 * Creates a non-persistent entry for anonymous tuple mode.
 *
 * Anonymous tuple mode is intentionally not registered globally and does not use
 * stack traces as hidden keys. Each call creates a fresh store. Declare tuple
 * mode at module top-level and export the returned functions when the store must
 * be shared across components.
 */
export function makeVolatileEntry<T>(params: {
	kind: RxRegistryKind;
	defaultValue: T;
}): RxBaseEntry<T> {
	const subject = new BehaviorSubject<T>(params.defaultValue);
	const { get, useValue } = createUseValue(subject);

	return {
		subject,
		get,
		useValue,
		ready: Promise.resolve(),
		storage: "in-memory",
		registryKey: `${params.kind}|anonymous|volatile`,
		storageKey: "",
	};
}

/**
 * Creates the internal RxJS-backed entry used by named state and reducer APIs.
 *
 * The BehaviorSubject is intentionally created synchronously from defaultValue so
 * get(), dispatch/set(), and React hooks are immediately usable. Persistent
 * storage is hydrated asynchronously through ready. If the entry is changed
 * before hydration finishes, the newer in-memory value wins and the older
 * persisted value is not replayed over it.
 */
export function makeBaseEntry<T>(params: {
	kind: RxRegistryKind;
	defaultValue: T;
	registryKey: string;
	logicalKey: string;
	storageOptions: Required<RxStateStorageOptions>;
	onChangeRef: { current: number };
}): RxBaseEntry<T> {
	const subject = new BehaviorSubject<T>(params.defaultValue);
	const storageKey = getPersistedItemKey(
		params.storageOptions.keyPrefix,
		params.kind,
		params.logicalKey,
	);
	const adapterPromise = createStorageAdapter(params.storageOptions);

	const ready = adapterPromise
		.then(async (adapter) => {
			const persisted = await adapter.getItem<T>(storageKey);

			if (persisted !== undefined && params.onChangeRef.current === 0) {
				subject.next(persisted);
			}
		})
		.catch(() => {
			// Storage hydration must not break synchronous state usage.
		});

	const { get, useValue } = createUseValue(subject);

	return {
		subject,
		get,
		useValue,
		ready,
		storage: params.storageOptions.storage,
		registryKey: params.registryKey,
		storageKey,
		storageOptions: params.storageOptions,
	};
}

/** Persists the next value without making persistence failure break runtime state. */
export function persistNextValue<T>(params: {
	storageOptions: Required<RxStateStorageOptions>;
	storageKey: string;
	value: T;
}) {
	void createStorageAdapter(params.storageOptions)
		.then((adapter) => adapter.setItem(params.storageKey, params.value))
		.catch(() => {
			// Keep BehaviorSubject as the source of truth when persistence fails.
		});
}
