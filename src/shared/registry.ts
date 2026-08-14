import type { RxBaseEntry, RxRegistryKind, RxStateStorageOptions } from "./types";
import { getPersistedItemKey, getStorageRegistryPart, normalizeStorageOptions } from "./storage";

/**
 * The registry stores entries with different value types in the same Map.
 * RxBaseEntry<T> is intentionally erased here because BehaviorSubject<T> is not
 * assignable to BehaviorSubject<unknown> across arbitrary T.
 */
type AnyRxEntry = RxBaseEntry<any>;

const g = globalThis as typeof globalThis & {
	__globalRxStateRegistry?: Map<string, AnyRxEntry>;
	__globalRxStateNameDefaultStorage?: Map<string, Required<RxStateStorageOptions>>;
	__globalRxStateNamedReturnRegistry?: Map<string, Record<string, unknown>>;
};

// Keep registries on globalThis so multiple imports and HMR reloads share named state.
g.__globalRxStateRegistry ??= new Map<string, AnyRxEntry>();
g.__globalRxStateNameDefaultStorage ??= new Map<string, Required<RxStateStorageOptions>>();
g.__globalRxStateNamedReturnRegistry ??= new Map<string, Record<string, unknown>>();

export const globalRxRegistry = g.__globalRxStateRegistry;
export const globalRxNamedReturnRegistry = g.__globalRxStateNamedReturnRegistry;
const nameDefaultStorage = g.__globalRxStateNameDefaultStorage;

function makeAliasKey(kind: RxRegistryKind, name: string) {
	return `${kind}|${name}`;
}

/**
 * Resolves the storage options for a named entry.
 *
 * If storage options are omitted, this reuses the first storage alias registered
 * for the same kind/name pair. If that pair has never been seen, it registers
 * in-memory as the default alias. Explicit storage options always point to their
 * own storage entry; they only become the default alias when no alias exists yet.
 */
export function resolveNamedStorageOptions(
	kind: RxRegistryKind,
	name: string,
	storageOptions?: RxStateStorageOptions,
) {
	const aliasKey = makeAliasKey(kind, name);

	if (!storageOptions) {
		const existing = nameDefaultStorage.get(aliasKey);

		if (existing) {
			return existing;
		}

		const next = normalizeStorageOptions({ storage: "in-memory" });
		nameDefaultStorage.set(aliasKey, next);
		return next;
	}

	const next = normalizeStorageOptions(storageOptions);

	if (!nameDefaultStorage.has(aliasKey)) {
		nameDefaultStorage.set(aliasKey, next);
	}

	return next;
}

/** Creates the registry key for a named entry scoped by kind and storage options. */
export function makeNamedRegistryKey(
	kind: RxRegistryKind,
	name: string,
	options: Required<RxStateStorageOptions>,
) {
	return `${kind}|named|${getStorageRegistryPart(options)}|${name}`;
}

/** Returns every registered storage configuration for one named entry. */
export function listRegisteredStorageOptions(kind: RxRegistryKind, name: string) {
	const options = new Map<string, Required<RxStateStorageOptions>>();

	globalRxRegistry.forEach((entry, registryKey) => {
		if (
			registryKey.startsWith(`${kind}|named|`) &&
			entry.storageOptions &&
			entry.storageKey ===
				getPersistedItemKey(entry.storageOptions.keyPrefix, kind, name)
		) {
			options.set(getStorageRegistryPart(entry.storageOptions), entry.storageOptions);
		}
	});

	return Array.from(options.values());
}

/** Removes the cached named API object for a registry entry. */
export function deleteNamedReturn(registryKey: string) {
	globalRxNamedReturnRegistry.delete(registryKey);
}

/** Removes cached named API objects that belong to the given registry kind. */
export function clearNamedReturns(kind: RxRegistryKind) {
	Array.from(globalRxNamedReturnRegistry.keys()).forEach((key) => {
		if (key.startsWith(`${kind}|`)) {
			globalRxNamedReturnRegistry.delete(key);
		}
	});
}

/** Removes a name's default storage alias when the cleared storage matches it. */
export function deleteDefaultStorageAlias(
	kind: RxRegistryKind,
	name: string,
	storageOptions?: RxStateStorageOptions,
) {
	const aliasKey = makeAliasKey(kind, name);
	const existing = nameDefaultStorage.get(aliasKey);
	const storage = storageOptions?.storage;

	if (!existing || (storage && existing.storage !== storage)) {
		return;
	}

	nameDefaultStorage.delete(aliasKey);
}

/** Lists every learned default storage alias for debugging and tooling. */
export function listDefaultStorageAliases(kind?: RxRegistryKind) {
	return Array.from(nameDefaultStorage.entries())
		.filter(([aliasKey]) => !kind || aliasKey.startsWith(`${kind}|`))
		.map(([aliasKey, options]) => {
			const separatorIndex = aliasKey.indexOf("|");
			return {
				kind: aliasKey.slice(0, separatorIndex) as RxRegistryKind,
				name: aliasKey.slice(separatorIndex + 1),
				storage: options.storage,
			};
		});
}
