<?php

namespace Coss\LogDrains\Types;

enum CreateLogDrainRequestFormat: string
{
    case Ndjson = "ndjson";
    case Loki = "loki";
    case Datadog = "datadog";
    case Otlp = "otlp";
}
