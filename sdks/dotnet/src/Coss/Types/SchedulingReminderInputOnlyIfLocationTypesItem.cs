using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(
    typeof(SchedulingReminderInputOnlyIfLocationTypesItem.SchedulingReminderInputOnlyIfLocationTypesItemSerializer)
)]
[Serializable]
public readonly record struct SchedulingReminderInputOnlyIfLocationTypesItem : IStringEnum
{
    public static readonly SchedulingReminderInputOnlyIfLocationTypesItem Link = new(Values.Link);

    public static readonly SchedulingReminderInputOnlyIfLocationTypesItem Phone = new(Values.Phone);

    public static readonly SchedulingReminderInputOnlyIfLocationTypesItem InPerson = new(
        Values.InPerson
    );

    public static readonly SchedulingReminderInputOnlyIfLocationTypesItem GoogleMeet = new(
        Values.GoogleMeet
    );

    public static readonly SchedulingReminderInputOnlyIfLocationTypesItem MicrosoftTeams = new(
        Values.MicrosoftTeams
    );

    public static readonly SchedulingReminderInputOnlyIfLocationTypesItem Zoom = new(Values.Zoom);

    public SchedulingReminderInputOnlyIfLocationTypesItem(string value)
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
    public static SchedulingReminderInputOnlyIfLocationTypesItem FromCustom(string value)
    {
        return new SchedulingReminderInputOnlyIfLocationTypesItem(value);
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
        SchedulingReminderInputOnlyIfLocationTypesItem value1,
        string value2
    ) => value1.Value.Equals(value2);

    public static bool operator !=(
        SchedulingReminderInputOnlyIfLocationTypesItem value1,
        string value2
    ) => !value1.Value.Equals(value2);

    public static explicit operator string(SchedulingReminderInputOnlyIfLocationTypesItem value) =>
        value.Value;

    public static explicit operator SchedulingReminderInputOnlyIfLocationTypesItem(string value) =>
        new(value);

    internal class SchedulingReminderInputOnlyIfLocationTypesItemSerializer
        : JsonConverter<SchedulingReminderInputOnlyIfLocationTypesItem>
    {
        public override SchedulingReminderInputOnlyIfLocationTypesItem Read(
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
            return new SchedulingReminderInputOnlyIfLocationTypesItem(stringValue);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingReminderInputOnlyIfLocationTypesItem value,
            JsonSerializerOptions options
        )
        {
            writer.WriteStringValue(value.Value);
        }

        public override SchedulingReminderInputOnlyIfLocationTypesItem ReadAsPropertyName(
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
            return new SchedulingReminderInputOnlyIfLocationTypesItem(stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingReminderInputOnlyIfLocationTypesItem value,
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
        public const string Link = "link";

        public const string Phone = "phone";

        public const string InPerson = "in_person";

        public const string GoogleMeet = "google_meet";

        public const string MicrosoftTeams = "microsoft_teams";

        public const string Zoom = "zoom";
    }
}
