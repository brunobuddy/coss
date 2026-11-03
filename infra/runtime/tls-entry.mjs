/**
 * Encrypts the hop from the load balancer to this container: terminates TLS on TLS_PORT and pipes
 * the bytes to the app's plain port, then runs the app (argv[2]) in this process. Node and Bun; no
 * dependencies, because it is copied into each image on its own. The load balancer doesn't validate
 * target certificates, so each start makes its own and the key never leaves memory.
 */
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { connect } from "node:net";
import { resolve } from "node:path";
import { createServer } from "node:tls";
import { pathToFileURL } from "node:url";

function der(tag, ...parts) {
  const body = Buffer.concat(parts);
  if (body.length < 0x80) return Buffer.concat([Buffer.from([tag, body.length]), body]);
  const length = [];
  for (let rest = body.length; rest > 0; rest >>= 8) length.unshift(rest & 0xff);
  return Buffer.concat([Buffer.from([tag, 0x80 | length.length, ...length]), body]);
}

const SEQUENCE = 0x30;
const ECDSA_WITH_SHA256 = der(SEQUENCE, Buffer.from("06082a8648ce3d040302", "hex"));

function generalizedTime(date) {
  const digits = date.toISOString().replace(/[-:T]|\.\d+/g, "");
  return der(0x18, Buffer.from(digits));
}

export function selfSignedCertificate(now = new Date()) {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const name = der(
    SEQUENCE,
    der(
      0x31,
      der(SEQUENCE, Buffer.from("0603550403", "hex"), der(0x0c, Buffer.from("coss-target"))),
    ),
  );
  const serial = randomBytes(16);
  serial[0] = (serial[0] & 0x7f) | 0x40;
  const tbs = der(
    SEQUENCE,
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, serial),
    ECDSA_WITH_SHA256,
    name,
    der(
      SEQUENCE,
      generalizedTime(new Date(now.getTime() - 86_400_000)),
      generalizedTime(new Date(now.getTime() + 3_650 * 86_400_000)),
    ),
    name,
    publicKey.export({ type: "spki", format: "der" }),
  );
  const signature = sign("sha256", tbs, { key: privateKey, dsaEncoding: "der" });
  const certificate = der(SEQUENCE, tbs, ECDSA_WITH_SHA256, der(0x03, Buffer.from([0]), signature));
  const pem = certificate.toString("base64").replace(/(.{64})/g, "$1\n");
  return {
    cert: `-----BEGIN CERTIFICATE-----\n${pem}\n-----END CERTIFICATE-----\n`,
    key: privateKey.export({ type: "pkcs8", format: "pem" }),
  };
}

export function startTerminator(tlsPort, targetPort) {
  const server = createServer({ ...selfSignedCertificate(), minVersion: "TLSv1.2" }, (client) => {
    const target = connect(targetPort, "127.0.0.1");
    client.on("error", () => target.destroy());
    target.on("error", () => client.destroy());
    client.pipe(target);
    target.pipe(client);
  });
  server.on("tlsClientError", () => {});
  server.listen(tlsPort, "0.0.0.0");
  // The app decides when the process ends: it drains on SIGTERM, then exits.
  server.unref();
  return server;
}

const [, self, entry] = process.argv;
if (entry && self && import.meta.url === pathToFileURL(resolve(self)).href) {
  const tlsPort = Number(process.env.TLS_PORT);
  if (tlsPort) startTerminator(tlsPort, Number(process.env.PORT ?? process.env.API_PORT ?? 3001));
  await import(pathToFileURL(resolve(entry)).href);
}
