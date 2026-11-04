using Coss;
using Coss.Email.Contacts;

namespace Coss.Email;

public partial interface IContactsClient
{
    public IPropertiesClient Properties { get; }

    /// <summary>
    /// The contacts of the API key's environment, newest first. Pass the last `id` as `after` to get the next page while `has_more` is true.
    /// </summary>
    WithRawResponseTask<ContactList> ListAsync(
        ListContactsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Creates the contact with this address in the API key's environment, or updates the existing one: names are replaced when given, `properties` are merged (`null` removes one), `audience_ids` are added and `topics` choices recorded. `status` only changes when passed.
    /// </summary>
    WithRawResponseTask<Contact> UpsertAsync(
        UpsertContactRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Sends a pending contact (double opt-in) its confirmation email again: at most once a day, and three times before it confirms (`status` says what happened).
    /// </summary>
    WithRawResponseTask<ContactConfirmation> ResendConfirmationAsync(
        ResendConfirmationContactsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// The contact's preference center and unsubscribe links, for emails you build yourself. They never expire. Marketing email sent through coss.com gets them (and one-click unsubscribe headers) automatically. Needs `contact:update`: whoever has the links can change the contact's consent.
    /// </summary>
    WithRawResponseTask<PreferenceLinks> CreatePreferenceLinksAsync(
        CreatePreferenceLinksRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Creates or updates up to 1000 contacts at once (source `import`). Each entry is validated on its own: invalid ones are skipped and listed in `invalid`. Existing contacts get the new names and properties, but an import never re-subscribes an unsubscribed contact (`kept_unsubscribed`). Imports send no `contact.*` webhooks. Over the plan's contact limit nothing is imported.
    /// </summary>
    WithRawResponseTask<ContactImport> ImportAsync(
        ImportContactsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// The contacts of the API key's environment (optionally filtered), oldest first, as CSV with the columns `email,first_name,last_name,status`, one column per custom property, then `created_at,id`. The file can be imported again as is. Values a spreadsheet would run as a formula are prefixed with `'`.
    /// </summary>
    WithRawResponseTask<string> ExportAsync(
        ExportContactsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// One contact of the API key's environment.
    /// </summary>
    WithRawResponseTask<Contact> GetAsync(
        GetContactsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Deletes the contact with its audience memberships and topic choices. Its suppressions stay: they are about the address, not the contact.
    /// </summary>
    WithRawResponseTask<DeletedContact> RemoveAsync(
        RemoveContactsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Changes the fields given; `properties` are merged (`null` removes one).
    /// </summary>
    WithRawResponseTask<Contact> UpdateAsync(
        UpdateContactRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Every topic of the environment with the contact's choice and whether its emails reach them.
    /// </summary>
    WithRawResponseTask<ContactTopics> GetTopicsAsync(
        GetTopicsContactsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Records the contact's choices for the topics given; the others keep theirs.
    /// </summary>
    WithRawResponseTask<ContactTopics> UpdateTopicsAsync(
        UpdateContactTopicsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
