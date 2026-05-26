import type { BehaviorSubject } from "rxjs";
import type { RxBaseEntry, RxStateStorage, RxStateStorageOptions } from "../shared";

export type { RxStateStorage, RxStateStorageOptions };

/**
 * Reducer function used by createRxReducer.
 *
 * A reducer receives the previous state and an action, then returns the next
 * state. This keeps state transition rules in one place instead of spreading
 * ad-hoc setState calls throughout an app.
 */
export type RxReducer<S, A> = (state: S, action: A) => S;

/** Dispatch function returned from createRxReducer. */
export type RxDispatch<A> = (action: A) => void;

/** Named dispatch shape: createRxReducer(..., "cart") exposes dispatchCart(...). */
export type NamedDispatch<N extends string, A> = {
	[K in `dispatch${Capitalize<N>}`]: RxDispatch<A>;
};

/** Named getter shape: createRxReducer(..., "cart") exposes getCart(). */
export type NamedReducerGet<N extends string, S> = {
	[K in `get${Capitalize<N>}`]: () => S;
};

/** Named React hook shape: createRxReducer(..., "cart") exposes useCart(). */
export type NamedReducerUse<N extends string, S> = {
	[K in `use${Capitalize<N>}`]: () => S;
};

/** Named subject shape: createRxReducer(..., "cart") exposes cartSubject. */
export type NamedReducerSubject<N extends string, S> = {
	[K in `${N}Subject`]: BehaviorSubject<S>;
};

/** Named hydration promise shape: createRxReducer(..., "cart") exposes cartReady. */
export type NamedReducerReady<N extends string> = {
	[K in `${N}Ready`]: Promise<void>;
};

/** Internal registry entry used by createRxReducer. */
export interface RxReducerEntry<S, A> extends RxBaseEntry<S> {
	dispatch: RxDispatch<A>;
}

/** Combined return type for named reducer mode. */
export type NamedRxReducer<N extends string, S, A> = NamedDispatch<N, A> &
	NamedReducerGet<N, S> &
	NamedReducerUse<N, S> &
	NamedReducerSubject<N, S> &
	NamedReducerReady<N>;
