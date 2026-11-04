using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(LogSource.LogSourceSerializer))]
[Serializable]
public readonly record struct LogSource : IStringEnum
{
    public static readonly LogSource Api = new(Values.Api);

    public static readonly LogSource Email = new(Values.Email);

    public static readonly LogSource Webhook = new(Values.Webhook);

    public static readonly LogSource Risk = new(Values.Risk);

    public static readonly LogSource Smtp = new(Values.Smtp);

    public static readonly LogSource Sms = new(Values.Sms);

    public static readonly LogSource Sign = new(Values.Sign);

    public static readonly LogSource Verify = new(Values.Verify);

    public static readonly LogSource Forms = new(Values.Forms);

    public static readonly LogSource Scheduling = new(Values.Scheduling);

    public LogSource(string value)
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
    public static LogSource FromCustom(string value)
    {
        return new LogSource(value);
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

    public static bool operator ==(LogSource value1, string value2) => value1.Value.Equals(value2);

    public static bool operator !=(LogSource value1, string value2) => !value1.Value.Equals(value2);

    public static explicit operator string(LogSource value) => value.Value;

    public static explicit operator LogSource(string value) => new(value);

    internal class LogSourceSerializer : JsonConverter<LogSource>
    {
        public override LogSource Read(
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
            return new LogSource(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            LogSource value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override LogSource ReadAsPropertyName(
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
            return new LogSource(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            LogSource value,
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
    }
}
