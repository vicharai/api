import { db, eq, sql, tables } from "@llmgateway/db";

const SUBJECT_PREFIX = "Subject: ";
const WORKSPACE_PREFIX = "Workspace: ";

export type SupportConversationStatus = "open" | "answered" | "resolved";

/**
 * chat_support_conversation has no subject or workspace column, so dashboard
 * conversations carry them as header lines on the first message.
 */
export function composeFirstMessage(input: {
	subject?: string;
	workspace?: { id: string; name: string };
	body: string;
}): string {
	const header = [
		input.subject ? `${SUBJECT_PREFIX}${input.subject}` : null,
		input.workspace
			? `${WORKSPACE_PREFIX}${input.workspace.name} (${input.workspace.id})`
			: null,
	].filter((line): line is string => line !== null);
	return header.length ? `${header.join("\n")}\n\n${input.body}` : input.body;
}

export function parseFirstMessage(content: string): {
	subject: string | null;
	workspaceId: string | null;
	body: string;
} {
	let subject: string | null = null;
	let workspaceId: string | null = null;
	const lines = content.split("\n");
	let index = 0;
	for (; index < lines.length; index++) {
		const line = lines[index]!;
		if (subject === null && line.startsWith(SUBJECT_PREFIX)) {
			subject = line.slice(SUBJECT_PREFIX.length).trim() || null;
		} else if (workspaceId === null && line.startsWith(WORKSPACE_PREFIX)) {
			workspaceId = /\(([^()\s]+)\)\s*$/.exec(line)?.[1] ?? null;
		} else {
			break;
		}
	}
	if (index === 0) {
		return { subject, workspaceId, body: content };
	}
	if (lines[index] === "") {
		index++;
	}
	return { subject, workspaceId, body: lines.slice(index).join("\n") };
}

export function supportConversationStatus(conversation: {
	resolvedAt: Date | null;
	lastMessageRole: string | null;
}): SupportConversationStatus {
	if (conversation.resolvedAt) {
		return "resolved";
	}
	return conversation.lastMessageRole === "admin" ? "answered" : "open";
}

/** Appends a message, keeping `sequence` aligned with `messageCount`. */
export async function appendSupportMessage(
	conversationId: string,
	role: "user" | "admin",
	content: string,
	set: Partial<{ resolvedAt: Date | null; archivedAt: Date | null }> = {},
): Promise<number> {
	const t = tables.chatSupportConversation;
	return await db.transaction(async (tx) => {
		const [updated] = await tx
			.update(t)
			.set({ messageCount: sql`${t.messageCount} + 1`, ...set })
			.where(eq(t.id, conversationId))
			.returning({ messageCount: t.messageCount });
		const sequence = (updated?.messageCount ?? 1) - 1;
		await tx.insert(tables.chatSupportMessage).values({
			conversationId,
			role,
			content,
			sequence,
		});
		return sequence;
	});
}
