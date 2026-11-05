using Coss.Scheduling;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Scheduling.Schedules;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class RemoveTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string mockResponse = """
            {
              "object": "scheduling.schedule",
              "id": "id",
              "deleted": true
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/hosts/host/schedules/schedule_id")
                    .UsingDelete()
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Schedules.RemoveAsync(
            new RemoveSchedulesRequest { Host = "host", ScheduleId = "schedule_id" }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }

    [NUnit.Framework.Test]
    public async Task MockServerTest_2()
    {
        const string mockResponse = """
            {
              "object": "scheduling.schedule",
              "id": "sched_01kd2m9a0b1c2d3e4f5g6h7j8m",
              "deleted": true
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath(
                        "/v1/scheduling/hosts/host_01kd2m9a0b1c2d3e4f5g6h7j8m/schedules/sched_01kd2m9a0b1c2d3e4f5g6h7j8m"
                    )
                    .UsingDelete()
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Schedules.RemoveAsync(
            new RemoveSchedulesRequest
            {
                Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
                ScheduleId = "sched_01kd2m9a0b1c2d3e4f5g6h7j8m",
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
