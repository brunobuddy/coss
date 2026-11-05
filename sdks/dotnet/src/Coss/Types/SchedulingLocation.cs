// ReSharper disable NullableWarningSuppressionIsUsed
// ReSharper disable InconsistentNaming

using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Nodes;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Where a booking meets. `link`, `phone` and `in_person` carry their details, and on an event type, left blank, use the booked host's own if they have one; `google_meet`, `microsoft_teams` and `zoom` get a meeting made on the host's connected account.
/// </summary>
[JsonConverter(typeof(SchedulingLocation.JsonConverter))]
[Serializable]
public record SchedulingLocation
{
    internal SchedulingLocation(string type, object? value)
    {
        Type = type;
        Value = value;
    }

    /// <summary>
    /// Create an instance of SchedulingLocation with <see cref="SchedulingLocation.Link"/>.
    /// </summary>
    public SchedulingLocation(SchedulingLocation.Link value)
    {
        Type = "link";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of SchedulingLocation with <see cref="SchedulingLocation.Phone"/>.
    /// </summary>
    public SchedulingLocation(SchedulingLocation.Phone value)
    {
        Type = "phone";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of SchedulingLocation with <see cref="SchedulingLocation.InPerson"/>.
    /// </summary>
    public SchedulingLocation(SchedulingLocation.InPerson value)
    {
        Type = "in_person";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of SchedulingLocation with <see cref="SchedulingLocation.GoogleMeet"/>.
    /// </summary>
    public SchedulingLocation(SchedulingLocation.GoogleMeet value)
    {
        Type = "google_meet";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of SchedulingLocation with <see cref="SchedulingLocation.MicrosoftTeams"/>.
    /// </summary>
    public SchedulingLocation(SchedulingLocation.MicrosoftTeams value)
    {
        Type = "microsoft_teams";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of SchedulingLocation with <see cref="SchedulingLocation.Zoom"/>.
    /// </summary>
    public SchedulingLocation(SchedulingLocation.Zoom value)
    {
        Type = "zoom";
        Value = value.Value;
    }

    /// <summary>
    /// Discriminant value
    /// </summary>
    [JsonPropertyName("type")]
    public string Type { get; internal set; }

    /// <summary>
    /// Discriminated union value
    /// </summary>
    public object? Value { get; internal set; }

    /// <summary>
    /// Returns true if <see cref="Type"/> is "link"
    /// </summary>
    public bool IsLink => Type == "link";

    /// <summary>
    /// Returns true if <see cref="Type"/> is "phone"
    /// </summary>
    public bool IsPhone => Type == "phone";

    /// <summary>
    /// Returns true if <see cref="Type"/> is "in_person"
    /// </summary>
    public bool IsInPerson => Type == "in_person";

    /// <summary>
    /// Returns true if <see cref="Type"/> is "google_meet"
    /// </summary>
    public bool IsGoogleMeet => Type == "google_meet";

    /// <summary>
    /// Returns true if <see cref="Type"/> is "microsoft_teams"
    /// </summary>
    public bool IsMicrosoftTeams => Type == "microsoft_teams";

    /// <summary>
    /// Returns true if <see cref="Type"/> is "zoom"
    /// </summary>
    public bool IsZoom => Type == "zoom";

    /// <summary>
    /// Returns the value as a <see cref="Coss.SchedulingLocationLink"/> if <see cref="Type"/> is 'link', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'link'.</exception>
    public Coss.SchedulingLocationLink AsLink() =>
        IsLink
            ? (Coss.SchedulingLocationLink)Value!
            : throw new global::System.Exception("SchedulingLocation.Type is not 'link'");

    /// <summary>
    /// Returns the value as a <see cref="Coss.SchedulingLocationPhone"/> if <see cref="Type"/> is 'phone', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'phone'.</exception>
    public Coss.SchedulingLocationPhone AsPhone() =>
        IsPhone
            ? (Coss.SchedulingLocationPhone)Value!
            : throw new global::System.Exception("SchedulingLocation.Type is not 'phone'");

    /// <summary>
    /// Returns the value as a <see cref="Coss.SchedulingLocationInPerson"/> if <see cref="Type"/> is 'in_person', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'in_person'.</exception>
    public Coss.SchedulingLocationInPerson AsInPerson() =>
        IsInPerson
            ? (Coss.SchedulingLocationInPerson)Value!
            : throw new global::System.Exception("SchedulingLocation.Type is not 'in_person'");

    /// <summary>
    /// Returns the value as a <see cref="Coss.SchedulingLocationGoogleMeet"/> if <see cref="Type"/> is 'google_meet', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'google_meet'.</exception>
    public Coss.SchedulingLocationGoogleMeet AsGoogleMeet() =>
        IsGoogleMeet
            ? (Coss.SchedulingLocationGoogleMeet)Value!
            : throw new global::System.Exception("SchedulingLocation.Type is not 'google_meet'");

    /// <summary>
    /// Returns the value as a <see cref="Coss.SchedulingLocationMicrosoftTeams"/> if <see cref="Type"/> is 'microsoft_teams', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'microsoft_teams'.</exception>
    public Coss.SchedulingLocationMicrosoftTeams AsMicrosoftTeams() =>
        IsMicrosoftTeams
            ? (Coss.SchedulingLocationMicrosoftTeams)Value!
            : throw new global::System.Exception(
                "SchedulingLocation.Type is not 'microsoft_teams'"
            );

    /// <summary>
    /// Returns the value as a <see cref="Coss.SchedulingLocationZoom"/> if <see cref="Type"/> is 'zoom', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'zoom'.</exception>
    public Coss.SchedulingLocationZoom AsZoom() =>
        IsZoom
            ? (Coss.SchedulingLocationZoom)Value!
            : throw new global::System.Exception("SchedulingLocation.Type is not 'zoom'");

    public T Match<T>(
        Func<Coss.SchedulingLocationLink, T> onLink,
        Func<Coss.SchedulingLocationPhone, T> onPhone,
        Func<Coss.SchedulingLocationInPerson, T> onInPerson,
        Func<Coss.SchedulingLocationGoogleMeet, T> onGoogleMeet,
        Func<Coss.SchedulingLocationMicrosoftTeams, T> onMicrosoftTeams,
        Func<Coss.SchedulingLocationZoom, T> onZoom,
        Func<string, object?, T> onUnknown_
    )
    {
        return Type switch
        {
            "link" => onLink(AsLink()),
            "phone" => onPhone(AsPhone()),
            "in_person" => onInPerson(AsInPerson()),
            "google_meet" => onGoogleMeet(AsGoogleMeet()),
            "microsoft_teams" => onMicrosoftTeams(AsMicrosoftTeams()),
            "zoom" => onZoom(AsZoom()),
            _ => onUnknown_(Type, Value),
        };
    }

    public void Visit(
        Action<Coss.SchedulingLocationLink> onLink,
        Action<Coss.SchedulingLocationPhone> onPhone,
        Action<Coss.SchedulingLocationInPerson> onInPerson,
        Action<Coss.SchedulingLocationGoogleMeet> onGoogleMeet,
        Action<Coss.SchedulingLocationMicrosoftTeams> onMicrosoftTeams,
        Action<Coss.SchedulingLocationZoom> onZoom,
        Action<string, object?> onUnknown_
    )
    {
        switch (Type)
        {
            case "link":
                onLink(AsLink());
                break;
            case "phone":
                onPhone(AsPhone());
                break;
            case "in_person":
                onInPerson(AsInPerson());
                break;
            case "google_meet":
                onGoogleMeet(AsGoogleMeet());
                break;
            case "microsoft_teams":
                onMicrosoftTeams(AsMicrosoftTeams());
                break;
            case "zoom":
                onZoom(AsZoom());
                break;
            default:
                onUnknown_(Type, Value);
                break;
        }
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.SchedulingLocationLink"/> and returns true if successful.
    /// </summary>
    public bool TryAsLink(out Coss.SchedulingLocationLink? value)
    {
        if (Type == "link")
        {
            value = (Coss.SchedulingLocationLink)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.SchedulingLocationPhone"/> and returns true if successful.
    /// </summary>
    public bool TryAsPhone(out Coss.SchedulingLocationPhone? value)
    {
        if (Type == "phone")
        {
            value = (Coss.SchedulingLocationPhone)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.SchedulingLocationInPerson"/> and returns true if successful.
    /// </summary>
    public bool TryAsInPerson(out Coss.SchedulingLocationInPerson? value)
    {
        if (Type == "in_person")
        {
            value = (Coss.SchedulingLocationInPerson)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.SchedulingLocationGoogleMeet"/> and returns true if successful.
    /// </summary>
    public bool TryAsGoogleMeet(out Coss.SchedulingLocationGoogleMeet? value)
    {
        if (Type == "google_meet")
        {
            value = (Coss.SchedulingLocationGoogleMeet)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.SchedulingLocationMicrosoftTeams"/> and returns true if successful.
    /// </summary>
    public bool TryAsMicrosoftTeams(out Coss.SchedulingLocationMicrosoftTeams? value)
    {
        if (Type == "microsoft_teams")
        {
            value = (Coss.SchedulingLocationMicrosoftTeams)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.SchedulingLocationZoom"/> and returns true if successful.
    /// </summary>
    public bool TryAsZoom(out Coss.SchedulingLocationZoom? value)
    {
        if (Type == "zoom")
        {
            value = (Coss.SchedulingLocationZoom)Value!;
            return true;
        }
        value = null;
        return false;
    }

    public override string ToString() => JsonUtils.Serialize(this);

    public static implicit operator SchedulingLocation(SchedulingLocation.Link value) => new(value);

    public static implicit operator SchedulingLocation(SchedulingLocation.Phone value) =>
        new(value);

    public static implicit operator SchedulingLocation(SchedulingLocation.InPerson value) =>
        new(value);

    public static implicit operator SchedulingLocation(SchedulingLocation.GoogleMeet value) =>
        new(value);

    public static implicit operator SchedulingLocation(SchedulingLocation.MicrosoftTeams value) =>
        new(value);

    public static implicit operator SchedulingLocation(SchedulingLocation.Zoom value) => new(value);

    [Serializable]
    internal sealed class JsonConverter : JsonConverter<SchedulingLocation>
    {
        public override bool CanConvert(global::System.Type typeToConvert) =>
            typeof(SchedulingLocation).IsAssignableFrom(typeToConvert);

        public override SchedulingLocation Read(
            ref Utf8JsonReader reader,
            global::System.Type typeToConvert,
            JsonSerializerOptions options
        )
        {
            var json = JsonElement.ParseValue(ref reader);
            if (!json.TryGetProperty("type", out var discriminatorElement))
            {
                throw new JsonException("Missing discriminator property 'type'");
            }
            if (discriminatorElement.ValueKind != JsonValueKind.String)
            {
                if (discriminatorElement.ValueKind == JsonValueKind.Null)
                {
                    throw new JsonException("Discriminator property 'type' is null");
                }

                throw new JsonException(
                    $"Discriminator property 'type' is not a string, instead is {discriminatorElement.ToString()}"
                );
            }

            var discriminator =
                discriminatorElement.GetString()
                ?? throw new JsonException("Discriminator property 'type' is null");

            // Strip the discriminant property to prevent it from leaking into AdditionalProperties
            var jsonObject = System.Text.Json.Nodes.JsonObject.Create(json);
            jsonObject?.Remove("type");
            var jsonWithoutDiscriminator =
                jsonObject != null ? JsonSerializer.SerializeToElement(jsonObject, options) : json;

            var value = discriminator switch
            {
                "link" => jsonWithoutDiscriminator.Deserialize<Coss.SchedulingLocationLink?>(
                    options
                ) ?? throw new JsonException("Failed to deserialize Coss.SchedulingLocationLink"),
                "phone" => jsonWithoutDiscriminator.Deserialize<Coss.SchedulingLocationPhone?>(
                    options
                ) ?? throw new JsonException("Failed to deserialize Coss.SchedulingLocationPhone"),
                "in_person" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.SchedulingLocationInPerson?>(options)
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.SchedulingLocationInPerson"
                        ),
                "google_meet" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.SchedulingLocationGoogleMeet?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.SchedulingLocationGoogleMeet"
                        ),
                "microsoft_teams" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.SchedulingLocationMicrosoftTeams?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.SchedulingLocationMicrosoftTeams"
                        ),
                "zoom" => jsonWithoutDiscriminator.Deserialize<Coss.SchedulingLocationZoom?>(
                    options
                ) ?? throw new JsonException("Failed to deserialize Coss.SchedulingLocationZoom"),
                _ => json.Deserialize<object?>(options),
            };
            return new SchedulingLocation(discriminator, value);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingLocation value,
            JsonSerializerOptions options
        )
        {
            JsonNode json =
                value.Type switch
                {
                    "link" => JsonSerializer.SerializeToNode(value.Value, options),
                    "phone" => JsonSerializer.SerializeToNode(value.Value, options),
                    "in_person" => JsonSerializer.SerializeToNode(value.Value, options),
                    "google_meet" => JsonSerializer.SerializeToNode(value.Value, options),
                    "microsoft_teams" => JsonSerializer.SerializeToNode(value.Value, options),
                    "zoom" => JsonSerializer.SerializeToNode(value.Value, options),
                    _ => JsonSerializer.SerializeToNode(value.Value, options),
                } ?? new JsonObject();
            json["type"] = value.Type;
            json.WriteTo(writer, options);
        }

        public override SchedulingLocation ReadAsPropertyName(
            ref Utf8JsonReader reader,
            global::System.Type typeToConvert,
            JsonSerializerOptions options
        )
        {
            var stringValue =
                reader.GetString()
                ?? throw new JsonException("The JSON property name could not be read as a string.");
            return new SchedulingLocation(stringValue, stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingLocation value,
            JsonSerializerOptions options
        )
        {
            writer.WritePropertyName(value.Type);
        }
    }

    /// <summary>
    /// Discriminated union type for link
    /// </summary>
    [Serializable]
    public struct Link
    {
        public Link(Coss.SchedulingLocationLink value)
        {
            Value = value;
        }

        internal Coss.SchedulingLocationLink Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator SchedulingLocation.Link(
            Coss.SchedulingLocationLink value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for phone
    /// </summary>
    [Serializable]
    public struct Phone
    {
        public Phone(Coss.SchedulingLocationPhone value)
        {
            Value = value;
        }

        internal Coss.SchedulingLocationPhone Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator SchedulingLocation.Phone(
            Coss.SchedulingLocationPhone value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for in_person
    /// </summary>
    [Serializable]
    public struct InPerson
    {
        public InPerson(Coss.SchedulingLocationInPerson value)
        {
            Value = value;
        }

        internal Coss.SchedulingLocationInPerson Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator SchedulingLocation.InPerson(
            Coss.SchedulingLocationInPerson value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for google_meet
    /// </summary>
    [Serializable]
    public struct GoogleMeet
    {
        public GoogleMeet(Coss.SchedulingLocationGoogleMeet value)
        {
            Value = value;
        }

        internal Coss.SchedulingLocationGoogleMeet Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator SchedulingLocation.GoogleMeet(
            Coss.SchedulingLocationGoogleMeet value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for microsoft_teams
    /// </summary>
    [Serializable]
    public struct MicrosoftTeams
    {
        public MicrosoftTeams(Coss.SchedulingLocationMicrosoftTeams value)
        {
            Value = value;
        }

        internal Coss.SchedulingLocationMicrosoftTeams Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator SchedulingLocation.MicrosoftTeams(
            Coss.SchedulingLocationMicrosoftTeams value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for zoom
    /// </summary>
    [Serializable]
    public struct Zoom
    {
        public Zoom(Coss.SchedulingLocationZoom value)
        {
            Value = value;
        }

        internal Coss.SchedulingLocationZoom Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator SchedulingLocation.Zoom(
            Coss.SchedulingLocationZoom value
        ) => new(value);
    }
}
