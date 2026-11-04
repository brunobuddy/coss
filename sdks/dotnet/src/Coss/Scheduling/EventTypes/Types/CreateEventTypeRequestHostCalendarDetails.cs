using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[JsonConverter(
    typeof(CreateEventTypeRequestHostCalendarDetails.CreateEventTypeRequestHostCalendarDetailsSerializer)
)]
[Serializable]
public readonly record struct CreateEventTypeRequestHostCalendarDetails : IStringEnum
{
    public static readonly CreateEventTypeRequestHostCalendarDetails Neutral = new(Values.Neutral);

    public static readonly CreateEventTypeRequestHostCalendarDetails Full = new(Values.Full);

    public CreateEventTypeRequestHostCalendarDetails(string value)
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
    public static CreateEventTypeRequestHostCalendarDetails FromCustom(string value)
    {
        return new CreateEventTypeRequestHostCalendarDetails(value);
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

    public static bool operator ==(
        CreateEventTypeRequestHostCalendarDetails value1,
        string value2
    ) => value1.Value.Equals(value2);

    public static bool operator !=(
        CreateEventTypeRequestHostCalendarDetails value1,
        string value2
    ) => !value1.Value.Equals(value2);

    public static explicit operator string(CreateEventTypeRequestHostCalendarDetails value) =>
        value.Value;

    public static explicit operator CreateEventTypeRequestHostCalendarDetails(string value) =>
        new(value);

    internal class CreateEventTypeRequestHostCalendarDetailsSerializer
        : JsonConverter<CreateEventTypeRequestHostCalendarDetails>
    {
        public override CreateEventTypeRequestHostCalendarDetails Read(
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
            return new CreateEventTypeRequestHostCalendarDetails(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            CreateEventTypeRequestHostCalendarDetails value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override CreateEventTypeRequestHostCalendarDetails ReadAsPropertyName(
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
            return new CreateEventTypeRequestHostCalendarDetails(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            CreateEventTypeRequestHostCalendarDetails value,
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
        public const string Neutral = "neutral";

        public const string Full = "full";
    }
}
