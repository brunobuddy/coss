"use client";

import { Button } from "@coss/ui/components/button";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast, useActionToast } from "@/lib/toast";
import { connectDnsAction, verifyDomainAction } from "../actions";
import { domainCheckToast } from "./domain-actions";

type Target = { orgSlug: string; domainId: string };

/** "Connect with Cloudflare": the action redirects to the DNS provider (Domain Connect). */
export function DomainConnectButton(props: Target & { providerName: string }) {
  const [, formAction, pending] = useActionToast(connectDnsAction, {
    success: `Opening ${props.providerName}`,
    errors: "toast",
  });

  return (
    <form action={formAction}>
      <input name="orgSlug" type="hidden" value={props.orgSlug} />
      <input name="domainId" type="hidden" value={props.domainId} />
      <Button loading={pending} size="sm" type="submit">
        Connect with {props.providerName}
      </Button>
    </form>
  );
}

/**
 * Back from the DNS provider (`?dns_connect=done`, plus `error` when nothing was added): says how it
 * went, checks the domain right away, and drops the query so a reload doesn't repeat it.
 */
export function DomainConnectReturn(props: Target & { error: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    router.replace(pathname, { scroll: false });
    if (props.error) {
      if (props.error === "access_denied") {
        toast.info("DNS setup canceled", "Nothing was changed at your DNS provider.");
      } else {
        toast.error("Your DNS provider couldn't add the records", "Add them below instead.");
      }
      return;
    }
    toast.success("DNS records added at your DNS provider");
    const formData = new FormData();
    formData.set("orgSlug", props.orgSlug);
    formData.set("domainId", props.domainId);
    verifyDomainAction(null, formData).then(
      (result) => {
        if (!result.ok) return;
        // The action refreshes the page itself.
        toastContent(domainCheckToast(result.data));
      },
      () => {},
    );
  }, [props.error, props.orgSlug, props.domainId, pathname, router]);

  return null;
}

function toastContent(content: ReturnType<typeof domainCheckToast>) {
  if (typeof content === "string") toast.success(content);
  else toast[content.type](content.title, content.description);
}
