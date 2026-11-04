using Coss;

namespace Coss.Sign;

public partial interface ITemplatesClient
{
    /// <summary>
    /// Newest first. Pass the last `id` as `after` while `has_more` is true.
    /// </summary>
    WithRawResponseTask<SignTemplateList> ListAsync(
        ListTemplatesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Documents with fields for roles (`client`, `company`) instead of named signers, made into requests by naming a signer per role. Fields by position or text anchor (resolved now). Can start empty and be built in the embedded builder (create a builder session).
    /// </summary>
    WithRawResponseTask<SignTemplate> CreateAsync(
        CreateSignTemplateRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// A template with its documents, roles and fields. `ready` says whether requests can be made from it.
    /// </summary>
    WithRawResponseTask<SignTemplate> GetAsync(
        GetTemplatesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Requests made from it, and its documents, stay.
    /// </summary>
    WithRawResponseTask<DeletedSignTemplate> RemoveAsync(
        RemoveTemplatesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Changes the fields given. `documents`, `roles` and `fields` each replace the whole list. Requests already made from it don't change.
    /// </summary>
    WithRawResponseTask<SignTemplate> UpdateAsync(
        UpdateSignTemplateRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// A signature request with the template's documents and fields: name one signer for each role, and give its merge fields' values. Like creating a request, it is sent at once unless `send` is `false`, and an `Idempotency-Key` makes retries safe.
    /// </summary>
    WithRawResponseTask<SignRequest> CreateRequestAsync(
        CreateSignRequestFromTemplateRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// A short-lived link to the embedded builder for this template: upload documents, add roles, and drag fields onto pages. Embed it with `mountBuilder` from `coss/sign` (from an origin in your Sign settings' `allowed_origins`) for whoever edits the template.
    /// </summary>
    WithRawResponseTask<SignBuilderSession> CreateBuilderSessionAsync(
        CreateSignBuilderSessionRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
