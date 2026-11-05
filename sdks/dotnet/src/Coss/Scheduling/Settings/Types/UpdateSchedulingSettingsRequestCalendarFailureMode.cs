using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[JsonConverter(
    typeof(UpdateSchedulingSettingsRequestCalendarFailureMode.UpdateSchedulingSettingsRequestCalendarFailureModeSerializer)
)]
[Serializable]
public readonly record struct UpdateSchedulingSettingsRequestCalendarFailureMode : IStringEnum
{
    public static readonly UpdateSchedulingSettingsRequestCalendarFailureMode Hide = new(
        Values.Hide
    );

    public static readonly UpdateSchedulingSettingsRequestCalendarFailureMode LastKnown = new(
        Values.LastKnown
    );

    public UpdateSchedulingSettingsRequestCalendarFailureMode(string value)
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
    public static UpdateSchedulingSettingsRequestCalendarFailureMode FromCustom(string value)
    {
        return new UpdateSchedulingSettingsRequestCalendarFailureMode(value);
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

    public static bool operator ==(
        UpdateSchedulingSettingsRequestCalendarFailureMode value1,
        string value2
    ) => value1.Value.Equals(value2);

    public static bool operator !=(
        UpdateSchedulingSettingsRequestCalendarFailureMode value1,
        string value2
    ) => !value1.Value.Equals(value2);

    public static explicit operator string(
        UpdateSchedulingSettingsRequestCalendarFailureMode value
    ) => value.Value;

    public static explicit operator UpdateSchedulingSettingsRequestCalendarFailureMode(
        string value
    ) => new(value);

    internal class UpdateSchedulingSettingsRequestCalendarFailureModeSerializer
        : JsonConverter<UpdateSchedulingSettingsRequestCalendarFailureMode>
    {
        public override UpdateSchedulingSettingsRequestCalendarFailureMode Read(
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
            return new UpdateSchedulingSettingsRequestCalendarFailureMode(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            UpdateSchedulingSettingsRequestCalendarFailureMode value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override UpdateSchedulingSettingsRequestCalendarFailureMode ReadAsPropertyName(
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
            return new UpdateSchedulingSettingsRequestCalendarFailureMode(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            UpdateSchedulingSettingsRequestCalendarFailureMode value,
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
