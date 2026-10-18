"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useCan } from "@/components/shell/admin-session";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";

import { Button, Input, Label } from "@llmgateway/shared/components";

import type { Route } from "next";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Creates an organization owned by an existing user and opens it. */
export function CreateOrganizationDialog({
	defaultOwnerEmail = "",
	children,
}: {
	defaultOwnerEmail?: string;
	children?: ReactNode;
}) {
	const api = useApi();
	const can = useCan();
	const router = useRouter();
	const invalidate = useInvalidate();
	const [form, setForm] = useState({
		name: "",
		ownerEmail: defaultOwnerEmail,
		billingEmail: "",
	});
	const create = api.useMutation("post", "/admin/organizations", {
		onSuccess: (res) => {
			toast.success(`Created ${res.organization.name}`);
			void invalidate("/admin/organizations", "/admin/users");
			router.push(`/organizations/${res.organization.id}` as Route);
		},
	});
	const ownerEmail = form.ownerEmail.trim();
	const billingEmail = form.billingEmail.trim();
	const valid =
		form.name.trim().length > 0 &&
		EMAIL_PATTERN.test(ownerEmail) &&
		(!billingEmail || EMAIL_PATTERN.test(billingEmail));

	function field(key: keyof typeof form, label: string, placeholder: string) {
		return (
			<div className="space-y-1.5">
				<Label htmlFor={`create-org-${key}`}>{label}</Label>
				<Input
					id={`create-org-${key}`}
					value={form[key]}
					placeholder={placeholder}
					onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
				/>
			</div>
		);
	}

	return (
		<ConfirmAction
			title="Create organization"
			description="The owner must already have an account. They become the organization's owner."
			confirmLabel="Create"
			requireReason={false}
			confirmDisabled={!valid}
			extra={
				<div className="space-y-3">
					{field("name", "Name", "Acme Inc.")}
					{field("ownerEmail", "Owner email", "owner@example.com")}
					{field(
						"billingEmail",
						"Billing email (optional)",
						"Defaults to the owner email",
					)}
				</div>
			}
			onConfirm={() =>
				create.mutateAsync({
					body: {
						name: form.name.trim(),
						ownerEmail,
						billingEmail: billingEmail || undefined,
					},
				})
			}
		>
			{children ?? (
				<Button
					size="sm"
					variant="outline"
					disabled={!can("POST", "/admin/organizations")}
				>
					<Plus /> New organization
				</Button>
			)}
		</ConfirmAction>
	);
}
