using Coss;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.LogDrains;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class UpdateTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string requestJson = """
            {
              "description": null,
              "auth_header": null
            }
            """;

        const string mockResponse = """
            {
              "object": "log_drain",
              "id": "id",
              "url": "url",
              "description": "description",
              "sources": [
                "api",
                "api"
              ],
              "format": "ndjson",
              "auth_header_name": "auth_header_name",
              "enabled": true,
              "disabled_reason": "manual",
              "disabled_at": "2024-01-15T09:30:00.000Z",
              "created_at": "2024-01-15T09:30:00.000Z",
              "updated_at": "2024-01-15T09:30:00.000Z"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/log_drains/id")
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

        var response = await Client.LogDrains.UpdateAsync(
            new UpdateLogDrainRequest
            {
                Id = "id",
                Url = null,
                Description = null,
                Sources = null,
                Format = null,
                AuthHeader = null,
                Enabled = null,
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }

    [NUnit.Framework.Test]
    public async Task MockServerTest_2()
    {
        const string requestJson = """
            {
              "enabled": false
            }
            """;

        const string mockResponse = """
            {
              "object": "log_drain",
              "id": "drain_01k7c8m4q2f3e9v6t5r1n0p8yz",
              "url": "https://logs.example.com/coss",
              "description": "Production logs",
              "sources": [
                "api",
                "email"
              ],
              "format": "ndjson",
              "auth_header_name": null,
              "enabled": true,
              "disabled_reason": null,
              "disabled_at": null,
              "created_at": "2026-01-15T09:30:00.000Z",
              "updated_at": "2026-01-15T09:30:00.000Z"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/log_drains/drain_01k7c8m4q2f3e9v6t5r1n0p8yz")
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

        var response = await Client.LogDrains.UpdateAsync(
            new UpdateLogDrainRequest { Id = "drain_01k7c8m4q2f3e9v6t5r1n0p8yz", Enabled = false }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
