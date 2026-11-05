using Coss.Scheduling;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Scheduling.Sessions;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class CreateForHostTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string requestJson = """
            {}
            """;

        const string mockResponse = """
            {
              "object": "scheduling.session",
              "id": "id",
              "token": "token",
              "url": "url",
              "expires_at": "expires_at"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/hosts/host/sessions")
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

        var response = await Client.Scheduling.Sessions.CreateForHostAsync(
            new CreateSchedulingHostSessionRequest
            {
                Host = "host",
                ExpiresIn = null,
                ReadOnly = null,
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }

    [NUnit.Framework.Test]
    public async Task MockServerTest_2()
    {
        const string requestJson = """
            {
              "expires_in": 3600
            }
            """;

        const string mockResponse = """
            {
              "object": "scheduling.session",
              "id": "schs_01kd2m9a0b1c2d3e4f5g6h7j8m",
              "token": "cossch_abc123",
              "url": "https://example.test/h/schs_01kd2m9a0b1c2d3e4f5g6h7j8m#cossch_abc123",
              "expires_at": "2027-01-01T11:00:00.000Z"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/hosts/host_01kd2m9a0b1c2d3e4f5g6h7j8m/sessions")
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

        var response = await Client.Scheduling.Sessions.CreateForHostAsync(
            new CreateSchedulingHostSessionRequest
            {
                Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
                ExpiresIn = 3600,
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
