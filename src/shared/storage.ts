import type { RxStateStorage, RxStateStorageOptions } from "./types";

type LocalForageModule = typeof import("localforage");

/**
 * Minimal async storage interface used by the package.
 *
 * All backends are normalized to Promise-based methods so in-memory,
 * sessionStorage, and localForage-backed storage can share the same state logic.
 */
export interface StorageAdapter {
	getItem<T>(key: string): Promise<T | undefined>;
	setItem<T>(key: string, value: T): Promise<void>;
	removeItem(key: string): Promise<void>;
}

const g = globalThis as typeof globalThis & {
	__rxStateMemoryStorage?: Map<string, unknown>;
	__rxStateLocalForageAdapters?: Map<string, Promise<StorageAdapter>>;
};

// The memory store and localForage adapter cache are global to survive HMR.
g.__rxStateMemoryStorage ??= new Map<string, unknown>();
g.__rxStateLocalForageAdapters ??= new Map<string, Promise<StorageAdapter>>();

const memoryStorage = g.__rxStateMemoryStorage;
const localForageAdapters = g.__rxStateLocalForageAdapters;

/** Fills storage options with stable defaults. */
export function normalizeStorageOptions(
	storageOptions?: RxStateStorageOptions,
): Required<RxStateStorageOptions> {
	return {
		storage: storageOptions?.storage ?? "in-memory",
		name: storageOptions?.name ?? "rx-state-core",
		storeName: storageOptions?.storeName ?? "state",
		keyPrefix: storageOptions?.keyPrefix ?? "rx-state:",
	};
}

/**
 * Converts storage options into the storage-scoped part of a registry key.
 *
 * The same named key with different storage options must be treated as a
 * different entry.
 */
export function getStorageRegistryPart(options: Required<RxStateStorageOptions>) {
	return [options.storage, options.name, options.storeName, options.keyPrefix].join("|");
}

/** Builds the actual persisted key used inside the selected backend. */
export function getPersistedItemKey(
	keyPrefix: string,
	kind: string,
	stateKey: string,
) {
	return `${keyPrefix}${kind}:${stateKey}`;
}

/** Creates or reuses the appropriate storage adapter. */
export async function createStorageAdapter(
	options: Required<RxStateStorageOptions>,
): Promise<StorageAdapter> {
	if (options.storage === "in-memory") {
		return {
			async getItem<T>(key: string) {
				return memoryStorage.has(key) ? (memoryStorage.get(key) as T) : undefined;
			},
			async setItem<T>(key: string, value: T) {
				memoryStorage.set(key, value);
			},
			async removeItem(key: string) {
				memoryStorage.delete(key);
			},
		};
	}

	if (options.storage === "sessionstorage") {
		return createWebStorageAdapter(() => globalThis.sessionStorage);
	}

	return getLocalForageAdapter(options);
}

function createWebStorageAdapter(getStorage: () => Storage): StorageAdapter {
	return {
		async getItem<T>(key: string) {
			const raw = getStorage().getItem(key);
			return raw === null ? undefined : (JSON.parse(raw) as T);
		},
		async setItem<T>(key: string, value: T) {
			getStorage().setItem(key, JSON.stringify(value));
		},
		async removeItem(key: string) {
			getStorage().removeItem(key);
		},
	};
}

function getLocalForageAdapter(
	options: Required<RxStateStorageOptions>,
): Promise<StorageAdapter> {
	const adapterKey = getStorageRegistryPart(options);
	const cached = localForageAdapters.get(adapterKey);

	if (cached) {
		return cached;
	}

	const pending = (async () => {
		const localforage = await import("localforage");
		const instance = localforage.createInstance({
			name: options.name,
			storeName: options.storeName,
		});

		await setLocalForageDriver(localforage, instance, options.storage);

		return {
			async getItem<T>(key: string) {
				const value = await instance.getItem<T>(key);
				return value === null ? undefined : value;
			},
			async setItem<T>(key: string, value: T) {
				await instance.setItem(key, value);
			},
			async removeItem(key: string) {
				await instance.removeItem(key);
			},
		} satisfies StorageAdapter;
	})();

	localForageAdapters.set(adapterKey, pending);
	return pending;
}

async function setLocalForageDriver(
	localforage: LocalForageModule,
	instance: LocalForageModule,
	storage: RxStateStorage,
) {
	if (storage === "auto") {
		await instance.setDriver([
			localforage.INDEXEDDB,
			localforage.WEBSQL,
			localforage.LOCALSTORAGE,
		]);
		return;
	}

	if (storage === "indexeddb") {
		await instance.setDriver(localforage.INDEXEDDB);
		return;
	}

	if (storage === "websql") {
		await instance.setDriver(localforage.WEBSQL);
		return;
	}

	if (storage === "localstorage") {
		await instance.setDriver(localforage.LOCALSTORAGE);
	}
}
