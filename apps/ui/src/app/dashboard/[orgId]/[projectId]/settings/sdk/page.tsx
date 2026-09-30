import { SdkSettings } from "@/components/settings/sdk-settings";
import { SettingsSection } from "@/components/settings/settings-section";
import { getProject } from "@/lib/server-api";

export default async function SdkPage({
	params,
}: {
	params: Promise<{ orgId: string; projectId: string }>;
}) {
	const { orgId, projectId } = await params;
	const projectData = await getProject(projectId);

	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-5 p-4 pt-6 md:p-6">
				<div className="mx-auto w-full max-w-3xl space-y-5">
					<div>
						<h1 className="text-xl font-medium tracking-tight">Payments SDK</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Embed end-user payments and sessions into your own site.
						</p>
					</div>
					<SettingsSection
						title="Embeddable Payments"
						description="Configure end-user sessions and platform secret keys for this project."
					>
						{projectData?.project ? (
							<SdkSettings
								initialProject={projectData.project}
								orgId={orgId}
								projectId={projectId}
							/>
						) : (
							<p className="text-muted-foreground text-sm">
								Project settings could not be loaded.
							</p>
						)}
					</SettingsSection>
				</div>
			</div>
		</div>
	);
}
