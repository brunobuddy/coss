export {
  accountOf,
  configurationSetsFor,
  createSesApi,
  isSesError,
  requiredTlsSetFor,
  type SesApi,
  type SesConfig,
  TENANT_SUPPRESSION,
  tenantNameFor,
} from "./api.ts";
export { SesDedicatedIpProvider } from "./dedicated-ips.ts";
export { MANAGED_TAG, SesIdentityProvider } from "./identity.ts";
export {
  createS3Api,
  LANDING_PREFIX,
  type ParsedSesReceipt,
  parseSesReceipt,
  type S3Api,
  S3InboundStore,
  type SesReceipt,
} from "./inbound.ts";
export { encodeAddress, encodeWords } from "./mime.ts";
export {
  type ParsedSesMessage,
  parseSesEvent,
  parseSesMessage,
  type TenantStatusEvent,
} from "./parse.ts";
export { EMAIL_ID_TAG, SesEmailProvider } from "./provider.ts";
