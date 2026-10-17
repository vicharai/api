"use client";

import { Building2, Search, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useApi } from "@/lib/fetch-client";

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

import type { Route } from "next";

export function GlobalSearch() {
	const api = useApi();
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const search = useDebouncedValue(query.trim(), 250);
	const enabled = open && search.length >= 2;

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				setOpen((value) => !value);
			}
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	const users = api.useQuery(
		"get",
		"/admin/users",
		{ params: { query: { search, limit: 8 } } },
		{ enabled },
	);
	const orgs = api.useQuery(
		"get",
		"/admin/organizations",
		{ params: { query: { search, limit: 8 } } },
		{ enabled },
	);

	function go(href: string) {
		setOpen(false);
		setQuery("");
		router.push(href as Route);
	}

	const loading = enabled && (users.isFetching || orgs.isFetching);

	return (
		<>
			<Button
				variant="outline"
				className="h-9 w-full max-w-sm justify-start gap-2 text-muted-foreground"
				onClick={() => setOpen(true)}
			>
				<Search className="size-4" />
				<span className="flex-1 text-left">Search users and orgs…</span>
				<kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">
					⌘K
				</kbd>
			</Button>
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="overflow-hidden p-0 sm:max-w-xl">
					<DialogTitle className="sr-only">Search</DialogTitle>
					<Command shouldFilter={false}>
						<CommandInput
							placeholder="Email, name, org name or ID…"
							value={query}
							onValueChange={setQuery}
						/>
						<CommandList className="max-h-[60vh]">
							<CommandEmpty>
								{search.length < 2
									? "Type at least 2 characters."
									: loading
										? "Searching…"
										: "No matches."}
							</CommandEmpty>
							{enabled && users.data?.users.length ? (
								<CommandGroup heading="Users">
									{users.data.users.map((u) => (
										<CommandItem
											key={u.id}
											value={`user-${u.id}`}
											onSelect={() => go(`/users/${u.id}`)}
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
							{enabled && orgs.data?.organizations.length ? (
								<CommandGroup heading="Organizations">
									{orgs.data.organizations.map((o) => (
										<CommandItem
											key={o.id}
											value={`org-${o.id}`}
											onSelect={() => go(`/organizations/${o.id}`)}
										>
											<Building2 className="size-4" />
											<span className="truncate">{o.name}</span>
											<span className="truncate text-muted-foreground">
												{o.billingEmail}
											</span>
										</CommandItem>
									))}
								</CommandGroup>
							) : null}
						</CommandList>
					</Command>
				</DialogContent>
			</Dialog>
		</>
	);
}
