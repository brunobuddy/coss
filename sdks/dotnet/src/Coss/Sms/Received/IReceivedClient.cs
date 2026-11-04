using Coss;

namespace Coss.Sms_;

public partial interface IReceivedClient
{
    /// <summary>
    /// Messages sent to the organization's numbers whose replies go to the API key's environment, newest first.
    /// </summary>
    WithRawResponseTask<ReceivedSmsList> ListAsync(
        ListReceivedRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// One message received on a number of the organization and routed to the API key's environment.
    /// </summary>
    WithRawResponseTask<ReceivedSms> GetAsync(
        GetReceivedRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
