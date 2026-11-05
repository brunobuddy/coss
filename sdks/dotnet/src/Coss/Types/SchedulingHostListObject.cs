using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingHostListObject.SchedulingHostListObjectSerializer))]
[Serializable]
public readonly record struct SchedulingHostListObject : IStringEnum
{
    public static readonly SchedulingHostListObject List = new(Values.List);

    public SchedulingHostListObject(string value)
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
    public static SchedulingHostListObject FromCustom(string value)
    {
        return new SchedulingHostListObject(value);
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

    public static bool operator ==(SchedulingHostListObject value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingHostListObject value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingHostListObject value) => value.Value;

    public static explicit operator SchedulingHostListObject(string value) => new(value);

    internal class SchedulingHostListObjectSerializer : JsonConverter<SchedulingHostListObject>
    {
        public override SchedulingHostListObject Read(
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
            return new SchedulingHostListObject(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingHostListObject value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingHostListObject ReadAsPropertyName(
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
            return new SchedulingHostListObject(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingHostListObject value,
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
        public const string List = "list";
    }
}
