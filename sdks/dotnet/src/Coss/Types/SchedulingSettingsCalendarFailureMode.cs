using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingSettingsCalendarFailureMode.SchedulingSettingsCalendarFailureModeSerializer)
)]
[Serializable]
public readonly record struct SchedulingSettingsCalendarFailureMode : IStringEnum
{
    public static readonly SchedulingSettingsCalendarFailureMode Hide = new(Values.Hide);

    public static readonly SchedulingSettingsCalendarFailureMode LastKnown = new(Values.LastKnown);

    public SchedulingSettingsCalendarFailureMode(string value)
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
    public static SchedulingSettingsCalendarFailureMode FromCustom(string value)
    {
        return new SchedulingSettingsCalendarFailureMode(value);
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

    public static bool operator ==(SchedulingSettingsCalendarFailureMode value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingSettingsCalendarFailureMode value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingSettingsCalendarFailureMode value) =>
        value.Value;

    public static explicit operator SchedulingSettingsCalendarFailureMode(string value) =>
        new(value);

    internal class SchedulingSettingsCalendarFailureModeSerializer
        : JsonConverter<SchedulingSettingsCalendarFailureMode>
    {
        public override SchedulingSettingsCalendarFailureMode Read(
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
            return new SchedulingSettingsCalendarFailureMode(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingSettingsCalendarFailureMode value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingSettingsCalendarFailureMode ReadAsPropertyName(
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
            return new SchedulingSettingsCalendarFailureMode(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingSettingsCalendarFailureMode value,
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
        public const string Hide = "hide";

        public const string LastKnown = "last_known";
    }
}
