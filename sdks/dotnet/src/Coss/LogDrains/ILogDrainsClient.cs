using Coss.LogDrains;

namespace Coss;

public partial interface ILogDrainsClient
{
    public IBatchesClient Batches { get; }

    /// <summary>
    /// Every drain of the API key's environment, oldest first. Log drains belong to the API key's own environment: a `coss_test_…` key only ever sees sandbox drains, and a `coss_live_…` key only production ones.
    /// </summary>
    WithRawResponseTask<LogDrainList> ListAsync(
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Streams the environment's logs to a URL: every line `GET /v1/logs` returns (API requests, email events, webhook attempts) and the environment's audit events, posted as signed batches of up to 500 lines or 1 MB, usually within seconds. `format` picks the body: NDJSON for your own endpoint, or the intake API of Loki (Grafana Cloud), Datadog or an OTLP/HTTP collector, with `auth_header` carrying its key. Log drains belong to the API key's own environment: a `coss_test_…` key only ever sees sandbox drains, and a `coss_live_…` key only production ones. The response carries the signing secret, which is returned only here: store it, and verify every NDJSON batch with it (`verifyLogDrainBatch` in the SDK).
    /// </summary>
    WithRawResponseTask<LogDrainWithSecret> CreateAsync(
        CreateLogDrainRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// The drain without its signing secret, which is only returned when created.
    /// </summary>
    WithRawResponseTask<LogDrain> GetAsync(
        GetLogDrainsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Removes the drain and its batch log. Lines still waiting for it are dropped. To stop it temporarily, set `enabled` to `false` instead.
    /// </summary>
    WithRawResponseTask<DeletedLogDrain> DeleteAsync(
        DeleteLogDrainsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Changes the URL, description, sources, format, auth header or `enabled` flag. Omitted fields keep their current value (`auth_header: null` removes the header), and the signing secret stays the same. A batch being retried goes out as the drain is when it is retried. Disabling a drain drops the lines still waiting for it, and nothing is kept for it while it is disabled; enabling it again (also after coss.com disabled it for failing) sends lines logged from then on.
    /// </summary>
    WithRawResponseTask<LogDrain> UpdateAsync(
        UpdateLogDrainRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
