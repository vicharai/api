import { GuardrailsSettings } from "@/components/guardrails/guardrails-settings";

export default async function ProjectGuardrailsPage({
	params,
}: {
	params: Promise<{ orgId: string; projectId: string }>;
}) {
	const { orgId, projectId } = await params;

	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-4">
				<div className="flex items-center justify-between">
					<h1 className="text-xl font-medium tracking-tight">Guardrails</h1>
				</div>
				<GuardrailsSettings
					scope={{ kind: "project", organizationId: orgId, projectId }}
				/>
			</div>
		</div>
	);
}
