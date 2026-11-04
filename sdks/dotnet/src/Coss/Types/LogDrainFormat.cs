using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(LogDrainFormat.LogDrainFormatSerializer))]
[Serializable]
public readonly record struct LogDrainFormat : IStringEnum
{
    public static readonly LogDrainFormat Ndjson = new(Values.Ndjson);

    public static readonly LogDrainFormat Loki = new(Values.Loki);

    public static readonly LogDrainFormat Datadog = new(Values.Datadog);

    public static readonly LogDrainFormat Otlp = new(Values.Otlp);

    public LogDrainFormat(string value)
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
    public static LogDrainFormat FromCustom(string value)
    {
        return new LogDrainFormat(value);
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

    public static bool operator ==(LogDrainFormat value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(LogDrainFormat value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(LogDrainFormat value) => value.Value;

    public static explicit operator LogDrainFormat(string value) => new(value);

    internal class LogDrainFormatSerializer : JsonConverter<LogDrainFormat>
    {
        public override LogDrainFormat Read(
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
            return new LogDrainFormat(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            LogDrainFormat value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override LogDrainFormat ReadAsPropertyName(
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
            return new LogDrainFormat(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            LogDrainFormat value,
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
        public const string Ndjson = "ndjson";

        public const string Loki = "loki";

        public const string Datadog = "datadog";

        public const string Otlp = "otlp";
    }
}
