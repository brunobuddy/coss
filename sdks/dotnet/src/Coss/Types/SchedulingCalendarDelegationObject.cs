using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingCalendarDelegationObject.SchedulingCalendarDelegationObjectSerializer)
)]
[Serializable]
public readonly record struct SchedulingCalendarDelegationObject : IStringEnum
{
    public static readonly SchedulingCalendarDelegationObject SchedulingCalendarDelegation = new(
        Values.SchedulingCalendarDelegation
    );

    public SchedulingCalendarDelegationObject(string value)
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
    public static SchedulingCalendarDelegationObject FromCustom(string value)
    {
        return new SchedulingCalendarDelegationObject(value);
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

    public static bool operator ==(SchedulingCalendarDelegationObject value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingCalendarDelegationObject value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingCalendarDelegationObject value) => value.Value;

    public static explicit operator SchedulingCalendarDelegationObject(string value) => new(value);

    internal class SchedulingCalendarDelegationObjectSerializer
        : JsonConverter<SchedulingCalendarDelegationObject>
    {
        public override SchedulingCalendarDelegationObject Read(
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
            return new SchedulingCalendarDelegationObject(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingCalendarDelegationObject value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingCalendarDelegationObject ReadAsPropertyName(
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
            return new SchedulingCalendarDelegationObject(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingCalendarDelegationObject value,
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
        public const string SchedulingCalendarDelegation = "scheduling.calendar_delegation";
    }
}
