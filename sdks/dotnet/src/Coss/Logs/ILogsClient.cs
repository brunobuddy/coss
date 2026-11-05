namespace Coss;

public partial interface ILogsClient
{
    /// <summary>
    /// The API key's environment log, newest first: every API request made with one of its keys (`source: api`), every email event (`email`) and every webhook delivery attempt (`webhook`). Filter by time range (an hour by default, at most 31 days), source, level, type, status, method, route, key, request, resource or free text. Pass the last `id` as `after` to get the next page while `has_more` is true. Reading logs is not itself logged.
    /// </summary>
    WithRawResponseTask<LogList> ListAsync(
        ListLogsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// One line of the API key's environment log.
    /// </summary>
    WithRawResponseTask<Log> GetAsync(
        GetLogsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
