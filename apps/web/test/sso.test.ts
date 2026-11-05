import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
mock.module("@coss/email", () => ({
  BroadcastError: class extends Error {},
  ContactError: class extends Error {},
  DomainError: class extends Error {},
  EmailError: class extends Error {},
  InboxError: class extends Error {},
  SubaccountError: class extends Error {},
}));
mock.module("@coss/tenancy", () => ({ TenancyError: class extends Error {} }));
const { discoverOidcEndpoints, samlConfigFrom, samlEntryPointFromMetadata, ssoUrls } = await import(
  "../src/lib/sso"
);

describe("ssoUrls", () => {
  test("serves everything under /api/auth on the dashboard origin", () => {
    expect(ssoUrls("https://coss.com/", "sso_x")).toEqual({
      oidcRedirectUri: "https://coss.com/api/auth/sso/callback/sso_x",
      samlAcsUrl: "https://coss.com/api/auth/sso/saml2/sp/acs/sso_x",
      samlEntityId: "https://coss.com/api/auth/sso/saml2/sp/metadata?providerId=sso_x",
      samlMetadataUrl: "https://coss.com/api/auth/sso/saml2/sp/metadata?providerId=sso_x",
    });
  });
});

describe("samlEntryPointFromMetadata", () => {
  const metadata = (services: string) =>
    `<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="https://idp.example.com"><md:IDPSSODescriptor>${services}</md:IDPSSODescriptor></md:EntityDescriptor>`;

  test("prefers the HTTP-Redirect binding", () => {
    expect(
      samlEntryPointFromMetadata(
        metadata(
          '<md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="https://idp.example.com/post"/>' +
            '<md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.com/redirect"/>',
        ),
      ),
    ).toBe("https://idp.example.com/redirect");
  });

  test("falls back to the first service, and to null without a valid URL", () => {
    expect(
      samlEntryPointFromMetadata(
        metadata('<SingleSignOnService Location="https://idp.example.com/only" Binding="x"/>'),
      ),
    ).toBe("https://idp.example.com/only");
    expect(samlEntryPointFromMetadata(metadata(""))).toBeNull();
    expect(
      samlEntryPointFromMetadata(metadata('<md:SingleSignOnService Location="not a url"/>')),
    ).toBeNull();
  });
});

describe("discoverOidcEndpoints", () => {
  test("refuses non-https and private issuers before fetching anything", async () => {
    await expect(discoverOidcEndpoints("http://idp.example.com")).rejects.toThrow(
      "The issuer must be a public https:// URL.",
    );
    await expect(discoverOidcEndpoints("https://127.0.0.1")).rejects.toThrow(
      "The issuer must be a public https:// URL.",
    );
    await expect(discoverOidcEndpoints("https://169.254.169.254")).rejects.toThrow(
      "The issuer must be a public https:// URL.",
    );
  });

  describe("issuers", () => {
    const realFetch = globalThis.fetch;
    afterEach(() => {
      globalThis.fetch = realFetch;
    });

    const servingIssuer = (issuer: string) => {
      const base = issuer.replace(/\/$/, "");
      globalThis.fetch = (async () =>
        Response.json({
          issuer,
          authorization_endpoint: `${base}/authorize`,
          token_endpoint: `${base}/token`,
          jwks_uri: `${base}/jwks`,
          userinfo_endpoint: `${base}/userinfo`,
        })) as unknown as typeof fetch;
    };

    test("a bare origin with the slash `httpsUrl` adds keeps the IdP's own issuer", async () => {
      servingIssuer("https://1.1.1.1");
      const endpoints = await discoverOidcEndpoints("https://1.1.1.1/");
      expect(endpoints.issuer).toBe("https://1.1.1.1");
      expect(endpoints.tokenEndpoint).toBe("https://1.1.1.1/token");
    });

    test("a missing slash keeps the IdP's own issuer", async () => {
      servingIssuer("https://1.1.1.1/tenant/");
      const endpoints = await discoverOidcEndpoints("https://1.1.1.1/tenant");
      expect(endpoints.issuer).toBe("https://1.1.1.1/tenant/");
    });

    test("any other difference is refused", async () => {
      servingIssuer("https://1.1.1.1/other");
      await expect(discoverOidcEndpoints("https://1.1.1.1/tenant")).rejects.toThrow(
        "does not match configured issuer",
      );
    });
  });
});

describe("samlConfigFrom", () => {
  function config(fields: Record<string, string>, update = true) {
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.set(name, value);
    return samlConfigFrom(form, "https://coss.com", "sso_acme", update);
  }

  const manual = {
    samlEntryPoint: "https://idp.example.com/sso",
    samlIdpEntityId: "https://idp.example.com",
    samlCertificate: "",
  };

  test("editing domains or re-enabling a manual provider retains both stored certificates", () => {
    const result = config(manual);
    expect(result).toMatchObject({
      entryPoint: manual.samlEntryPoint,
      idpMetadata: { entityID: manual.samlIdpEntityId },
      wantAssertionsSigned: true,
    });
    expect(result).not.toHaveProperty("cert");
    expect(result.idpMetadata).not.toHaveProperty("cert");
  });

  test("certificate rotation updates both certificate fields", () => {
    expect(config({ ...manual, samlCertificate: "new certificate" })).toMatchObject({
      cert: "new certificate",
      idpMetadata: { entityID: manual.samlIdpEntityId, cert: "new certificate" },
    });
  });

  test("blank update fields preserve the stored IdP configuration", () => {
    const result = config({});
    expect(result).not.toHaveProperty("entryPoint");
    expect(result).not.toHaveProperty("cert");
    expect(result).not.toHaveProperty("idpMetadata");
  });

  test("registration still requires every manual field", () => {
    const complete = { ...manual, samlCertificate: "certificate" };
    for (const field of Object.keys(complete)) {
      expect(() => config({ ...complete, [field]: "" }, false)).toThrow(
        "Paste the IdP metadata XML",
      );
    }
    expect(config(complete, false)).toMatchObject({ cert: "certificate" });
  });

  test("metadata registration still works and invalid updates are rejected", () => {
    const metadata =
      '<EntityDescriptor><SingleSignOnService Location="https://idp.example.com/sso"/></EntityDescriptor>';
    expect(config({ samlMetadata: metadata }, false)).toMatchObject({
      entryPoint: manual.samlEntryPoint,
      idpMetadata: { metadata },
    });
    expect(() => config({ ...manual, samlEntryPoint: "http://idp.example.com" })).toThrow(
      "The SSO URL must be an https:// URL.",
    );
    expect(() => config({ ...manual, samlCertificate: "x".repeat(100_001) })).toThrow(
      "That document is too large",
    );
  });
});
