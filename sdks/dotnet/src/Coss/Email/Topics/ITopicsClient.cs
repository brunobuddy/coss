using Coss;

namespace Coss.Email;

public partial interface ITopicsClient
{
    /// <summary>
    /// The subscription topics of the API key's environment.
    /// </summary>
    WithRawResponseTask<TopicList> ListAsync(
        ListTopicsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// A topic is what contacts subscribe to, built on categories: emails sent with `category` equal to the topic's `key` are about it, so contacts who opted out (or, for an `opt_out` topic, never opted in) are skipped. Public topics show in the preference center.
    /// </summary>
    WithRawResponseTask<Topic> CreateAsync(
        CreateTopicRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// One topic of the API key's environment.
    /// </summary>
    WithRawResponseTask<Topic> GetAsync(
        GetTopicsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Deletes the topic and every contact's choice for it. Refused while a segment filters on it (`topic_in_use`).
    /// </summary>
    WithRawResponseTask<DeletedTopic> RemoveAsync(
        RemoveTopicsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Changes the fields given; the key can't change.
    /// </summary>
    WithRawResponseTask<Topic> UpdateAsync(
        UpdateTopicRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
