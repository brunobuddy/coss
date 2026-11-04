using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

[JsonConverter(typeof(CreateEventTypeRequestKind.CreateEventTypeRequestKindSerializer))]
[Serializable]
public readonly record struct CreateEventTypeRequestKind : IStringEnum
{
    public static readonly CreateEventTypeRequestKind OneOnOne = new(Values.OneOnOne);

    public static readonly CreateEventTypeRequestKind Pool = new(Values.Pool);

    public static readonly CreateEventTypeRequestKind Collective = new(Values.Collective);

    public static readonly CreateEventTypeRequestKind Group = new(Values.Group);

    public CreateEventTypeRequestKind(string value)
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
    public static CreateEventTypeRequestKind FromCustom(string value)
    {
        return new CreateEventTypeRequestKind(value);
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

    public static bool operator ==(CreateEventTypeRequestKind value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(CreateEventTypeRequestKind value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(CreateEventTypeRequestKind value) => value.Value;

    public static explicit operator CreateEventTypeRequestKind(string value) => new(value);

    internal class CreateEventTypeRequestKindSerializer : JsonConverter<CreateEventTypeRequestKind>
    {
        public override CreateEventTypeRequestKind Read(
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
            return new CreateEventTypeRequestKind(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            CreateEventTypeRequestKind value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override CreateEventTypeRequestKind ReadAsPropertyName(
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
            return new CreateEventTypeRequestKind(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            CreateEventTypeRequestKind value,
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
        public const string OneOnOne = "one_on_one";

        public const string Pool = "pool";

        public const string Collective = "collective";

        public const string Group = "group";
    }
}
