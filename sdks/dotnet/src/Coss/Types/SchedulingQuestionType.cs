using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(SchedulingQuestionType.SchedulingQuestionTypeSerializer))]
[Serializable]
public readonly record struct SchedulingQuestionType : IStringEnum
{
    public static readonly SchedulingQuestionType Text = new(Values.Text);

    public static readonly SchedulingQuestionType Textarea = new(Values.Textarea);

    public static readonly SchedulingQuestionType Select = new(Values.Select);

    public static readonly SchedulingQuestionType Radio = new(Values.Radio);

    public static readonly SchedulingQuestionType Checkbox = new(Values.Checkbox);

    public static readonly SchedulingQuestionType Phone = new(Values.Phone);

    public static readonly SchedulingQuestionType Email = new(Values.Email);

    public static readonly SchedulingQuestionType Number = new(Values.Number);

    public SchedulingQuestionType(string value)
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
    public static SchedulingQuestionType FromCustom(string value)
    {
        return new SchedulingQuestionType(value);
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

    public static bool operator ==(SchedulingQuestionType value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingQuestionType value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingQuestionType value) => value.Value;

    public static explicit operator SchedulingQuestionType(string value) => new(value);

    internal class SchedulingQuestionTypeSerializer : JsonConverter<SchedulingQuestionType>
    {
        public override SchedulingQuestionType Read(
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
            return new SchedulingQuestionType(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingQuestionType value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingQuestionType ReadAsPropertyName(
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
            return new SchedulingQuestionType(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingQuestionType value,
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
        public const string Text = "text";

        public const string Textarea = "textarea";

        public const string Select = "select";

        public const string Radio = "radio";

        public const string Checkbox = "checkbox";

        public const string Phone = "phone";

        public const string Email = "email";

        public const string Number = "number";
    }
}
