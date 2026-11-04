using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[JsonConverter(typeof(ListBookingsRequestStatus.ListBookingsRequestStatusSerializer))]
[Serializable]
public readonly record struct ListBookingsRequestStatus : IStringEnum
{
    public static readonly ListBookingsRequestStatus Held = new(Values.Held);

    public static readonly ListBookingsRequestStatus PendingApproval = new(Values.PendingApproval);

    public static readonly ListBookingsRequestStatus Confirmed = new(Values.Confirmed);

    public static readonly ListBookingsRequestStatus Cancelled = new(Values.Cancelled);

    public static readonly ListBookingsRequestStatus Declined = new(Values.Declined);

    public ListBookingsRequestStatus(string value)
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
    public static ListBookingsRequestStatus FromCustom(string value)
    {
        return new ListBookingsRequestStatus(value);
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

    public static bool operator ==(ListBookingsRequestStatus value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(ListBookingsRequestStatus value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(ListBookingsRequestStatus value) => value.Value;

    public static explicit operator ListBookingsRequestStatus(string value) => new(value);

    internal class ListBookingsRequestStatusSerializer : JsonConverter<ListBookingsRequestStatus>
    {
        public override ListBookingsRequestStatus Read(
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
            return new ListBookingsRequestStatus(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            ListBookingsRequestStatus value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override ListBookingsRequestStatus ReadAsPropertyName(
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
            return new ListBookingsRequestStatus(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            ListBookingsRequestStatus value,
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
        public const string Held = "held";

        public const string PendingApproval = "pending_approval";

        public const string Confirmed = "confirmed";

        public const string Cancelled = "cancelled";

        public const string Declined = "declined";
    }
}
