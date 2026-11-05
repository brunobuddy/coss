using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingReminderInputAnchor.SchedulingReminderInputAnchorSerializer))]
[Serializable]
public readonly record struct SchedulingReminderInputAnchor : IStringEnum
{
    public static readonly SchedulingReminderInputAnchor Start = new(Values.Start);

    public static readonly SchedulingReminderInputAnchor End = new(Values.End);

    public static readonly SchedulingReminderInputAnchor Confirmed = new(Values.Confirmed);

    public static readonly SchedulingReminderInputAnchor Rescheduled = new(Values.Rescheduled);

    public static readonly SchedulingReminderInputAnchor Cancelled = new(Values.Cancelled);

    public static readonly SchedulingReminderInputAnchor Declined = new(Values.Declined);

    public static readonly SchedulingReminderInputAnchor PendingApproval = new(
        Values.PendingApproval
    );

    public static readonly SchedulingReminderInputAnchor NoShow = new(Values.NoShow);

    public SchedulingReminderInputAnchor(string value)
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
    public static SchedulingReminderInputAnchor FromCustom(string value)
    {
        return new SchedulingReminderInputAnchor(value);
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

    public static bool operator ==(SchedulingReminderInputAnchor value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingReminderInputAnchor value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingReminderInputAnchor value) => value.Value;

    public static explicit operator SchedulingReminderInputAnchor(string value) => new(value);

    internal class SchedulingReminderInputAnchorSerializer
        : JsonConverter<SchedulingReminderInputAnchor>
    {
        public override SchedulingReminderInputAnchor Read(
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
            return new SchedulingReminderInputAnchor(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingReminderInputAnchor value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingReminderInputAnchor ReadAsPropertyName(
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
            return new SchedulingReminderInputAnchor(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingReminderInputAnchor value,
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
        public const string Start = "start";

        public const string End = "end";

        public const string Confirmed = "confirmed";

        public const string Rescheduled = "rescheduled";

        public const string Cancelled = "cancelled";

        public const string Declined = "declined";

        public const string PendingApproval = "pending_approval";

        public const string NoShow = "no_show";
    }
}
