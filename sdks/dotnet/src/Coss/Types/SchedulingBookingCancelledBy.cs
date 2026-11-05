using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingBookingCancelledBy.SchedulingBookingCancelledBySerializer))]
[Serializable]
public readonly record struct SchedulingBookingCancelledBy : IStringEnum
{
    public static readonly SchedulingBookingCancelledBy ApiKey = new(Values.ApiKey);

    public static readonly SchedulingBookingCancelledBy User = new(Values.User);

    public static readonly SchedulingBookingCancelledBy HostSession = new(Values.HostSession);

    public static readonly SchedulingBookingCancelledBy BookerSession = new(Values.BookerSession);

    public static readonly SchedulingBookingCancelledBy ManageSession = new(Values.ManageSession);

    public static readonly SchedulingBookingCancelledBy System = new(Values.System);

    public SchedulingBookingCancelledBy(string value)
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
    public static SchedulingBookingCancelledBy FromCustom(string value)
    {
        return new SchedulingBookingCancelledBy(value);
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

    public static bool operator ==(SchedulingBookingCancelledBy value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingBookingCancelledBy value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingBookingCancelledBy value) => value.Value;

    public static explicit operator SchedulingBookingCancelledBy(string value) => new(value);

    internal class SchedulingBookingCancelledBySerializer
        : JsonConverter<SchedulingBookingCancelledBy>
    {
        public override SchedulingBookingCancelledBy Read(
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
            return new SchedulingBookingCancelledBy(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingBookingCancelledBy value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingBookingCancelledBy ReadAsPropertyName(
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
            return new SchedulingBookingCancelledBy(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingBookingCancelledBy value,
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
        public const string ApiKey = "api_key";

        public const string User = "user";

        public const string HostSession = "host_session";

        public const string BookerSession = "booker_session";

        public const string ManageSession = "manage_session";

        public const string System = "system";
    }
}
