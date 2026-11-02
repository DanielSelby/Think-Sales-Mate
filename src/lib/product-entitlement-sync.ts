export interface RetryableEntitlementEvent {
  id: string;
  attempts: number;
}

export function getEntitlementRetryAt(attempt: number, now = new Date()): string {
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error("Entitlement retry attempt must be a positive integer.");
  }
  const delaySeconds = Math.min(3600, 5 * 2 ** Math.min(attempt - 1, 10));
  return new Date(now.getTime() + delaySeconds * 1000).toISOString();
}

export async function processEntitlementEvents<T extends RetryableEntitlementEvent>(
  events: T[],
  apply: (event: T) => Promise<void>,
  markProcessed: (event: T) => Promise<void>,
  markFailed: (event: T, error: string) => Promise<void>,
): Promise<{ processed: number }> {
  const failures: string[] = [];
  let processed = 0;

  for (const event of events) {
    try {
      await apply(event);
      await markProcessed(event);
      processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown entitlement synchronization error.";
      try {
        await markFailed(event, message);
        failures.push(`${event.id}: ${message}`);
      } catch (retryError) {
        const retryMessage = retryError instanceof Error ? retryError.message : "Unknown retry-state update error.";
        failures.push(`${event.id}: ${message}; retry state update failed: ${retryMessage}`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Entitlement synchronization failed for ${failures.length} event(s): ${failures.join(" | ")}`);
  }
  return { processed };
}
