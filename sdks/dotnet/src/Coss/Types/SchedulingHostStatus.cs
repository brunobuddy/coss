using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingHostStatus.SchedulingHostStatusSerializer))]
[Serializable]
public readonly record struct SchedulingHostStatus : IStringEnum
{
    public static readonly SchedulingHostStatus Active = new(Values.Active);

    public static readonly SchedulingHostStatus Disabled = new(Values.Disabled);

    public SchedulingHostStatus(string value)
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
    public static SchedulingHostStatus FromCustom(string value)
    {
        return new SchedulingHostStatus(value);
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

    public static bool operator ==(SchedulingHostStatus value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingHostStatus value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingHostStatus value) => value.Value;

    public static explicit operator SchedulingHostStatus(string value) => new(value);

    internal class SchedulingHostStatusSerializer : JsonConverter<SchedulingHostStatus>
    {
        public override SchedulingHostStatus Read(
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
            return new SchedulingHostStatus(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingHostStatus value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingHostStatus ReadAsPropertyName(
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
            return new SchedulingHostStatus(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingHostStatus value,
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

        public const string Disabled = "disabled";
    }
}
