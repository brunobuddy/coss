using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[JsonConverter(typeof(UpdateEventTypeRequestStatus.UpdateEventTypeRequestStatusSerializer))]
[Serializable]
public readonly record struct UpdateEventTypeRequestStatus : IStringEnum
{
    public static readonly UpdateEventTypeRequestStatus Active = new(Values.Active);

    public static readonly UpdateEventTypeRequestStatus Archived = new(Values.Archived);

    public UpdateEventTypeRequestStatus(string value)
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
    public static UpdateEventTypeRequestStatus FromCustom(string value)
    {
        return new UpdateEventTypeRequestStatus(value);
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

    public static bool operator ==(UpdateEventTypeRequestStatus value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(UpdateEventTypeRequestStatus value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(UpdateEventTypeRequestStatus value) => value.Value;

    public static explicit operator UpdateEventTypeRequestStatus(string value) => new(value);

    internal class UpdateEventTypeRequestStatusSerializer
        : JsonConverter<UpdateEventTypeRequestStatus>
    {
        public override UpdateEventTypeRequestStatus Read(
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
            return new UpdateEventTypeRequestStatus(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            UpdateEventTypeRequestStatus value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override UpdateEventTypeRequestStatus ReadAsPropertyName(
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
            return new UpdateEventTypeRequestStatus(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            UpdateEventTypeRequestStatus value,
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
        public const string Active = "active";

        public const string Archived = "archived";
    }
}
