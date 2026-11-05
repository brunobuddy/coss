using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingBookingStatus.SchedulingBookingStatusSerializer))]
[Serializable]
public readonly record struct SchedulingBookingStatus : IStringEnum
{
    public static readonly SchedulingBookingStatus Held = new(Values.Held);

    public static readonly SchedulingBookingStatus PendingApproval = new(Values.PendingApproval);

    public static readonly SchedulingBookingStatus Confirmed = new(Values.Confirmed);

    public static readonly SchedulingBookingStatus Cancelled = new(Values.Cancelled);

    public static readonly SchedulingBookingStatus Declined = new(Values.Declined);

    public SchedulingBookingStatus(string value)
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
    public static SchedulingBookingStatus FromCustom(string value)
    {
        return new SchedulingBookingStatus(value);
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

    public static bool operator ==(SchedulingBookingStatus value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingBookingStatus value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingBookingStatus value) => value.Value;

    public static explicit operator SchedulingBookingStatus(string value) => new(value);

    internal class SchedulingBookingStatusSerializer : JsonConverter<SchedulingBookingStatus>
    {
        public override SchedulingBookingStatus Read(
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
            return new SchedulingBookingStatus(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingBookingStatus value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingBookingStatus ReadAsPropertyName(
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
            return new SchedulingBookingStatus(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingBookingStatus value,
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
        public const string Held = "held";

        public const string PendingApproval = "pending_approval";

        public const string Confirmed = "confirmed";

        public const string Cancelled = "cancelled";

        public const string Declined = "declined";
    }
}
