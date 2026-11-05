using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[JsonConverter(typeof(AuthorizeCalendarRequestProvider.AuthorizeCalendarRequestProviderSerializer))]
[Serializable]
public readonly record struct AuthorizeCalendarRequestProvider : IStringEnum
{
    public static readonly AuthorizeCalendarRequestProvider Google = new(Values.Google);

    public static readonly AuthorizeCalendarRequestProvider Microsoft = new(Values.Microsoft);

    public static readonly AuthorizeCalendarRequestProvider Zoom = new(Values.Zoom);

    public AuthorizeCalendarRequestProvider(string value)
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
    public static AuthorizeCalendarRequestProvider FromCustom(string value)
    {
        return new AuthorizeCalendarRequestProvider(value);
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

    public static bool operator ==(AuthorizeCalendarRequestProvider value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(AuthorizeCalendarRequestProvider value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(AuthorizeCalendarRequestProvider value) => value.Value;

    public static explicit operator AuthorizeCalendarRequestProvider(string value) => new(value);

    internal class AuthorizeCalendarRequestProviderSerializer
        : JsonConverter<AuthorizeCalendarRequestProvider>
    {
        public override AuthorizeCalendarRequestProvider Read(
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
            return new AuthorizeCalendarRequestProvider(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            AuthorizeCalendarRequestProvider value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override AuthorizeCalendarRequestProvider ReadAsPropertyName(
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
            return new AuthorizeCalendarRequestProvider(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            AuthorizeCalendarRequestProvider value,
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
        public const string Google = "google";

        public const string Microsoft = "microsoft";

        public const string Zoom = "zoom";
    }
}
