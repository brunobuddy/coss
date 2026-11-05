using Coss;

namespace Coss.Hooks;

public partial interface IMessagesClient
{
    /// <summary>
    /// The application's messages, newest first (kept for 30 days).
    /// </summary>
    WithRawResponseTask<HookMessageList> ListAsync(
        ListMessagesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Queues a message to the application: coss.com delivers it to each of its enabled endpoints subscribed to `event_type` within seconds, signed with each endpoint's secret, and retries failures with backoff for about a day. Each request's `webhook-id` header is the message's id. Counts against the send quota once per endpoint it goes to (at least once). A live message is billed once, whatever its fan-out; retries and sandbox are free. Live sends are refused while the organization is suspended (`account_suspended`), on a billing hold (`billing_hold`), over a budget (`budget_exceeded`) or past Free's monthly messages (`usage_limit_exceeded`). Hooks resources belong to the API key's own environment: a `coss_test_…` key only ever sees sandbox ones, a `coss_live_…` key only production ones.
    /// </summary>
    WithRawResponseTask<HookMessage> SendAsync(
        SendHookMessageRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// A message of the application, with its payload.
    /// </summary>
    WithRawResponseTask<HookMessage> GetAsync(
        GetMessagesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// One delivery per endpoint the message went to.
    /// </summary>
    WithRawResponseTask<HookDeliveryList> ListDeliveriesAsync(
        ListDeliveriesMessagesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
