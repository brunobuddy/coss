using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingSettingsLogoContentType.SchedulingSettingsLogoContentTypeSerializer)
)]
[Serializable]
public readonly record struct SchedulingSettingsLogoContentType : IStringEnum
{
    public static readonly SchedulingSettingsLogoContentType ImagePng = new(Values.ImagePng);

    public static readonly SchedulingSettingsLogoContentType ImageJpeg = new(Values.ImageJpeg);

    public SchedulingSettingsLogoContentType(string value)
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
    public static SchedulingSettingsLogoContentType FromCustom(string value)
    {
        return new SchedulingSettingsLogoContentType(value);
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

    public static bool operator ==(SchedulingSettingsLogoContentType value1, string value2) =>
        value1.Value.Equals(value2);

    public static bool operator !=(SchedulingSettingsLogoContentType value1, string value2) =>
        !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingSettingsLogoContentType value) => value.Value;

    public static explicit operator SchedulingSettingsLogoContentType(string value) => new(value);

    internal class SchedulingSettingsLogoContentTypeSerializer
        : JsonConverter<SchedulingSettingsLogoContentType>
    {
        public override SchedulingSettingsLogoContentType Read(
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
            return new SchedulingSettingsLogoContentType(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingSettingsLogoContentType value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingSettingsLogoContentType ReadAsPropertyName(
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
            return new SchedulingSettingsLogoContentType(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingSettingsLogoContentType value,
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
        public const string ImagePng = "image/png";

        public const string ImageJpeg = "image/jpeg";
    }
}
