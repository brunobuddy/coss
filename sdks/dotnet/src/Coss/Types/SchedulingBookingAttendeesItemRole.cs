using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingBookingAttendeesItemRole.SchedulingBookingAttendeesItemRoleSerializer)
)]
[Serializable]
public readonly record struct SchedulingBookingAttendeesItemRole : IStringEnum
{
    public static readonly SchedulingBookingAttendeesItemRole Attendee = new(Values.Attendee);

    public static readonly SchedulingBookingAttendeesItemRole Guest = new(Values.Guest);

    public SchedulingBookingAttendeesItemRole(string value)
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
    public static SchedulingBookingAttendeesItemRole FromCustom(string value)
    {
        return new SchedulingBookingAttendeesItemRole(value);
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

    public static bool operator ==(SchedulingBookingAttendeesItemRole value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingBookingAttendeesItemRole value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingBookingAttendeesItemRole value) => value.Value;

    public static explicit operator SchedulingBookingAttendeesItemRole(string value) => new(value);

    internal class SchedulingBookingAttendeesItemRoleSerializer
        : JsonConverter<SchedulingBookingAttendeesItemRole>
    {
        public override SchedulingBookingAttendeesItemRole Read(
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
            return new SchedulingBookingAttendeesItemRole(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingBookingAttendeesItemRole value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingBookingAttendeesItemRole ReadAsPropertyName(
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
            return new SchedulingBookingAttendeesItemRole(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingBookingAttendeesItemRole value,
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
        public const string Attendee = "attendee";

        public const string Guest = "guest";
    }
}
