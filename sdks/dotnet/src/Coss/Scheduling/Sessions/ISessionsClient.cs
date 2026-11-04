using Coss;

namespace Coss.Scheduling;

public partial interface ISessionsClient
{
    /// <summary>
    /// Lets one host manage their own hours, calendars and locations, on coss.com's hosted page or your own UI. Send the `url` to their browser, or embed it with `coss/scheduling`.
    /// </summary>
    WithRawResponseTask<SchedulingSession> CreateForHostAsync(
        CreateSchedulingHostSessionRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Lets a browser book one event type, on coss.com's hosted page or your own UI, without your API key.
    /// </summary>
    WithRawResponseTask<SchedulingSession> CreateForBookerAsync(
        CreateSchedulingBookerSessionRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Lets an attendee reschedule or cancel this one booking, within the event type's cutoffs. Stops working when the booking's cancelled, or a day after it ends.
    /// </summary>
    WithRawResponseTask<SchedulingSession> CreateForBookingAsync(
        CreateForBookingSessionsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
