/**
 * The SMTP relay: two listeners (implicit TLS and STARTTLS) on `smtp-server`, each message mapped
 * onto a send request (`@coss/email/smtp`) and stored through the same email service, rate limits
 * and quotas as `POST /v1/emails`. Side-effect free: src/index.ts wires the dependencies, tests
 * run it in-process.
 */
import { type EmailService, findSubaccount } from "@coss/email";
import { emailAddressProblem, MAX_RECIPIENTS, uniqueRecipientCount } from "@coss/email/schemas";
import { messageToSendRequest, SMTP_MAX_MESSAGE_BYTES } from "@coss/email/smtp";
import { type LogWriter, noopLogWriter } from "@coss/logs";
import { consumeAll, emailSendQuotas, type RateLimiter, refundAll } from "@coss/ratelimit";
import type { ApiKeyContext, RefusedKeyContext } from "@coss/tenancy";
import {
  SMTPServer,
  type SMTPServerAddress,
  type SMTPServerAuthentication,
  type SMTPServerAuthenticationResponse,
  type SMTPServerDataStream,
  type SMTPServerOptions,
  type SMTPServerSession,
} from "smtp-server";
import { type Authenticate, authenticateSmtp, recheckSmtpKey } from "./auth.ts";
import {
  loggedMessage,
  reply,
  replyError,
  replyText,
  type SmtpOutcome,
  sendErrorReply,
} from "./replies.ts";
import type { TlsMaterial } from "./tls.ts";

/** An idle client is disconnected after this long (RFC 5321 suggests at least 5 minutes). */
const SOCKET_TIMEOUT_MS = 5 * 60 * 1000;
/** How long shutdown waits for messages in progress before closing what is left. */
const DEFAULT_CLOSE_TIMEOUT_MS = 90 * 1000;
/** Concurrent connections per listener and process. */
const DEFAULT_MAX_CLIENTS = 1_000;

export type SmtpRelayOptions = {
  /** The relay's public name: greeting and EHLO reply. */
  hostname: string;
  tls: TlsMaterial;
  emailService: EmailService;
  rateLimiter: RateLimiter;
  logWriter?: LogWriter;
  /** Injectable for tests only. */
  authenticate?: Authenticate;
  /** Development only: allow AUTH before STARTTLS (passwords are API keys). */
  allowInsecureAuth?: boolean;
  maxClients?: number;
  closeTimeoutMs?: number;
  /** The `SIZE` limit (default SMTP_MAX_MESSAGE_BYTES; tests lower it). */
  maxMessageBytes?: number;
};

export type SmtpPorts = { implicitTls: number; startTls: number };

export type SmtpRelay = {
  /** Starts both listeners; port 0 picks a free port. Resolves with the bound ports. */
  listen(ports: SmtpPorts, host?: string): Promise<SmtpPorts>;
  /** Replaces the certificate for new connections (ACM renewals). */
  updateTls(tls: TlsMaterial): void;
  /**
   * Stops accepting connections, says goodbye (421) to idle clients and to busy ones once their
   * current message is answered, closes what is left after `closeTimeoutMs`. Idempotent.
   */
  shutdown(): Promise<void>;
};

/** What smtp-server keeps per connection, typed as far as the relay uses it. */
type Connection = {
  session: SMTPServerSession;
  send(code: number, message: string): void;
  close(): void;
};

/** `::ffff:1.2.3.4` → `1.2.3.4`, as the API's resolver reports addresses. */
function clientIpOf(session: SMTPServerSession): string | null {
  const address = session.remoteAddress?.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, "");
  return address || null;
}

export function createSmtpRelay(options: SmtpRelayOptions): SmtpRelay {
  const logWriter = options.logWriter ?? noopLogWriter;
  const maxMessageBytes = options.maxMessageBytes ?? SMTP_MAX_MESSAGE_BYTES;
  /**
   * Authenticated sessions (smtp-server keeps only a string user), with the key so each message
   * checks it again (held in memory for the connection only).
   */
  const sessions = new Map<string, { context: ApiKeyContext; key: string }>();
  /** Sessions between MAIL FROM and the reply to their message. */
  const inTransaction = new Set<string>();
  /**
   * The negotiated TLS protocol per session (`TLSv1.3`), read in `onSecure`. smtp-server's
   * `session.tlsOptions` is `getCipher()`, whose `version` is the suite's minimum protocol, not
   * the one in use (Bun reports `TLSv1/SSLv3` for every suite).
   */
  const tlsProtocols = new Map<string, string>();
  let draining = false;

  function log(
    context: ApiKeyContext | RefusedKeyContext,
    session: SMTPServerSession,
    entry: {
      type: string;
      outcome: SmtpOutcome;
      startedAt: number;
      emailId?: string;
      attributes?: Record<string, unknown>;
    },
  ) {
    const { code, status, errorCode } = entry.outcome;
    logWriter.write({
      organizationId: context.organizationId,
      projectId: context.projectId,
      environmentId: context.environmentId,
      occurredAt: new Date(entry.startedAt),
      source: "smtp",
      level: code >= 500 ? "error" : code >= 400 ? "warning" : "info",
      type: entry.type,
      message: `${code} ${status} ${loggedMessage(entry.outcome)}`,
      apiKeyId: context.apiKeyId,
      method: "SMTP",
      statusCode: code,
      durationMs: Date.now() - entry.startedAt,
      clientIp: clientIpOf(session),
      errorCode,
      ...(entry.emailId ? { resourceType: "email", resourceId: entry.emailId } : {}),
      // Never addresses, subjects or content: like API request logs, only the shape.
      attributes: {
        smtp: {
          port: session.localPort,
          tls: tlsProtocols.get(session.id) ?? null,
          // smtp-server stores `getCipher()` here once the connection is encrypted.
          cipher: (session.tlsOptions as { name?: string } | undefined)?.name ?? null,
          client_hostname: session.hostNameAppearsAs ?? null,
          ...entry.attributes,
        },
      },
    });
  }

  async function onConnect(session: SMTPServerSession): Promise<void> {
    if (draining) throw replyError(reply(421, "4.3.2", "Shutting down, retry shortly."));
    const ip = clientIpOf(session);
    if (!ip) return;
    const decision = await options.rateLimiter.consume({
      buckets: ["smtp.connections.ip"],
      subject: ip,
    });
    if (!decision.allowed) {
      throw replyError(reply(421, "4.7.0", "Too many connections from this address. Retry later."));
    }
  }

  async function onAuth(
    auth: SMTPServerAuthentication,
    session: SMTPServerSession,
  ): Promise<SMTPServerAuthenticationResponse> {
    const startedAt = Date.now();
    const result = await authenticateSmtp({
      username: auth.username ?? "",
      password: auth.password ?? "",
      clientIp: clientIpOf(session),
      rateLimiter: options.rateLimiter,
      authenticate: options.authenticate,
    });
    if (!result.ok) {
      if (result.attempted) {
        log(result.attempted, session, {
          type: "smtp.auth",
          outcome: { ...result.reply, errorCode: result.errorCode },
          startedAt,
        });
      }
      throw replyError(result.reply);
    }
    sessions.set(session.id, { context: result.context, key: auth.password ?? "" });
    return { user: result.context.apiKeyId };
  }

  async function onMailFrom(_address: SMTPServerAddress, session: SMTPServerSession) {
    if (draining) throw replyError(reply(421, "4.3.2", "Shutting down, retry shortly."));
    const authenticated = sessions.get(session.id);
    if (!authenticated) throw replyError(reply(530, "5.7.0", "Authentication required."));
    // The key may have been revoked (or its organization suspended) since AUTH.
    const startedAt = Date.now();
    const result = await recheckSmtpKey(authenticated.key, options.authenticate);
    if (!result.ok) {
      if (result.errorCode !== "service_unavailable") sessions.delete(session.id);
      if (result.attempted) {
        log(result.attempted, session, {
          type: "smtp.auth",
          outcome: { ...result.reply, errorCode: result.errorCode },
          startedAt,
        });
      }
      throw replyError(result.reply);
    }
    authenticated.context = result.context;
    inTransaction.add(session.id);
  }

  async function onRcptTo(address: SMTPServerAddress, session: SMTPServerSession) {
    if (session.envelope.rcptTo.length >= MAX_RECIPIENTS) {
      throw replyError(
        reply(452, "4.5.3", `Too many recipients: at most ${MAX_RECIPIENTS} per message.`),
      );
    }
    const problem = emailAddressProblem(address.address);
    if (problem) throw replyError(reply(553, "5.1.3", problem));
  }

  /** Everything after DATA: the message's outcome, never a thrown error. */
  async function handleMessage(
    context: ApiKeyContext,
    session: SMTPServerSession,
    raw: Uint8Array,
  ): Promise<{ outcome: SmtpOutcome; emailId?: string }> {
    const { rateLimiter, emailService } = options;
    // The per-key send budget, shared with POST /v1/emails.
    const perKey = await rateLimiter.consume({
      buckets: ["api.send"],
      subject: context.apiKeyId,
      organizationId: context.organizationId,
    });
    if (!perKey.allowed) {
      return {
        outcome: reply(
          451,
          "4.7.1",
          "Too many messages for this API key. Retry later.",
          "rate_limit_exceeded",
        ),
      };
    }

    const mapped = await messageToSendRequest({
      raw,
      envelope: {
        mailFrom: session.envelope.mailFrom ? session.envelope.mailFrom.address : null,
        rcptTo: session.envelope.rcptTo.map((recipient) => recipient.address),
      },
    });
    if (!mapped.ok) {
      // The reply may quote the message's addresses: the log gets the stable reason only.
      return {
        outcome: { ...mapped.reply, errorCode: mapped.errorCode, logMessage: "Message refused." },
      };
    }

    // Tenancy always comes from the authenticated key, never from the message.
    const input = {
      environment: {
        organizationId: context.organizationId,
        projectId: context.projectId,
        environmentId: context.environmentId,
        mode: context.mode,
      },
      apiKeyId: context.apiKeyId,
      apiKeyOwnerId: context.ownerUserId,
      params: mapped.params,
      idempotencyKey: mapped.idempotencyKey,
    };
    const accepted = (emailId: string) => ({
      outcome: reply(250, "2.0.0", `OK queued as ${emailId}`),
      emailId,
    });

    const quota = await emailSendQuotas(
      context,
      [
        {
          recipients: uniqueRecipientCount(mapped.params),
          subaccount: mapped.params.subaccount,
        },
      ],
      (ref) =>
        findSubaccount({
          organizationId: context.organizationId,
          environmentId: context.environmentId,
          ref,
        }),
    );
    const decision = await consumeAll(rateLimiter, quota);
    if (decision) {
      // A matching replay needs no quota (it cannot create or dispatch a send).
      const replay = await emailService.replay(input);
      if (replay) return accepted(replay.id);
      return {
        outcome:
          decision.retryAfterMs === null
            ? reply(
                552,
                "5.3.4",
                "This message has more recipients than the send quota allows at once.",
                "quota_exceeded",
              )
            : reply(
                451,
                "4.7.1",
                `The send quota (${decision.bucket}) is used up. Retry in ${Math.ceil(decision.retryAfterMs / 1000)} seconds.`,
                "quota_exceeded",
              ),
      };
    }
    try {
      const { email, replayed } = await emailService.send(input);
      // A replay sent nothing new (a client retry with the same X-Coss-Idempotency-Key).
      if (replayed) await refundAll(rateLimiter, quota);
      return accepted(email.id);
    } catch (error) {
      // Rejected before anything was stored (sender, idempotency conflicts, outages).
      await refundAll(rateLimiter, quota);
      const outcome = sendErrorReply(error);
      if (outcome) return { outcome };
      console.error("[smtp] send failed:", error);
      return {
        outcome: reply(451, "4.3.0", "Temporary failure, retry shortly.", "internal_error"),
      };
    }
  }

  function onData(
    stream: SMTPServerDataStream,
    session: SMTPServerSession,
    callback: (error?: Error | null, message?: string) => void,
  ) {
    const startedAt = Date.now();
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => {
      // Past SIZE smtp-server keeps reading (to find the end) but the bytes aren't needed.
      if (!stream.sizeExceeded) chunks.push(chunk);
    });
    stream.on("end", () => {
      const context = sessions.get(session.id)?.context;
      const respond = (outcome: SmtpOutcome) => {
        inTransaction.delete(session.id);
        if (outcome.code >= 400) callback(replyError(outcome));
        else callback(null, replyText(outcome));
        // A draining relay lets the client go once its message is answered.
        if (draining) setImmediate(() => closeSession(session.id));
      };
      if (!context) {
        respond(reply(530, "5.7.0", "Authentication required.", null));
        return;
      }
      if (stream.sizeExceeded) {
        const outcome = reply(
          552,
          "5.3.4",
          `Message too large: at most ${maxMessageBytes} bytes.`,
          "message_too_large",
        );
        log(context, session, { type: "smtp.message", outcome, startedAt });
        respond(outcome);
        return;
      }
      const raw = Buffer.concat(chunks);
      handleMessage(context, session, raw).then(
        ({ outcome, emailId }) => {
          log(context, session, {
            type: "smtp.message",
            outcome,
            startedAt,
            emailId,
            attributes: { recipients: session.envelope.rcptTo.length, size: raw.byteLength },
          });
          respond(outcome);
        },
        (error: unknown) => {
          console.error("[smtp] message handling failed:", error);
          respond(reply(451, "4.3.0", "Temporary failure, retry shortly.", "internal_error"));
        },
      );
    });
  }

  const shared: SMTPServerOptions = {
    name: options.hostname,
    banner: "coss.com",
    key: options.tls.key,
    cert: options.tls.cert,
    minVersion: "TLSv1.2",
    authMethods: ["PLAIN", "LOGIN"],
    allowInsecureAuth: options.allowInsecureAuth ?? false,
    size: maxMessageBytes,
    disabledCommands: [],
    disableReverseLookup: true,
    maxClients: options.maxClients ?? DEFAULT_MAX_CLIENTS,
    socketTimeout: SOCKET_TIMEOUT_MS,
    closeTimeout: options.closeTimeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS,
    logger: false,
    onConnect: (session, callback) => {
      onConnect(session).then(() => callback(), callback);
    },
    onAuth: (auth, session, callback) => {
      onAuth(auth, session).then((response) => callback(null, response), callback);
    },
    onMailFrom: (address, session, callback) => {
      onMailFrom(address, session).then(() => callback(), callback);
    },
    onRcptTo: (address, session, callback) => {
      onRcptTo(address, session).then(() => callback(), callback);
    },
    onData,
    // STARTTLS starts the session over (RFC 3207): smtp-server forgets its user, and so do we.
    onSecure: (socket, session, callback) => {
      sessions.delete(session.id);
      const protocol = "getProtocol" in socket ? socket.getProtocol() : null;
      if (protocol) tlsProtocols.set(session.id, protocol);
      callback();
    },
    onClose: (session) => {
      sessions.delete(session.id);
      inTransaction.delete(session.id);
      tlsProtocols.delete(session.id);
    },
  };
  const implicitTls = new SMTPServer({ ...shared, secure: true });
  const startTls = new SMTPServer({ ...shared, secure: false });
  const servers = [implicitTls, startTls];
  // Failed TLS handshakes (plaintext on the implicit-TLS port, scanners) and dropped sockets are
  // emitted here; unhandled, an `error` event would end the process. Expected noise, not Sentry
  // events (only console.error is).
  for (const server of servers) {
    server.on("error", (error: Error & { code?: string }) => {
      console.warn(`[smtp] connection error: ${error.code ?? error.message}`);
    });
  }

  function connections(): Connection[] {
    return servers.flatMap((server) => [
      ...(server as unknown as { connections: Set<Connection> }).connections,
    ]);
  }

  function closeSession(id: string) {
    const connection = connections().find((candidate) => candidate.session.id === id);
    if (!connection) return;
    connection.send(421, "4.3.2 Shutting down, reconnect to continue.");
    connection.close();
  }

  let shuttingDown: Promise<void> | undefined;
  return {
    async listen(ports, host) {
      const bound = await Promise.all(
        (
          [
            [implicitTls, ports.implicitTls],
            [startTls, ports.startTls],
          ] as const
        ).map(
          ([server, port]) =>
            new Promise<number>((resolve, reject) => {
              const listener = server.listen(port, host, () => {
                const address = listener.address();
                resolve(typeof address === "object" && address ? address.port : port);
              });
              server.once("error", reject);
            }),
        ),
      );
      return { implicitTls: bound[0] as number, startTls: bound[1] as number };
    },
    updateTls(tls) {
      for (const server of servers) server.updateSecureContext({ key: tls.key, cert: tls.cert });
    },
    shutdown() {
      shuttingDown ??= (async () => {
        draining = true;
        const closed = Promise.all(
          servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
        );
        // Idle clients (pooled connections between messages) go now; busy ones after their reply.
        for (const connection of connections()) {
          if (!inTransaction.has(connection.session.id)) closeSession(connection.session.id);
        }
        await closed;
      })();
      return shuttingDown;
    },
  };
}
