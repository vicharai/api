"use client";

import {
	ArrowLeft,
	Building2,
	Clock,
	Plus,
	Power,
	Search,
	User,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { CreateKillSwitchDialog } from "@/components/kill-switches/create-kill-switch-dialog";
import {
	AddCreditsDialog,
	BlockOrgDialog,
	BlockUserDialog,
	type OrgRef,
	type UserRef,
} from "@/components/productivity/quick-action-dialogs";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import {
	COMMAND_ACTIONS,
	type CommandAction,
	type CommandFlow,
} from "@/lib/command-actions";
import { useApi } from "@/lib/fetch-client";
import { roleAllows } from "@/lib/permissions";

import {
	Button,
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	Dialog,
	DialogContent,
	DialogTitle,
} from "@llmgateway/shared/components";

import { useAdminSession } from "./admin-session";

import type { RoutingOverride } from "@/lib/api/pending-paths-p2";
import type { Route } from "next";

export const OPEN_COMMAND_PALETTE_EVENT = "admin:open-command-palette";

/** Opens the command palette from anywhere (e.g. keyboard shortcuts). */
export function openCommandPalette() {
	window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}

type PendingDialog =
	| { kind: "credits"; org: OrgRef }
	| { kind: "block-org"; org: OrgRef }
	| { kind: "block-user"; user: UserRef }
	| { kind: "kill-switch-new" }
	| { kind: "kill-switch-remove"; override: RoutingOverride }
	| null;

const FLOW_PROMPTS: Record<CommandFlow, string> = {
	"open-org": "Open which organization?",
	"open-user": "Open which user?",
	"add-credits": "Add credits to which organization?",
	"block-org": "Block or unblock which organization?",
	"block-user": "Block or unblock which user?",
	"kill-switch": "Remove a kill switch or create one",
};

const ORG_FLOWS = new Set<CommandFlow>([
	"open-org",
	"add-credits",
	"block-org",
]);
const USER_FLOWS = new Set<CommandFlow>(["open-user", "block-user"]);

function Hint({ children }: { children: ReactNode }) {
	return (
		<span className="ml-auto max-w-40 truncate text-xs text-muted-foreground">
			{children}
		</span>
	);
}

function matchesQuery(text: string, query: string): boolean {
	const haystack = text.toLowerCase();
	return query
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.every((word) => haystack.includes(word));
}

/**
 * ⌘K palette: search users and orgs, jump to pages, reopen recent records
 * and run quick actions (credits, blocks, kill switches).
 */
export function CommandPalette() {
	const api = useApi();
	const router = useRouter();
	const { role } = useAdminSession();
	const recent = useRecentlyViewed();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [flow, setFlow] = useState<CommandFlow | null>(null);
	const [dialog, setDialog] = useState<PendingDialog>(null);
	const search = useDebouncedValue(query.trim(), 250);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				setOpen((value) => !value);
			}
		}
		function onOpen() {
			setOpen(true);
		}
		window.addEventListener("keydown", onKeyDown);
		window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpen);
		};
	}, []);

	const wantsOrgs = flow === null || ORG_FLOWS.has(flow);
	const wantsUsers = flow === null || USER_FLOWS.has(flow);
	const searching = open && search.length >= 2;

	const users = api.useQuery(
		"get",
		"/admin/users",
		{ params: { query: { search, limit: 8 } } },
		{ enabled: searching && wantsUsers },
	);
	const orgs = api.useQuery(
		"get",
		"/admin/organizations",
		{ params: { query: { search, limit: 8 } } },
		{ enabled: searching && wantsOrgs },
	);
	const overrides = api.useQuery("get", "/admin/routing-overrides", undefined, {
		enabled: open && flow === "kill-switch",
	});

	function reset() {
		setOpen(false);
		setQuery("");
		setFlow(null);
	}

	function go(href: string) {
		reset();
		router.push(href as Route);
	}

	function allowed(action: CommandAction) {
		return (
			(!action.requires || roleAllows(role, "GET", action.requires)) &&
			(!action.mutation ||
				roleAllows(role, action.mutation.method, action.mutation.path))
		);
	}

	function runAction(action: CommandAction) {
		if (action.flow) {
			setFlow(action.flow);
			setQuery("");
		} else if (action.href) {
			go(action.href);
		}
	}

	function pickOrg(org: OrgRef) {
		const current = flow;
		reset();
		if (current === "add-credits") {
			setDialog({ kind: "credits", org });
		} else if (current === "block-org") {
			setDialog({ kind: "block-org", org });
		} else {
			router.push(`/organizations/${org.id}` as Route);
		}
	}

	function pickUser(user: UserRef) {
		const current = flow;
		reset();
		if (current === "block-user") {
			setDialog({ kind: "block-user", user });
		} else {
			router.push(`/users/${user.id}` as Route);
		}
	}

	const q = query.trim();
	const actions = COMMAND_ACTIONS.filter(
		(a) =>
			allowed(a) && (!q || matchesQuery(`${a.label} ${a.keywords ?? ""}`, q)),
	);
	const quickActions = actions.filter((a) => a.group !== "Navigation");
	const navActions = actions.filter((a) => a.group === "Navigation");
	const loading =
		searching &&
		((wantsUsers && users.isFetching) || (wantsOrgs && orgs.isFetching));
	const activeOverrides = (overrides.data?.overrides ?? []).filter(
		(o) =>
			o.active && (!q || matchesQuery(`${o.scope} ${o.target} ${o.reason}`, q)),
	);

	return (
		<>
			<Button
				variant="outline"
				className="h-9 w-full max-w-sm justify-start gap-2 text-muted-foreground"
				onClick={() => setOpen(true)}
			>
				<Search className="size-4" />
				<span className="flex-1 text-left">Search or run a command…</span>
				<kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">
					⌘K
				</kbd>
			</Button>
			<Dialog
				open={open}
				onOpenChange={(next) => (next ? setOpen(true) : reset())}
			>
				<DialogContent className="overflow-hidden p-0 sm:max-w-xl">
					<DialogTitle className="sr-only">Command palette</DialogTitle>
					<Command shouldFilter={false}>
						{flow ? (
							<button
								type="button"
								className="flex items-center gap-2 border-b px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
								onClick={() => {
									setFlow(null);
									setQuery("");
								}}
							>
								<ArrowLeft className="size-3" /> {FLOW_PROMPTS[flow]}
							</button>
						) : null}
						<CommandInput
							placeholder={
								flow === "kill-switch"
									? "Filter kill switches…"
									: flow && USER_FLOWS.has(flow)
										? "Email, name or user ID…"
										: flow
											? "Organization name, email or ID…"
											: "Search users, orgs, pages and actions…"
							}
							value={query}
							onValueChange={setQuery}
							onKeyDown={(e) => {
								if (e.key === "Backspace" && !query && flow) {
									setFlow(null);
								}
							}}
						/>
						<CommandList className="max-h-[60vh]">
							<CommandEmpty>
								{flow && flow !== "kill-switch" && search.length < 2
									? "Type at least 2 characters."
									: loading
										? "Searching…"
										: "No matches."}
							</CommandEmpty>

							{flow === null && !q && recent.length > 0 ? (
								<CommandGroup heading="Recently viewed">
									{recent.map((item) => (
										<CommandItem
											key={`${item.type}-${item.id}`}
											value={`recent-${item.type}-${item.id}`}
											onSelect={() =>
												go(
													item.type === "organization"
														? `/organizations/${item.id}`
														: `/users/${item.id}`,
												)
											}
										>
											<Clock className="size-4" />
											<span className="truncate">{item.label}</span>
											<Hint>{item.type}</Hint>
										</CommandItem>
									))}
								</CommandGroup>
							) : null}

							{flow === null && quickActions.length > 0 ? (
								<CommandGroup heading="Quick actions">
									{quickActions.map((action) => (
										<CommandItem
											key={action.id}
											value={`action-${action.id}`}
											onSelect={() => runAction(action)}
										>
											<action.icon className="size-4" />
											{action.label}
										</CommandItem>
									))}
								</CommandGroup>
							) : null}

							{flow === "kill-switch" ? (
								<CommandGroup heading="Kill switches">
									<CommandItem
										value="kill-switch-new"
										onSelect={() => {
											reset();
											setDialog({ kind: "kill-switch-new" });
										}}
									>
										<Plus className="size-4" /> New kill switch…
									</CommandItem>
									{activeOverrides.map((o) => (
										<CommandItem
											key={o.id}
											value={`override-${o.id}`}
											onSelect={() => {
												reset();
												setDialog({ kind: "kill-switch-remove", override: o });
											}}
										>
											<Power className="size-4 text-destructive" />
											<span className="truncate">
												Re-enable {o.scope} <code>{o.target}</code>
											</span>
											<Hint>{o.reason}</Hint>
										</CommandItem>
									))}
								</CommandGroup>
							) : null}

							{searching && wantsUsers && users.data?.users.length ? (
								<CommandGroup heading="Users">
									{users.data.users.map((u) => (
										<CommandItem
											key={u.id}
											value={`user-${u.id}`}
											onSelect={() => pickUser({ id: u.id, email: u.email })}
										>
											<User className="size-4" />
											<span className="truncate">{u.email}</span>
											{u.name ? (
												<span className="truncate text-muted-foreground">
													{u.name}
												</span>
											) : null}
										</CommandItem>
									))}
								</CommandGroup>
							) : null}

							{searching && wantsOrgs && orgs.data?.organizations.length ? (
								<CommandGroup heading="Organizations">
									{orgs.data.organizations.map((o) => (
										<CommandItem
											key={o.id}
											value={`org-${o.id}`}
											onSelect={() =>
												pickOrg({
													id: o.id,
													name: o.name,
													status: o.status,
													credits: o.credits,
												})
											}
										>
											<Building2 className="size-4" />
											<span className="truncate">{o.name}</span>
											<span className="truncate text-muted-foreground">
												{o.billingEmail}
											</span>
											{o.status && o.status !== "active" ? (
												<Hint>{o.status}</Hint>
											) : null}
										</CommandItem>
									))}
								</CommandGroup>
							) : null}

							{flow === null && navActions.length > 0 ? (
								<CommandGroup heading="Go to">
									{navActions.map((action) => (
										<CommandItem
											key={action.id}
											value={action.id}
											onSelect={() => runAction(action)}
										>
											<action.icon className="size-4" />
											{action.label}
											<Hint>{action.keywords}</Hint>
										</CommandItem>
									))}
								</CommandGroup>
							) : null}
						</CommandList>
					</Command>
				</DialogContent>
			</Dialog>

			{dialog?.kind === "credits" ? (
				<AddCreditsDialog
					org={dialog.org}
					open
					onOpenChange={(next) => !next && setDialog(null)}
				/>
			) : null}
			{dialog?.kind === "block-org" ? (
				<BlockOrgDialog
					org={dialog.org}
					open
					onOpenChange={(next) => !next && setDialog(null)}
				/>
			) : null}
			{dialog?.kind === "block-user" ? (
				<BlockUserDialog
					user={dialog.user}
					open
					onOpenChange={(next) => !next && setDialog(null)}
				/>
			) : null}
			{dialog?.kind === "kill-switch-new" ? (
				<CreateKillSwitchDialog
					open
					onOpenChange={(next) => !next && setDialog(null)}
				/>
			) : null}
			{dialog?.kind === "kill-switch-remove" ? (
				<RemoveKillSwitchDialog
					override={dialog.override}
					onClose={() => setDialog(null)}
				/>
			) : null}
		</>
	);
}

function RemoveKillSwitchDialog({
	override,
	onClose,
}: {
	override: RoutingOverride;
	onClose: () => void;
}) {
	const api = useApi();
	const invalidate = useInvalidate();
	const remove = api.useMutation("delete", "/admin/routing-overrides/{id}", {
		onSuccess: () => {
			toast.success(`Re-enabled ${override.scope} ${override.target}`);
			void invalidate("/admin/routing-overrides");
		},
	});

	return (
		<ConfirmAction
			title="Re-enable routing"
			description={`Removes the kill switch on ${override.scope} ${override.target} (${override.reason}).`}
			confirmLabel="Re-enable"
			requireReason={false}
			open
			onOpenChange={(next) => !next && onClose()}
			onConfirm={() =>
				remove.mutateAsync({ params: { path: { id: override.id } } })
			}
		/>
	);
}
