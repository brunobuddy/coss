using Coss;

namespace Coss.Scheduling;

public partial interface ISlotsClient
{
    /// <summary>
    /// Starts an attendee can book between `start` and `end` (at most 62 days), as UTC instants to show in their own time zone. A host whose calendar can't be read isn't offered.
    /// </summary>
    WithRawResponseTask<SchedulingSlotList> ListAsync(
        ListSlotsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Why one start can or can't be booked right now, host by host, decided the same way a booking is. For support and debugging: it says when a host is busy, so don't show it to attendees.
    /// </summary>
    WithRawResponseTask<SchedulingSlotExplanation> ExplainAsync(
        ExplainSlotsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
