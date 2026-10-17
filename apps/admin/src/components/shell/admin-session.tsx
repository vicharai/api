"use client";

import { createContext, use, type ReactNode } from "react";

import { roleAllows, type AdminRole } from "@/lib/permissions";

export interface AdminSession {
	userId: string;
	email: string;
	name: string | null;
	role: AdminRole;
}

const AdminSessionContext = createContext<AdminSession | null>(null);

export function AdminSessionProvider({
	session,
	children,
}: {
	session: AdminSession;
	children: ReactNode;
}) {
	return <AdminSessionContext value={session}>{children}</AdminSessionContext>;
}

export function useAdminSession(): AdminSession {
	const session = use(AdminSessionContext);
	if (!session) {
		throw new Error("useAdminSession must be used inside the dashboard");
	}
	return session;
}

/** Whether the current admin role may call `method path` (UI hint only). */
export function useCan() {
	const { role } = useAdminSession();
	return (
		method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
		path: string,
	): boolean => roleAllows(role, method, path);
}
