import { fetchPublicSignupMode } from "@/lib/public-content";

import { SignupForm } from "./signup-form";

export default async function SignupPage() {
	return <SignupForm signupMode={await fetchPublicSignupMode()} />;
}
