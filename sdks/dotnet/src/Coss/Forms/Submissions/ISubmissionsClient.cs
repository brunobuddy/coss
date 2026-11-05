using Coss;

namespace Coss.Forms;

public partial interface ISubmissionsClient
{
    /// <summary>
    /// Newest first. `status` narrows them: `accepted` (delivered), `held` (Risk asked for a review), `spam` and `pending_confirmation` (waiting for the submitter's email link).
    /// </summary>
    WithRawResponseTask<FormSubmissionList> ListAsync(
        ListSubmissionsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// One submission of the form, with its data, files and Risk's assessment.
    /// </summary>
    WithRawResponseTask<FormSubmission> GetAsync(
        GetSubmissionsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Deletes the submission and its files.
    /// </summary>
    WithRawResponseTask<DeletedFormSubmission> RemoveAsync(
        RemoveSubmissionsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Not spam: a `held` or `spam` submission becomes `accepted` and is delivered (webhooks, notifications, contacts), and Risk records its assessment as `legitimate`. Releasing an accepted submission returns it as is.
    /// </summary>
    WithRawResponseTask<FormSubmission> ReleaseAsync(
        ReleaseSubmissionsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// A file uploaded with the submission, as `application/octet-stream`: whatever its type, treat it as untrusted (a submitter chose it).
    /// </summary>
    WithRawResponseTask<global::System.IO.Stream> FileAsync(
        FileSubmissionsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
