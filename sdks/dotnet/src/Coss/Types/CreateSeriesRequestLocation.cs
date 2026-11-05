// ReSharper disable NullableWarningSuppressionIsUsed
// ReSharper disable InconsistentNaming

using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Nodes;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// One of the event type's `locations`, with your link filled in if it has none.
/// </summary>
[JsonConverter(typeof(CreateSeriesRequestLocation.JsonConverter))]
[Serializable]
public record CreateSeriesRequestLocation
{
    internal CreateSeriesRequestLocation(string type, object? value)
    {
        Type = type;
        Value = value;
    }

    /// <summary>
    /// Create an instance of CreateSeriesRequestLocation with <see cref="CreateSeriesRequestLocation.Link"/>.
    /// </summary>
    public CreateSeriesRequestLocation(CreateSeriesRequestLocation.Link value)
    {
        Type = "link";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of CreateSeriesRequestLocation with <see cref="CreateSeriesRequestLocation.Phone"/>.
    /// </summary>
    public CreateSeriesRequestLocation(CreateSeriesRequestLocation.Phone value)
    {
        Type = "phone";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of CreateSeriesRequestLocation with <see cref="CreateSeriesRequestLocation.InPerson"/>.
    /// </summary>
    public CreateSeriesRequestLocation(CreateSeriesRequestLocation.InPerson value)
    {
        Type = "in_person";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of CreateSeriesRequestLocation with <see cref="CreateSeriesRequestLocation.GoogleMeet"/>.
    /// </summary>
    public CreateSeriesRequestLocation(CreateSeriesRequestLocation.GoogleMeet value)
    {
        Type = "google_meet";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of CreateSeriesRequestLocation with <see cref="CreateSeriesRequestLocation.MicrosoftTeams"/>.
    /// </summary>
    public CreateSeriesRequestLocation(CreateSeriesRequestLocation.MicrosoftTeams value)
    {
        Type = "microsoft_teams";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of CreateSeriesRequestLocation with <see cref="CreateSeriesRequestLocation.Zoom"/>.
    /// </summary>
    public CreateSeriesRequestLocation(CreateSeriesRequestLocation.Zoom value)
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
    /// Returns the value as a <see cref="Coss.CreateSeriesRequestLocationLink"/> if <see cref="Type"/> is 'link', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'link'.</exception>
    public Coss.CreateSeriesRequestLocationLink AsLink() =>
        IsLink
            ? (Coss.CreateSeriesRequestLocationLink)Value!
            : throw new global::System.Exception("CreateSeriesRequestLocation.Type is not 'link'");

    /// <summary>
    /// Returns the value as a <see cref="Coss.CreateSeriesRequestLocationPhone"/> if <see cref="Type"/> is 'phone', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'phone'.</exception>
    public Coss.CreateSeriesRequestLocationPhone AsPhone() =>
        IsPhone
            ? (Coss.CreateSeriesRequestLocationPhone)Value!
            : throw new global::System.Exception("CreateSeriesRequestLocation.Type is not 'phone'");

    /// <summary>
    /// Returns the value as a <see cref="Coss.CreateSeriesRequestLocationInPerson"/> if <see cref="Type"/> is 'in_person', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'in_person'.</exception>
    public Coss.CreateSeriesRequestLocationInPerson AsInPerson() =>
        IsInPerson
            ? (Coss.CreateSeriesRequestLocationInPerson)Value!
            : throw new global::System.Exception(
                "CreateSeriesRequestLocation.Type is not 'in_person'"
            );

    /// <summary>
    /// Returns the value as a <see cref="Coss.CreateSeriesRequestLocationGoogleMeet"/> if <see cref="Type"/> is 'google_meet', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'google_meet'.</exception>
    public Coss.CreateSeriesRequestLocationGoogleMeet AsGoogleMeet() =>
        IsGoogleMeet
            ? (Coss.CreateSeriesRequestLocationGoogleMeet)Value!
            : throw new global::System.Exception(
                "CreateSeriesRequestLocation.Type is not 'google_meet'"
            );

    /// <summary>
    /// Returns the value as a <see cref="Coss.CreateSeriesRequestLocationMicrosoftTeams"/> if <see cref="Type"/> is 'microsoft_teams', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'microsoft_teams'.</exception>
    public Coss.CreateSeriesRequestLocationMicrosoftTeams AsMicrosoftTeams() =>
        IsMicrosoftTeams
            ? (Coss.CreateSeriesRequestLocationMicrosoftTeams)Value!
            : throw new global::System.Exception(
                "CreateSeriesRequestLocation.Type is not 'microsoft_teams'"
            );

    /// <summary>
    /// Returns the value as a <see cref="Coss.CreateSeriesRequestLocationZoom"/> if <see cref="Type"/> is 'zoom', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'zoom'.</exception>
    public Coss.CreateSeriesRequestLocationZoom AsZoom() =>
        IsZoom
            ? (Coss.CreateSeriesRequestLocationZoom)Value!
            : throw new global::System.Exception("CreateSeriesRequestLocation.Type is not 'zoom'");

    public T Match<T>(
        Func<Coss.CreateSeriesRequestLocationLink, T> onLink,
        Func<Coss.CreateSeriesRequestLocationPhone, T> onPhone,
        Func<Coss.CreateSeriesRequestLocationInPerson, T> onInPerson,
        Func<Coss.CreateSeriesRequestLocationGoogleMeet, T> onGoogleMeet,
        Func<Coss.CreateSeriesRequestLocationMicrosoftTeams, T> onMicrosoftTeams,
        Func<Coss.CreateSeriesRequestLocationZoom, T> onZoom,
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
        Action<Coss.CreateSeriesRequestLocationLink> onLink,
        Action<Coss.CreateSeriesRequestLocationPhone> onPhone,
        Action<Coss.CreateSeriesRequestLocationInPerson> onInPerson,
        Action<Coss.CreateSeriesRequestLocationGoogleMeet> onGoogleMeet,
        Action<Coss.CreateSeriesRequestLocationMicrosoftTeams> onMicrosoftTeams,
        Action<Coss.CreateSeriesRequestLocationZoom> onZoom,
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
    /// Attempts to cast the value to a <see cref="Coss.CreateSeriesRequestLocationLink"/> and returns true if successful.
    /// </summary>
    public bool TryAsLink(out Coss.CreateSeriesRequestLocationLink? value)
    {
        if (Type == "link")
        {
            value = (Coss.CreateSeriesRequestLocationLink)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.CreateSeriesRequestLocationPhone"/> and returns true if successful.
    /// </summary>
    public bool TryAsPhone(out Coss.CreateSeriesRequestLocationPhone? value)
    {
        if (Type == "phone")
        {
            value = (Coss.CreateSeriesRequestLocationPhone)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.CreateSeriesRequestLocationInPerson"/> and returns true if successful.
    /// </summary>
    public bool TryAsInPerson(out Coss.CreateSeriesRequestLocationInPerson? value)
    {
        if (Type == "in_person")
        {
            value = (Coss.CreateSeriesRequestLocationInPerson)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.CreateSeriesRequestLocationGoogleMeet"/> and returns true if successful.
    /// </summary>
    public bool TryAsGoogleMeet(out Coss.CreateSeriesRequestLocationGoogleMeet? value)
    {
        if (Type == "google_meet")
        {
            value = (Coss.CreateSeriesRequestLocationGoogleMeet)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.CreateSeriesRequestLocationMicrosoftTeams"/> and returns true if successful.
    /// </summary>
    public bool TryAsMicrosoftTeams(out Coss.CreateSeriesRequestLocationMicrosoftTeams? value)
    {
        if (Type == "microsoft_teams")
        {
            value = (Coss.CreateSeriesRequestLocationMicrosoftTeams)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.CreateSeriesRequestLocationZoom"/> and returns true if successful.
    /// </summary>
    public bool TryAsZoom(out Coss.CreateSeriesRequestLocationZoom? value)
    {
        if (Type == "zoom")
        {
            value = (Coss.CreateSeriesRequestLocationZoom)Value!;
            return true;
        }
        value = null;
        return false;
    }

    public override string ToString() => JsonUtils.Serialize(this);

    public static implicit operator CreateSeriesRequestLocation(
        CreateSeriesRequestLocation.Link value
    ) => new(value);

    public static implicit operator CreateSeriesRequestLocation(
        CreateSeriesRequestLocation.Phone value
    ) => new(value);

    public static implicit operator CreateSeriesRequestLocation(
        CreateSeriesRequestLocation.InPerson value
    ) => new(value);

    public static implicit operator CreateSeriesRequestLocation(
        CreateSeriesRequestLocation.GoogleMeet value
    ) => new(value);

    public static implicit operator CreateSeriesRequestLocation(
        CreateSeriesRequestLocation.MicrosoftTeams value
    ) => new(value);

    public static implicit operator CreateSeriesRequestLocation(
        CreateSeriesRequestLocation.Zoom value
    ) => new(value);

    [Serializable]
    internal sealed class JsonConverter : JsonConverter<CreateSeriesRequestLocation>
    {
        public override bool CanConvert(global::System.Type typeToConvert) =>
            typeof(CreateSeriesRequestLocation).IsAssignableFrom(typeToConvert);

        public override CreateSeriesRequestLocation Read(
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
                "link" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.CreateSeriesRequestLocationLink?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.CreateSeriesRequestLocationLink"
                        ),
                "phone" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.CreateSeriesRequestLocationPhone?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.CreateSeriesRequestLocationPhone"
                        ),
                "in_person" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.CreateSeriesRequestLocationInPerson?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.CreateSeriesRequestLocationInPerson"
                        ),
                "google_meet" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.CreateSeriesRequestLocationGoogleMeet?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.CreateSeriesRequestLocationGoogleMeet"
                        ),
                "microsoft_teams" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.CreateSeriesRequestLocationMicrosoftTeams?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.CreateSeriesRequestLocationMicrosoftTeams"
                        ),
                "zoom" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.CreateSeriesRequestLocationZoom?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.CreateSeriesRequestLocationZoom"
                        ),
                _ => json.Deserialize<object?>(options),
            };
            return new CreateSeriesRequestLocation(discriminator, value);
        }

        public override void Write(
            Utf8JsonWriter writer,
            CreateSeriesRequestLocation value,
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

        public override CreateSeriesRequestLocation ReadAsPropertyName(
            ref Utf8JsonReader reader,
            global::System.Type typeToConvert,
            JsonSerializerOptions options
        )
        {
            var stringValue =
                reader.GetString()
                ?? throw new JsonException("The JSON property name could not be read as a string.");
            return new CreateSeriesRequestLocation(stringValue, stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            CreateSeriesRequestLocation value,
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
        public Link(Coss.CreateSeriesRequestLocationLink value)
        {
            Value = value;
        }

        internal Coss.CreateSeriesRequestLocationLink Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateSeriesRequestLocation.Link(
            Coss.CreateSeriesRequestLocationLink value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for phone
    /// </summary>
    [Serializable]
    public struct Phone
    {
        public Phone(Coss.CreateSeriesRequestLocationPhone value)
        {
            Value = value;
        }

        internal Coss.CreateSeriesRequestLocationPhone Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateSeriesRequestLocation.Phone(
            Coss.CreateSeriesRequestLocationPhone value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for in_person
    /// </summary>
    [Serializable]
    public struct InPerson
    {
        public InPerson(Coss.CreateSeriesRequestLocationInPerson value)
        {
            Value = value;
        }

        internal Coss.CreateSeriesRequestLocationInPerson Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateSeriesRequestLocation.InPerson(
            Coss.CreateSeriesRequestLocationInPerson value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for google_meet
    /// </summary>
    [Serializable]
    public struct GoogleMeet
    {
        public GoogleMeet(Coss.CreateSeriesRequestLocationGoogleMeet value)
        {
            Value = value;
        }

        internal Coss.CreateSeriesRequestLocationGoogleMeet Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateSeriesRequestLocation.GoogleMeet(
            Coss.CreateSeriesRequestLocationGoogleMeet value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for microsoft_teams
    /// </summary>
    [Serializable]
    public struct MicrosoftTeams
    {
        public MicrosoftTeams(Coss.CreateSeriesRequestLocationMicrosoftTeams value)
        {
            Value = value;
        }

        internal Coss.CreateSeriesRequestLocationMicrosoftTeams Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateSeriesRequestLocation.MicrosoftTeams(
            Coss.CreateSeriesRequestLocationMicrosoftTeams value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for zoom
    /// </summary>
    [Serializable]
    public struct Zoom
    {
        public Zoom(Coss.CreateSeriesRequestLocationZoom value)
        {
            Value = value;
        }

        internal Coss.CreateSeriesRequestLocationZoom Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateSeriesRequestLocation.Zoom(
            Coss.CreateSeriesRequestLocationZoom value
        ) => new(value);
    }
}
