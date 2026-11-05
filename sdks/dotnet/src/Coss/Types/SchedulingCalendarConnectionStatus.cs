using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingCalendarConnectionStatus.SchedulingCalendarConnectionStatusSerializer)
)]
[Serializable]
public readonly record struct SchedulingCalendarConnectionStatus : IStringEnum
{
    public static readonly SchedulingCalendarConnectionStatus Active = new(Values.Active);

    public static readonly SchedulingCalendarConnectionStatus NeedsReauth = new(Values.NeedsReauth);

    public SchedulingCalendarConnectionStatus(string value)
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
    public static SchedulingCalendarConnectionStatus FromCustom(string value)
    {
        return new SchedulingCalendarConnectionStatus(value);
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

    public static bool operator ==(SchedulingCalendarConnectionStatus value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingCalendarConnectionStatus value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingCalendarConnectionStatus value) => value.Value;

    public static explicit operator SchedulingCalendarConnectionStatus(string value) => new(value);

    internal class SchedulingCalendarConnectionStatusSerializer
        : JsonConverter<SchedulingCalendarConnectionStatus>
    {
        public override SchedulingCalendarConnectionStatus Read(
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
            return new SchedulingCalendarConnectionStatus(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingCalendarConnectionStatus value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingCalendarConnectionStatus ReadAsPropertyName(
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
            return new SchedulingCalendarConnectionStatus(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingCalendarConnectionStatus value,
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
        public const string Active = "active";

        public const string NeedsReauth = "needs_reauth";
    }
}
