namespace Coss;

public partial interface IAuditEventsClient
{
    /// <summary>
    /// The organization's audit log, newest first: changes made by members in the dashboard, by API keys (from any environment) and by coss.com support. The audit log is organization-wide, so every key of the organization reads the same events. Filter by action (an entry ending in `.` matches a whole resource, e.g. `domain.`), actor, target, environment or time. Pass the last `id` as `after` to get the next page while `has_more` is true. Reading the audit log is not itself logged.
    /// </summary>
    WithRawResponseTask<AuditEventList> ListAsync(
        ListAuditEventsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// One event of the organization's audit log.
    /// </summary>
    WithRawResponseTask<AuditEvent> GetAsync(
        GetAuditEventsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
