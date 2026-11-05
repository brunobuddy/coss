using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingBookingListObject.SchedulingBookingListObjectSerializer))]
[Serializable]
public readonly record struct SchedulingBookingListObject : IStringEnum
{
    public static readonly SchedulingBookingListObject List = new(Values.List);

    public SchedulingBookingListObject(string value)
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
    public static SchedulingBookingListObject FromCustom(string value)
    {
        return new SchedulingBookingListObject(value);
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

    public static bool operator ==(SchedulingBookingListObject value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingBookingListObject value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingBookingListObject value) => value.Value;

    public static explicit operator SchedulingBookingListObject(string value) => new(value);

    internal class SchedulingBookingListObjectSerializer
        : JsonConverter<SchedulingBookingListObject>
    {
        public override SchedulingBookingListObject Read(
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
            return new SchedulingBookingListObject(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingBookingListObject value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingBookingListObject ReadAsPropertyName(
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
            return new SchedulingBookingListObject(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingBookingListObject value,
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
        public const string List = "list";
    }
}
