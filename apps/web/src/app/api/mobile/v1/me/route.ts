import type { MeResponse } from "@coss/companion";
import { listUserOrganizations } from "@coss/tenancy";
import { mobileRoute, requireMobileSession } from "@/lib/mobile-api";
import { toMobileUser } from "@/lib/mobile-wire";

export const dynamic = "force-dynamic";

export const GET = mobileRoute(async (request): Promise<MeResponse> => {
  const session = await requireMobileSession(request);
  const organizations = await listUserOrganizations({ userId: session.user.id });
  return {
    user: toMobileUser(session.user),
    organizations: organizations.map(({ name, slug, role }) => ({ name, slug, role })),
  };
});
