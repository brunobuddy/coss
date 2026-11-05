using Coss;

namespace Coss.Sign;

public partial interface IDocumentsClient
{
    /// <summary>
    /// Documents uploaded to the API key's environment, newest first. Pass the last `id` as `after` to get the next page while `has_more` is true.
    /// </summary>
    WithRawResponseTask<SignDocumentList> ListAsync(
        ListDocumentsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Uploads a PDF (base64, at most 25 MB and 500 pages, not password-protected) for signature requests to use. The response lists each page's size and the text anchors found in it (`{{signature:signer_1}}`), which fields can be placed by. Requests can also take PDFs inline.
    /// </summary>
    WithRawResponseTask<SignDocument> UploadAsync(
        UploadSignDocumentRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// An uploaded document's details: its hash, page sizes and text anchors. Its bytes are never returned here.
    /// </summary>
    WithRawResponseTask<SignDocument> GetAsync(
        GetDocumentsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Deletes an uploaded document and its file. Documents a request uses can't be deleted.
    /// </summary>
    WithRawResponseTask<DeletedSignDocument> RemoveAsync(
        RemoveDocumentsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
