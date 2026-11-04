using Coss.Core;
using global::System.Text.Json.Serialization;

namespace Coss;

[Serializable]
public record CreateLogDrainRequest
{
    /// <summary>
    /// An `https://` URL coss.com posts batches of log lines to.
    /// </summary>
    [JsonPropertyName("url")]
    public required string Url { get; set; }

    /// <summary>
    /// A note for your own reference. `null` clears it.
    /// </summary>
    [Nullable, Optional]
    [JsonPropertyName("description")]
    public Optional<string?> Description { get; set; }

    /// <summary>
    /// What the drain forwards: `api` (requests made with the environment's API keys), `email` (email events), `webhook` (webhook delivery attempts) and `audit` (changes to the environment, from the organization's audit log). An empty array means every source, including ones added later. Defaults to every source.
    /// </summary>
    [Optional]
    [JsonPropertyName("sources")]
    public IEnumerable<LogDrainSource>? Sources { get; set; }

    /// <summary>
    /// How batches are encoded. `ndjson`: one JSON object per line (`application/x-ndjson`), for your own endpoint. `loki`: Loki's push API (`/loki/api/v1/push`, Grafana Cloud Logs). `datadog`: Datadog's log intake (`/api/v2/logs`). `otlp`: OTLP/HTTP logs in JSON (`/v1/logs`, Grafana Cloud, Honeycomb, an OpenTelemetry Collector…). Defaults to `ndjson`.
    /// </summary>
    [Optional]
    [JsonPropertyName("format")]
    public CreateLogDrainRequestFormat? Format { get; set; }

    [Nullable, Optional]
    [JsonPropertyName("auth_header")]
    public Optional<LogDrainAuthHeader?> AuthHeader { get; set; }

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
