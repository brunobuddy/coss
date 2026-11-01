"use client";

import {
  PRODUCT_CATEGORIES,
  PRODUCTS,
  type ProductKey,
  type ProductPreferences,
} from "@coss/dashboard-routes";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@coss/ui/components/input-group";
import { SearchIcon } from "lucide-react";
import { useState } from "react";
import { ProductCell, ProductGrid } from "@/components/product-grid";
import { ProductPinButton } from "@/components/product-pin-button";
import { SectionHeading } from "@/components/section-heading";
import { StatusDot } from "@/components/status-dot";

/** Every product by category, filtered as you type, each with its state in this environment. */
export function ProductCatalog(props: {
  base: string;
  orgSlug: string;
  inUse: ProductKey[];
  visible: ProductKey[];
  preferences: ProductPreferences;
}) {
  const [query, setQuery] = useState("");
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = PRODUCTS.filter((product) => {
    const text = `${product.name} ${product.description} ${product.pages.map((page) => page.label).join(" ")}`;
    return words.every((word) => text.toLowerCase().includes(word));
  });

  return (
    <div className="flex flex-col gap-8">
      <InputGroup className="max-w-sm">
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          aria-label="Filter products"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter products…"
          type="search"
          value={query}
        />
      </InputGroup>
      {matches.length === 0 ? (
        <p className="text-muted-foreground text-sm">No product matches “{query}”.</p>
      ) : null}
      {PRODUCT_CATEGORIES.map((category) => {
        const products = matches.filter((product) => product.category === category.key);
        if (products.length === 0) return null;
        return (
          <section className="flex flex-col gap-3" key={category.key}>
            <SectionHeading title={category.label} />
            <ProductGrid>
              {products.map((product) => {
                const inUse = props.inUse.includes(product.key);
                const pinned = props.preferences[product.key] === true;
                return (
                  <ProductCell
                    action={
                      <ProductPinButton
                        inUse={inUse}
                        orgSlug={props.orgSlug}
                        preference={props.preferences[product.key]}
                        product={{ key: product.key, name: product.name }}
                        visible={props.visible.includes(product.key)}
                      />
                    }
                    detail={
                      inUse || pinned ? (
                        <StatusDot
                          className="text-muted-foreground"
                          tone={inUse ? "success" : "neutral"}
                        >
                          {inUse ? "In use here" : "Pinned"}
                        </StatusDot>
                      ) : null
                    }
                    docs
                    href={props.base + product.path}
                    key={product.key}
                    product={product}
                  />
                );
              })}
            </ProductGrid>
          </section>
        );
      })}
    </div>
  );
}
