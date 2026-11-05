using Coss.Sms_;

namespace Coss;

public partial interface ISmsClient
{
    public Coss.Sms_.ISuppressionsClient Suppressions { get; }
    public Coss.Sms_.IReceivedClient Received { get; }
    public INumbersClient Numbers { get; }

    /// <summary>
    /// Messages sent from the API key's environment, newest first. Pass the last `id` as `after` to get the next page while `has_more` is true.
    /// </summary>
    WithRawResponseTask<SmsList> ListAsync(
        ListSmsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Queues a text message from the API key's environment and returns it with `status: "queued"`; it is handed to the carrier moments later. Follow it with `GET /v1/sms/{id}` or the `sms.sent`, `sms.delivered`, `sms.undelivered` and `sms.failed` webhooks. Live (`coss_live_…`) keys send `from` one of the organization's numbers whose carrier registration is approved, to the countries the organization allows (US and Canada unless changed in the dashboard). Sandbox (`coss_test_…`) keys accept any `from`, deliver nothing and answer the SMS simulator's numbers (`+15005550006` delivered, `+15005550001` invalid, `+15005550004` filtered by the carrier, `+15005550009` opted out, `+15005550008` replies). A number on the environment's SMS suppression list (it replied STOP, or it can't receive SMS) is skipped: the message is `failed` with `suppressed`. Segments count against the organization's send quota, and each is billed by the destination country.
    /// </summary>
    WithRawResponseTask<Sms> SendAsync(
        SendSmsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// One message sent from the API key's environment, with its current status.
    /// </summary>
    WithRawResponseTask<Sms> GetAsync(
        GetSmsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Everything that happened to the message, oldest first.
    /// </summary>
    WithRawResponseTask<SmsEventList> ListEventsAsync(
        ListEventsSmsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Cancels a message scheduled with `scheduled_at` before it is sent. Canceling a canceled message returns it as is.
    /// </summary>
    WithRawResponseTask<Sms> CancelAsync(
        CancelSmsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
