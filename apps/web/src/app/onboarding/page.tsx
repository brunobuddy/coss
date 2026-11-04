import type { Metadata } from "next";
import { AuthFrame } from "@/components/auth-frame";
import { SignOutButton } from "@/components/sign-out-button";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { requireSession } from "@/lib/session";
import { CreateOrganizationForm } from "./create-organization-form";

export const metadata: Metadata = { title: "Create an organization" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  await requireSession();
  const next = safeRedirectPath((await searchParams).next, "") || null;
  return (
    <AuthFrame>
      <div className="flex flex-col gap-6">
        <CreateOrganizationForm next={next} />
        <div className="flex justify-center border-t pt-4">
          <SignOutButton />
        </div>
      </div>
    </AuthFrame>
  );
}
