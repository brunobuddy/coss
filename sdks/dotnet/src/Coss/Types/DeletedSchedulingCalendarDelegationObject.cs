using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(DeletedSchedulingCalendarDelegationObject.DeletedSchedulingCalendarDelegationObjectSerializer)
)]
[Serializable]
public readonly record struct DeletedSchedulingCalendarDelegationObject : IStringEnum
{
    public static readonly DeletedSchedulingCalendarDelegationObject SchedulingCalendarDelegation =
        new(Values.SchedulingCalendarDelegation);

    public DeletedSchedulingCalendarDelegationObject(string value)
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
    public static DeletedSchedulingCalendarDelegationObject FromCustom(string value)
    {
        return new DeletedSchedulingCalendarDelegationObject(value);
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
        DeletedSchedulingCalendarDelegationObject value1,
        string value2
    ) => value1.Value.Equals(value2);

    public static bool operator !=(
        DeletedSchedulingCalendarDelegationObject value1,
        string value2
    ) => !value1.Value.Equals(value2);

    public static explicit operator string(DeletedSchedulingCalendarDelegationObject value) =>
        value.Value;

    public static explicit operator DeletedSchedulingCalendarDelegationObject(string value) =>
        new(value);

    internal class DeletedSchedulingCalendarDelegationObjectSerializer
        : JsonConverter<DeletedSchedulingCalendarDelegationObject>
    {
        public override DeletedSchedulingCalendarDelegationObject Read(
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
            return new DeletedSchedulingCalendarDelegationObject(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            DeletedSchedulingCalendarDelegationObject value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override DeletedSchedulingCalendarDelegationObject ReadAsPropertyName(
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
            return new DeletedSchedulingCalendarDelegationObject(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            DeletedSchedulingCalendarDelegationObject value,
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
        public const string SchedulingCalendarDelegation = "scheduling.calendar_delegation";
    }
}
