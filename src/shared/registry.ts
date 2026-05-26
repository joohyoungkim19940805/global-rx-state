import type { RxBaseEntry, RxRegistryKind, RxStateStorageOptions } from "./types";
import { getStorageRegistryPart, normalizeStorageOptions } from "./storage";

/**
 * The registry stores entries with different value types in the same Map.
 * RxBaseEntry<T> is intentionally erased here because BehaviorSubject<T> is not
 * assignable to BehaviorSubject<unknown> across arbitrary T.
 */
type AnyRxEntry = RxBaseEntry<any>;

const g = globalThis as typeof globalThis & {
	__globalRxStateRegistry?: Map<string, AnyRxEntry>;
	__globalRxStateNameDefaultStorage?: Map<string, Required<RxStateStorageOptions>>;
};

// Keep registries on globalThis so multiple imports and HMR reloads share named state.
g.__globalRxStateRegistry ??= new Map<string, AnyRxEntry>();
g.__globalRxStateNameDefaultStorage ??= new Map<string, Required<RxStateStorageOptions>>();

export const globalRxRegistry = g.__globalRxStateRegistry;
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
