using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingCalendarDelegationProvider.SchedulingCalendarDelegationProviderSerializer)
)]
[Serializable]
public readonly record struct SchedulingCalendarDelegationProvider : IStringEnum
{
    public static readonly SchedulingCalendarDelegationProvider Google = new(Values.Google);

    public static readonly SchedulingCalendarDelegationProvider Microsoft = new(Values.Microsoft);

    public SchedulingCalendarDelegationProvider(string value)
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
    public static SchedulingCalendarDelegationProvider FromCustom(string value)
    {
        return new SchedulingCalendarDelegationProvider(value);
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

    public static bool operator ==(SchedulingCalendarDelegationProvider value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingCalendarDelegationProvider value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingCalendarDelegationProvider value) =>
        value.Value;

    public static explicit operator SchedulingCalendarDelegationProvider(string value) =>
        new(value);

    internal class SchedulingCalendarDelegationProviderSerializer
        : JsonConverter<SchedulingCalendarDelegationProvider>
    {
        public override SchedulingCalendarDelegationProvider Read(
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
            return new SchedulingCalendarDelegationProvider(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingCalendarDelegationProvider value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingCalendarDelegationProvider ReadAsPropertyName(
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
            return new SchedulingCalendarDelegationProvider(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingCalendarDelegationProvider value,
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
    }
}
