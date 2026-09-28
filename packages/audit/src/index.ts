import {
	auditLog,
	db,
	type AuditLogAction,
	type AuditLogMetadata,
	type AuditLogResourceType,
} from "@llmgateway/db";
import { logger } from "@llmgateway/logger";

export interface LogAuditEventParams {
	organizationId: string;
	userId: string;
	action: AuditLogAction;
	resourceType: AuditLogResourceType;
	resourceId?: string;
	metadata?: AuditLogMetadata;
}

/**
 * Records an audit event for an organization. Best-effort by design: a
 * logging failure must never abort the mutating request that triggered it.
 */
export async function logAuditEvent(
	params: LogAuditEventParams,
): Promise<void> {
	try {
		await db.insert(auditLog).values({
			organizationId: params.organizationId,
			userId: params.userId,
			action: params.action,
			resourceType: params.resourceType,
			resourceId: params.resourceId,
			metadata: params.metadata,
		});
	} catch (error) {
		logger.error("audit event write failed", {
			error: error instanceof Error ? error.message : String(error),
			action: params.action,
			organizationId: params.organizationId,
		});
	}
}
