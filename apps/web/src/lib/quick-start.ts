import type { CodeSample } from "@/components/code-block";

/** The quick start's send, in curl and every SDK (coss.com/docs/sdks). */
export function quickStart(apiUrl: string, from: string): CodeSample[] {
  return [
    { label: "curl", code: curlSample(apiUrl, from) },
    { label: "TypeScript", code: typescriptSample(apiUrl, from) },
    {
      label: "Python",
      code: [
        `from coss import Coss`,
        ``,
        `client = Coss(base_url="${apiUrl}")  # api_key from COSS_API_KEY`,
        ``,
        `email = client.email.send(`,
        `    from_="Acme <${from}>",`,
        `    to=["delivered@example.com"],`,
        `    subject="Hello from coss.com",`,
        `    html="<p>It works!</p>",`,
        `)`,
      ].join("\n"),
    },
    {
      label: "Go",
      code: [
        `client := cossclient.NewClient(option.WithBaseURL("${apiUrl}")) // COSS_API_KEY`,
        ``,
        `email, err := client.Email.Send(ctx, &coss.SendEmailBody{`,
        `\tBody: &coss.SendEmailRequest{`,
        `\t\tFrom:    "Acme <${from}>",`,
        `\t\tTo:      &coss.SendEmailRequestTo{StringList: []string{"delivered@example.com"}},`,
        `\t\tSubject: coss.String("Hello from coss.com"),`,
        `\t\tHTML:    coss.String("<p>It works!</p>"),`,
        `\t},`,
        `})`,
      ].join("\n"),
    },
    {
      label: "Ruby",
      code: [
        `require "coss"`,
        ``,
        `client = Coss::Client.new(base_url: "${apiUrl}") # api_key from COSS_API_KEY`,
        ``,
        `email = client.email.send_(`,
        `  from: "Acme <${from}>",`,
        `  to: ["delivered@example.com"],`,
        `  subject: "Hello from coss.com",`,
        `  html: "<p>It works!</p>"`,
        `)`,
      ].join("\n"),
    },
    {
      label: "PHP",
      code: [
        `$client = new Coss\\Coss(options: ['baseUrl' => '${apiUrl}']); // COSS_API_KEY`,
        ``,
        `$email = $client->email->send(new Coss\\Email\\Requests\\SendEmailBody([`,
        `    'body' => new Coss\\Types\\SendEmailRequest([`,
        `        'from' => 'Acme <${from}>',`,
        `        'to' => ['delivered@example.com'],`,
        `        'subject' => 'Hello from coss.com',`,
        `        'html' => '<p>It works!</p>',`,
        `    ]),`,
        `]));`,
      ].join("\n"),
    },
    {
      label: "Java",
      code: [
        `Coss client = Coss.builder().url("${apiUrl}").build(); // COSS_API_KEY`,
        ``,
        `Email email = client.email().send(SendEmailRequest.builder()`,
        `        .from("Acme <${from}>")`,
        `        .to(SendEmailRequestTo.of(Arrays.asList("delivered@example.com")))`,
        `        .subject("Hello from coss.com")`,
        `        .html("<p>It works!</p>")`,
        `        .build());`,
      ].join("\n"),
    },
    {
      label: ".NET",
      code: [
        `var client = new CossClient(clientOptions: new ClientOptions { BaseUrl = "${apiUrl}" }); // COSS_API_KEY`,
        ``,
        `var email = await client.Email.SendAsync(new SendEmailBody`,
        `{`,
        `    Body = new SendEmailRequest`,
        `    {`,
        `        From = "Acme <${from}>",`,
        `        To = new[] { "delivered@example.com" },`,
        `        Subject = "Hello from coss.com",`,
        `        Html = "<p>It works!</p>",`,
        `    },`,
        `});`,
      ].join("\n"),
    },
  ];
}

function curlSample(apiUrl: string, from: string): string {
  return [
    `curl -X POST ${apiUrl}/v1/emails \\`,
    `  -H "Authorization: Bearer $COSS_API_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{`,
    `    "from": "Acme <${from}>",`,
    `    "to": "delivered@example.com",`,
    `    "subject": "Hello from coss.com",`,
    `    "html": "<p>It works!</p>"`,
    `  }'`,
  ].join("\n");
}

function typescriptSample(apiUrl: string, from: string): string {
  return [
    `import { Coss } from "coss";`,
    ``,
    `const coss = new Coss({`,
    `  apiKey: process.env.COSS_API_KEY,`,
    `  baseUrl: "${apiUrl}",`,
    `});`,
    ``,
    `const { data, error } = await coss.email.send({`,
    `  from: "Acme <${from}>",`,
    `  to: "delivered@example.com",`,
    `  subject: "Hello from coss.com",`,
    `  html: "<p>It works!</p>",`,
    `});`,
  ].join("\n");
}
