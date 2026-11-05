import {
  type EnvironmentUse,
  environmentHref,
  inUseElsewhereLabel,
  type Product,
} from "@coss/dashboard-routes";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { StatusDot } from "./status-dot";

/** A product cell's status when only other environments use it: a link to the first of them. */
export function ProductElsewhere(props: {
  product: Product;
  organization: string;
  project: string;
  environments: EnvironmentUse[];
}) {
  const [first] = props.environments;
  if (!first) return null;
  const href = environmentHref({
    organization: props.organization,
    project: props.project,
    environment: first.slug,
  });
  return (
    <Link
      className="group/elsewhere relative z-10 inline-flex items-center gap-1.5 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      href={href + props.product.path}
    >
      <StatusDot tone="neutral">{inUseElsewhereLabel(props.environments)}</StatusDot>
      <ArrowRightIcon className="size-3.5 transition-transform group-hover/elsewhere:translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  );
}
