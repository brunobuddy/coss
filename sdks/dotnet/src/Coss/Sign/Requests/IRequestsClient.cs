using Coss;

namespace Coss.Sign;

public partial interface IRequestsClient
{
    /// <summary>
    /// Signature requests of the API key's environment, newest first. Pass the last `id` as `after` to get the next page while `has_more` is true.
    /// </summary>
    WithRawResponseTask<SignRequestList> ListAsync(
        ListRequestsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Asks one or more signers to sign one or more PDFs. Give documents by id (uploaded) or inline, and each signer's fields by position (`page`, `x`, `y`, `width`, `height` in PDF points from the page's top left) or by text anchor (`{{signature:signer_1}}`). Every signer needs a `signature` field. Sent at once unless `send` is `false` (a `draft`). Each signer signs by email (`delivery: "email"`, the default) or in your app (`"embedded"`).
    /// </summary>
    WithRawResponseTask<SignRequest> CreateAsync(
        CreateSignRequestRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// A signature request with its documents, signers and fields, and `signed_document` once it's sealed.
    /// </summary>
    WithRawResponseTask<SignRequest> GetAsync(
        GetRequestsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Deletes a request that isn't `sent` (cancel it first) with its signers, fields, audit trail, signatures and signed document, for good. Its documents stay (delete them on their own). Keep the signed document first if you need it: it is your record.
    /// </summary>
    WithRawResponseTask<DeletedSignRequest> RemoveAsync(
        RemoveRequestsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Sends a `draft`. An already sent request is returned as is.
    /// </summary>
    WithRawResponseTask<SignRequest> SendAsync(
        SendRequestsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Cancels a `draft` or `sent` request: its signers can no longer sign. An already canceled request is returned as is.
    /// </summary>
    WithRawResponseTask<SignRequest> CancelAsync(
        CancelRequestsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Everything that happened to the request, oldest first: who did it, from which address, the documents' SHA-256 when it mattered, and a hash chain (`previous_hash`, `hash`) that shows the trail is complete and unchanged.
    /// </summary>
    WithRawResponseTask<SignEventList> AuditTrailAsync(
        AuditTrailRequestsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Emails a reminder, with a fresh link, to every email signer of a sent request who hasn't signed and whose turn it is, unless they were emailed in the last hour. Embedded signers are yours to remind. Sent within seconds; each is a `reminded` event in the audit trail.
    /// </summary>
    WithRawResponseTask<SignRequest> RemindAsync(
        RemindRequestsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// The completed request's sealed PDF: every document with the signatures and values filled in, then a certificate of completion (signers, how they were identified, what they agreed to, the documents' SHA-256 and the audit trail). coss.com's seal makes any later change visible in PDF viewers. Ready once `signed_document` is set, which the `sign_request.completed` webhook announces.
    /// </summary>
    WithRawResponseTask<global::System.IO.Stream> SignedDocumentAsync(
        SignedDocumentRequestsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
