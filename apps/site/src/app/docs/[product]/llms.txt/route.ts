import { notFound } from "next/navigation";
import { apiIndex, productIndex, productIndexSlugs } from "@/lib/llms";

// /docs/<product>/llms.txt: a product's guides and API operations (/llms.txt links each), and
// /docs/api-reference/llms.txt: every operation. Under /docs, so the load balancer needs no rule.
export const revalidate = false;
export const dynamicParams = false;

export async function GET(_request: Request, { params }: RouteContext<"/docs/[product]/llms.txt">) {
  const { product } = await params;
  const text = product === "api-reference" ? apiIndex() : productIndex(product);
  if (!text) notFound();
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export function generateStaticParams() {
  return ["api-reference", ...productIndexSlugs()].map((product) => ({ product }));
}
