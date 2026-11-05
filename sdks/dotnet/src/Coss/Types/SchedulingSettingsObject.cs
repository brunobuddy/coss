using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingSettingsObject.SchedulingSettingsObjectSerializer))]
[Serializable]
public readonly record struct SchedulingSettingsObject : IStringEnum
{
    public static readonly SchedulingSettingsObject SchedulingSettings = new(
        Values.SchedulingSettings
    );

    public SchedulingSettingsObject(string value)
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
    public static SchedulingSettingsObject FromCustom(string value)
    {
        return new SchedulingSettingsObject(value);
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

    public static bool operator ==(SchedulingSettingsObject value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingSettingsObject value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingSettingsObject value) => value.Value;

    public static explicit operator SchedulingSettingsObject(string value) => new(value);

    internal class SchedulingSettingsObjectSerializer : JsonConverter<SchedulingSettingsObject>
    {
        public override SchedulingSettingsObject Read(
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
            return new SchedulingSettingsObject(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingSettingsObject value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingSettingsObject ReadAsPropertyName(
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
            return new SchedulingSettingsObject(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingSettingsObject value,
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
        public const string SchedulingSettings = "scheduling.settings";
    }
}
