using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingCalendarDelegationStatus.SchedulingCalendarDelegationStatusSerializer)
)]
[Serializable]
public readonly record struct SchedulingCalendarDelegationStatus : IStringEnum
{
    public static readonly SchedulingCalendarDelegationStatus Pending = new(Values.Pending);

    public static readonly SchedulingCalendarDelegationStatus Active = new(Values.Active);

    public static readonly SchedulingCalendarDelegationStatus Failing = new(Values.Failing);

    public static readonly SchedulingCalendarDelegationStatus Deleting = new(Values.Deleting);

    public SchedulingCalendarDelegationStatus(string value)
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
    public static SchedulingCalendarDelegationStatus FromCustom(string value)
    {
        return new SchedulingCalendarDelegationStatus(value);
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

    public static bool operator ==(SchedulingCalendarDelegationStatus value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingCalendarDelegationStatus value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingCalendarDelegationStatus value) => value.Value;

    public static explicit operator SchedulingCalendarDelegationStatus(string value) => new(value);

    internal class SchedulingCalendarDelegationStatusSerializer
        : JsonConverter<SchedulingCalendarDelegationStatus>
    {
        public override SchedulingCalendarDelegationStatus Read(
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
            return new SchedulingCalendarDelegationStatus(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingCalendarDelegationStatus value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingCalendarDelegationStatus ReadAsPropertyName(
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
            return new SchedulingCalendarDelegationStatus(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingCalendarDelegationStatus value,
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
        public const string Pending = "pending";

        public const string Active = "active";

        public const string Failing = "failing";

        public const string Deleting = "deleting";
    }
}
