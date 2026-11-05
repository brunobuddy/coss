using Coss;

namespace Coss.Scheduling;

public partial interface ICalendarDelegationsClient
{
    /// <summary>
    /// With how many hosts each has connected.
    /// </summary>
    WithRawResponseTask<SchedulingCalendarDelegationList> ListAsync(
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// An admin authorizes once, and every host on the domain gets their calendar with no consent screen. It stays `pending`: authorize what it returns, then verify it. Credentials are never returned.
    /// </summary>
    WithRawResponseTask<SchedulingCalendarDelegation> CreateAsync(
        CreateCalendarDelegationRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Its status, what to authorize, and how many hosts it has connected.
    /// </summary>
    WithRawResponseTask<SchedulingCalendarDelegation> GetAsync(
        GetCalendarDelegationsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Its hosts lose these calendars within minutes. They stay bookable with no conflict check, and events already written stay on their calendars, out of reach of later moves or cancellations.
    /// </summary>
    WithRawResponseTask<DeletedSchedulingCalendarDelegation> DeleteAsync(
        DeleteCalendarDelegationsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// New credentials are tried on the verified mailbox before they replace the old ones, and end an outage if they work.
    /// </summary>
    WithRawResponseTask<SchedulingCalendarDelegation> UpdateAsync(
        UpdateCalendarDelegationRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Tries one real mailbox. Passing makes it `active`, and its hosts start connecting. Google can take up to 24 hours to apply a new authorization, so a refusal may just need time.
    /// </summary>
    WithRawResponseTask<SchedulingCalendarDelegation> VerifyAsync(
        VerifyCalendarDelegationRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
