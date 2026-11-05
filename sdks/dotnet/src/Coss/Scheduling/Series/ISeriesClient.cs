using Coss;

namespace Coss.Scheduling;

public partial interface ISeriesClient
{
    /// <summary>
    /// Books up to 52 occurrences, keeping the attendee's local time across DST changes. Each one is an ordinary booking that can move on its own, and a pool keeps one host throughout.
    /// </summary>
    WithRawResponseTask<SchedulingSeries> CreateAsync(
        CreateSeriesBody request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Which occurrences would be free, without booking anything.
    /// </summary>
    WithRawResponseTask<SchedulingSeriesPreview> PreviewAsync(
        CreateSeriesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Cancels the occurrences from `from_index` on, or all of them.
    /// </summary>
    WithRawResponseTask<SchedulingCancelledSeries> CancelAsync(
        CancelSeriesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
