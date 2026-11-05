export type SupportErrorCode =
  | "not_found"
  | "new_message"
  | "invalid_attachment"
  | "attachments_unavailable"
  | "invalid_state";

/** Its message is written for the person who caused it. */
export class SupportError extends Error {
  readonly code: SupportErrorCode;

  constructor(code: SupportErrorCode, message: string) {
    super(message);
    this.name = "SupportError";
    this.code = code;
  }
}
