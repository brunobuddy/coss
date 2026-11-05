using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingHostObject.SchedulingHostObjectSerializer))]
[Serializable]
public readonly record struct SchedulingHostObject : IStringEnum
{
    public static readonly SchedulingHostObject SchedulingHost = new(Values.SchedulingHost);

    public SchedulingHostObject(string value)
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
    public static SchedulingHostObject FromCustom(string value)
    {
        return new SchedulingHostObject(value);
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

    public static bool operator ==(SchedulingHostObject value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingHostObject value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingHostObject value) => value.Value;

    public static explicit operator SchedulingHostObject(string value) => new(value);

    internal class SchedulingHostObjectSerializer : JsonConverter<SchedulingHostObject>
    {
        public override SchedulingHostObject Read(
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
            return new SchedulingHostObject(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingHostObject value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingHostObject ReadAsPropertyName(
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
            return new SchedulingHostObject(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingHostObject value,
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
        public const string SchedulingHost = "scheduling.host";
    }
}
