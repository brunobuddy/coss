using Coss.Scheduling;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Scheduling.Hosts;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class UpdateTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string requestJson = """
            {
              "uid": null,
              "email": null,
              "phone": null,
              "calendar_account": null,
              "locale": null
            }
            """;

        const string mockResponse = """
            {
              "object": "scheduling.host",
              "id": "id",
              "uid": "uid",
              "name": "name",
              "email": "email",
              "phone": "phone",
              "calendar_account": "calendar_account",
              "time_zone": "time_zone",
              "locale": "locale",
              "attributes": {
                "attributes": "attributes"
              },
              "locations": [
                {
                  "type": "link",
                  "url": "url"
                },
                {
                  "type": "link",
                  "url": "url"
                }
              ],
              "metadata": {
                "metadata": "metadata"
              },
              "status": "active",
              "created_at": "created_at",
              "updated_at": "updated_at"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/hosts/host")
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

        var response = await Client.Scheduling.Hosts.UpdateAsync(
            new UpdateHostRequest
            {
                Host = "host",
                Uid = null,
                Name = null,
                Email = null,
                Phone = null,
                CalendarAccount = null,
                TimeZone = null,
                Locale = null,
                Attributes = null,
                Locations = null,
                Metadata = null,
                Status = null,
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }

    [NUnit.Framework.Test]
    public async Task MockServerTest_2()
    {
        const string requestJson = """
            {
              "status": "disabled"
            }
            """;

        const string mockResponse = """
            {
              "object": "scheduling.host",
              "id": "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
              "uid": "doctor_482",
              "name": "Dr. Ana Reyes",
              "email": "ana@example.com",
              "phone": null,
              "calendar_account": null,
              "time_zone": "America/New_York",
              "locale": null,
              "attributes": {
                "licensed_in": [
                  "NY",
                  "NJ"
                ]
              },
              "locations": [
                {
                  "type": "in_person",
                  "address": "12 Main St, New York, NY"
                }
              ],
              "metadata": {
                "key": "value"
              },
              "status": "active",
              "created_at": "2027-01-01T10:00:00.000Z",
              "updated_at": "2027-01-01T10:00:00.000Z"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/hosts/host_01kd2m9a0b1c2d3e4f5g6h7j8m")
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

        var response = await Client.Scheduling.Hosts.UpdateAsync(
            new UpdateHostRequest
            {
                Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
                Status = UpdateHostRequestStatus.Disabled,
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
