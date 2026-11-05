using Coss;

namespace Coss.LogDrains;

public partial interface IBatchesClient
{
    /// <summary>
    /// The drain's delivery log, newest first: one batch per request, with every HTTP attempt. A failing batch is retried with backoff for about a day (10 attempts); if every attempt fails, the drain is disabled. Pass the last `id` as `after` to get the next page while `has_more` is true.
    /// </summary>
    WithRawResponseTask<LogDrainBatchList> ListAsync(
        ListBatchesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// One batch of the drain, with every HTTP attempt.
    /// </summary>
    WithRawResponseTask<LogDrainBatch> GetAsync(
        GetBatchesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
