using Coss.Scheduling;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Scheduling.Calendars;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class AuthorizeTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string requestJson = """
            {
              "provider": "google"
            }
            """;

        const string mockResponse = """
            {
              "object": "scheduling.calendar_authorization",
              "url": "url"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/hosts/host/calendar_connections/authorize")
                    .WithHeader("Content-Type", "application/json")
                    .UsingPost()
                    .WithBodyAsJson(requestJson)
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Calendars.AuthorizeAsync(
            new AuthorizeCalendarRequest
            {
                Host = "host",
                Provider = AuthorizeCalendarRequestProvider.Google,
                ReturnUrl = null,
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }

    [NUnit.Framework.Test]
    public async Task MockServerTest_2()
    {
        const string requestJson = """
            {
              "provider": "google"
            }
            """;

        const string mockResponse = """
            {
              "object": "scheduling.calendar_authorization",
              "url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=abc"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath(
                        "/v1/scheduling/hosts/host_01kd2m9a0b1c2d3e4f5g6h7j8m/calendar_connections/authorize"
                    )
                    .WithHeader("Content-Type", "application/json")
                    .UsingPost()
                    .WithBodyAsJson(requestJson)
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Calendars.AuthorizeAsync(
            new AuthorizeCalendarRequest
            {
                Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
                Provider = AuthorizeCalendarRequestProvider.Google,
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
