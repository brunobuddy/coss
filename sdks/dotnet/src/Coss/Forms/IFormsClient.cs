using Coss.Forms;

namespace Coss;

public partial interface IFormsClient
{
    public ISubmissionsClient Submissions { get; }

    /// <summary>
    /// The environment's forms, newest first.
    /// </summary>
    WithRawResponseTask<FormList> ListAsync(
        ListFormsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// A hosted form endpoint: point an HTML `&lt;form action&gt;` (or `coss/forms`) at its `endpoint`. Every submission is screened by Risk (the honeypot, captcha, email, IP, device, velocity and content) and accepted ones go to webhooks (`form.submission.received`), notification emails and contacts. Without `fields`, any field is accepted.
    /// </summary>
    WithRawResponseTask<Form> CreateAsync(
        CreateFormRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// A form's settings, with the `endpoint` it posts to and its `hosted_url`.
    /// </summary>
    WithRawResponseTask<Form> GetAsync(
        GetFormsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Deletes the form with every submission and uploaded file. Its endpoint answers 404 from then on.
    /// </summary>
    WithRawResponseTask<DeletedForm> RemoveAsync(
        RemoveFormsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Only the fields given change, within each group (`spam`, `contacts`, …) too.
    /// </summary>
    WithRawResponseTask<Form> UpdateAsync(
        UpdateFormRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
