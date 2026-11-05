using Coss;

namespace Coss.Scheduling;

public partial interface ISchedulesClient
{
    /// <summary>
    /// All of the host's schedules, oldest first.
    /// </summary>
    WithRawResponseTask<SchedulingScheduleList> ListAsync(
        ListSchedulesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// A host's weekly hours and date overrides, in local time. The first one is the host's default.
    /// </summary>
    WithRawResponseTask<SchedulingSchedule> CreateAsync(
        CreateSchedulesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// One of the host's schedules.
    /// </summary>
    WithRawResponseTask<SchedulingSchedule> GetAsync(
        GetSchedulesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Replaces its weekly rules, and its overrides when given. Existing bookings stay: a schedule only decides what's offered next.
    /// </summary>
    WithRawResponseTask<SchedulingSchedule> UpdateAsync(
        UpdateSchedulesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Refused for the host's default schedule.
    /// </summary>
    WithRawResponseTask<DeletedSchedulingSchedule> RemoveAsync(
        RemoveSchedulesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
