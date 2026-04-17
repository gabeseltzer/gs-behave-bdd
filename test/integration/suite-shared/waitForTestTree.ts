// Predicate-polling helper for integration tests.
// Waits until `predicate()` returns a truthy value or the timeout elapses.
// Resolves with the matching value; throws with the last-seen value on timeout.

export interface WaitOptions {
	intervalMs: number;
	timeoutMs: number;
}

export async function waitForTestTree<T>(
	predicate: () => T | undefined,
	options: WaitOptions
): Promise<T> {
	const start = Date.now();
	let lastSeen: T | undefined;
	while (Date.now() - start < options.timeoutMs) {
		lastSeen = predicate();
		if (lastSeen !== undefined && lastSeen !== null && (lastSeen as unknown) !== false) {
			return lastSeen;
		}
		await new Promise<void>(t => setTimeout(t, options.intervalMs));
	}
	let lastSeenRepr: string;
	try {
		lastSeenRepr = JSON.stringify(lastSeen);
	} catch {
		lastSeenRepr = String(lastSeen);
	}
	throw new Error(
		`waitForTestTree: predicate did not match within ${options.timeoutMs}ms. ` +
		`Last seen: ${lastSeenRepr}`
	);
}
