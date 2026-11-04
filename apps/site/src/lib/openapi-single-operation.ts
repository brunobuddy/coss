const HTTP_METHODS = new Set(["get", "put", "post", "delete", "patch", "options", "head", "trace"]);

/**
 * An API page's props with only its own operation. `<OpenAPIPage />` is a client component, so
 * whatever it's given is serialized into the page: the whole document, every operation's samples
 * included, made each of the 306 pages over 3 MB. Components stay as far as `$ref`s reach them.
 */
export function singleOperationProps<
  Props extends {
    operations?: readonly { path: string; method: string }[];
    payload: { bundled: unknown };
  },
>(props: Props): Props {
  const bundled = props.payload.bundled as OpenApiNode & {
    paths?: Record<string, OpenApiNode>;
    components?: Record<string, OpenApiNode>;
  };
  const paths: Record<string, OpenApiNode> = {};
  for (const { path, method } of props.operations ?? []) {
    const item = bundled.paths?.[path] ?? {};
    const shared = Object.entries(item).filter(([key]) => !HTTP_METHODS.has(key));
    paths[path] = { ...paths[path], ...Object.fromEntries(shared), [method]: item[method] };
  }

  const components: Record<string, OpenApiNode> = {};
  const seen = new Set<string>();
  const follow = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) follow(child);
      return;
    }
    if (typeof node !== "object" || node === null) return;
    for (const [key, value] of Object.entries(node)) {
      if (key !== "$ref" || typeof value !== "string") {
        follow(value);
        continue;
      }
      const [, kind, name] = /^#\/components\/([^/]+)\/([^/]+)$/.exec(value) ?? [];
      if (!kind || !name || seen.has(value)) continue;
      seen.add(value);
      const target = bundled.components?.[kind]?.[name];
      components[kind] = { ...components[kind], [name]: target };
      follow(target);
    }
  };
  follow(paths);
  // Requests refer to these by name, not with a `$ref`.
  if (bundled.components?.securitySchemes) {
    components.securitySchemes = bundled.components.securitySchemes;
  }

  return {
    ...props,
    payload: { ...props.payload, bundled: { ...bundled, paths, components } },
  };
}

type OpenApiNode = Record<string, unknown>;
