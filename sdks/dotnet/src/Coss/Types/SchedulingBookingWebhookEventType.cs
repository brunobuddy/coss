using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingBookingWebhookEventType.SchedulingBookingWebhookEventTypeSerializer)
)]
[Serializable]
public readonly record struct SchedulingBookingWebhookEventType : IStringEnum
{
    public static readonly SchedulingBookingWebhookEventType SchedulingBookingCreated = new(
        Values.SchedulingBookingCreated
    );

    public static readonly SchedulingBookingWebhookEventType SchedulingBookingPendingApproval = new(
        Values.SchedulingBookingPendingApproval
    );

    public static readonly SchedulingBookingWebhookEventType SchedulingBookingConfirmed = new(
        Values.SchedulingBookingConfirmed
    );

    public static readonly SchedulingBookingWebhookEventType SchedulingBookingRescheduled = new(
        Values.SchedulingBookingRescheduled
    );

    public static readonly SchedulingBookingWebhookEventType SchedulingBookingCancelled = new(
        Values.SchedulingBookingCancelled
    );

    public static readonly SchedulingBookingWebhookEventType SchedulingBookingDeclined = new(
        Values.SchedulingBookingDeclined
    );

    public static readonly SchedulingBookingWebhookEventType SchedulingBookingNoShow = new(
        Values.SchedulingBookingNoShow
    );

    public static readonly SchedulingBookingWebhookEventType SchedulingBookingExternalConflict =
        new(Values.SchedulingBookingExternalConflict);

    public static readonly SchedulingBookingWebhookEventType SchedulingBookingCalendarWriteFailed =
        new(Values.SchedulingBookingCalendarWriteFailed);

    public static readonly SchedulingBookingWebhookEventType SchedulingBookingLocationReady = new(
        Values.SchedulingBookingLocationReady
    );

    public static readonly SchedulingBookingWebhookEventType SchedulingBookingStarted = new(
        Values.SchedulingBookingStarted
    );

    public static readonly SchedulingBookingWebhookEventType SchedulingBookingEnded = new(
        Values.SchedulingBookingEnded
    );

    public static readonly SchedulingBookingWebhookEventType SchedulingBookingReminder = new(
        Values.SchedulingBookingReminder
    );

    public SchedulingBookingWebhookEventType(string value)
    {
        Value = value;
    }

    /// <summary>
    /// The string value of the enum.
    /// </summary>
    public string Value { get; }

    /// <summary>
    /// Create a string enum with the given value.
    /// </summary>
    public static SchedulingBookingWebhookEventType FromCustom(string value)
    {
        return new SchedulingBookingWebhookEventType(value);
    }

    public bool Equals(string? other)
    {
        return Value.Equals(other);
    }

    /// <summary>
    /// Returns the string value of the enum.
    /// </summary>
    public override string ToString()
    {
        return Value;
    }

    public static bool operator ==(SchedulingBookingWebhookEventType value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingBookingWebhookEventType value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingBookingWebhookEventType value) => value.Value;

    public static explicit operator SchedulingBookingWebhookEventType(string value) => new(value);

    internal class SchedulingBookingWebhookEventTypeSerializer
        : JsonConverter<SchedulingBookingWebhookEventType>
    {
        public override SchedulingBookingWebhookEventType Read(
            ref Utf8JsonReader reader,
            Type typeToConvert,
            JsonSerializerOptions options
        )
        {
            var stringValue =
                reader.GetString()
                ?? throw new global::System.Exception(
                    "The JSON value could not be read as a string."
                );
            return new SchedulingBookingWebhookEventType(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingBookingWebhookEventType value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingBookingWebhookEventType ReadAsPropertyName(
            ref Utf8JsonReader reader,
            Type typeToConvert,
            JsonSerializerOptions options
        )
        {
            var stringValue =
                reader.GetString()
                ?? throw new global::System.Exception(
                    "The JSON property name could not be read as a string."
                );
            return new SchedulingBookingWebhookEventType(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingBookingWebhookEventType value,
            JsonSerializerOptions options
        )
        {
            writer.WritePropertyName(value.Value);
        }
    }

    /// <summary>
    /// Constant strings for enum values
    /// </summary>
    [Serializable]
    public static class Values
    {
        public const string SchedulingBookingCreated = "scheduling.booking.created";

        public const string SchedulingBookingPendingApproval =
            "scheduling.booking.pending_approval";

        public const string SchedulingBookingConfirmed = "scheduling.booking.confirmed";

        public const string SchedulingBookingRescheduled = "scheduling.booking.rescheduled";

        public const string SchedulingBookingCancelled = "scheduling.booking.cancelled";

        public const string SchedulingBookingDeclined = "scheduling.booking.declined";

        public const string SchedulingBookingNoShow = "scheduling.booking.no_show";

        public const string SchedulingBookingExternalConflict =
            "scheduling.booking.external_conflict";

        public const string SchedulingBookingCalendarWriteFailed =
            "scheduling.booking.calendar_write_failed";

        public const string SchedulingBookingLocationReady = "scheduling.booking.location_ready";

        public const string SchedulingBookingStarted = "scheduling.booking.started";

        public const string SchedulingBookingEnded = "scheduling.booking.ended";

        public const string SchedulingBookingReminder = "scheduling.booking.reminder";
    }
}
