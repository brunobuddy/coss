// ReSharper disable NullableWarningSuppressionIsUsed
// ReSharper disable InconsistentNaming

using Coss.Core;
using global::System.Text.Json;
using global::System.Text.Json.Nodes;
using global::System.Text.Json.Serialization;

namespace Coss;

[JsonConverter(typeof(CreateCalendarDelegationRequest.JsonConverter))]
[Serializable]
public record CreateCalendarDelegationRequest
{
    internal CreateCalendarDelegationRequest(string type, object? value)
    {
        Provider = type;
        Value = value;
    }

    /// <summary>
    /// Create an instance of CreateCalendarDelegationRequest with <see cref="CreateCalendarDelegationRequest.Google"/>.
    /// </summary>
    public CreateCalendarDelegationRequest(CreateCalendarDelegationRequest.Google value)
    {
        Provider = "google";
        Value = value.Value;
    }

    /// <summary>
    /// Create an instance of CreateCalendarDelegationRequest with <see cref="CreateCalendarDelegationRequest.Microsoft"/>.
    /// </summary>
    public CreateCalendarDelegationRequest(CreateCalendarDelegationRequest.Microsoft value)
    {
        Provider = "microsoft";
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
    /// Returns true if <see cref="Provider"/> is "google"
    /// </summary>
    public bool IsGoogle => Provider == "google";

    /// <summary>
    /// Returns true if <see cref="Provider"/> is "microsoft"
    /// </summary>
    public bool IsMicrosoft => Provider == "microsoft";

    /// <summary>
    /// Returns the value as a <see cref="Coss.CreateCalendarDelegationRequestGoogle"/> if <see cref="Provider"/> is 'google', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Provider"/> is not 'google'.</exception>
    public Coss.CreateCalendarDelegationRequestGoogle AsGoogle() =>
        IsGoogle
            ? (Coss.CreateCalendarDelegationRequestGoogle)Value!
            : throw new global::System.Exception(
                "CreateCalendarDelegationRequest.Provider is not 'google'"
            );

    /// <summary>
    /// Returns the value as a <see cref="Coss.CreateCalendarDelegationRequestMicrosoft"/> if <see cref="Provider"/> is 'microsoft', otherwise throws an exception.
    /// </summary>
    /// <exception cref="Exception">Thrown when <see cref="Provider"/> is not 'microsoft'.</exception>
    public Coss.CreateCalendarDelegationRequestMicrosoft AsMicrosoft() =>
        IsMicrosoft
            ? (Coss.CreateCalendarDelegationRequestMicrosoft)Value!
            : throw new global::System.Exception(
                "CreateCalendarDelegationRequest.Provider is not 'microsoft'"
            );

    public T Match<T>(
        Func<Coss.CreateCalendarDelegationRequestGoogle, T> onGoogle,
        Func<Coss.CreateCalendarDelegationRequestMicrosoft, T> onMicrosoft,
        Func<string, object?, T> onUnknown_
    )
    {
        return Provider switch
        {
            "google" => onGoogle(AsGoogle()),
            "microsoft" => onMicrosoft(AsMicrosoft()),
            _ => onUnknown_(Provider, Value),
        };
    }

    public void Visit(
        Action<Coss.CreateCalendarDelegationRequestGoogle> onGoogle,
        Action<Coss.CreateCalendarDelegationRequestMicrosoft> onMicrosoft,
        Action<string, object?> onUnknown_
    )
    {
        switch (Provider)
        {
            case "google":
                onGoogle(AsGoogle());
                break;
            case "microsoft":
                onMicrosoft(AsMicrosoft());
                break;
            default:
                onUnknown_(Provider, Value);
                break;
        }
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.CreateCalendarDelegationRequestGoogle"/> and returns true if successful.
    /// </summary>
    public bool TryAsGoogle(out Coss.CreateCalendarDelegationRequestGoogle? value)
    {
        if (Provider == "google")
        {
            value = (Coss.CreateCalendarDelegationRequestGoogle)Value!;
            return true;
        }
        value = null;
        return false;
    }

    /// <summary>
    /// Attempts to cast the value to a <see cref="Coss.CreateCalendarDelegationRequestMicrosoft"/> and returns true if successful.
    /// </summary>
    public bool TryAsMicrosoft(out Coss.CreateCalendarDelegationRequestMicrosoft? value)
    {
        if (Provider == "microsoft")
        {
            value = (Coss.CreateCalendarDelegationRequestMicrosoft)Value!;
            return true;
        }
        value = null;
        return false;
    }

    public override string ToString() => JsonUtils.Serialize(this);

    public static implicit operator CreateCalendarDelegationRequest(
        CreateCalendarDelegationRequest.Google value
    ) => new(value);

    public static implicit operator CreateCalendarDelegationRequest(
        CreateCalendarDelegationRequest.Microsoft value
    ) => new(value);

    [Serializable]
    internal sealed class JsonConverter : JsonConverter<CreateCalendarDelegationRequest>
    {
        public override bool CanConvert(global::System.Type typeToConvert) =>
            typeof(CreateCalendarDelegationRequest).IsAssignableFrom(typeToConvert);

        public override CreateCalendarDelegationRequest Read(
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
                "google" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.CreateCalendarDelegationRequestGoogle?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.CreateCalendarDelegationRequestGoogle"
                        ),
                "microsoft" =>
                    jsonWithoutDiscriminator.Deserialize<Coss.CreateCalendarDelegationRequestMicrosoft?>(
                        options
                    )
                        ?? throw new JsonException(
                            "Failed to deserialize Coss.CreateCalendarDelegationRequestMicrosoft"
                        ),
                _ => json.Deserialize<object?>(options),
            };
            return new CreateCalendarDelegationRequest(discriminator, value);
        }

        public override void Write(
            Utf8JsonWriter writer,
            CreateCalendarDelegationRequest value,
            JsonSerializerOptions options
        )
        {
            JsonNode json =
                value.Provider switch
                {
                    "google" => JsonSerializer.SerializeToNode(value.Value, options),
                    "microsoft" => JsonSerializer.SerializeToNode(value.Value, options),
                    _ => JsonSerializer.SerializeToNode(value.Value, options),
                } ?? new JsonObject();
            json["provider"] = value.Provider;
            json.WriteTo(writer, options);
        }

        public override CreateCalendarDelegationRequest ReadAsPropertyName(
            ref Utf8JsonReader reader,
            global::System.Type typeToConvert,
            JsonSerializerOptions options
        )
        {
            var stringValue =
                reader.GetString()
                ?? throw new JsonException("The JSON property name could not be read as a string.");
            return new CreateCalendarDelegationRequest(stringValue, stringValue);
        }

        public override void WriteAsPropertyName(
            Utf8JsonWriter writer,
            CreateCalendarDelegationRequest value,
            JsonSerializerOptions options
        )
        {
            writer.WritePropertyName(value.Provider);
        }
    }

    /// <summary>
    /// Discriminated union type for google
    /// </summary>
    [Serializable]
    public struct Google
    {
        public Google(Coss.CreateCalendarDelegationRequestGoogle value)
        {
            Value = value;
        }

        internal Coss.CreateCalendarDelegationRequestGoogle Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateCalendarDelegationRequest.Google(
            Coss.CreateCalendarDelegationRequestGoogle value
        ) => new(value);
    }

    /// <summary>
    /// Discriminated union type for microsoft
    /// </summary>
    [Serializable]
    public struct Microsoft
    {
        public Microsoft(Coss.CreateCalendarDelegationRequestMicrosoft value)
        {
            Value = value;
        }

        internal Coss.CreateCalendarDelegationRequestMicrosoft Value { get; set; }

        public override string ToString() => Value.ToString() ?? "null";

        public static implicit operator CreateCalendarDelegationRequest.Microsoft(
            Coss.CreateCalendarDelegationRequestMicrosoft value
        ) => new(value);
    }
}
