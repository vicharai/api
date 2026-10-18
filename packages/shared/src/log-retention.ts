/** Built-in default of `retention.logRetentionDays`. */
export const LOG_RETENTION_DAYS = 30;

export function getLogRetentionCutoff(
	now = new Date(),
	retentionDays = LOG_RETENTION_DAYS,
): Date {
	const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
	return new Date(now.getTime() - retentionMs);
}

export function isRoutingMetadataExpired(
	log: { createdAt: string | Date; routingMetadata?: unknown },
	now = new Date(),
): boolean {
	return (
		log.routingMetadata === null &&
		new Date(log.createdAt) < getLogRetentionCutoff(now)
	);
}
