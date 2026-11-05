using Coss;

namespace Coss.Email.Contacts;

public partial interface IPropertiesClient
{
    /// <summary>
    /// Every custom contact property of the API key's environment (at most 50), by key.
    /// </summary>
    WithRawResponseTask<ContactPropertyList> ListAsync(
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Defines a custom property contacts can have. Its key and type can't change; `fallback` is what templates use for contacts without a value.
    /// </summary>
    WithRawResponseTask<ContactProperty> CreateAsync(
        CreateContactPropertyRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// One contact property of the API key's environment: its key, type and fallback.
    /// </summary>
    WithRawResponseTask<ContactProperty> GetAsync(
        GetPropertiesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Deletes the property and removes its values from every contact. Refused while a segment filters on it (`property_in_use`).
    /// </summary>
    WithRawResponseTask<DeletedContactProperty> RemoveAsync(
        RemovePropertiesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Changes the value used when a contact has none for this property. Its key and type can't change.
    /// </summary>
    WithRawResponseTask<ContactProperty> UpdateAsync(
        UpdateContactPropertyRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
