using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingBookingEventActorKind.SchedulingBookingEventActorKindSerializer))]
[Serializable]
public readonly record struct SchedulingBookingEventActorKind : IStringEnum
{
    public static readonly SchedulingBookingEventActorKind ApiKey = new(Values.ApiKey);

    public static readonly SchedulingBookingEventActorKind User = new(Values.User);

    public static readonly SchedulingBookingEventActorKind HostSession = new(Values.HostSession);

    public static readonly SchedulingBookingEventActorKind BookerSession = new(
        Values.BookerSession
    );

    public static readonly SchedulingBookingEventActorKind ManageSession = new(
        Values.ManageSession
    );

    public static readonly SchedulingBookingEventActorKind System = new(Values.System);

    public SchedulingBookingEventActorKind(string value)
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
    public static SchedulingBookingEventActorKind FromCustom(string value)
    {
        return new SchedulingBookingEventActorKind(value);
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

    public static bool operator ==(SchedulingBookingEventActorKind value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingBookingEventActorKind value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingBookingEventActorKind value) => value.Value;

    public static explicit operator SchedulingBookingEventActorKind(string value) => new(value);

    internal class SchedulingBookingEventActorKindSerializer
        : JsonConverter<SchedulingBookingEventActorKind>
    {
        public override SchedulingBookingEventActorKind Read(
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
            return new SchedulingBookingEventActorKind(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingBookingEventActorKind value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingBookingEventActorKind ReadAsPropertyName(
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
            return new SchedulingBookingEventActorKind(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingBookingEventActorKind value,
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
