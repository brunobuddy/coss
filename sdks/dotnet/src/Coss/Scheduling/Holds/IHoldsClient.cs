using Coss;

namespace Coss.Scheduling;

public partial interface IHoldsClient
{
    /// <summary>
    /// Keeps a slot for a while (the event type's `hold_ttl_seconds`) so you can take payment, then confirm it. Answers with a `held` booking, which isn't charged and sends nothing.
    /// </summary>
    WithRawResponseTask<SchedulingBooking> CreateAsync(
        CreateHoldRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Turns a hold into a booking. Always succeeds before the hold expires. Repeating it is safe.
    /// </summary>
    WithRawResponseTask<SchedulingBooking> ConfirmAsync(
        ConfirmHoldRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Gives the slot back early.
    /// </summary>
    WithRawResponseTask<SchedulingBooking> ReleaseAsync(
        ReleaseHoldsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
