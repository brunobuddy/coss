using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(LogDrainSource.LogDrainSourceSerializer))]
[Serializable]
public readonly record struct LogDrainSource : IStringEnum
{
    public static readonly LogDrainSource Api = new(Values.Api);

    public static readonly LogDrainSource Email = new(Values.Email);

    public static readonly LogDrainSource Webhook = new(Values.Webhook);

    public static readonly LogDrainSource Risk = new(Values.Risk);

    public static readonly LogDrainSource Smtp = new(Values.Smtp);

    public static readonly LogDrainSource Sms = new(Values.Sms);

    public static readonly LogDrainSource Sign = new(Values.Sign);

    public static readonly LogDrainSource Verify = new(Values.Verify);

    public static readonly LogDrainSource Forms = new(Values.Forms);

    public static readonly LogDrainSource Scheduling = new(Values.Scheduling);

    public static readonly LogDrainSource Audit = new(Values.Audit);

    public LogDrainSource(string value)
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
    public static LogDrainSource FromCustom(string value)
    {
        return new LogDrainSource(value);
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

    public static bool operator ==(LogDrainSource value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(LogDrainSource value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(LogDrainSource value) => value.Value;

    public static explicit operator LogDrainSource(string value) => new(value);

    internal class LogDrainSourceSerializer : JsonConverter<LogDrainSource>
    {
        public override LogDrainSource Read(
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
            return new LogDrainSource(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            LogDrainSource value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override LogDrainSource ReadAsPropertyName(
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
            return new LogDrainSource(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            LogDrainSource value,
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
        public const string Api = "api";

        public const string Email = "email";

        public const string Webhook = "webhook";

        public const string Risk = "risk";

        public const string Smtp = "smtp";

        public const string Sms = "sms";

        public const string Sign = "sign";

        public const string Verify = "verify";

        public const string Forms = "forms";

        public const string Scheduling = "scheduling";

        public const string Audit = "audit";
    }
}
