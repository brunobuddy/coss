import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const alt = "coss.com products";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    label: "Products",
    title: "Email, SMS, inboxes, signatures and more, on one key.",
  });
}
