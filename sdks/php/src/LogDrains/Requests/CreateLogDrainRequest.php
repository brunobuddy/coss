<?php

namespace Coss\LogDrains\Requests;

use Coss\Core\Json\JsonSerializableType;
use Coss\Core\Json\JsonProperty;
use Coss\Types\LogDrainSource;
use Coss\Core\Types\ArrayType;
use Coss\LogDrains\Types\CreateLogDrainRequestFormat;
use Coss\Types\LogDrainAuthHeader;

class CreateLogDrainRequest extends JsonSerializableType
{
    /**
     * @var string $url An `https://` URL coss.com posts batches of log lines to.
     */
    #[JsonProperty('url')]
    public string $url;

    /**
     * @var ?string $description A note for your own reference. `null` clears it.
     */
    #[JsonProperty('description')]
    public ?string $description;

    /**
     * @var ?array<value-of<LogDrainSource>> $sources What the drain forwards: `api` (requests made with the environment's API keys), `email` (email events), `webhook` (webhook delivery attempts) and `audit` (changes to the environment, from the organization's audit log). An empty array means every source, including ones added later. Defaults to every source.
     */
    #[JsonProperty('sources'), ArrayType(['string'])]
    public ?array $sources;

    /**
     * @var ?value-of<CreateLogDrainRequestFormat> $format How batches are encoded. `ndjson`: one JSON object per line (`application/x-ndjson`), for your own endpoint. `loki`: Loki's push API (`/loki/api/v1/push`, Grafana Cloud Logs). `datadog`: Datadog's log intake (`/api/v2/logs`). `otlp`: OTLP/HTTP logs in JSON (`/v1/logs`, Grafana Cloud, Honeycomb, an OpenTelemetry Collector…). Defaults to `ndjson`.
     */
    #[JsonProperty('format')]
    public ?string $format;

    /**
     * @var ?LogDrainAuthHeader $authHeader
     */
    #[JsonProperty('auth_header')]
    public ?LogDrainAuthHeader $authHeader;

    /**
     * @param array{
     *   url: string,
     *   description?: ?string,
     *   sources?: ?array<value-of<LogDrainSource>>,
     *   format?: ?value-of<CreateLogDrainRequestFormat>,
     *   authHeader?: ?LogDrainAuthHeader,
     * } $values
     */
    public function __construct(
        array $values,
    ) {
        $this->url = $values['url'];
        $this->description = $values['description'] ?? null;
        if (array_key_exists('description', $values)) {
            $this->_setField('description');
        }
        $this->sources = $values['sources'] ?? null;
        if (array_key_exists('sources', $values)) {
            $this->_setField('sources');
        }
        $this->format = $values['format'] ?? null;
        if (array_key_exists('format', $values)) {
            $this->_setField('format');
        }
        $this->authHeader = $values['authHeader'] ?? null;
        if (array_key_exists('authHeader', $values)) {
            $this->_setField('authHeader');
        }
    }
}
