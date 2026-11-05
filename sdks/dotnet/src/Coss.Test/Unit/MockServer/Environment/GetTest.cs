using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Environment;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class GetTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string mockResponse = """
            {
              "object": "environment",
              "id": "id",
              "name": "name",
              "slug": "slug",
              "mode": "live",
              "project": {
                "id": "id",
                "name": "name",
                "slug": "slug"
              },
              "organization": {
                "id": "id",
                "name": "name",
                "slug": "slug",
                "api_version": "api_version",
                "hipaa_mode": true
              },
              "api_key": {
                "id": "id",
                "name": "name",
                "start": "start",
                "access": "full",
                "permissions": [
                  "permissions",
                  "permissions"
                ]
              }
            }
            """;

        Server
            .Given(WireMock.RequestBuilders.Request.Create().WithPath("/v1/environment").UsingGet())
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Environment.GetAsync();
        JsonAssert.AreEqual(response, mockResponse);
    }

    [NUnit.Framework.Test]
    public async Task MockServerTest_2()
    {
        const string mockResponse = """
            {
              "object": "environment",
              "id": "env_01k7c8m4q2f3e9v6t5r1n0p8yz",
              "name": "Development",
              "slug": "development",
              "mode": "sandbox",
              "project": {
                "id": "proj_01k7c8m4q2f3e9v6t5r1n0p8yz",
                "name": "Default",
                "slug": "default"
              },
              "organization": {
                "id": "org_01k7c8m4q2f3e9v6t5r1n0p8yz",
                "name": "Acme",
                "slug": "acme",
                "api_version": "2026-10-10",
                "hipaa_mode": true
              },
              "api_key": {
                "id": "key_01k7c8m4q2f3e9v6t5r1n0p8yz",
                "name": "Backend",
                "start": "coss_test_Ab",
                "access": "restricted",
                "permissions": [
                  "email:send",
                  "email:read"
                ]
              }
            }
            """;

        Server
            .Given(WireMock.RequestBuilders.Request.Create().WithPath("/v1/environment").UsingGet())
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Environment.GetAsync();
        JsonAssert.AreEqual(response, mockResponse);
    }
}
