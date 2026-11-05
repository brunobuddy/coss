using Coss;

namespace Coss.Risk;

public partial interface IListsClient
{
    /// <summary>
    /// The environment's list entries, newest first. Pass the last `id` as `after` to get the next page while `has_more` is true.
    /// </summary>
    WithRawResponseTask<RiskListEntryList> ListAsync(
        ListListsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Adds an email address (matched by mailbox), domain (with its subdomains), IP address or CIDR range, AS number, country or user id to the environment's allow or block list. An allow-list match makes the decision `allow` whatever else fired; a block-list match makes it `block`. Adding an entry that already exists returns it with status 200.
    /// </summary>
    WithRawResponseTask<RiskListEntry> AddAsync(
        CreateRiskListEntryRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// One allow or block list entry of the API key's environment.
    /// </summary>
    WithRawResponseTask<RiskListEntry> GetAsync(
        GetListsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Removes an entry from its list. Later assessments no longer see it.
    /// </summary>
    WithRawResponseTask<DeletedRiskListEntry> RemoveAsync(
        RemoveListsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
