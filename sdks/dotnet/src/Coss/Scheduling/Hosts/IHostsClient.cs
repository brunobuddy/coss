using Coss;

namespace Coss.Scheduling;

public partial interface IHostsClient
{
    /// <summary>
    /// The environment's hosts, newest first.
    /// </summary>
    WithRawResponseTask<SchedulingHostList> ListAsync(
        ListHostsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// A person who can be booked: one of your users, such as a doctor or a tutor.
    /// </summary>
    WithRawResponseTask<SchedulingHost> CreateAsync(
        CreateHostRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// A host by its id or your uid.
    /// </summary>
    WithRawResponseTask<SchedulingHost> GetAsync(
        GetHostsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Removes the host and its schedules and calendars. Refused while bookings are still to come (`host_has_live_bookings`): cancel them, or set the host's status to `disabled`.
    /// </summary>
    WithRawResponseTask<DeletedSchedulingHost> RemoveAsync(
        RemoveHostsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Changes what's given. A `disabled` host keeps its bookings but gets no new ones.
    /// </summary>
    WithRawResponseTask<SchedulingHost> UpdateAsync(
        UpdateHostRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
