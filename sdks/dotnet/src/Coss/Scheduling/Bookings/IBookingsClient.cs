using Coss;

namespace Coss.Scheduling;

public partial interface IBookingsClient
{
    /// <summary>
    /// The environment's bookings, newest first. Answers aren't included.
    /// </summary>
    WithRawResponseTask<SchedulingBookingList> ListAsync(
        ListBookingsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Books a slot, or joins a group session. Without a `host`, a pool chooses fairly among those free. An event type that requires approval answers with a `pending_approval` booking.
    /// </summary>
    WithRawResponseTask<SchedulingBooking> CreateAsync(
        CreateBookingRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// A booking with its attendees and their answers.
    /// </summary>
    WithRawResponseTask<SchedulingBooking> GetAsync(
        GetBookingsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Moves it to a new time, keeping its id. The old time stays booked if the new one isn't free.
    /// </summary>
    WithRawResponseTask<SchedulingBooking> RescheduleAsync(
        RescheduleBookingRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Frees the time and removes the calendar event. A cancelled booking stays charged.
    /// </summary>
    WithRawResponseTask<SchedulingBooking> CancelAsync(
        CancelSchedulingBookingRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// What's happened to a booking, oldest first, and who did it. There's no personal data in here.
    /// </summary>
    WithRawResponseTask<SchedulingBookingEventList> EventsAsync(
        EventsBookingsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Confirms a `pending_approval` booking.
    /// </summary>
    WithRawResponseTask<SchedulingBooking> ApproveAsync(
        ApproveBookingsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Refuses a `pending_approval` booking and frees the time.
    /// </summary>
    WithRawResponseTask<SchedulingBooking> DeclineAsync(
        DeclineBookingsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// What's been queued for this booking and what became of it, newest first, including why something wasn't sent. It never says who it went to.
    /// </summary>
    WithRawResponseTask<SchedulingBookingNotificationList> NotificationsAsync(
        NotificationsBookingsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Records that the attendee didn't come, once the booking has started.
    /// </summary>
    WithRawResponseTask<SchedulingBooking> MarkNoShowAsync(
        MarkNoShowBookingsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Where it happens, such as the meeting link you made after the `scheduling.booking.confirmed` webhook.
    /// </summary>
    WithRawResponseTask<SchedulingBooking> UpdateLocationAsync(
        UpdateBookingLocationRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
