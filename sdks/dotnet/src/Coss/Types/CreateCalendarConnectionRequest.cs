// ReSharper disable NullableWarningSuppressionIsUsed
// ReSharper disable InconsistentNaming

using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Nodes;
using global::System.Text.Json.Serialization;

namespace Coss;

/// <summary>
/// `caldav` connects a server with an app-specific password; `simulated` is a sandbox calendar for tests.
/// </summary>
[JsonConverter(typeof(CreateCalendarConnectionRequest.JsonConverter))]
[Serializable]
public record CreateCalendarConnectionRequest
{
    internal CreateCalendarConnectionRequest(string type, object? value)
    {
        Provider = type;
        Value = value;
    }

    /// <summary>
    /// Create an instance of CreateCalendarConnectionRequest with <see cref="CreateCalendarConnectionRequest.Caldav"/>.
    /// </summary>
    public CreateCalendarConnectionRequest(CreateCalendarConnectionRequest.Caldav value)
    {
        Provider = "caldav";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of CreateCalendarConnectionRequest with <see cref="CreateCalendarConnectionRequest.Simulated"/>.
    /// </summary>
    public CreateCalendarConnectionRequest(CreateCalendarConnectionRequest.Simulated value)
    {
        Provider = "simulated";
        Value = value.Value;
    }

    /// <summary>
    /// Discriminant value
    /// </summary>
    [JsonPropertyName("provider")]
    public string Provider { get; internal set; }

    /// <summary>
    /// Discriminated union value
    /// </summary>
    public object? Value { get; internal set; }

    /// <summary>
    /// Returns true if <see cref="Provider"/> is "caldav"
    /// </summary>
    public bool IsCaldav => Provider == "caldav";

    /// <summary>
    /// Returns true if <see cref="Provider"/> is "simulated"
    /// </summary>
    public bool IsSimulated => Provider == "simulated";

    /// <summary>
    /// Returns the value as a <see cref="Coss.CreateCalendarConnectionRequestCaldav"/> if <see cref="Provider"/> is 'caldav', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Provider"/> is not 'caldav'.</exception>
    public Coss.CreateCalendarConnectionRequestCaldav AsCaldav() =>
        IsCaldav
            ? (Coss.CreateCalendarConnectionRequestCaldav)Value!
            : throw new global::System.Exception(
                "CreateCalendarConnectionRequest.Provider is not 'caldav'"
            );

    /// <summary>
    /// Returns the value as a <see cref="Coss.CreateCalendarConnectionRequestSimulated"/> if <see cref="Provider"/> is 'simulated', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Provider"/> is not 'simulated'.</exception>
    public Coss.CreateCalendarConnectionRequestSimulated AsSimulated() =>
        IsSimulated
            ? (Coss.CreateCalendarConnectionRequestSimulated)Value!
            : throw new global::System.Exception(
                "CreateCalendarConnectionRequest.Provider is not 'simulated'"
            );

    public T Match<T>(
        Func<Coss.CreateCalendarConnectionRequestCaldav, T> onCaldav,
        Func<Coss.CreateCalendarConnectionRequestSimulated, T> onSimulated,
        Func<string, object?, T> onUnknown_
    )
    {
        return Provider switch
        {
            "caldav" => onCaldav(AsCaldav()),
            "simulated" => onSimulated(AsSimulated()),
            _ => onUnknown_(Provider, Value),
        };
    }

    public void Visit(
        Action<Coss.CreateCalendarConnectionRequestCaldav> onCaldav,
        Action<Coss.CreateCalendarConnectionRequestSimulated> onSimulated,
        Action<string, object?> onUnknown_
    )
    {
        switch (Provider)
        {
            case "caldav":
                onCaldav(AsCaldav());
                break;
            case "simulated":
                onSimulated(AsSimulated());
                break;
            default:
                onUnknown_(Provider, Value);
                break;
        }
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.CreateCalendarConnectionRequestCaldav"/> and returns true if successful.
    /// </summary>
    public bool TryAsCaldav(out Coss.CreateCalendarConnectionRequestCaldav? value)
    {
        if (Provider == "caldav")
        {
            value = (Coss.CreateCalendarConnectionRequestCaldav)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.CreateCalendarConnectionRequestSimulated"/> and returns true if successful.
    /// </summary>
    public bool TryAsSimulated(out Coss.CreateCalendarConnectionRequestSimulated? value)
    {
        if (Provider == "simulated")
        {
            value = (Coss.CreateCalendarConnectionRequestSimulated)Value!;
            return true;
        }
        value = null;
        return false;
    }

    public override string ToString() => JsonUtils.Serialize(this);

    public static implicit operator CreateCalendarConnectionRequest(
        CreateCalendarConnectionRequest.Caldav value
    ) => new(value);

    public static implicit operator CreateCalendarConnectionRequest(
        CreateCalendarConnectionRequest.Simulated value
    ) => new(value);

    [Serializable]
    internal sealed class JsonConverter : JsonConverter<CreateCalendarConnectionRequest>
    {
        public override bool CanConvert(global::System.Type typeToConvert) =>
            typeof(CreateCalendarConnectionRequest).IsAssignableFrom(typeToConvert);

        public override CreateCalendarConnectionRequest Read(
            ref Utf8JsonReader reader,
            global::System.Type typeToConvert,
            JsonSerializerOptions options
        )
        {
            var json = JsonElement.ParseValue(ref reader);
            if (!json.TryGetProperty("provider", out var discriminatorElement))
            {
                throw new JsonException("Missing discriminator property 'provider'");
            }
            if (discriminatorElement.ValueKind != JsonValueKind.String)
            {
                if (discriminatorElement.ValueKind == JsonValueKind.Null)
                {
                    throw new JsonException("Discriminator property 'provider' is null");
                }

                throw new JsonException(
                    $"Discriminator property 'provider' is not a string, instead is {discriminatorElement.ToString()}"
                );
            }

            var discriminator =
                discriminatorElement.GetString()
                ?? throw new JsonException("Discriminator property 'provider' is null");

            // Strip the discriminant property to prevent it from leaking into AdditionalProperties
            var jsonObject = System.Text.Json.Nodes.JsonObject.Create(json);
            jsonObject?.Remove("provider");
            var jsonWithoutDiscriminator =
                jsonObject != null ? JsonSerializer.SerializeToElement(jsonObject, options) : json;

            var value = discriminator switch
            {
                "caldav" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.CreateCalendarConnectionRequestCaldav?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.CreateCalendarConnectionRequestCaldav"
                        ),
                "simulated" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.CreateCalendarConnectionRequestSimulated?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.CreateCalendarConnectionRequestSimulated"
                        ),
                _ => json.Deserialize<object?>(options),
            };
            return new CreateCalendarConnectionRequest(discriminator, value);
        }

        public override void Write(
            Utf8JsonWriter writer,
            CreateCalendarConnectionRequest value,
            JsonSerializerOptions options
        )
        {
            JsonNode json =
                value.Provider switch
                {
                    "caldav" => JsonSerializer.SerializeToNode(value.Value, options),
                    "simulated" => JsonSerializer.SerializeToNode(value.Value, options),
                    _ => JsonSerializer.SerializeToNode(value.Value, options),
                } ?? new JsonObject();
            json["provider"] = value.Provider;
            json.WriteTo(writer, options);
        }

        public override CreateCalendarConnectionRequest ReadAsPropertyName(
            ref Utf8JsonReader reader,
            global::System.Type typeToConvert,
            JsonSerializerOptions options
        )
        {
            var stringValue =
                reader.GetString()
                ?? throw new JsonException("The JSON property name could not be read as a string.");
            return new CreateCalendarConnectionRequest(stringValue, stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            CreateCalendarConnectionRequest value,
            JsonSerializerOptions options
        )
        {
            writer.WritePropertyName(value.Provider);
        }
    }

    /// <summary>
    /// Discriminated union type for caldav
    /// </summary>
    [Serializable]
    public struct Caldav
    {
        public Caldav(Coss.CreateCalendarConnectionRequestCaldav value)
        {
            Value = value;
        }

        internal Coss.CreateCalendarConnectionRequestCaldav Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateCalendarConnectionRequest.Caldav(
            Coss.CreateCalendarConnectionRequestCaldav value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for simulated
    /// </summary>
    [Serializable]
    public struct Simulated
    {
        public Simulated(Coss.CreateCalendarConnectionRequestSimulated value)
        {
            Value = value;
        }

        internal Coss.CreateCalendarConnectionRequestSimulated Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateCalendarConnectionRequest.Simulated(
            Coss.CreateCalendarConnectionRequestSimulated value
        ) => new(value);
    }
}
