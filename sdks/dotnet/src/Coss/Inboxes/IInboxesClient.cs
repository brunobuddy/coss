using Coss.Inboxes;

namespace Coss;

public partial interface IInboxesClient
{
    public IThreadsClient Threads { get; }
    public Coss.Inboxes.IMessagesClient Messages { get; }

    /// <summary>
    /// The environment's inboxes, newest first. Pass the last `id` as `after` to get the next page while `has_more` is true.
    /// </summary>
    WithRawResponseTask<InboxList> ListAsync(
        ListInboxesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Gives an agent (or anyone) its own email address in the API key's environment: `username@&lt;the environment's inbound domain&gt;`, which needs no DNS setup, or an address at one of the environment's receiving domains (`domain`). Mail to it is kept as threads, and each message that arrives sends an `inbox.message.received` webhook. With a `client_id` that already has an inbox, that inbox is returned (200) instead of a new one.
    /// </summary>
    WithRawResponseTask<Inbox> CreateAsync(
        CreateInboxRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// One inbox of the API key's environment.
    /// </summary>
    WithRawResponseTask<Inbox> GetAsync(
        GetInboxesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Deletes the inbox and its threads. The received emails and emails they held stay in the environment until their retention ends, and mail to the address is still received by the environment (without a thread or `inbox.message.received` webhook).
    /// </summary>
    WithRawResponseTask<DeletedInbox> DeleteAsync(
        DeleteInboxesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Changes the name messages from the inbox are sent with. Its address never changes.
    /// </summary>
    WithRawResponseTask<Inbox> UpdateAsync(
        UpdateInboxRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
