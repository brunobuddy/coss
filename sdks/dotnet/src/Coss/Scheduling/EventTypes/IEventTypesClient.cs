using Coss;

namespace Coss.Scheduling;

public partial interface IEventTypesClient
{
    /// <summary>
    /// The environment's event types, newest first.
    /// </summary>
    WithRawResponseTask<SchedulingEventTypeList> ListAsync(
        ListEventTypesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// What can be booked: `one_on_one` with one host, `pool` for any free host, `collective` when every required host must be free, or `group` for a session with seats.
    /// </summary>
    WithRawResponseTask<SchedulingEventType> CreateAsync(
        CreateEventTypeRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// An event type by its id or your uid.
    /// </summary>
    WithRawResponseTask<SchedulingEventType> GetAsync(
        GetEventTypesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Changes what's given. Existing bookings keep what they were booked with. Set `status` to `archived` to stop new bookings.
    /// </summary>
    WithRawResponseTask<SchedulingEventType> UpdateAsync(
        UpdateEventTypeRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
