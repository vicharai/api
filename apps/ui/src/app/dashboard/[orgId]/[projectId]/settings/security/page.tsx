"use client";

import { useState } from "react";

import { createAddPasskeyFunction } from "@/components/passkeys/add-passkey";
import { PasskeyList } from "@/components/passkeys/passkey-list";
import { SettingsSection } from "@/components/settings/settings-section";
import { useUpdatePassword } from "@/hooks/useUser";
import { getApiErrorMessage } from "@/lib/api-error";
import { useAuthClient } from "@/lib/auth-client";
import { Button } from "@/lib/components/button";
import { Input } from "@/lib/components/input";
import { Label } from "@/lib/components/label";
import { Separator } from "@/lib/components/separator";
import { toast } from "@/lib/components/use-toast";

export default function SecurityPage() {
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const authClient = useAuthClient();
	const addPasskey = createAddPasskeyFunction(authClient);

	const updatePasswordMutation = useUpdatePassword();

	const handleUpdatePassword = async () => {
		if (newPassword !== confirmPassword) {
			toast({
				title: "Error",
				description: "New passwords do not match",
				variant: "destructive",
			});
			return;
		}

		try {
			await updatePasswordMutation.mutateAsync({
				body: {
					currentPassword,
					newPassword,
				},
			});

			setCurrentPassword("");
			setNewPassword("");
			setConfirmPassword("");

			toast({
				title: "Success",
				description: "Your password has been updated.",
			});
		} catch (error) {
			toast({
				title: "Error",
				description: getApiErrorMessage(error, "An error occurred"),
				variant: "destructive",
			});
		}
	};

	return (
		<div className="flex flex-col">
			<div className="flex-1 space-y-5">
				<div className="mx-auto w-full max-w-3xl space-y-5">
					<div>
						<h1 className="text-xl font-medium tracking-tight">Security</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Manage how you sign in.
						</p>
					</div>
					<SettingsSection
						title="Change Password"
						description="Update your password"
					>
						<div className="space-y-4">
							<div className="space-y-2">
								<Label htmlFor="current-password">Current Password</Label>
								<Input
									id="current-password"
									type="password"
									value={currentPassword}
									onChange={(e) => setCurrentPassword(e.target.value)}
								/>
							</div>
							<Separator />
							<div className="space-y-2">
								<Label htmlFor="new-password">New Password</Label>
								<Input
									id="new-password"
									type="password"
									value={newPassword}
									onChange={(e) => setNewPassword(e.target.value)}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="confirm-password">Confirm New Password</Label>
								<Input
									id="confirm-password"
									type="password"
									value={confirmPassword}
									onChange={(e) => setConfirmPassword(e.target.value)}
								/>
							</div>
							<div className="flex justify-end pt-1">
								<Button
									onClick={handleUpdatePassword}
									disabled={updatePasswordMutation.isPending}
								>
									{updatePasswordMutation.isPending
										? "Updating..."
										: "Update Password"}
								</Button>
							</div>
						</div>
					</SettingsSection>

					<SettingsSection
						title="Passkeys"
						description="Manage your passkeys for passwordless login"
					>
						<div className="space-y-4">
							<PasskeyList />
							<div className="flex justify-end pt-1">
								<Button
									onClick={async () => {
										await addPasskey();
									}}
								>
									Add Passkey
								</Button>
							</div>
						</div>
					</SettingsSection>
				</div>
			</div>
		</div>
	);
}
