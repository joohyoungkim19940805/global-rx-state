import type { BehaviorSubject } from "rxjs";
import type {
	RxBaseEntry,
	RxStateResolvedStorage,
	RxStateStorage,
	RxStateStorageInfo,
	RxStateStorageOptions,
} from "../shared";

export type {
	RxStateResolvedStorage,
	RxStateStorage,
	RxStateStorageInfo,
	RxStateStorageOptions,
};

/**
 * A value update accepted by every setter returned from createRxState.
 *
 * It mirrors React's useState setter shape: pass either the next value directly,
 * or a function that receives the previous value and returns the next value.
 */
export type Updater<T> = T | ((prev: T) => T);

/** Named setter shape: createRxState(0, "count") exposes setCount(...). */
export type NamedSet<N extends string, T> = {
	[K in `set${Capitalize<N>}`]: (u: Updater<T>) => void;
};

/** Named getter shape: createRxState(0, "count") exposes getCount(). */
export type NamedGet<N extends string, T> = {
	[K in `get${Capitalize<N>}`]: () => T;
};

/** Named React hook shape: createRxState(0, "count") exposes useCount(). */
export type NamedUse<N extends string, T> = {
	[K in `use${Capitalize<N>}`]: () => T;
};

/** Named subject shape: createRxState(0, "count") exposes countSubject. */
export type NamedSubject<N extends string, T> = {
	[K in `${N}Subject`]: BehaviorSubject<T>;
};

/** Named hydration promise shape: createRxState(0, "count") exposes countReady. */
export type NamedReady<N extends string> = {
	[K in `${N}Ready`]: Promise<void>;
};

/** Internal registry entry used by createRxState. */
export interface RxStateEntry<T> extends RxBaseEntry<T> {
	set: (u: Updater<T>) => void;
}

/** Combined return type for named state mode. */
export type NamedRxState<N extends string, T> = NamedSet<N, T> &
	NamedGet<N, T> &
	NamedUse<N, T> &
	NamedSubject<N, T> &
	NamedReady<N>;
