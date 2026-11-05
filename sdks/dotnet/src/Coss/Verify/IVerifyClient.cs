namespace Coss;

public partial interface IVerifyClient
{
    public Coss.Verify.ISettingsClient Settings { get; }

    /// <summary>
    /// Verifications of the API key's environment, newest first. Pass the last `id` as `after` to get the next page while `has_more` is true.
    /// </summary>
    WithRawResponseTask<VerificationList> ListAsync(
        ListVerifyRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Sends a one-time code to a phone number (SMS) or an email address and returns the verification, `pending` until you check the code the end user typed (`POST /v1/verifications/check`). Starting again for the same destination while it is pending sends a new code (the earlier one stops working), up to 5 times. Before a new verification costs anything, the fraud guard checks it (your Risk lists, premium-rate numbers, Tor, and velocity per IP, user, number range and country, with how often their codes are entered): a blocked one is stored with its `reasons` and nothing is sent. Pass the end user's `ip` (and your `user_id`) so it can tell them apart. SMS codes come from coss.com's shared numbers unless the environment's Verify settings name one of your own; email codes from your sender, else coss.com's. Sandbox (`coss_test_…`) keys deliver nothing and the code is always zeros.
    /// </summary>
    WithRawResponseTask<Verification> StartAsync(
        StartVerificationRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Checks the code the end user typed, by the verification's id or by the destination (its latest verification). `valid: true` approves it (`verification.approved`, billed once); a wrong code spends an attempt, and the last one fails it. Checking an approved verification again with its code stays valid until it expires, without being billed again.
    /// </summary>
    WithRawResponseTask<VerificationCheck> CheckAsync(
        CheckVerificationRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// A verification's status and destination. Its code is never returned.
    /// </summary>
    WithRawResponseTask<Verification> GetAsync(
        GetVerifyRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Cancels a pending verification: its code stops working. Canceling it again returns it as is.
    /// </summary>
    WithRawResponseTask<Verification> CancelAsync(
        CancelVerifyRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
