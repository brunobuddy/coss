using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using Coss.Verify;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Verify.Settings;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class UpdateTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string requestJson = """
            {
              "app_name": null,
              "sms_from": null,
              "email_from": null
            }
            """;

        const string mockResponse = """
            {
              "object": "verify_settings",
              "app_name": "app_name",
              "app_name_is_default": true,
              "code_length": 1000000,
              "ttl_seconds": 1000000,
              "max_attempts": 1000000,
              "sms_from": "sms_from",
              "email_from": "email_from",
              "allowed_countries": [
                "allowed_countries",
                "allowed_countries"
              ]
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/verify/settings")
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

        var response = await Client.Verify.Settings.UpdateAsync(
            new UpdateVerifySettingsRequest
            {
                AppName = null,
                CodeLength = null,
                TtlSeconds = null,
                MaxAttempts = null,
                SmsFrom = null,
                EmailFrom = null,
                AllowedCountries = null,
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }

    [NUnit.Framework.Test]
    public async Task MockServerTest_2()
    {
        const string requestJson = """
            {
              "sms_from": "+14155550100",
              "allowed_countries": [
                "CA",
                "GB",
                "US"
              ]
            }
            """;

        const string mockResponse = """
            {
              "object": "verify_settings",
              "app_name": "Acme",
              "app_name_is_default": false,
              "code_length": 6,
              "ttl_seconds": 600,
              "max_attempts": 5,
              "sms_from": "+14155550100",
              "email_from": "codes@acme.com",
              "allowed_countries": [
                "CA",
                "US"
              ]
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/verify/settings")
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

        var response = await Client.Verify.Settings.UpdateAsync(
            new UpdateVerifySettingsRequest
            {
                SmsFrom = "+14155550100",
                AllowedCountries = new List<string>() { "CA", "GB", "US" },
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
