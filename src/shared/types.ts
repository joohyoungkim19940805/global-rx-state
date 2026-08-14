import type { BehaviorSubject } from "rxjs";

/**
 * Storage backends supported by the package.
 *
 * - in-memory: Uses a process/tab-local Map. This is the default when storage is
 *   omitted and no named storage alias has been registered yet.
 * - auto: Uses localForage with the best available driver in this order:
 *   IndexedDB > WebSQL > localStorage.
 * - indexeddb/websql/localstorage: Forces a specific localForage driver.
 * - sessionstorage: Uses browser sessionStorage, scoped to the current tab/session.
 */
export type RxStateStorage =
	| "in-memory"
	| "auto"
	| "indexeddb"
	| "IndexedDB"
	| "websql"
	| "WebSQL"
	| "localstorage"
	| "localStorage"
	| "sessionstorage"
	| "sessionStorage";

/** Concrete storage backend after aliases and auto driver selection are resolved. */
export type RxStateResolvedStorage =
	| "in-memory"
	| "indexeddb"
	| "websql"
	| "localstorage"
	| "sessionstorage";

/** Detailed location of one named state/reducer value. */
export interface RxStateStorageInfo {
	/** Name passed to createRxState/createRxReducer. */
	key: string;
	/** Item key passed to the storage adapter/localForage instance. */
	storageKey: string;
	/** Physical flat key when the backend exposes one; otherwise storageKey. */
	fullKey: string;
	/** Concrete backend. auto is resolved to the driver actually in use. */
	storage: RxStateResolvedStorage;
	/** localForage database name. */
	name: string;
	/** localForage store name. */
	storeName: string;
	/** Prefix used to build storageKey. */
	keyPrefix: string;
}

/**
 * Storage options shared by rx-state, rx-reducer, helper APIs, and persistence.
 *
 * Storage is always configured through this object shape for API consistency:
 *
 * ```ts
 * createRxState(0, "count", { storage: "auto" });
 * createRxReducer(0, reducer, "count", { storage: "auto" });
 * createRxStateTuple(0, "count", { storage: "auto" });
 * createRxReducerTuple(0, reducer, "count", { storage: "auto" });
 * ```
 *
 * Anonymous tuple mode does not accept storage options because it has no stable
 * storage key. Use named mode or the named tuple helpers when persistence is
 * required.
 */
export interface RxStateStorageOptions {
	/** Storage backend. Defaults to in-memory. */
	storage?: RxStateStorage;
	/** localForage database name. Applies to auto/indexeddb/websql/localstorage. */
	name?: string;
	/** localForage store name. Applies to auto/indexeddb/websql/localstorage. */
	storeName?: string;
	/** Prefix for the actual persisted item key. */
	keyPrefix?: string;
}

/**
 * Shared registry entry shape for every BehaviorSubject-backed primitive.
 *
 * State and reducer APIs expose different public methods, but both store the
 * current value in a BehaviorSubject and both hydrate from the same storage
 * adapter layer.
 */
export interface RxBaseEntry<T> {
	subject: BehaviorSubject<T>;
	get: () => T;
	useValue: () => T;
	ready: Promise<void>;
	storage: RxStateStorage;
	registryKey: string;
	storageKey: string;
	storageOptions?: Required<RxStateStorageOptions>;
}

/** Registry namespace. Different namespaces can reuse the same name safely. */
export type RxRegistryKind = "state" | "reducer";
