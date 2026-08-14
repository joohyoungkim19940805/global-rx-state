# @byeolnaerim/global-rx-state

RxJS로 동작하는 작은 전역 React 상태 primitive입니다. named singleton store, reducer, 선택적 persistence를 지원합니다.

## 설치

```bash
npm install @byeolnaerim/global-rx-state rxjs react
```

## Anonymous tuple mode

Anonymous tuple mode는 호출할 때마다 새로운 store를 생성합니다. 반드시 모듈 최상위에서 선언하고, 반환된 함수들을 export해서 사용하세요.

```ts
// ./state
import { createRxState } from "@byeolnaerim/global-rx-state";

export const [setCount, getCount, useCount, countSubject, countReady] =
	createRxState(0);
```

React 컴포넌트에서는 export된 함수들을 import해서 사용합니다.

```tsx
import { useCount } from "./state";

export function Counter() {
	const count = useCount();
	return <div>{count}</div>;
}
```

React 컴포넌트나 다른 함수 내부에서 anonymous tuple mode를 호출하지 마세요. 호출할 때마다 새로운 store가 생성됩니다.

```tsx
function Counter() {
	// 이렇게 사용하지 마세요.
	const [setCount, getCount, useCount] = createRxState(0);
	return <div>{useCount()}</div>;
}
```

Anonymous tuple mode는 storage 옵션을 받지 않습니다. 안정적인 persistence key가 없으며, 숨겨진, 랜덤한 key를 생성해서 사용하지도 않습니다.

## Named state mode

Named mode는 name과 storage options를 기준으로 global singleton registry를 사용합니다.

```tsx
import { createRxState } from "@byeolnaerim/global-rx-state";

export const { setCount, getCount, useCount, countSubject, countReady } =
	createRxState(0, "count", { storage: "auto" });

//OR

function A_Component(){
	const {setCountInner} = createRxState(0, "countInner"{storage:"auto"});
	return (
		<div>
			<button onClick={() => setCountInner((prev) => prev + 1)}>
				{countInner}
			</button>
		</div>
	);
}

function B_Component(){
	const {useCountInner} = createRxState(0, "countInner")// is A_Component countInner

	const countInner = useCountInner();

	return (
		<div><span>current count : {countInner}</span></div>
	)
}
```

storage를 생략하면 같은 name에 대해 처음 등록된 storage alias를 재사용합니다. 만약 storage alias가 없다면 기본값은 `in-memory`입니다.

혼란스러운 사용을 방지하기 위해서 가급적 storage를 지정하세요.

```ts
createRxState(0, "count", { storage: "auto" });
createRxState(0, "count"); // count에 대해 auto 재사용

createRxState(0, "count", { storage: "in-memory" }); // 별도 store

createRxState(0, "clickCount"); // storage alias가 없다면 default : in-memory
createRxState(0, "clickCount", { storage: "auto" }); // 별도 store
```

## Named tuple helper

tuple 형태의 사용성을 유지하면서 named singleton 동작과 선택적 persistence가 필요하면 `createRxStateTuple`을 사용하세요.

정적인 name을 알고 있다면 named mode를 사용하는 편이 더 읽기 쉽습니다.

createRxStateTuple은 name이 런타임에 결정되는 경우에 특히 유용합니다. 예를 들어 서버에서 받은 workspace id, 사용자가 선택한 탭 이름, route parameter처럼 미리 확정할 수 없는 key를 기준으로 상태를 분리하고 싶을 때 사용할 수 있습니다.

```tsx
type TabDraft = {
	title: string;
	content: string;
};

function EditorTab({ tabName }: { tabName: string }) {
	const [setDraft, getDraft, useDraft, draftSubject, draftReady] =
		createRxStateTuple<TabDraft>(
			{ title: "", content: "" },
			`tab-draft:${tabName}`,
			{ storage: "auto" },
		);

	const draft = useDraft();

	return (
		<textarea
			value={draft.content}
			onChange={(event) => {
				setDraft((prev) => ({
					...prev,
					content: event.target.value,
				}));
			}}
		/>
	);
}
```

## Reducer mode

Anonymous reducer tuple mode도 모듈 최상위에서만 사용해야 합니다.

```ts
import { createRxReducer } from "@byeolnaerim/global-rx-state";

type CountAction = { type: "increment" } | { type: "reset" };

function countReducer(state: number, action: CountAction) {
	switch (action.type) {
		case "increment":
			return state + 1;
		case "reset":
			return 0;
		default:
			return state;
	}
}

export const [dispatchCount, getCount, useCount] = createRxReducer(
	0,
	countReducer,
);
```

Named reducer mode는 persistence를 지원합니다.

```ts
export const { dispatchCount, getCount, useCount, countSubject, countReady } =
	createRxReducer(0, countReducer, "count", { storage: "auto" });
```

Named reducer tuple helper:

```tsx
import { createRxReducerTuple } from "@byeolnaerim/global-rx-state";

type FilterState = {
	keyword: string;
	onlyOpen: boolean;
};

type FilterAction =
	| { type: "setKeyword"; keyword: string }
	| { type: "toggleOnlyOpen" }
	| { type: "reset" };

const initialFilterState: FilterState = {
	keyword: "",
	onlyOpen: false,
};

function filterReducer(state: FilterState, action: FilterAction): FilterState {
	switch (action.type) {
		case "setKeyword":
			return {
				...state,
				keyword: action.keyword,
			};
		case "toggleOnlyOpen":
			return {
				...state,
				onlyOpen: !state.onlyOpen,
			};
		case "reset":
			return initialFilterState;
		default:
			return state;
	}
}

function WorkspaceFilter({ workspaceId }: { workspaceId: string }) {
	const [dispatchFilter, getFilter, useFilter] = createRxReducerTuple(
		initialFilterState,
		filterReducer,
		`workspace-filter:${workspaceId}`,
		{ storage: "auto" },
	);

	const filter = useFilter();

	return (
		<input
			value={filter.keyword}
			onChange={(event) => {
				dispatchFilter({
					type: "setKeyword",
					keyword: event.target.value,
				});
			}}
		/>
	);
}
```

## Storage

지원하는 storage 값은 다음과 같습니다.

- `in-memory`
- `auto`
- `indexeddb`
- `websql`
- `localstorage`
- `sessionstorage`

`auto`는 localForage를 사용하며, 다음 순서로 driver를 선택합니다.

```txt
IndexedDB > WebSQL > localStorage
```

`ready`는 persistent storage hydration이 끝난 뒤 resolve되는 Promise입니다. React hook은 hydration 이후 자동으로 업데이트됩니다. 복구된 값을 기준으로 다음 로직을 실행해야 할 때만 `ready`를 사용하세요.

## Storage 유틸리티

Named state의 저장 여부와 저장 위치는 세 가지 유틸리티로 확인할 수 있습니다.

### `hasRxState`

지정한 storage 설정에 해당 named state가 저장되어 있는지 확인합니다.

```ts
import { hasRxState } from "@byeolnaerim/global-rx-state";

await hasRxState("count", { storage: "auto" });
// Promise<boolean>
```

### `findRxStateStorages`

해당 named state가 실제로 존재하는 storage backend를 반환합니다. 같은 name이 여러 storage에 있으면 확인된 backend를 중복 없이 모두 반환합니다.

```ts
import { findRxStateStorages } from "@byeolnaerim/global-rx-state";

await findRxStateStorages("count");
// Promise<RxStateResolvedStorage[]>
// 예: ["indexeddb", "localstorage"]
```

### `getRxStateStorageInfo`

해당 named state가 존재하는 모든 저장 위치의 상세 정보를 반환합니다. 같은 name이 여러 storage 설정에 존재할 수 있으므로 결과는 항상 배열입니다.

```ts
import { getRxStateStorageInfo } from "@byeolnaerim/global-rx-state";

await getRxStateStorageInfo("count");

await getRxStateStorageInfo("count", { storage: "indexeddb" });
// Promise<RxStateStorageInfo[]>
```

각 `RxStateStorageInfo`에는 다음 정보가 포함됩니다.

```ts
interface RxStateStorageInfo {
	key: string;
	storageKey: string;
	fullKey: string;
	storage: RxStateResolvedStorage;
	name: string;
	storeName: string;
	keyPrefix: string;
}
```

`storageKey`는 storage adapter/localForage instance에 전달되는 item key입니다. `fullKey`는 backend가 flat key를 직접 노출하는 경우의 전체 key입니다. `storage`에는 실제 backend가 들어가므로 `auto`를 사용한 경우에도 localForage가 실제 선택한 driver가 반환됩니다.

Reducer도 동일하게 `hasRxReducer`, `findRxReducerStorages`, `getRxReducerStorageInfo`를 제공합니다.

## ESLint rule

이 패키지는 함수/컴포넌트 내부에서 anonymous tuple mode를 사용하는 것을 막기 위한 작은 ESLint rule을 포함합니다.

```js
const globalRxState = require("@byeolnaerim/global-rx-state/eslint-rules");

module.exports = {
	plugins: {
		"global-rx-state": globalRxState,
	},
	rules: {
		"global-rx-state/no-tuple-global-rx-state-in-function": "error",
	},
};
```

기존 `.eslintrc` 환경에서는 ESLint `--rulesdir`와 `eslint-rules/no-tuple-global-rx-state-in-function.cjs`를 함께 사용할 수도 있습니다.
