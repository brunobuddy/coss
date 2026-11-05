using Coss.Scheduling;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Scheduling.Attendees;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class EraseByEmailTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string requestJson = """
            {
              "email": "email"
            }
            """;

        const string mockResponse = """
            {
              "object": "scheduling.attendee_erasure",
              "erased": 1.1
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/attendees/erase")
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

        var response = await Client.Scheduling.Attendees.EraseByEmailAsync(
            new EraseSchedulingAttendeeByEmailRequest { Email = "email" }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }

    [NUnit.Framework.Test]
    public async Task MockServerTest_2()
    {
        const string requestJson = """
            {
              "email": "sam@example.com"
            }
            """;

        const string mockResponse = """
            {
              "object": "scheduling.attendee_erasure",
              "erased": 3
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/attendees/erase")
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

        var response = await Client.Scheduling.Attendees.EraseByEmailAsync(
            new EraseSchedulingAttendeeByEmailRequest { Email = "sam@example.com" }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
