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
[JsonConverter(typeof(CreateBookingRequestLocation.JsonConverter))]
[Serializable]
public record CreateBookingRequestLocation
{
    internal CreateBookingRequestLocation(string type, object? value)
    {
        Type = type;
        Value = value;
    }

    /// <summary>
    /// Create an instance of CreateBookingRequestLocation with <see cref="CreateBookingRequestLocation.Link"/>.
    /// </summary>
    public CreateBookingRequestLocation(CreateBookingRequestLocation.Link value)
    {
        Type = "link";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of CreateBookingRequestLocation with <see cref="CreateBookingRequestLocation.Phone"/>.
    /// </summary>
    public CreateBookingRequestLocation(CreateBookingRequestLocation.Phone value)
    {
        Type = "phone";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of CreateBookingRequestLocation with <see cref="CreateBookingRequestLocation.InPerson"/>.
    /// </summary>
    public CreateBookingRequestLocation(CreateBookingRequestLocation.InPerson value)
    {
        Type = "in_person";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of CreateBookingRequestLocation with <see cref="CreateBookingRequestLocation.GoogleMeet"/>.
    /// </summary>
    public CreateBookingRequestLocation(CreateBookingRequestLocation.GoogleMeet value)
    {
        Type = "google_meet";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of CreateBookingRequestLocation with <see cref="CreateBookingRequestLocation.MicrosoftTeams"/>.
    /// </summary>
    public CreateBookingRequestLocation(CreateBookingRequestLocation.MicrosoftTeams value)
    {
        Type = "microsoft_teams";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of CreateBookingRequestLocation with <see cref="CreateBookingRequestLocation.Zoom"/>.
    /// </summary>
    public CreateBookingRequestLocation(CreateBookingRequestLocation.Zoom value)
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
    /// Returns the value as a <see cref="Coss.Scheduling.CreateBookingRequestLocationLink"/> if <see cref="Type"/> is 'link', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'link'.</exception>
    public Coss.Scheduling.CreateBookingRequestLocationLink AsLink() =>
        IsLink
            ? (Coss.Scheduling.CreateBookingRequestLocationLink)Value!
            : throw new global::System.Exception("CreateBookingRequestLocation.Type is not 'link'");

    /// <summary>
    /// Returns the value as a <see cref="Coss.Scheduling.CreateBookingRequestLocationPhone"/> if <see cref="Type"/> is 'phone', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'phone'.</exception>
    public Coss.Scheduling.CreateBookingRequestLocationPhone AsPhone() =>
        IsPhone
            ? (Coss.Scheduling.CreateBookingRequestLocationPhone)Value!
            : throw new global::System.Exception(
                "CreateBookingRequestLocation.Type is not 'phone'"
            );

    /// <summary>
    /// Returns the value as a <see cref="Coss.Scheduling.CreateBookingRequestLocationInPerson"/> if <see cref="Type"/> is 'in_person', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'in_person'.</exception>
    public Coss.Scheduling.CreateBookingRequestLocationInPerson AsInPerson() =>
        IsInPerson
            ? (Coss.Scheduling.CreateBookingRequestLocationInPerson)Value!
            : throw new global::System.Exception(
                "CreateBookingRequestLocation.Type is not 'in_person'"
            );

    /// <summary>
    /// Returns the value as a <see cref="Coss.Scheduling.CreateBookingRequestLocationGoogleMeet"/> if <see cref="Type"/> is 'google_meet', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'google_meet'.</exception>
    public Coss.Scheduling.CreateBookingRequestLocationGoogleMeet AsGoogleMeet() =>
        IsGoogleMeet
            ? (Coss.Scheduling.CreateBookingRequestLocationGoogleMeet)Value!
            : throw new global::System.Exception(
                "CreateBookingRequestLocation.Type is not 'google_meet'"
            );

    /// <summary>
    /// Returns the value as a <see cref="Coss.Scheduling.CreateBookingRequestLocationMicrosoftTeams"/> if <see cref="Type"/> is 'microsoft_teams', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'microsoft_teams'.</exception>
    public Coss.Scheduling.CreateBookingRequestLocationMicrosoftTeams AsMicrosoftTeams() =>
        IsMicrosoftTeams
            ? (Coss.Scheduling.CreateBookingRequestLocationMicrosoftTeams)Value!
            : throw new global::System.Exception(
                "CreateBookingRequestLocation.Type is not 'microsoft_teams'"
            );

    /// <summary>
    /// Returns the value as a <see cref="Coss.Scheduling.CreateBookingRequestLocationZoom"/> if <see cref="Type"/> is 'zoom', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'zoom'.</exception>
    public Coss.Scheduling.CreateBookingRequestLocationZoom AsZoom() =>
        IsZoom
            ? (Coss.Scheduling.CreateBookingRequestLocationZoom)Value!
            : throw new global::System.Exception("CreateBookingRequestLocation.Type is not 'zoom'");

    public T Match<T>(
        Func<Coss.Scheduling.CreateBookingRequestLocationLink, T> onLink,
        Func<Coss.Scheduling.CreateBookingRequestLocationPhone, T> onPhone,
        Func<Coss.Scheduling.CreateBookingRequestLocationInPerson, T> onInPerson,
        Func<Coss.Scheduling.CreateBookingRequestLocationGoogleMeet, T> onGoogleMeet,
        Func<Coss.Scheduling.CreateBookingRequestLocationMicrosoftTeams, T> onMicrosoftTeams,
        Func<Coss.Scheduling.CreateBookingRequestLocationZoom, T> onZoom,
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
        Action<Coss.Scheduling.CreateBookingRequestLocationLink> onLink,
        Action<Coss.Scheduling.CreateBookingRequestLocationPhone> onPhone,
        Action<Coss.Scheduling.CreateBookingRequestLocationInPerson> onInPerson,
        Action<Coss.Scheduling.CreateBookingRequestLocationGoogleMeet> onGoogleMeet,
        Action<Coss.Scheduling.CreateBookingRequestLocationMicrosoftTeams> onMicrosoftTeams,
        Action<Coss.Scheduling.CreateBookingRequestLocationZoom> onZoom,
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
    /// Attempts to cast the value to a <see cref="Coss.Scheduling.CreateBookingRequestLocationLink"/> and returns true if successful.
    /// </summary>
    public bool TryAsLink(out Coss.Scheduling.CreateBookingRequestLocationLink? value)
    {
        if (Type == "link")
        {
            value = (Coss.Scheduling.CreateBookingRequestLocationLink)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.Scheduling.CreateBookingRequestLocationPhone"/> and returns true if successful.
    /// </summary>
    public bool TryAsPhone(out Coss.Scheduling.CreateBookingRequestLocationPhone? value)
    {
        if (Type == "phone")
        {
            value = (Coss.Scheduling.CreateBookingRequestLocationPhone)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.Scheduling.CreateBookingRequestLocationInPerson"/> and returns true if successful.
    /// </summary>
    public bool TryAsInPerson(out Coss.Scheduling.CreateBookingRequestLocationInPerson? value)
    {
        if (Type == "in_person")
        {
            value = (Coss.Scheduling.CreateBookingRequestLocationInPerson)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.Scheduling.CreateBookingRequestLocationGoogleMeet"/> and returns true if successful.
    /// </summary>
    public bool TryAsGoogleMeet(out Coss.Scheduling.CreateBookingRequestLocationGoogleMeet? value)
    {
        if (Type == "google_meet")
        {
            value = (Coss.Scheduling.CreateBookingRequestLocationGoogleMeet)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.Scheduling.CreateBookingRequestLocationMicrosoftTeams"/> and returns true if successful.
    /// </summary>
    public bool TryAsMicrosoftTeams(
        out Coss.Scheduling.CreateBookingRequestLocationMicrosoftTeams? value
    )
    {
        if (Type == "microsoft_teams")
        {
            value = (Coss.Scheduling.CreateBookingRequestLocationMicrosoftTeams)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.Scheduling.CreateBookingRequestLocationZoom"/> and returns true if successful.
    /// </summary>
    public bool TryAsZoom(out Coss.Scheduling.CreateBookingRequestLocationZoom? value)
    {
        if (Type == "zoom")
        {
            value = (Coss.Scheduling.CreateBookingRequestLocationZoom)Value!;
            return true;
        }
        value = null;
        return false;
    }

    public override string ToString() => JsonUtils.Serialize(this);

    public static implicit operator CreateBookingRequestLocation(
        CreateBookingRequestLocation.Link value
    ) => new(value);

    public static implicit operator CreateBookingRequestLocation(
        CreateBookingRequestLocation.Phone value
    ) => new(value);

    public static implicit operator CreateBookingRequestLocation(
        CreateBookingRequestLocation.InPerson value
    ) => new(value);

    public static implicit operator CreateBookingRequestLocation(
        CreateBookingRequestLocation.GoogleMeet value
    ) => new(value);

    public static implicit operator CreateBookingRequestLocation(
        CreateBookingRequestLocation.MicrosoftTeams value
    ) => new(value);

    public static implicit operator CreateBookingRequestLocation(
        CreateBookingRequestLocation.Zoom value
    ) => new(value);

    [Serializable]
    internal sealed class JsonConverter : JsonConverter<CreateBookingRequestLocation>
    {
        public override bool CanConvert(global::System.Type typeToConvert) =>
            typeof(CreateBookingRequestLocation).IsAssignableFrom(typeToConvert);

        public override CreateBookingRequestLocation Read(
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
                    jsonWithoutDiscriminator.Deserialize<Coss.Scheduling.CreateBookingRequestLocationLink?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.Scheduling.CreateBookingRequestLocationLink"
                        ),
                "phone" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.Scheduling.CreateBookingRequestLocationPhone?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.Scheduling.CreateBookingRequestLocationPhone"
                        ),
                "in_person" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.Scheduling.CreateBookingRequestLocationInPerson?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.Scheduling.CreateBookingRequestLocationInPerson"
                        ),
                "google_meet" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.Scheduling.CreateBookingRequestLocationGoogleMeet?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.Scheduling.CreateBookingRequestLocationGoogleMeet"
                        ),
                "microsoft_teams" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.Scheduling.CreateBookingRequestLocationMicrosoftTeams?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.Scheduling.CreateBookingRequestLocationMicrosoftTeams"
                        ),
                "zoom" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.Scheduling.CreateBookingRequestLocationZoom?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.Scheduling.CreateBookingRequestLocationZoom"
                        ),
                _ => json.Deserialize<object?>(options),
            };
            return new CreateBookingRequestLocation(discriminator, value);
        }

        public override void Write(
            Utf8JsonWriter writer,
            CreateBookingRequestLocation value,
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

        public override CreateBookingRequestLocation ReadAsPropertyName(
            ref Utf8JsonReader reader,
            global::System.Type typeToConvert,
            JsonSerializerOptions options
        )
        {
            var stringValue =
                reader.GetString()
                ?? throw new JsonException("The JSON property name could not be read as a string.");
            return new CreateBookingRequestLocation(stringValue, stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            CreateBookingRequestLocation value,
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
        public Link(Coss.Scheduling.CreateBookingRequestLocationLink value)
        {
            Value = value;
        }

        internal Coss.Scheduling.CreateBookingRequestLocationLink Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateBookingRequestLocation.Link(
            Coss.Scheduling.CreateBookingRequestLocationLink value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for phone
    /// </summary>
    [Serializable]
    public struct Phone
    {
        public Phone(Coss.Scheduling.CreateBookingRequestLocationPhone value)
        {
            Value = value;
        }

        internal Coss.Scheduling.CreateBookingRequestLocationPhone Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateBookingRequestLocation.Phone(
            Coss.Scheduling.CreateBookingRequestLocationPhone value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for in_person
    /// </summary>
    [Serializable]
    public struct InPerson
    {
        public InPerson(Coss.Scheduling.CreateBookingRequestLocationInPerson value)
        {
            Value = value;
        }

        internal Coss.Scheduling.CreateBookingRequestLocationInPerson Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateBookingRequestLocation.InPerson(
            Coss.Scheduling.CreateBookingRequestLocationInPerson value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for google_meet
    /// </summary>
    [Serializable]
    public struct GoogleMeet
    {
        public GoogleMeet(Coss.Scheduling.CreateBookingRequestLocationGoogleMeet value)
        {
            Value = value;
        }

        internal Coss.Scheduling.CreateBookingRequestLocationGoogleMeet Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateBookingRequestLocation.GoogleMeet(
            Coss.Scheduling.CreateBookingRequestLocationGoogleMeet value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for microsoft_teams
    /// </summary>
    [Serializable]
    public struct MicrosoftTeams
    {
        public MicrosoftTeams(Coss.Scheduling.CreateBookingRequestLocationMicrosoftTeams value)
        {
            Value = value;
        }

        internal Coss.Scheduling.CreateBookingRequestLocationMicrosoftTeams Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateBookingRequestLocation.MicrosoftTeams(
            Coss.Scheduling.CreateBookingRequestLocationMicrosoftTeams value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for zoom
    /// </summary>
    [Serializable]
    public struct Zoom
    {
        public Zoom(Coss.Scheduling.CreateBookingRequestLocationZoom value)
        {
            Value = value;
        }

        internal Coss.Scheduling.CreateBookingRequestLocationZoom Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateBookingRequestLocation.Zoom(
            Coss.Scheduling.CreateBookingRequestLocationZoom value
        ) => new(value);
    }
}
