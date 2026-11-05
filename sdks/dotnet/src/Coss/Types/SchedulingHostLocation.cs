// ReSharper disable NullableWarningSuppressionIsUsed
// ReSharper disable InconsistentNaming

using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Nodes;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// Where this host meets. A host has at most one of each type.
/// </summary>
[JsonConverter(typeof(SchedulingHostLocation.JsonConverter))]
[Serializable]
public record SchedulingHostLocation
{
    internal SchedulingHostLocation(string type, object? value)
    {
        Type = type;
        Value = value;
    }

    /// <summary>
    /// Create an instance of SchedulingHostLocation with <see cref="SchedulingHostLocation.Link"/>.
    /// </summary>
    public SchedulingHostLocation(SchedulingHostLocation.Link value)
    {
        Type = "link";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of SchedulingHostLocation with <see cref="SchedulingHostLocation.Phone"/>.
    /// </summary>
    public SchedulingHostLocation(SchedulingHostLocation.Phone value)
    {
        Type = "phone";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of SchedulingHostLocation with <see cref="SchedulingHostLocation.InPerson"/>.
    /// </summary>
    public SchedulingHostLocation(SchedulingHostLocation.InPerson value)
    {
        Type = "in_person";
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
    /// Returns the value as a <see cref="Coss.SchedulingHostLocationLink"/> if <see cref="Type"/> is 'link', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'link'.</exception>
    public Coss.SchedulingHostLocationLink AsLink() =>
        IsLink
            ? (Coss.SchedulingHostLocationLink)Value!
            : throw new global::System.Exception("SchedulingHostLocation.Type is not 'link'");

    /// <summary>
    /// Returns the value as a <see cref="Coss.SchedulingHostLocationPhone"/> if <see cref="Type"/> is 'phone', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'phone'.</exception>
    public Coss.SchedulingHostLocationPhone AsPhone() =>
        IsPhone
            ? (Coss.SchedulingHostLocationPhone)Value!
            : throw new global::System.Exception("SchedulingHostLocation.Type is not 'phone'");

    /// <summary>
    /// Returns the value as a <see cref="Coss.SchedulingHostLocationInPerson"/> if <see cref="Type"/> is 'in_person', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Type"/> is not 'in_person'.</exception>
    public Coss.SchedulingHostLocationInPerson AsInPerson() =>
        IsInPerson
            ? (Coss.SchedulingHostLocationInPerson)Value!
            : throw new global::System.Exception("SchedulingHostLocation.Type is not 'in_person'");

    public T Match<T>(
        Func<Coss.SchedulingHostLocationLink, T> onLink,
        Func<Coss.SchedulingHostLocationPhone, T> onPhone,
        Func<Coss.SchedulingHostLocationInPerson, T> onInPerson,
        Func<string, object?, T> onUnknown_
    )
    {
        return Type switch
        {
            "link" => onLink(AsLink()),
            "phone" => onPhone(AsPhone()),
            "in_person" => onInPerson(AsInPerson()),
            _ => onUnknown_(Type, Value),
        };
    }

    public void Visit(
        Action<Coss.SchedulingHostLocationLink> onLink,
        Action<Coss.SchedulingHostLocationPhone> onPhone,
        Action<Coss.SchedulingHostLocationInPerson> onInPerson,
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
            default:
                onUnknown_(Type, Value);
                break;
        }
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.SchedulingHostLocationLink"/> and returns true if successful.
    /// </summary>
    public bool TryAsLink(out Coss.SchedulingHostLocationLink? value)
    {
        if (Type == "link")
        {
            value = (Coss.SchedulingHostLocationLink)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.SchedulingHostLocationPhone"/> and returns true if successful.
    /// </summary>
    public bool TryAsPhone(out Coss.SchedulingHostLocationPhone? value)
    {
        if (Type == "phone")
        {
            value = (Coss.SchedulingHostLocationPhone)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.SchedulingHostLocationInPerson"/> and returns true if successful.
    /// </summary>
    public bool TryAsInPerson(out Coss.SchedulingHostLocationInPerson? value)
    {
        if (Type == "in_person")
        {
            value = (Coss.SchedulingHostLocationInPerson)Value!;
            return true;
        }
        value = null;
        return false;
    }

    public override string ToString() => JsonUtils.Serialize(this);

    public static implicit operator SchedulingHostLocation(SchedulingHostLocation.Link value) =>
        new(value);

    public static implicit operator SchedulingHostLocation(SchedulingHostLocation.Phone value) =>
        new(value);

    public static implicit operator SchedulingHostLocation(SchedulingHostLocation.InPerson value) =>
        new(value);

    [Serializable]
    internal sealed class JsonConverter : JsonConverter<SchedulingHostLocation>
    {
        public override bool CanConvert(global::System.Type typeToConvert) =>
            typeof(SchedulingHostLocation).IsAssignableFrom(typeToConvert);

        public override SchedulingHostLocation Read(
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
                "link" => jsonWithoutDiscriminator.Deserialize<Coss.SchedulingHostLocationLink?>(
                    options
                )
                    ?? throw new JsonException(
                        "Failed to deserialize Coss.SchedulingHostLocationLink"
                    ),
                "phone" => jsonWithoutDiscriminator.Deserialize<Coss.SchedulingHostLocationPhone?>(
                    options
                )
                    ?? throw new JsonException(
                        "Failed to deserialize Coss.SchedulingHostLocationPhone"
                    ),
                "in_person" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.SchedulingHostLocationInPerson?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.SchedulingHostLocationInPerson"
                        ),
                _ => json.Deserialize<object?>(options),
            };
            return new SchedulingHostLocation(discriminator, value);
        }

        public override void Write(
            Utf8JsonWriter writer,
            SchedulingHostLocation value,
            JsonSerializerOptions options
        )
        {
            JsonNode json =
                value.Type switch
                {
                    "link" => JsonSerializer.SerializeToNode(value.Value, options),
                    "phone" => JsonSerializer.SerializeToNode(value.Value, options),
                    "in_person" => JsonSerializer.SerializeToNode(value.Value, options),
                    _ => JsonSerializer.SerializeToNode(value.Value, options),
                } ?? new JsonObject();
            json["type"] = value.Type;
            json.WriteTo(writer, options);
        }

        public override SchedulingHostLocation ReadAsPropertyName(
            ref Utf8JsonReader reader,
            global::System.Type typeToConvert,
            JsonSerializerOptions options
        )
        {
            var stringValue =
                reader.GetString()
                ?? throw new JsonException("The JSON property name could not be read as a string.");
            return new SchedulingHostLocation(stringValue, stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            SchedulingHostLocation value,
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
        public Link(Coss.SchedulingHostLocationLink value)
        {
            Value = value;
        }

        internal Coss.SchedulingHostLocationLink Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator SchedulingHostLocation.Link(
            Coss.SchedulingHostLocationLink value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for phone
    /// </summary>
    [Serializable]
    public struct Phone
    {
        public Phone(Coss.SchedulingHostLocationPhone value)
        {
            Value = value;
        }

        internal Coss.SchedulingHostLocationPhone Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator SchedulingHostLocation.Phone(
            Coss.SchedulingHostLocationPhone value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for in_person
    /// </summary>
    [Serializable]
    public struct InPerson
    {
        public InPerson(Coss.SchedulingHostLocationInPerson value)
        {
            Value = value;
        }

        internal Coss.SchedulingHostLocationInPerson Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator SchedulingHostLocation.InPerson(
            Coss.SchedulingHostLocationInPerson value
        ) => new(value);
    }
}
