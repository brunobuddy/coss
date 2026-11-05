using Coss;

namespace Coss.Email;

public partial interface IAudiencesClient
{
    /// <summary>
    /// The static contact lists of the API key's environment, newest first.
    /// </summary>
    WithRawResponseTask<AudienceList> ListAsync(
        ListAudiencesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Creates a static contact list in the API key's environment. Names are unique within it (`name_taken`). Add its members with `POST /v1/audiences/{id}/contacts`.
    /// </summary>
    WithRawResponseTask<Audience> CreateAsync(
        CreateAudienceRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// One audience of the API key's environment.
    /// </summary>
    WithRawResponseTask<Audience> GetAsync(
        GetAudiencesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Deletes the audience; its contacts stay. Refused while a segment filters on it (`audience_in_use`).
    /// </summary>
    WithRawResponseTask<DeletedAudience> RemoveAsync(
        RemoveAudiencesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Renames an audience. Its members stay.
    /// </summary>
    WithRawResponseTask<Audience> UpdateAsync(
        UpdateAudienceRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// The audience's members, whatever their status, newest first.
    /// </summary>
    WithRawResponseTask<ContactList> ListContactsAsync(
        ListContactsAudiencesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Adds existing contacts, by id or address. Members already in it are counted in `existing`; unknown ones are listed in `missing` (create them first).
    /// </summary>
    WithRawResponseTask<AudienceContactsAdded> AddContactsAsync(
        AddAudienceContactsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Takes a contact out of the audience. The contact itself stays.
    /// </summary>
    WithRawResponseTask<RemoveContactAudiencesResponse> RemoveContactAsync(
        RemoveContactAudiencesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
