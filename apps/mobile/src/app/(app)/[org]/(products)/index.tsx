import { PRODUCT_CATEGORIES, PRODUCTS, type ProductKey } from "@coss/dashboard-routes";
import * as Haptics from "expo-haptics";
import type { Href } from "expo-router";
import { Code, ExternalLink } from "lucide-react-native";
import { Icon } from "../../../../components/icon";
import { ListRow, Panel, Ruled } from "../../../../components/panel";
import { ProductGlyph } from "../../../../components/product-glyph";
import { RootToolbar } from "../../../../components/root-toolbar";
import { Screen } from "../../../../components/screen";
import { useActiveEnvironment } from "../../../../lib/active-environment";
import { DEVELOPER_PAGES, PRODUCT_ICONS, productHref } from "../../../../lib/products";
import { useEnvironmentHome } from "../../../../lib/queries-scheduling";
import { environmentPath, openOnWeb } from "../../../../lib/web";

export default function ProductsScreen() {
  const { params, organization, isPending } = useActiveEnvironment();
  const home = useEnvironmentHome(params);
  if (isPending || !params || home.isPending) {
    return (
      <Screen loading="list" title="Products">
        <RootToolbar environment />
      </Screen>
    );
  }
  if (home.isError && !home.data) {
    return <Screen error={home.error} onRetry={() => home.refetch()} title="Products" />;
  }
  const base = environmentPath(params);
  const can = organization?.can;
  const inUse = new Set<ProductKey>(home.data?.products.map((product) => product.key));
  const figures = new Map(home.data?.products.map((product) => [product.key, product]));
  const row = (key: ProductKey) => {
    const product = PRODUCTS.find((item) => item.key === key);
    if (!product) return null;
    const href = productHref(key, base, can);
    const figure = figures.get(key);
    return (
      <ListRow
        external={!href}
        detail={figure && !figure.elsewhere ? String(figure.count) : undefined}
        href={href ? (href as Href) : undefined}
        key={key}
        leading={<ProductGlyph icon={PRODUCT_ICONS[key]} size={32} tone={key} />}
        onPress={
          href
            ? undefined
            : () => {
                void Haptics.selectionAsync();
                openOnWeb(`${base}${product.path}`);
              }
        }
        subtitle={product.description}
        title={product.name}
        trailing={href ? undefined : <Icon color="mutedForeground" icon={ExternalLink} size={14} />}
      />
    );
  };
  const others = PRODUCT_CATEGORIES.flatMap((category) =>
    PRODUCTS.filter((product) => product.category === category.key && !inUse.has(product.key)),
  );
  const developers = DEVELOPER_PAGES.filter((page) => can?.[page.can]);
  return (
    <Screen onRefresh={() => home.refetch()} title="Products">
      <RootToolbar environment />
      {inUse.size > 0 ? (
        <Panel title="In use">
          <Ruled>
            {PRODUCTS.filter((product) => inUse.has(product.key)).map((item) => row(item.key))}
          </Ruled>
        </Panel>
      ) : null}
      {others.length > 0 ? (
        <Panel title={inUse.size > 0 ? "Discover" : "Products"}>
          <Ruled>{others.map((item) => row(item.key))}</Ruled>
        </Panel>
      ) : null}
      {developers.length > 0 ? (
        <Panel icon={Code} title="Developers">
          <Ruled>
            {developers.map((page) => (
              <ListRow
                href={`${base}/${page.path}` as Href}
                key={page.path}
                leading={<Icon color="mutedForeground" icon={page.icon} size={18} />}
                onPress={undefined}
                title={page.label}
              />
            ))}
          </Ruled>
        </Panel>
      ) : null}
    </Screen>
  );
}
