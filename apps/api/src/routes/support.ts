import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

import { checkRateLimit } from "@/auth/config.js";
import { getClientIpFromContext } from "@/lib/client-ip.js";
import {
	appendSupportMessage,
	composeFirstMessage,
	parseFirstMessage,
	supportConversationStatus,
} from "@/lib/support-conversation.js";

import { and, asc, db, desc, eq, inArray, tables } from "@llmgateway/db";

import type { ServerTypes } from "@/vars.js";

export const support = new OpenAPIHono<ServerTypes>();

export const SUPPORT_CREATE_RATE_LIMIT = {
	keyPrefix: "support_conversation_create",
	windowSizeMs: 60 * 60 * 1000,
	maxRequests: 5,
};

export const SUPPORT_MESSAGE_RATE_LIMIT = {
	keyPrefix: "support_message",
	windowSizeMs: 10 * 60 * 1000,
	maxRequests: 20,
};

const PREVIEW_LENGTH = 160;

const statusSchema = z.enum(["open", "answered", "resolved"]);
const roleSchema = z.enum(["user", "assistant", "admin"]);

const summarySchema = z.object({
	id: z.string(),
	subject: z.string().nullable(),
	status: statusSchema,
	messageCount: z.number(),
	lastMessage: z
		.object({
			role: roleSchema,
			preview: z.string(),
			createdAt: z.string(),
		})
		.nullable(),
	createdAt: z.string(),
	updatedAt: z.string(),
	resolvedAt: z.string().nullable(),
});

const messageSchema = z.object({
	id: z.string(),
	role: roleSchema,
	content: z.string(),
	createdAt: z.string(),
});

const detailSchema = summarySchema.extend({
	workspaceId: z.string().nullable(),
	messages: z.array(messageSchema),
});

const messageBody = z.string().trim().min(1).max(5000);

type Conversation = typeof tables.chatSupportConversation.$inferSelect;
type Message = typeof tables.chatSupportMessage.$inferSelect;

function displayContent(message: Message): string {
	return message.sequence === 0
		? parseFirstMessage(message.content).body
		: message.content;
}

function preview(text: string): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length > PREVIEW_LENGTH
		? `${flat.slice(0, PREVIEW_LENGTH - 1)}…`
		: flat;
}

function summarize(
	conversation: Conversation,
	first: Message | undefined,
	last: Message | undefined,
): z.infer<typeof summarySchema> {
	return {
		id: conversation.id,
		subject: first ? parseFirstMessage(first.content).subject : null,
		status: supportConversationStatus({
			resolvedAt: conversation.resolvedAt,
			lastMessageRole: last?.role ?? null,
		}),
		messageCount: conversation.messageCount,
		lastMessage: last
			? {
					role: last.role,
					preview: preview(displayContent(last)),
					createdAt: last.createdAt.toISOString(),
				}
			: null,
		createdAt: conversation.createdAt.toISOString(),
		updatedAt: conversation.updatedAt.toISOString(),
		resolvedAt: conversation.resolvedAt?.toISOString() ?? null,
	};
}

// Dashboard conversations store the owning user's id in `clientId`.
async function findOwnConversation(
	userId: string,
	id: string,
): Promise<Conversation> {
	const conversation = await db.query.chatSupportConversation.findFirst({
		where: { id: { eq: id }, clientId: { eq: userId } },
	});
	if (!conversation) {
		throw new HTTPException(404, { message: "Conversation not found" });
	}
	return conversation;
}

async function enforceRateLimit(
	userId: string,
	config: typeof SUPPORT_MESSAGE_RATE_LIMIT,
	message: string,
) {
	const limit = await checkRateLimit(userId, config);
	if (!limit.allowed) {
		throw new HTTPException(429, { message });
	}
}

async function conversationDetail(
	conversation: Conversation,
): Promise<z.infer<typeof detailSchema>> {
	const messages = await db.query.chatSupportMessage.findMany({
		where: { conversationId: { eq: conversation.id } },
		orderBy: { sequence: "asc" },
	});
	const first = messages[0];
	return {
		...summarize(conversation, first, messages.at(-1)),
		workspaceId: first ? parseFirstMessage(first.content).workspaceId : null,
		messages: messages.map((m) => ({
			id: m.id,
			role: m.role,
			content: displayContent(m),
			createdAt: m.createdAt.toISOString(),
		})),
	};
}

const notFound = { description: "Conversation not found." };

support.openapi(
	createRoute({
		operationId: "create_support_conversation",
		method: "post",
		path: "/conversations",
		request: {
			body: {
				content: {
					"application/json": {
						schema: z.object({
							subject: z
								.string()
								.trim()
								.max(140)
								.regex(/^[^\r\n]*$/, "Subject must be a single line")
								.optional(),
							message: messageBody,
							organizationId: z.string().optional(),
						}),
					},
				},
			},
		},
		responses: {
			200: {
				description: "The new conversation.",
				content: { "application/json": { schema: detailSchema } },
			},
			404: { description: "Workspace not found." },
			429: { description: "Too many new conversations." },
		},
	}),
	async (c) => {
		const user = c.get("user")!;
		const { subject, message, organizationId } = c.req.valid("json");

		let workspace: { id: string; name: string } | undefined;
		if (organizationId) {
			const membership = await db.query.userOrganization.findFirst({
				where: {
					userId: { eq: user.id },
					organizationId: { eq: organizationId },
				},
				with: { organization: { columns: { id: true, name: true } } },
			});
			if (!membership?.organization) {
				throw new HTTPException(404, { message: "Workspace not found" });
			}
			workspace = membership.organization;
		}

		await enforceRateLimit(
			user.id,
			SUPPORT_CREATE_RATE_LIMIT,
			"Too many new conversations. Try again later.",
		);

		const conversation = await db.transaction(async (tx) => {
			const [created] = await tx
				.insert(tables.chatSupportConversation)
				.values({
					clientId: user.id,
					name: user.name,
					email: user.email,
					ipAddress: getClientIpFromContext(c),
					userAgent: c.req.header("user-agent") ?? null,
					messageCount: 1,
				})
				.returning();
			await tx.insert(tables.chatSupportMessage).values({
				conversationId: created!.id,
				role: "user",
				content: composeFirstMessage({
					subject: subject || undefined,
					workspace,
					body: message,
				}),
				sequence: 0,
			});
			return created!;
		});

		return c.json(await conversationDetail(conversation), 200);
	},
);

support.openapi(
	createRoute({
		operationId: "list_support_conversations",
		method: "get",
		path: "/conversations",
		responses: {
			200: {
				description: "Your support conversations, most recent first.",
				content: {
					"application/json": {
						schema: z.object({ conversations: z.array(summarySchema) }),
					},
				},
			},
		},
	}),
	async (c) => {
		const user = c.get("user")!;
		const t = tables.chatSupportConversation;
		const mt = tables.chatSupportMessage;

		const conversations = await db
			.select()
			.from(t)
			.where(eq(t.clientId, user.id))
			.orderBy(desc(t.updatedAt))
			.limit(100);
		const ids = conversations.map((conv) => conv.id);
		if (ids.length === 0) {
			return c.json({ conversations: [] }, 200);
		}

		const [firsts, lasts] = await Promise.all([
			db
				.selectDistinctOn([mt.conversationId])
				.from(mt)
				.where(inArray(mt.conversationId, ids))
				.orderBy(mt.conversationId, asc(mt.sequence)),
			db
				.selectDistinctOn([mt.conversationId])
				.from(mt)
				.where(inArray(mt.conversationId, ids))
				.orderBy(mt.conversationId, desc(mt.sequence)),
		]);
		const firstBy = new Map(firsts.map((m) => [m.conversationId, m]));
		const lastBy = new Map(lasts.map((m) => [m.conversationId, m]));

		return c.json(
			{
				conversations: conversations.map((conv) =>
					summarize(conv, firstBy.get(conv.id), lastBy.get(conv.id)),
				),
			},
			200,
		);
	},
);

support.openapi(
	createRoute({
		operationId: "get_support_conversation",
		method: "get",
		path: "/conversations/{id}",
		request: { params: z.object({ id: z.string() }) },
		responses: {
			200: {
				description: "The conversation with its messages.",
				content: { "application/json": { schema: detailSchema } },
			},
			404: notFound,
		},
	}),
	async (c) => {
		const { id } = c.req.valid("param");
		const conversation = await findOwnConversation(c.get("user")!.id, id);
		return c.json(await conversationDetail(conversation), 200);
	},
);

support.openapi(
	createRoute({
		operationId: "reply_support_conversation",
		method: "post",
		path: "/conversations/{id}/messages",
		request: {
			params: z.object({ id: z.string() }),
			body: {
				content: {
					"application/json": {
						schema: z.object({ message: messageBody }),
					},
				},
			},
		},
		responses: {
			200: {
				description: "The updated conversation. Reopens it if resolved.",
				content: { "application/json": { schema: detailSchema } },
			},
			404: notFound,
			429: { description: "Too many messages." },
		},
	}),
	async (c) => {
		const user = c.get("user")!;
		const { id } = c.req.valid("param");
		const { message } = c.req.valid("json");
		await findOwnConversation(user.id, id);
		await enforceRateLimit(
			user.id,
			SUPPORT_MESSAGE_RATE_LIMIT,
			"Too many messages. Try again later.",
		);

		await appendSupportMessage(id, "user", message, {
			resolvedAt: null,
			archivedAt: null,
		});

		return c.json(
			await conversationDetail(await findOwnConversation(user.id, id)),
			200,
		);
	},
);

support.openapi(
	createRoute({
		operationId: "resolve_support_conversation",
		method: "post",
		path: "/conversations/{id}/resolve",
		request: { params: z.object({ id: z.string() }) },
		responses: {
			200: {
				description: "The resolved conversation.",
				content: { "application/json": { schema: detailSchema } },
			},
			404: notFound,
		},
	}),
	async (c) => {
		const user = c.get("user")!;
		const { id } = c.req.valid("param");
		const conversation = await findOwnConversation(user.id, id);
		if (conversation.resolvedAt) {
			return c.json(await conversationDetail(conversation), 200);
		}
		const [updated] = await db
			.update(tables.chatSupportConversation)
			.set({ resolvedAt: new Date() })
			.where(
				and(
					eq(tables.chatSupportConversation.id, id),
					eq(tables.chatSupportConversation.clientId, user.id),
				),
			)
			.returning();
		return c.json(await conversationDetail(updated!), 200);
	},
);
