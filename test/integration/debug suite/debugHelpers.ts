import * as vscode from 'vscode';

// Result from a tracked debug session
export interface DebugTrackerResult {
	breakpointHit: boolean;
	exceptionHit: boolean;
	stoppedEvents: Array<{ reason: string; threadId?: number }>;
}

/**
 * Creates a DebugAdapterTrackerFactory that watches for `stopped` events and auto-continues.
 * Optionally intercepts `setExceptionBreakpoints` to add the 'raised' filter.
 *
 * Returns: { factory disposable, promise of the result }
 */
export function createDebugTracker(options?: {
	interceptExceptionBreakpoints?: boolean;
}): {
	dispose: () => void;
	result: DebugTrackerResult;
} {
	const result: DebugTrackerResult = {
		breakpointHit: false,
		exceptionHit: false,
		stoppedEvents: [],
	};

	const disposable = vscode.debug.registerDebugAdapterTrackerFactory('python', {
		createDebugAdapterTracker(session: vscode.DebugSession) {
			return {
				onWillReceiveMessage(message: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
					// Intercept setExceptionBreakpoints to inject 'raised' filter
					if (options?.interceptExceptionBreakpoints && message.command === 'setExceptionBreakpoints') {
						if (!message.arguments.filters.includes('raised')) {
							message.arguments.filters.push('raised');
						}
						console.log(`debugTracker: intercepted setExceptionBreakpoints, filters: ${JSON.stringify(message.arguments.filters)}`);
					}
				},
				onDidSendMessage(message: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
					if (message.type === 'event' && message.event === 'stopped') {
						const reason = message.body?.reason;
						const threadId = message.body?.threadId;
						console.log(`debugTracker: stopped event, reason=${reason}, threadId=${threadId}`);
						result.stoppedEvents.push({ reason, threadId });

						if (reason === 'breakpoint') {
							result.breakpointHit = true;
						}
						if (reason === 'exception') {
							result.exceptionHit = true;
						}

						// Auto-continue the debug session
						if (threadId !== undefined) {
							session.customRequest('continue', { threadId }).then(
								() => console.log(`debugTracker: continued after ${reason}`),
								(err) => console.error(`debugTracker: failed to continue: ${err}`)
							);
						}
					}
				}
			};
		}
	});

	return {
		dispose: () => disposable.dispose(),
		result,
	};
}
