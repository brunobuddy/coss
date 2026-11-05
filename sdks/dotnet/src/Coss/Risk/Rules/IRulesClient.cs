using Coss;

namespace Coss.Risk;

public partial interface IRulesClient
{
    /// <summary>
    /// Every rule of the API key's environment, in evaluation order.
    /// </summary>
    WithRawResponseTask<RiskRuleList> ListAsync(
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Rules decide after the allow and block lists and before the score thresholds: the first enabled rule (lowest `position`, then oldest) whose conditions match the event sets the decision to its `action`. Conditions test the fields listed in the docs; a field without a value (no IP, no email) never matches. At most 50 rules per environment.
    /// </summary>
    WithRawResponseTask<RiskRule> CreateAsync(
        CreateRiskRuleRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// One rule of the API key's environment.
    /// </summary>
    WithRawResponseTask<RiskRule> GetAsync(
        GetRulesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Deletes a rule. Later assessments no longer apply it.
    /// </summary>
    WithRawResponseTask<DeletedRiskRule> DeleteAsync(
        DeleteRulesRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );

    /// <summary>
    /// Changes the fields given; `conditions` replaces the whole list.
    /// </summary>
    WithRawResponseTask<RiskRule> UpdateAsync(
        UpdateRiskRuleRequest request,
        RequestOptions? options = null,
        CancellationToken cancellationToken = default
    );
}
