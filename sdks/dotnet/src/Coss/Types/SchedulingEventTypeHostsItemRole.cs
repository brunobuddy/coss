using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingEventTypeHostsItemRole.SchedulingEventTypeHostsItemRoleSerializer))]
[Serializable]
public readonly record struct SchedulingEventTypeHostsItemRole : IStringEnum
{
    public static readonly SchedulingEventTypeHostsItemRole Required = new(Values.Required);

    public static readonly SchedulingEventTypeHostsItemRole Member = new(Values.Member);

    public SchedulingEventTypeHostsItemRole(string value)
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
    public static SchedulingEventTypeHostsItemRole FromCustom(string value)
    {
        return new SchedulingEventTypeHostsItemRole(value);
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

    public static bool operator ==(SchedulingEventTypeHostsItemRole value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingEventTypeHostsItemRole value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingEventTypeHostsItemRole value) => value.Value;

    public static explicit operator SchedulingEventTypeHostsItemRole(string value) => new(value);

    internal class SchedulingEventTypeHostsItemRoleSerializer
        : JsonConverter<SchedulingEventTypeHostsItemRole>
    {
        public override SchedulingEventTypeHostsItemRole Read(
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
            return new SchedulingEventTypeHostsItemRole(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingEventTypeHostsItemRole value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingEventTypeHostsItemRole ReadAsPropertyName(
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
            return new SchedulingEventTypeHostsItemRole(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingEventTypeHostsItemRole value,
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
        public const string Required = "required";

        public const string Member = "member";
    }
}
