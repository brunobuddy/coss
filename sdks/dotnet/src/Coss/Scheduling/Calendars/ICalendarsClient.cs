using Coss;

namespace Coss.Scheduling;

public partial interface ICalendarsClient
{
    /// <summary>
    /// A URL for the host to give consent at Google or Microsoft. Open it in a new window: providers refuse to be framed. Coss.com reads only busy times, and writes events with a neutral title unless the event type's `host_calendar_details` is `full`.
    /// </summary>
    WithRawResponseTask<SchedulingCalendarAuthorization> AuthorizeAsync(
        AuthorizeCalendarRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// With each connection's calendars and which of them count.
    /// </summary>
    WithRawResponseTask<SchedulingCalendarConnectionList> ListAsync(
        ListCalendarsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// CalDAV (Apple and others) with an app password, or, in sandbox environments, a `simulated` calendar whose busy times you set yourself. Google and Microsoft use `authorize`.
    /// </summary>
    WithRawResponseTask<SchedulingCalendarConnection> ConnectAsync(
        ConnectCalendarsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Revokes coss.com's access and deletes every busy time read through it. One a calendar delegation manages is refused (`calendar_managed`).
    /// </summary>
    WithRawResponseTask<DeletedSchedulingCalendarConnection> DisconnectAsync(
        DisconnectCalendarsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Whether its busy times block slots, and whether bookings are written to it.
    /// </summary>
    WithRawResponseTask<SchedulingCalendarConnectionList> UpdateAsync(
        UpdateCalendarRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Sandbox environments only: test how bookings react to a busy calendar.
    /// </summary>
    WithRawResponseTask SetSimulatedBusyAsync(
        SetSimulatedBusyRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
