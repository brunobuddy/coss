using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(DeletedSchedulingCalendarConnectionObject.DeletedSchedulingCalendarConnectionObjectSerializer)
)]
[Serializable]
public readonly record struct DeletedSchedulingCalendarConnectionObject : IStringEnum
{
    public static readonly DeletedSchedulingCalendarConnectionObject SchedulingCalendarConnection =
        new(Values.SchedulingCalendarConnection);

    public DeletedSchedulingCalendarConnectionObject(string value)
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
    public static DeletedSchedulingCalendarConnectionObject FromCustom(string value)
    {
        return new DeletedSchedulingCalendarConnectionObject(value);
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
        DeletedSchedulingCalendarConnectionObject value1,
        string value2
    ) => value1.Value.Equals(value2);

    public static bool operator !=(
        DeletedSchedulingCalendarConnectionObject value1,
        string value2
    ) => !value1.Value.Equals(value2);

    public static explicit operator string(DeletedSchedulingCalendarConnectionObject value) =>
        value.Value;

    public static explicit operator DeletedSchedulingCalendarConnectionObject(string value) =>
        new(value);

    internal class DeletedSchedulingCalendarConnectionObjectSerializer
        : JsonConverter<DeletedSchedulingCalendarConnectionObject>
    {
        public override DeletedSchedulingCalendarConnectionObject Read(
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
            return new DeletedSchedulingCalendarConnectionObject(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            DeletedSchedulingCalendarConnectionObject value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override DeletedSchedulingCalendarConnectionObject ReadAsPropertyName(
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
            return new DeletedSchedulingCalendarConnectionObject(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            DeletedSchedulingCalendarConnectionObject value,
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
        public const string SchedulingCalendarConnection = "scheduling.calendar_connection";
    }
}
