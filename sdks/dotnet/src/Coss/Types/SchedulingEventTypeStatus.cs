using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingEventTypeStatus.SchedulingEventTypeStatusSerializer))]
[Serializable]
public readonly record struct SchedulingEventTypeStatus : IStringEnum
{
    public static readonly SchedulingEventTypeStatus Active = new(Values.Active);

    public static readonly SchedulingEventTypeStatus Archived = new(Values.Archived);

    public SchedulingEventTypeStatus(string value)
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
    public static SchedulingEventTypeStatus FromCustom(string value)
    {
        return new SchedulingEventTypeStatus(value);
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

    public static bool operator ==(SchedulingEventTypeStatus value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingEventTypeStatus value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingEventTypeStatus value) => value.Value;

    public static explicit operator SchedulingEventTypeStatus(string value) => new(value);

    internal class SchedulingEventTypeStatusSerializer : JsonConverter<SchedulingEventTypeStatus>
    {
        public override SchedulingEventTypeStatus Read(
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
            return new SchedulingEventTypeStatus(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingEventTypeStatus value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingEventTypeStatus ReadAsPropertyName(
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
            return new SchedulingEventTypeStatus(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingEventTypeStatus value,
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

        public const string Archived = "archived";
    }
}
