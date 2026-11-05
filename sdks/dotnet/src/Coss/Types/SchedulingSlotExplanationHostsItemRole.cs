using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingSlotExplanationHostsItemRole.SchedulingSlotExplanationHostsItemRoleSerializer)
)]
[Serializable]
public readonly record struct SchedulingSlotExplanationHostsItemRole : IStringEnum
{
    public static readonly SchedulingSlotExplanationHostsItemRole Required = new(Values.Required);

    public static readonly SchedulingSlotExplanationHostsItemRole Member = new(Values.Member);

    public SchedulingSlotExplanationHostsItemRole(string value)
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
    public static SchedulingSlotExplanationHostsItemRole FromCustom(string value)
    {
        return new SchedulingSlotExplanationHostsItemRole(value);
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

    public static bool operator ==(SchedulingSlotExplanationHostsItemRole value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingSlotExplanationHostsItemRole value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingSlotExplanationHostsItemRole value) =>
        value.Value;

    public static explicit operator SchedulingSlotExplanationHostsItemRole(string value) =>
        new(value);

    internal class SchedulingSlotExplanationHostsItemRoleSerializer
        : JsonConverter<SchedulingSlotExplanationHostsItemRole>
    {
        public override SchedulingSlotExplanationHostsItemRole Read(
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
            return new SchedulingSlotExplanationHostsItemRole(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingSlotExplanationHostsItemRole value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingSlotExplanationHostsItemRole ReadAsPropertyName(
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
            return new SchedulingSlotExplanationHostsItemRole(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingSlotExplanationHostsItemRole value,
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
