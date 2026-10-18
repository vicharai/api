"use client";

import { useState } from "react";

import { useUser } from "@/hooks/useUser";
import { useAuth } from "@/lib/auth-client";
import { Button } from "@/lib/components/button";
import { toast } from "@/lib/components/use-toast";

export function EmailVerificationBanner() {
	const { user } = useUser();
	const { sendVerificationEmail } = useAuth();
	const [isResending, setIsResending] = useState(false);

	if (!user || user.emailVerified) {
		return null;
	}

	const handleResendVerification = async () => {
		setIsResending(true);

		const { error } = await sendVerificationEmail({
			email: user.email,
			callbackURL: `${window.location.origin}/dashboard?emailVerified=true`,
		});

		if (error) {
			toast({
				title: "Error",
				description: error.message ?? "Failed to send verification email",
				variant: "destructive",
			});
		} else {
			toast({
				title: "Verification email sent",
				description: "Please check your inbox for the verification email.",
			});
		}

		setIsResending(false);
	};

	return (
		<div className="bg-warning-soft px-4 py-3 sm:px-8">
			<div className="flex items-center justify-between">
				<div className="flex items-center">
					<div className="flex-1">
						<p className="text-sm text-foreground">
							<strong>Your email is unverified.</strong> Please check your inbox
							and click the verification link to access all features.
						</p>
					</div>
				</div>
				<div className="ml-4">
					<Button
						variant="outline"
						size="sm"
						onClick={handleResendVerification}
						disabled={isResending}
						className="border-transparent font-medium text-brand hover:bg-brand-soft"
					>
						{isResending ? "Sending..." : "Resend Email"}
					</Button>
				</div>
			</div>
		</div>
	);
}
