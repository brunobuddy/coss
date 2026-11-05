/** Environment wire types (hand-written mirrors of the API's `Environment` schema). */

/** A project or organization, as named in the dashboard. */
export interface NamedResource {
  id: string;
  name: string;
  /** As in dashboard URLs. */
  slug: string;
}

/** `GET /v1/environment`: the environment the API key belongs to. */
export interface Environment {
  object: "environment";
  id: string;
  name: string;
  slug: string;
  /** `live` delivers email; `sandbox` (`coss_test_` keys) never does. */
  mode: "live" | "sandbox";
  project: NamedResource;
  organization: NamedResource & {
    /** The organization's pinned API version (for requests without `Coss-Version`). */
    api_version: string;
    /** Whether the organization is in HIPAA mode, which refuses some requests. */
    hipaa_mode: boolean;
  };
  /** The API key making the request. */
  api_key: {
    id: string;
    name: string | null;
    /** The key's first characters, as shown in the dashboard. */
    start: string | null;
    /**
     * `full`: every permission, including ones new products add later. `restricted`: only
     * `permissions`, chosen when the key was created.
     */
    access: "full" | "restricted";
    /** What the key may do now, as `resource:action` (e.g. `email:send`). */
    permissions: string[];
  };
}

/** `DELETE /v1/api_key`: the key revoked itself. */
export interface DeletedApiKey {
  object: "api_key";
  id: string;
  deleted: true;
}
