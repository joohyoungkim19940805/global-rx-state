import type {
	RxRegistryKind,
	RxStateResolvedStorage,
	RxStateStorage,
	RxStateStorageInfo,
	RxStateStorageOptions,
} from "./types";

type LocalForageModule = typeof import("localforage");
type LocalForageInstance = ReturnType<LocalForageModule["createInstance"]>;

/**
 * Minimal async storage interface used by the package.
 *
 * All backends are normalized to Promise-based methods so in-memory,
 * sessionStorage, and localForage-backed storage can share the same state logic.
 */
export interface StorageAdapter {
	storage: RxStateResolvedStorage;
	getItem<T>(key: string): Promise<T | undefined>;
	hasItem(key: string): Promise<boolean>;
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
		storage:
			storageOptions?.storage === "IndexedDB"
				? "indexeddb"
				: storageOptions?.storage === "WebSQL"
					? "websql"
					: storageOptions?.storage === "localStorage"
						? "localstorage"
						: storageOptions?.storage === "sessionStorage"
							? "sessionstorage"
							: (storageOptions?.storage ?? "in-memory"),
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
		storage: "in-memory",
		async getItem<T>(key: string) {
			return memoryStorage.has(key) ? (memoryStorage.get(key) as T) : undefined;
		},
		async hasItem(key: string) {
			return memoryStorage.has(key);
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
		storage: "sessionstorage",
		async getItem<T>(key: string) {
			const raw = getStorage().getItem(key);
			return raw === null ? undefined : (JSON.parse(raw) as T);
		},
		async hasItem(key: string) {
			return getStorage().getItem(key) !== null;
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
		await instance.ready();

		const storage = getResolvedLocalForageStorage(localforage, instance);

		return {
			storage,
			async getItem<T>(key: string) {
				const value = await instance.getItem<T>(key);
				return value === null ? undefined : value;
			},
			async hasItem(key: string) {
				return (await instance.keys()).includes(key);
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

function getResolvedLocalForageStorage(
	localforage: LocalForageModule,
	instance: LocalForageInstance,
): RxStateResolvedStorage {
	const driver = instance.driver();

	if (driver === localforage.INDEXEDDB) {
		return "indexeddb";
	}

	if (driver === localforage.WEBSQL) {
		return "websql";
	}

	if (driver === localforage.LOCALSTORAGE) {
		return "localstorage";
	}

	throw new Error(`Unsupported localForage driver: ${String(driver)}`);
}

async function setLocalForageDriver(
	localforage: LocalForageModule,
	instance: LocalForageInstance,
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


/** Returns every confirmed storage location for one state/reducer key. */
export async function getRxStorageInfo(
	kind: RxRegistryKind,
	key: string,
	registeredStorageOptions: Required<RxStateStorageOptions>[],
	storageOptions?: RxStateStorageOptions,
): Promise<RxStateStorageInfo[]> {
	const candidates = new Map<string, Required<RxStateStorageOptions>>();
	const requestedStorage =
		storageOptions?.storage === undefined
			? undefined
			: normalizeStorageOptions({ storage: storageOptions.storage }).storage;

	registeredStorageOptions.forEach((candidate) => {
		if (
			(storageOptions?.name !== undefined && candidate.name !== storageOptions.name) ||
			(storageOptions?.storeName !== undefined &&
				candidate.storeName !== storageOptions.storeName) ||
			(storageOptions?.keyPrefix !== undefined &&
				candidate.keyPrefix !== storageOptions.keyPrefix) ||
			(requestedStorage === "auto" && candidate.storage !== "auto") ||
			(requestedStorage !== undefined &&
				requestedStorage !== "auto" &&
				candidate.storage !== requestedStorage &&
				candidate.storage !== "auto")
		) {
			return;
		}

		candidates.set(getStorageRegistryPart(candidate), candidate);
	});

	if (storageOptions?.storage !== undefined) {
		const candidate = normalizeStorageOptions(storageOptions);
		candidates.set(getStorageRegistryPart(candidate), candidate);
	} else {
		const base = normalizeStorageOptions(storageOptions);

		(["in-memory", "indexeddb", "websql", "localstorage", "sessionstorage"] as const).forEach(
			(storage) => {
				const candidate = { ...base, storage };
				candidates.set(getStorageRegistryPart(candidate), candidate);
			},
		);
	}

	const infos = new Map<string, RxStateStorageInfo>();

	for (const candidate of candidates.values()) {
		try {
			const adapter = await createStorageAdapter(candidate);
			const storageKey = getPersistedItemKey(candidate.keyPrefix, kind, key);

			if (
				!(await adapter.hasItem(storageKey)) ||
				(requestedStorage !== undefined &&
					requestedStorage !== "auto" &&
					adapter.storage !== requestedStorage)
			) {
				continue;
			}

			const info = {
				key,
				storageKey,
				fullKey:
					adapter.storage === "localstorage"
						? `${candidate.name}/${
								candidate.storeName === "keyvaluepairs"
									? ""
									: `${candidate.storeName}/`
							}${storageKey}`
						: storageKey,
				storage: adapter.storage,
				name: candidate.name,
				storeName: candidate.storeName,
				keyPrefix: candidate.keyPrefix,
			} satisfies RxStateStorageInfo;

			infos.set(
				info.storage === "in-memory" || info.storage === "sessionstorage"
					? JSON.stringify([info.storage, info.storageKey])
					: JSON.stringify([info.storage, info.name, info.storeName, info.storageKey]),
				info,
			);
		} catch {
			// Ignore unavailable storage backends while discovering locations.
		}
	}

	return Array.from(infos.values());
}

/** Returns the unique concrete backends that currently contain one key. */
export async function findRxStorages(
	kind: RxRegistryKind,
	key: string,
	registeredStorageOptions: Required<RxStateStorageOptions>[],
) {
	return Array.from(
		new Set(
			(await getRxStorageInfo(kind, key, registeredStorageOptions)).map(
				(info) => info.storage,
			),
		),
	);
}
