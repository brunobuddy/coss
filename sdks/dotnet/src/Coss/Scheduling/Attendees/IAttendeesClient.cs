using Coss;

namespace Coss.Scheduling;

public partial interface IAttendeesClient
{
    /// <summary>
    /// Removes this person's details and answers from every booking now, and ends any booker session fixed to them. The bookings themselves stay.
    /// </summary>
    WithRawResponseTask<SchedulingAttendeeErasure> EraseAsync(
        EraseAttendeesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Removes this address's details and answers from every booking now, for someone you have no `uid` for, such as a guest. The bookings themselves stay.
    /// </summary>
    WithRawResponseTask<SchedulingAttendeeErasureByEmail> EraseByEmailAsync(
        EraseSchedulingAttendeeByEmailRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
