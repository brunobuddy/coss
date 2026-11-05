using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;
using OneOf;

namespace Coss;

[Serializable]
public record WebhookTestEvent : IJsonOnDeserialized
{
    [JsonExtensionData]
    private readonly IDictionary<string, JsonElement> _extensionData =
        new Dictionary<string, JsonElement>();

    [JsonPropertyName("object")]
    public required WebhookTestEventObject Object { get; set; }

    /// <summary>
    /// The event, as an endpoint on the request's API version receives it. Its `webhook-id` header is `event.id`.
    /// </summary>
    [JsonPropertyName("event")]
    public required OneOf<
        EmailWebhookEvent,
        ReceivedEmailWebhookEvent,
        HookEndpointWebhookEvent,
        RiskWebhookEvent,
        ContactWebhookEvent,
        BroadcastWebhookEvent,
        InboxMessageReceivedWebhookEvent,
        SmsWebhookEvent,
        ReceivedSmsWebhookEvent,
        SignRequestWebhookEvent,
        VerificationWebhookEvent,
        FormSubmissionWebhookEvent,
        SchedulingBookingWebhookEvent,
        SchedulingCalendarWebhookEvent,
        SchedulingCalendarDelegationWebhookEvent
    > Event { get; set; }

    /// <summary>
    /// Enabled endpoints of the environment subscribed to the type, each sent it once.
    /// </summary>
    [JsonPropertyName("endpoints")]
    public required long Endpoints { get; set; }

    /// <summary>
    /// Open `coss listen` listeners subscribed to the type, each handed it once.
    /// </summary>
    [JsonPropertyName("listeners")]
    public required long Listeners { get; set; }

    [JsonIgnore]
    public ReadOnlyAdditionalProperties AdditionalProperties { get; private set; } = new();

    void IJsonOnDeserialized.OnDeserialized() =>
        AdditionalProperties.CopyFromExtensionData(_extensionData);

    /// <inheritdoc />
    public override string ToString()
    {
        return JsonUtils.Serialize(this);
    }
}
