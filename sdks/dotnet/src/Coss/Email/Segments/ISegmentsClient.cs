using Coss;

namespace Coss.Email;

public partial interface ISegmentsClient
{
    /// <summary>
    /// The segments (contact filters) of the API key's environment, newest first.
    /// </summary>
    WithRawResponseTask<SegmentList> ListAsync(
        ListSegmentsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// A segment is a filter over the environment's contacts, evaluated whenever it is used, so its contacts are always current.
    /// </summary>
    WithRawResponseTask<Segment> CreateAsync(
        CreateSegmentRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// One segment of the API key's environment, with its filter.
    /// </summary>
    WithRawResponseTask<Segment> GetAsync(
        GetSegmentsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Deletes a segment. The contacts it matched stay.
    /// </summary>
    WithRawResponseTask<DeletedSegment> RemoveAsync(
        RemoveSegmentsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Changes a segment's name or filter. Only the fields given change.
    /// </summary>
    WithRawResponseTask<Segment> UpdateAsync(
        UpdateSegmentRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// The contacts the segment's filter matches now, whatever their status, newest first. A broadcast to the segment goes only to the subscribed ones its topic reaches.
    /// </summary>
    WithRawResponseTask<ContactList> ListContactsAsync(
        ListContactsSegmentsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
