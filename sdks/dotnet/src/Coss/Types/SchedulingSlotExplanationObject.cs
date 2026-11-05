using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingSlotExplanationObject.SchedulingSlotExplanationObjectSerializer))]
[Serializable]
public readonly record struct SchedulingSlotExplanationObject : IStringEnum
{
    public static readonly SchedulingSlotExplanationObject SchedulingSlotExplanation = new(
        Values.SchedulingSlotExplanation
    );

    public SchedulingSlotExplanationObject(string value)
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
    public static SchedulingSlotExplanationObject FromCustom(string value)
    {
        return new SchedulingSlotExplanationObject(value);
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

    public static bool operator ==(SchedulingSlotExplanationObject value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingSlotExplanationObject value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingSlotExplanationObject value) => value.Value;

    public static explicit operator SchedulingSlotExplanationObject(string value) => new(value);

    internal class SchedulingSlotExplanationObjectSerializer
        : JsonConverter<SchedulingSlotExplanationObject>
    {
        public override SchedulingSlotExplanationObject Read(
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
            return new SchedulingSlotExplanationObject(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingSlotExplanationObject value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingSlotExplanationObject ReadAsPropertyName(
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
            return new SchedulingSlotExplanationObject(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingSlotExplanationObject value,
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
        public const string SchedulingSlotExplanation = "scheduling.slot_explanation";
    }
}
