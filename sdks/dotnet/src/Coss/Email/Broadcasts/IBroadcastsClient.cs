using Coss;

namespace Coss.Email;

public partial interface IBroadcastsClient
{
    /// <summary>
    /// The API key's environment's broadcasts, newest first, with their stats.
    /// </summary>
    WithRawResponseTask<BroadcastList> ListAsync(
        ListBroadcastsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Creates a draft, or with `send` or `scheduled_at` a broadcast that starts sending (so it needs `broadcast:send` too). A broadcast goes to every contact of its audience or segment who is subscribed, reached by its topic and not suppressed, as one email each, at the plan's marketing rate.
    /// </summary>
    WithRawResponseTask<Broadcast> CreateAsync(
        CreateBroadcastRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// One broadcast of the API key's environment, with its status and stats.
    /// </summary>
    WithRawResponseTask<Broadcast> GetAsync(
        GetBroadcastsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Deletes a draft, or a broadcast canceled before any of its emails were made.
    /// </summary>
    WithRawResponseTask<DeletedBroadcast> RemoveAsync(
        RemoveBroadcastsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Changes a draft; fields left out keep their value, `null` clears one.
    /// </summary>
    WithRawResponseTask<Broadcast> UpdateAsync(
        UpdateBroadcastRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Starts sending a draft, now or at `scheduled_at`. Sending a broadcast that already started returns it as it is.
    /// </summary>
    WithRawResponseTask<Broadcast> SendAsync(
        SendBroadcastRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Stops it for good: its emails not yet handed to the provider are dropped (the ones on their way still go). Canceling a canceled broadcast returns it.
    /// </summary>
    WithRawResponseTask<Broadcast> CancelAsync(
        CancelBroadcastsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Pauses a scheduled or sending broadcast; emails not yet handed to the provider are dropped and made again when it is resumed.
    /// </summary>
    WithRawResponseTask<Broadcast> PauseAsync(
        PauseBroadcastsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Resumes a paused broadcast where it stopped.
    /// </summary>
    WithRawResponseTask<Broadcast> ResumeAsync(
        ResumeBroadcastsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Sends its content to up to 5 addresses as ordinary marketing emails (subject prefixed `[Test]`), filled with `contact`'s values or the fallbacks. They count like any send.
    /// </summary>
    WithRawResponseTask<BroadcastTest> TestAsync(
        TestBroadcastRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// The emails made so far, one per contact, newest first.
    /// </summary>
    WithRawResponseTask<BroadcastEmailList> ListEmailsAsync(
        ListEmailsBroadcastsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
