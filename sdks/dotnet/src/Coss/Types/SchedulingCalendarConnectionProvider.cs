using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingCalendarConnectionProvider.SchedulingCalendarConnectionProviderSerializer)
)]
[Serializable]
public readonly record struct SchedulingCalendarConnectionProvider : IStringEnum
{
    public static readonly SchedulingCalendarConnectionProvider Google = new(Values.Google);

    public static readonly SchedulingCalendarConnectionProvider Microsoft = new(Values.Microsoft);

    public static readonly SchedulingCalendarConnectionProvider Caldav = new(Values.Caldav);

    public static readonly SchedulingCalendarConnectionProvider Simulated = new(Values.Simulated);

    public static readonly SchedulingCalendarConnectionProvider Zoom = new(Values.Zoom);

    public SchedulingCalendarConnectionProvider(string value)
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
    public static SchedulingCalendarConnectionProvider FromCustom(string value)
    {
        return new SchedulingCalendarConnectionProvider(value);
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

    public static bool operator ==(SchedulingCalendarConnectionProvider value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingCalendarConnectionProvider value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingCalendarConnectionProvider value) =>
        value.Value;

    public static explicit operator SchedulingCalendarConnectionProvider(string value) =>
        new(value);

    internal class SchedulingCalendarConnectionProviderSerializer
        : JsonConverter<SchedulingCalendarConnectionProvider>
    {
        public override SchedulingCalendarConnectionProvider Read(
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
            return new SchedulingCalendarConnectionProvider(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingCalendarConnectionProvider value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingCalendarConnectionProvider ReadAsPropertyName(
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
            return new SchedulingCalendarConnectionProvider(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingCalendarConnectionProvider value,
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
        public const string Google = "google";

        public const string Microsoft = "microsoft";

        public const string Caldav = "caldav";

        public const string Simulated = "simulated";

        public const string Zoom = "zoom";
    }
}
