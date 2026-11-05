using Coss;

namespace Coss.Verify;

public partial interface ISettingsClient
{
    /// <summary>
    /// The API key's environment's settings, with defaults filled in: the name codes are sent for, code length, lifetime and attempts, the senders, and the countries SMS codes may go to.
    /// </summary>
    WithRawResponseTask<VerifySettings> GetAsync(
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Changes the fields given; the others keep their values. `sms_from` must be one of the organization's numbers, and a live key's `email_from` must be on one of its verified domains.
    /// </summary>
    WithRawResponseTask<VerifySettings> UpdateAsync(
        UpdateVerifySettingsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
