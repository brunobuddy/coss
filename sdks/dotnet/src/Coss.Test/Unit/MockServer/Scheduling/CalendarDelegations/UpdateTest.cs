using Coss.Scheduling;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Scheduling.CalendarDelegations;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class UpdateTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string requestJson = """
            {
              "secret_expires_at": null
            }
            """;

        const string mockResponse = """
            {
              "object": "scheduling.calendar_delegation",
              "id": "id",
              "provider": "google",
              "domain": "domain",
              "status": "pending",
              "match_host_email": true,
              "client_id": "client_id",
              "tenant_id": "tenant_id",
              "scopes": [
                "scopes",
                "scopes"
              ],
              "verified_account": "verified_account",
              "last_error_code": "last_error_code",
              "failing_since": "failing_since",
              "secret_expires_at": "secret_expires_at",
              "hosts_connected": 1000000,
              "hosts_failed": 1000000,
              "created_at": "created_at",
              "updated_at": "updated_at"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/calendar_delegations/id")
                    .WithHeader("Content-Type", "application/json")
                    .UsingPatch()
                    .WithBodyAsJson(requestJson)
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.CalendarDelegations.UpdateAsync(
            new UpdateCalendarDelegationRequest
            {
                Id = "id",
                MatchHostEmail = null,
                ServiceAccountKey = null,
                ClientSecret = null,
                SecretExpiresAt = null,
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }

    [NUnit.Framework.Test]
    public async Task MockServerTest_2()
    {
        const string requestJson = """
            {
              "match_host_email": false
            }
            """;

        const string mockResponse = """
            {
              "object": "scheduling.calendar_delegation",
              "id": "caldlg_01kd2m9a0b1c2d3e4f5g6h7j8m",
              "provider": "google",
              "domain": "example.com",
              "status": "active",
              "match_host_email": true,
              "client_id": "117063284751902345678",
              "tenant_id": null,
              "scopes": [
                "https://www.googleapis.com/auth/calendar.events.freebusy"
              ],
              "verified_account": "ana@example.com",
              "last_error_code": null,
              "failing_since": null,
              "secret_expires_at": null,
              "hosts_connected": 240,
              "hosts_failed": 1,
              "created_at": "2027-01-01T10:00:00.000Z",
              "updated_at": "2027-01-01T10:00:00.000Z"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath(
                        "/v1/scheduling/calendar_delegations/caldlg_01kd2m9a0b1c2d3e4f5g6h7j8m"
                    )
                    .WithHeader("Content-Type", "application/json")
                    .UsingPatch()
                    .WithBodyAsJson(requestJson)
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.CalendarDelegations.UpdateAsync(
            new UpdateCalendarDelegationRequest
            {
                Id = "caldlg_01kd2m9a0b1c2d3e4f5g6h7j8m",
                MatchHostEmail = false,
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
