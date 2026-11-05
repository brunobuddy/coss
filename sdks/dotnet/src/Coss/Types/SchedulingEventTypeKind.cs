using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingEventTypeKind.SchedulingEventTypeKindSerializer))]
[Serializable]
public readonly record struct SchedulingEventTypeKind : IStringEnum
{
    public static readonly SchedulingEventTypeKind OneOnOne = new(Values.OneOnOne);

    public static readonly SchedulingEventTypeKind Pool = new(Values.Pool);

    public static readonly SchedulingEventTypeKind Collective = new(Values.Collective);

    public static readonly SchedulingEventTypeKind Group = new(Values.Group);

    public SchedulingEventTypeKind(string value)
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
    public static SchedulingEventTypeKind FromCustom(string value)
    {
        return new SchedulingEventTypeKind(value);
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

    public static bool operator ==(SchedulingEventTypeKind value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingEventTypeKind value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingEventTypeKind value) => value.Value;

    public static explicit operator SchedulingEventTypeKind(string value) => new(value);

    internal class SchedulingEventTypeKindSerializer : JsonConverter<SchedulingEventTypeKind>
    {
        public override SchedulingEventTypeKind Read(
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
            return new SchedulingEventTypeKind(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingEventTypeKind value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingEventTypeKind ReadAsPropertyName(
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
            return new SchedulingEventTypeKind(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingEventTypeKind value,
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
        public const string OneOnOne = "one_on_one";

        public const string Pool = "pool";

        public const string Collective = "collective";

        public const string Group = "group";
    }
}
