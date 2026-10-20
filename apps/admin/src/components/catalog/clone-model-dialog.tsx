"use client";

import { Copy, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ToggleChips } from "@/components/ui/controls";
import { useInvalidate } from "@/hooks/use-invalidate";
import { useApi } from "@/lib/fetch-client";

import {
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
} from "@llmgateway/shared/components";

import type { CatalogModel } from "@/lib/api/admin-types";

const MODEL_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/i;

/** Copies a model's definition and chosen live mappings into a new managed model. */
export function CloneModelDialog({
	model,
	onClose,
	onCloned,
}: {
	model: CatalogModel;
	onClose: () => void;
	onCloned: (modelId: string) => void;
}) {
	const api = useApi();
	const invalidate = useInvalidate();
	const providers = [
		...new Set(
			model.mappings
				.filter(
					(m) => !m.deactivatedAt || Date.parse(m.deactivatedAt) > Date.now(),
				)
				.map((m) => m.providerId),
		),
	];
	const [newId, setNewId] = useState(`${model.id}-copy`);
	const [name, setName] = useState(`${model.name} (copy)`);
	const [picked, setPicked] = useState(providers);
	const clone = api.useMutation(
		"post",
		"/admin/catalog/models/{modelId}/clone",
		{
			onSuccess: (res) => {
				toast.success(`Model ${res.model.id} created`);
				void invalidate("/admin/catalog", "/admin/models");
				onCloned(res.model.id);
			},
		},
	);
	const idValid = MODEL_ID.test(newId.trim());

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Clone {model.name}</DialogTitle>
					<DialogDescription>
						Creates a managed model with this model&apos;s family, output and
						the picked providers&apos; prices and capabilities. Edit it like any
						managed model afterwards.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<div className="space-y-1.5">
						<Label htmlFor="clone-id">New model id</Label>
						<Input
							id="clone-id"
							className="font-mono"
							value={newId}
							onChange={(e) => setNewId(e.target.value)}
						/>
						{idValid ? null : (
							<p className="text-xs text-destructive">
								Letters, digits, dot, dash or underscore
							</p>
						)}
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="clone-name">Name</Label>
						<Input
							id="clone-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label>Providers to copy</Label>
						{providers.length > 0 ? (
							<ToggleChips
								options={providers}
								value={picked}
								onChange={setPicked}
							/>
						) : (
							<p className="text-xs text-muted-foreground">
								No live mappings; the clone starts without providers.
							</p>
						)}
					</div>
				</div>
				<DialogFooter className="gap-2">
					<Button variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						disabled={!idValid || !name.trim() || clone.isPending}
						onClick={() =>
							clone.mutate({
								params: { path: { modelId: model.id } },
								body: {
									newId: newId.trim(),
									name: name.trim(),
									providerIds: picked,
								},
							})
						}
					>
						{clone.isPending ? <Loader2 className="animate-spin" /> : <Copy />}
						Clone
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
