using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingCalendarAuthorizationObject.SchedulingCalendarAuthorizationObjectSerializer)
)]
[Serializable]
public readonly record struct SchedulingCalendarAuthorizationObject : IStringEnum
{
    public static readonly SchedulingCalendarAuthorizationObject SchedulingCalendarAuthorization =
        new(Values.SchedulingCalendarAuthorization);

    public SchedulingCalendarAuthorizationObject(string value)
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
    public static SchedulingCalendarAuthorizationObject FromCustom(string value)
    {
        return new SchedulingCalendarAuthorizationObject(value);
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

    public static bool operator ==(SchedulingCalendarAuthorizationObject value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingCalendarAuthorizationObject value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingCalendarAuthorizationObject value) =>
        value.Value;

    public static explicit operator SchedulingCalendarAuthorizationObject(string value) =>
        new(value);

    internal class SchedulingCalendarAuthorizationObjectSerializer
        : JsonConverter<SchedulingCalendarAuthorizationObject>
    {
        public override SchedulingCalendarAuthorizationObject Read(
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
            return new SchedulingCalendarAuthorizationObject(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingCalendarAuthorizationObject value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingCalendarAuthorizationObject ReadAsPropertyName(
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
            return new SchedulingCalendarAuthorizationObject(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingCalendarAuthorizationObject value,
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
        public const string SchedulingCalendarAuthorization = "scheduling.calendar_authorization";
    }
}
