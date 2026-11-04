using Coss;

namespace Coss.Scheduling;

public partial interface IAvailabilityClient
{
    /// <summary>
    /// For "who's free" pages: each matching host's soonest slots, soonest first, across up to 500 hosts.
    /// </summary>
    WithRawResponseTask<SchedulingAvailabilitySearchResult> SearchAsync(
        AvailabilitySearchRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
