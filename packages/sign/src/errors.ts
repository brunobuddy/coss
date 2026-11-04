export type SignErrorCode =
  | "idempotency_key_reused"
  | "request_in_progress"
  | "not_found"
  | "invalid_document"
  | "document_in_use"
  | "invalid_fields"
  | "invalid_signers"
  | "invalid_expiry"
  | "request_not_draft"
  | "request_not_cancelable"
  | "account_suspended"
  | "billing_hold"
  | "budget_exceeded"
  | "invalid_origin"
  | "request_not_signable"
  | "signer_not_embedded"
  | "signer_finished"
  | "not_signers_turn"
  | "consent_required"
  | "invalid_signing"
  | "signed_document_not_ready"
  | "reminder_not_due"
  | "invalid_sender"
  | "template_incomplete"
  | "request_not_deletable";

const STATUS_BY_CODE = {
  idempotency_key_reused: 422,
  request_in_progress: 409,
  not_found: 404,
  // Not a PDF coss.com can read, encrypted, or too many pages.
  invalid_document: 422,
  // A signature request uses the document.
  document_in_use: 422,
  // Off the page, on a page that doesn't exist, or an anchor that isn't in the documents.
  invalid_fields: 422,
  invalid_signers: 422,
  invalid_expiry: 422,
  // Not 409: the SDK retries those.
  request_not_draft: 422,
  request_not_cancelable: 422,
  account_suspended: 403,
  billing_hold: 402,
  budget_exceeded: 402,
  // An origin allowed to embed the signing page that isn't `https://host[:port]`.
  invalid_origin: 422,
  // Signing needs a `sent` request that hasn't expired.
  request_not_signable: 422,
  // The API mints sessions for `delivery: embedded` signers only (coss.com emails the others).
  signer_not_embedded: 422,
  // The signer already signed or declined.
  signer_finished: 422,
  // Sequential order: someone before this signer hasn't signed yet.
  not_signers_turn: 422,
  // The signer hasn't agreed to sign electronically yet.
  consent_required: 403,
  // Missing or malformed field values or signature image.
  invalid_signing: 422,
  // Not completed, or still being sealed (not 409: the SDK retries those).
  signed_document_not_ready: 422,
  // Not sent, or nobody to remind (embedded signers, or reminded within the hour).
  reminder_not_due: 422,
  // `email_from` isn't on a verified domain of the organization.
  invalid_sender: 422,
  // No documents, no roles, or a role without a signature field.
  template_incomplete: 422,
  // A `sent` request: cancel it first.
  request_not_deletable: 422,
} as const satisfies Record<SignErrorCode, number>;

/** Expected failures of the Sign product; `status` is the HTTP status the API should use. */
export class SignError extends Error {
  readonly code: SignErrorCode;
  /** The request field at fault, e.g. `signers[0].fields[1].page`. */
  readonly param: string | undefined;

  constructor(code: SignErrorCode, message: string, opts?: { param?: string }) {
    super(message);
    this.name = "SignError";
    this.code = code;
    this.param = opts?.param;
  }

  get status(): (typeof STATUS_BY_CODE)[SignErrorCode] {
    return STATUS_BY_CODE[this.code];
  }
}
