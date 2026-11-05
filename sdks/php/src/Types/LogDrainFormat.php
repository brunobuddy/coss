<?php

namespace Coss\Types;

enum LogDrainFormat: string
{
    case Ndjson = "ndjson";
    case Loki = "loki";
    case Datadog = "datadog";
    case Otlp = "otlp";
}
