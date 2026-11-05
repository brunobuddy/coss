using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(CreateLogDrainRequestFormat.CreateLogDrainRequestFormatSerializer))]
[Serializable]
public readonly record struct CreateLogDrainRequestFormat : IStringEnum
{
    public static readonly CreateLogDrainRequestFormat Ndjson = new(Values.Ndjson);

    public static readonly CreateLogDrainRequestFormat Loki = new(Values.Loki);

    public static readonly CreateLogDrainRequestFormat Datadog = new(Values.Datadog);

    public static readonly CreateLogDrainRequestFormat Otlp = new(Values.Otlp);

    public CreateLogDrainRequestFormat(string value)
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
    public static CreateLogDrainRequestFormat FromCustom(string value)
    {
        return new CreateLogDrainRequestFormat(value);
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

    public static bool operator ==(CreateLogDrainRequestFormat value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(CreateLogDrainRequestFormat value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(CreateLogDrainRequestFormat value) => value.Value;

    public static explicit operator CreateLogDrainRequestFormat(string value) => new(value);

    internal class CreateLogDrainRequestFormatSerializer
        : JsonConverter<CreateLogDrainRequestFormat>
    {
        public override CreateLogDrainRequestFormat Read(
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
            return new CreateLogDrainRequestFormat(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            CreateLogDrainRequestFormat value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override CreateLogDrainRequestFormat ReadAsPropertyName(
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
            return new CreateLogDrainRequestFormat(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            CreateLogDrainRequestFormat value,
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
