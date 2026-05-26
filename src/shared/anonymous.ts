/**
 * Builds a stable anonymous key from the call site.
 *
 * This preserves tuple-mode behavior: unnamed entries are shared by the same call
 * site across module reloads, but they do not collide with other unnamed entries
 * from different call sites.
 */
export function getAnonymousRxKey(ignoredFunctionNames: string[]) {
	const stack = new Error().stack ?? "";
	let start = 0;

	while (start < stack.length) {
		let end = stack.indexOf("\n", start);

		if (end === -1) {
			end = stack.length;
		}

		const line = stack.slice(start, end).trim();
		const shouldIgnore = ignoredFunctionNames.some((name) => line.includes(name));

		if (line && !shouldIgnore) {
			return `anonymous:${line}`;
		}

		start = end + 1;
	}

	return `anonymous:${stack.slice(0, 100)}`;
}
