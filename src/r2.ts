// Cloudflare R2 presigned PUT URLs (S3-compatible, AWS SigV4 query-auth, UNSIGNED-PAYLOAD).
// The phone uploads the photo DIRECTLY to R2 with the presigned URL — image bytes never touch our
// server. Returns the eventual public URL too (served from R2_PUBLIC_BASE). All config via env; if any
// piece is missing, isConfigured() is false and the community upload endpoint degrades gracefully.
const enc = new TextEncoder();

export interface R2Config { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicBase: string; region: string }
export function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID, accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY, bucket = process.env.R2_BUCKET;
  const publicBase = (process.env.R2_PUBLIC_BASE || "").replace(/\/$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBase, region: process.env.R2_REGION || "auto" };
}
export const isConfigured = () => r2Config() !== null;

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function sha256hex(s: string) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(s))); }
async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(data));
}
// RFC3986 encoding; preserve "/" in the object path (each segment encoded, slashes kept).
const enc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const encPath = (s: string) => s.split("/").map(enc3986).join("/");

/** Derive the SigV4 signing key (HMAC chain). Exported for test vectors. */
export async function signingKeyHex(secret: string, dateStamp: string, region: string, service: string): Promise<string> {
  const kDate = await hmac(enc.encode("AWS4" + secret), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  return hex(kSigning);
}

/** Build a presigned PUT URL + the public URL the object will be readable at. */
export async function presignPut(key: string, cfg: R2Config, contentType = "image/jpeg", expiresSec = 600, now: Date = new Date()): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${cfg.region}/s3/aws4_request`;
  const canonicalUri = `/${enc3986(cfg.bucket)}/${encPath(key)}`;
  const q: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${cfg.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSec),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.keys(q).sort().map((k) => `${enc3986(k)}=${enc3986(q[k])}`).join("&");
  const canonicalRequest = ["PUT", canonicalUri, canonicalQuery, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256hex(canonicalRequest)].join("\n");
  const kDate = await hmac(enc.encode("AWS4" + cfg.secretAccessKey), dateStamp);
  const kRegion = await hmac(kDate, cfg.region);
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  const signature = hex(await hmac(kSigning, stringToSign));
  const uploadUrl = `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  void contentType; // header is not signed (signedHeaders=host) so the client may set any content-type
  return { uploadUrl, publicUrl: `${cfg.publicBase}/${key}`, key };
}

/** A safe, collision-resistant object key for a user photo. */
export function photoKey(ext = "jpg"): string {
  const d = new Date(), p = (n: number) => String(n).padStart(2, "0");
  const rand = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const safeExt = /^(jpg|jpeg|png|webp|gif)$/i.test(ext) ? ext.toLowerCase() : "jpg";
  return `community/${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}/${rand}.${safeExt}`;
}
