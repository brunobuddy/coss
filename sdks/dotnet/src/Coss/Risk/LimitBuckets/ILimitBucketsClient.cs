using Coss;

namespace Coss.Risk;

public partial interface ILimitBucketsClient
{
    /// <summary>
    /// Every bucket of the API key's environment, by name.
    /// </summary>
    WithRawResponseTask<RiskLimitBucketList> ListAsync(
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// At most 100 buckets per environment; names are unique in it.
    /// </summary>
    WithRawResponseTask<RiskLimitBucket> CreateAsync(
        CreateRiskLimitBucketRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// One of the rate limit buckets you defined for `POST /v1/risk/limit`.
    /// </summary>
    WithRawResponseTask<RiskLimitBucket> GetAsync(
        GetLimitBucketsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Checks naming it get a 404 from then on; a new bucket with its name starts empty.
    /// </summary>
    WithRawResponseTask<DeletedRiskLimitBucket> DeleteAsync(
        DeleteLimitBucketsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Changes the fields given; the next check uses them. Keys keep what they spent, so a smaller bucket can deny a key until it refills.
    /// </summary>
    WithRawResponseTask<RiskLimitBucket> UpdateAsync(
        UpdateRiskLimitBucketRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
