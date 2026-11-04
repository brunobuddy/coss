# coss.com SDK for Java

Every endpoint of the [coss.com](https://coss.com) API, typed, for Java 8+: email, Hooks, Risk,
webhooks and more, with retries, idempotency keys and webhook verification.

```kotlin
implementation("com.coss:coss:latest.release")
```

```java
import com.coss.Coss;
import com.coss.types.SendEmailRequest;
import com.coss.types.SendEmailRequestTo;
import java.util.Arrays;

Coss client = Coss.builder().build(); // reads COSS_API_KEY

client.email().send(SendEmailRequest.builder()
        .from("Acme <hello@acme.com>")
        .to(SendEmailRequestTo.of(Arrays.asList("ada@example.com")))
        .subject("Welcome to Acme")
        .html("<p>Thanks for signing up!</p>")
        .build());
```

- Guide: [coss.com/docs/sdks/java](https://coss.com/docs/sdks/java) (options, errors, lists, webhooks)
- Every method: [reference.md](./reference.md), and each endpoint's page in the
  [API reference](https://coss.com/docs/api-reference)

The SDK is generated from the API's OpenAPI document in
[cosscom/coss](https://github.com/cosscom/coss/tree/main/sdks/java). MIT licensed.
