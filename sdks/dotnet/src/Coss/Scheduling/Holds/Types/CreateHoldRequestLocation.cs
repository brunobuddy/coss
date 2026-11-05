// ReSharper disable NullableWarningSuppressionIsUsed
// ReSharper disable InconsistentNaming

using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Nodes;
using global::System.Text.Json.Serialization;

namespace Coss.Scheduling;

/// <summary>
/// One of the event type's `locations`, with your link filled in if it has none.
/// </summary>
[JsonConverter(typeof(CreateHoldRequestLocation.JsonConverter))]
[Serializable]
public record CreateHoldRequestLocation
{
    internal CreateHoldRequestLocation(string type, object? value)
    {
        Type = type;
        Value = value;
    }

    /// <summary>
    /// Create an instance of CreateHoldRequestLocation with <see cref="CreateHoldRequestLocation.Link"/>.
    /// </summary>
    public CreateHoldRequestLocation(CreateHoldRequestLocation.Link value)
    {
        Type = "link";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of CreateHoldRequestLocation with <see cref="CreateHoldRequestLocation.Phone"/>.
    /// </summary>
    public CreateHoldRequestLocation(CreateHoldRequestLocation.Phone value)
    {
        Type = "phone";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of CreateHoldRequestLocation with <see cref="CreateHoldRequestLocation.InPerson"/>.
    /// </summary>
    public CreateHoldRequestLocation(CreateHoldRequestLocation.InPerson value)
    {
        Type = "in_person";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of CreateHoldRequestLocation with <see cref="CreateHoldRequestLocation.GoogleMeet"/>.
    /// </summary>
    public CreateHoldRequestLocation(CreateHoldRequestLocation.GoogleMeet value)
    {
        Type = "google_meet";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of CreateHoldRequestLocation with <see cref="CreateHoldRequestLocation.MicrosoftTeams"/>.
    /// </summary>
    public CreateHoldRequestLocation(CreateHoldRequestLocation.MicrosoftTeams value)
    {
        Type = "microsoft_teams";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of CreateHoldRequestLocation with <see cref="CreateHoldRequestLocation.Zoom"/>.
    /// </summary>
    public CreateHoldRequestLocation(CreateHoldRequestLocation.Zoom value)
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
    /// Returns the value as a <see cref="Coss.Scheduling.CreateHoldRequestLocationLink"/> if <see cref="Type"/> is 'link', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'link'.</exception>
    public Coss.Scheduling.CreateHoldRequestLocationLink AsLink() =>
        IsLink
            ? (Coss.Scheduling.CreateHoldRequestLocationLink)Value!
            : throw new global::System.Exception("CreateHoldRequestLocation.Type is not 'link'");

    /// <summary>
    /// Returns the value as a <see cref="Coss.Scheduling.CreateHoldRequestLocationPhone"/> if <see cref="Type"/> is 'phone', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'phone'.</exception>
    public Coss.Scheduling.CreateHoldRequestLocationPhone AsPhone() =>
        IsPhone
            ? (Coss.Scheduling.CreateHoldRequestLocationPhone)Value!
            : throw new global::System.Exception("CreateHoldRequestLocation.Type is not 'phone'");

    /// <summary>
    /// Returns the value as a <see cref="Coss.Scheduling.CreateHoldRequestLocationInPerson"/> if <see cref="Type"/> is 'in_person', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'in_person'.</exception>
    public Coss.Scheduling.CreateHoldRequestLocationInPerson AsInPerson() =>
        IsInPerson
            ? (Coss.Scheduling.CreateHoldRequestLocationInPerson)Value!
            : throw new global::System.Exception(
                "CreateHoldRequestLocation.Type is not 'in_person'"
            );

    /// <summary>
    /// Returns the value as a <see cref="Coss.Scheduling.CreateHoldRequestLocationGoogleMeet"/> if <see cref="Type"/> is 'google_meet', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'google_meet'.</exception>
    public Coss.Scheduling.CreateHoldRequestLocationGoogleMeet AsGoogleMeet() =>
        IsGoogleMeet
            ? (Coss.Scheduling.CreateHoldRequestLocationGoogleMeet)Value!
            : throw new global::System.Exception(
                "CreateHoldRequestLocation.Type is not 'google_meet'"
            );

    /// <summary>
    /// Returns the value as a <see cref="Coss.Scheduling.CreateHoldRequestLocationMicrosoftTeams"/> if <see cref="Type"/> is 'microsoft_teams', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'microsoft_teams'.</exception>
    public Coss.Scheduling.CreateHoldRequestLocationMicrosoftTeams AsMicrosoftTeams() =>
        IsMicrosoftTeams
            ? (Coss.Scheduling.CreateHoldRequestLocationMicrosoftTeams)Value!
            : throw new global::System.Exception(
                "CreateHoldRequestLocation.Type is not 'microsoft_teams'"
            );

    /// <summary>
    /// Returns the value as a <see cref="Coss.Scheduling.CreateHoldRequestLocationZoom"/> if <see cref="Type"/> is 'zoom', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'zoom'.</exception>
    public Coss.Scheduling.CreateHoldRequestLocationZoom AsZoom() =>
        IsZoom
            ? (Coss.Scheduling.CreateHoldRequestLocationZoom)Value!
            : throw new global::System.Exception("CreateHoldRequestLocation.Type is not 'zoom'");

    public T Match<T>(
        Func<Coss.Scheduling.CreateHoldRequestLocationLink, T> onLink,
        Func<Coss.Scheduling.CreateHoldRequestLocationPhone, T> onPhone,
        Func<Coss.Scheduling.CreateHoldRequestLocationInPerson, T> onInPerson,
        Func<Coss.Scheduling.CreateHoldRequestLocationGoogleMeet, T> onGoogleMeet,
        Func<Coss.Scheduling.CreateHoldRequestLocationMicrosoftTeams, T> onMicrosoftTeams,
        Func<Coss.Scheduling.CreateHoldRequestLocationZoom, T> onZoom,
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
        Action<Coss.Scheduling.CreateHoldRequestLocationLink> onLink,
        Action<Coss.Scheduling.CreateHoldRequestLocationPhone> onPhone,
        Action<Coss.Scheduling.CreateHoldRequestLocationInPerson> onInPerson,
        Action<Coss.Scheduling.CreateHoldRequestLocationGoogleMeet> onGoogleMeet,
        Action<Coss.Scheduling.CreateHoldRequestLocationMicrosoftTeams> onMicrosoftTeams,
        Action<Coss.Scheduling.CreateHoldRequestLocationZoom> onZoom,
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
    /// Attempts to cast the value to a <see cref="Coss.Scheduling.CreateHoldRequestLocationLink"/> and returns true if successful.
    /// </summary>
    public bool TryAsLink(out Coss.Scheduling.CreateHoldRequestLocationLink? value)
    {
        if (Type == "link")
        {
            value = (Coss.Scheduling.CreateHoldRequestLocationLink)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.Scheduling.CreateHoldRequestLocationPhone"/> and returns true if successful.
    /// </summary>
    public bool TryAsPhone(out Coss.Scheduling.CreateHoldRequestLocationPhone? value)
    {
        if (Type == "phone")
        {
            value = (Coss.Scheduling.CreateHoldRequestLocationPhone)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.Scheduling.CreateHoldRequestLocationInPerson"/> and returns true if successful.
    /// </summary>
    public bool TryAsInPerson(out Coss.Scheduling.CreateHoldRequestLocationInPerson? value)
    {
        if (Type == "in_person")
        {
            value = (Coss.Scheduling.CreateHoldRequestLocationInPerson)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.Scheduling.CreateHoldRequestLocationGoogleMeet"/> and returns true if successful.
    /// </summary>
    public bool TryAsGoogleMeet(out Coss.Scheduling.CreateHoldRequestLocationGoogleMeet? value)
    {
        if (Type == "google_meet")
        {
            value = (Coss.Scheduling.CreateHoldRequestLocationGoogleMeet)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.Scheduling.CreateHoldRequestLocationMicrosoftTeams"/> and returns true if successful.
    /// </summary>
    public bool TryAsMicrosoftTeams(
        out Coss.Scheduling.CreateHoldRequestLocationMicrosoftTeams? value
    )
    {
        if (Type == "microsoft_teams")
        {
            value = (Coss.Scheduling.CreateHoldRequestLocationMicrosoftTeams)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.Scheduling.CreateHoldRequestLocationZoom"/> and returns true if successful.
    /// </summary>
    public bool TryAsZoom(out Coss.Scheduling.CreateHoldRequestLocationZoom? value)
    {
        if (Type == "zoom")
        {
            value = (Coss.Scheduling.CreateHoldRequestLocationZoom)Value!;
            return true;
        }
        value = null;
        return false;
    }

    public override string ToString() => JsonUtils.Serialize(this);

    public static implicit operator CreateHoldRequestLocation(
        CreateHoldRequestLocation.Link value
    ) => new(value);

    public static implicit operator CreateHoldRequestLocation(
        CreateHoldRequestLocation.Phone value
    ) => new(value);

    public static implicit operator CreateHoldRequestLocation(
        CreateHoldRequestLocation.InPerson value
    ) => new(value);

    public static implicit operator CreateHoldRequestLocation(
        CreateHoldRequestLocation.GoogleMeet value
    ) => new(value);

    public static implicit operator CreateHoldRequestLocation(
        CreateHoldRequestLocation.MicrosoftTeams value
    ) => new(value);

    public static implicit operator CreateHoldRequestLocation(
        CreateHoldRequestLocation.Zoom value
    ) => new(value);

    [Serializable]
    internal sealed class JsonConverter : JsonConverter<CreateHoldRequestLocation>
    {
        public override bool CanConvert(global::System.Type typeToConvert) =>
            typeof(CreateHoldRequestLocation).IsAssignableFrom(typeToConvert);

        public override CreateHoldRequestLocation Read(
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
                    jsonWithoutDiscriminator.Deserialize<Coss.Scheduling.CreateHoldRequestLocationLink?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.Scheduling.CreateHoldRequestLocationLink"
                        ),
                "phone" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.Scheduling.CreateHoldRequestLocationPhone?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.Scheduling.CreateHoldRequestLocationPhone"
                        ),
                "in_person" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.Scheduling.CreateHoldRequestLocationInPerson?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.Scheduling.CreateHoldRequestLocationInPerson"
                        ),
                "google_meet" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.Scheduling.CreateHoldRequestLocationGoogleMeet?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.Scheduling.CreateHoldRequestLocationGoogleMeet"
                        ),
                "microsoft_teams" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.Scheduling.CreateHoldRequestLocationMicrosoftTeams?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.Scheduling.CreateHoldRequestLocationMicrosoftTeams"
                        ),
                "zoom" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.Scheduling.CreateHoldRequestLocationZoom?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.Scheduling.CreateHoldRequestLocationZoom"
                        ),
                _ => json.Deserialize<object?>(options),
            };
            return new CreateHoldRequestLocation(discriminator, value);
        }

        public override void Write(
            Utf8JsonWriter writer,
            CreateHoldRequestLocation value,
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

        public override CreateHoldRequestLocation ReadAsPropertyName(
            ref Utf8JsonReader reader,
            global::System.Type typeToConvert,
            JsonSerializerOptions options
        )
        {
            var stringValue =
                reader.GetString()
                ?? throw new JsonException("The JSON property name could not be read as a string.");
            return new CreateHoldRequestLocation(stringValue, stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            CreateHoldRequestLocation value,
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
        public Link(Coss.Scheduling.CreateHoldRequestLocationLink value)
        {
            Value = value;
        }

        internal Coss.Scheduling.CreateHoldRequestLocationLink Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateHoldRequestLocation.Link(
            Coss.Scheduling.CreateHoldRequestLocationLink value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for phone
    /// </summary>
    [Serializable]
    public struct Phone
    {
        public Phone(Coss.Scheduling.CreateHoldRequestLocationPhone value)
        {
            Value = value;
        }

        internal Coss.Scheduling.CreateHoldRequestLocationPhone Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateHoldRequestLocation.Phone(
            Coss.Scheduling.CreateHoldRequestLocationPhone value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for in_person
    /// </summary>
    [Serializable]
    public struct InPerson
    {
        public InPerson(Coss.Scheduling.CreateHoldRequestLocationInPerson value)
        {
            Value = value;
        }

        internal Coss.Scheduling.CreateHoldRequestLocationInPerson Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateHoldRequestLocation.InPerson(
            Coss.Scheduling.CreateHoldRequestLocationInPerson value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for google_meet
    /// </summary>
    [Serializable]
    public struct GoogleMeet
    {
        public GoogleMeet(Coss.Scheduling.CreateHoldRequestLocationGoogleMeet value)
        {
            Value = value;
        }

        internal Coss.Scheduling.CreateHoldRequestLocationGoogleMeet Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateHoldRequestLocation.GoogleMeet(
            Coss.Scheduling.CreateHoldRequestLocationGoogleMeet value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for microsoft_teams
    /// </summary>
    [Serializable]
    public struct MicrosoftTeams
    {
        public MicrosoftTeams(Coss.Scheduling.CreateHoldRequestLocationMicrosoftTeams value)
        {
            Value = value;
        }

        internal Coss.Scheduling.CreateHoldRequestLocationMicrosoftTeams Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateHoldRequestLocation.MicrosoftTeams(
            Coss.Scheduling.CreateHoldRequestLocationMicrosoftTeams value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for zoom
    /// </summary>
    [Serializable]
    public struct Zoom
    {
        public Zoom(Coss.Scheduling.CreateHoldRequestLocationZoom value)
        {
            Value = value;
        }

        internal Coss.Scheduling.CreateHoldRequestLocationZoom Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateHoldRequestLocation.Zoom(
            Coss.Scheduling.CreateHoldRequestLocationZoom value
        ) => new(value);
    }
}
