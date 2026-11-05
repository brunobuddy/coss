using Coss;

namespace Coss.Scheduling;

public partial interface ISettingsClient
{
    /// <summary>
    /// The environment's scheduling settings.
    /// </summary>
    WithRawResponseTask<SchedulingSettings> GetAsync(
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Changes what's given.
    /// </summary>
    WithRawResponseTask<SchedulingSettings> UpdateAsync(
        UpdateSchedulingSettingsRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
