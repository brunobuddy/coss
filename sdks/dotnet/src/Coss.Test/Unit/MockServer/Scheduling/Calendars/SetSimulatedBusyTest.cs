using Coss.Scheduling;
using Coss.Test.Unit.MockServer;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Scheduling.Calendars;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class SetSimulatedBusyTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public void MockServerTest_1()
    {
        const string requestJson = """
            {
              "intervals": [
                {
                  "start": "start",
                  "end": "end"
                },
                {
                  "start": "start",
                  "end": "end"
                }
              ]
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/hosts/host/simulated_busy")
                    .WithHeader("Content-Type", "application/json")
                    .UsingPut()
                    .WithBodyAsJson(requestJson)
            )
            .RespondWith(WireMock.ResponseBuilders.Response.Create().WithStatusCode(200));

        Assert.DoesNotThrowAsync(async () =>
            await Client.Scheduling.Calendars.SetSimulatedBusyAsync(
                new SetSimulatedBusyRequest
                {
                    Host = "host",
                    Intervals = new List<SetSimulatedBusyRequestIntervalsItem>()
                    {
                        new SetSimulatedBusyRequestIntervalsItem { Start = "start", End = "end" },
                        new SetSimulatedBusyRequestIntervalsItem { Start = "start", End = "end" },
                    },
                }
            )
        );
    }

    [NUnit.Framework.Test]
    public void MockServerTest_2()
    {
        const string requestJson = """
            {
              "intervals": [
                {
                  "start": "2027-01-04T15:00:00.000Z",
                  "end": "2027-01-04T16:00:00.000Z"
                }
              ]
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/hosts/host_01kd2m9a0b1c2d3e4f5g6h7j8m/simulated_busy")
                    .WithHeader("Content-Type", "application/json")
                    .UsingPut()
                    .WithBodyAsJson(requestJson)
            )
            .RespondWith(WireMock.ResponseBuilders.Response.Create().WithStatusCode(200));

        Assert.DoesNotThrowAsync(async () =>
            await Client.Scheduling.Calendars.SetSimulatedBusyAsync(
                new SetSimulatedBusyRequest
                {
                    Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
                    Intervals = new List<SetSimulatedBusyRequestIntervalsItem>()
                    {
                        new SetSimulatedBusyRequestIntervalsItem
                        {
                            Start = "2027-01-04T15:00:00.000Z",
                            End = "2027-01-04T16:00:00.000Z",
                        },
                    },
                }
            )
        );
    }
}
