using Coss;

namespace Coss.Email;

public partial interface ISuppressionsClient
{
    /// <summary>
    /// The suppression list of the API key's environment, newest first. Pass the last `id` as `after` to get the next page while `has_more` is true.
    /// </summary>
    WithRawResponseTask<SuppressionList> ListAsync(
        ListSuppressionsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Suppresses an address in the API key's environment: later sends skip it, either for every email (`scope: "*"`, the default) or only for emails with the given `category` (e.g. to back an unsubscribe link). Adding an address that is already suppressed with the same scope returns the existing entry with status 200.
    /// </summary>
    WithRawResponseTask<Suppression> AddAsync(
        CreateSuppressionRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Whether a send to `address` (with `category`, if given) would skip it, and the entries that match: those with scope `*` and, with a `category`, those for that category.
    /// </summary>
    WithRawResponseTask<SuppressionCheck> CheckAsync(
        CheckSuppressionsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Adds up to 1000 entries at once, with reason `import`. Each entry is validated on its own: invalid ones are skipped and listed in `invalid`, entries already on the list are left unchanged and counted in `existing`. Importing again is safe.
    /// </summary>
    WithRawResponseTask<SuppressionImport> ImportAsync(
        ImportSuppressionsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// The whole suppression list of the API key's environment (optionally filtered), oldest first, as CSV with the columns `address,scope,reason,created_at,email_id,id`. The file can be imported again as is. Values a spreadsheet would run as a formula are prefixed with `'`.
    /// </summary>
    WithRawResponseTask<string> ExportAsync(
        ExportSuppressionsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// One entry of the suppression list of the API key's environment.
    /// </summary>
    WithRawResponseTask<Suppression> GetAsync(
        GetSuppressionsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Removes the entry, so later sends reach the address again (unless another entry still matches). Entries added for bounces and complaints can be removed too.
    /// </summary>
    WithRawResponseTask<DeletedSuppression> RemoveAsync(
        RemoveSuppressionsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
