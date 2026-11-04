import { orgRoleCan } from "@coss/auth/permissions";
import { listUserOrganizations } from "@coss/tenancy";
import { redirect } from "next/navigation";
import { planIntent, planIntentPath } from "@/lib/plan-intent";
import { getSession } from "@/lib/session";

/**
 * Entry point: sign in, create a first organization, or open the first organization. `?plan=` is
 * the plan picked on the pricing page: it survives the first two and ends on the plans page.
 */
export default async function HomePage({ searchParams }: PageProps<"/dashboard">) {
  const plan = planIntent((await searchParams).plan);
  const here = plan ? `?next=${encodeURIComponent(planIntentPath(plan))}` : "";
  const session = await getSession();
  if (!session) redirect(`/sign-in${here}`);

  const [first] = await listUserOrganizations({ userId: session.user.id });
  if (!first) redirect(`/onboarding${here}`);
  redirect(
    plan && orgRoleCan(first.role, { billing: ["read"] })
      ? `/${first.slug}/settings/billing/plans`
      : `/${first.slug}`,
  );
}
