import { Avatar, AvatarFallback, AvatarImage } from "@coss/ui/components/avatar";
import { cn } from "@coss/ui/lib/utils";
import { initials } from "./shell/initials";

/** The organization's logo on a white tile (most are drawn for light grounds), else its initials. */
export function OrganizationAvatar(props: {
  name: string;
  logo: string | null | undefined;
  className?: string;
}) {
  return (
    <Avatar
      className={cn(
        "size-7 rounded-lg",
        props.logo ? "border bg-white" : "bg-primary text-primary-foreground",
        props.className,
      )}
    >
      {props.logo ? <AvatarImage alt="" className="object-contain p-0.5" src={props.logo} /> : null}
      <AvatarFallback className="rounded-lg bg-primary bg-linear-to-b from-white/18 to-60% to-transparent font-semibold text-primary-foreground text-xs inset-shadow-[0_1px_--theme(--color-white/16%)]">
        {initials(props.name)}
      </AvatarFallback>
    </Avatar>
  );
}
