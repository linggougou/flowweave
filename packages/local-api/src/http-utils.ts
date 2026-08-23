import type { IncomingMessage } from "node:http";

export class HttpBodyTooLargeError extends Error {
  constructor() {
    super("请求体过大");
    this.name = "HttpBodyTooLargeError";
  }
}

export class InvalidJsonBodyError extends Error {
  constructor() {
    super("请求 JSON 格式无效");
    this.name = "InvalidJsonBodyError";
  }
}

export async function readJsonBody(
  req: IncomingMessage,
  options: { maxBytes?: number } = {},
): Promise<unknown> {
  const maxBytes = options.maxBytes ?? Number.POSITIVE_INFINITY;
  const declaredLength = Number(req.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    req.resume();
    throw new HttpBodyTooLargeError();
  }

  const raw = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    let settled = false;

    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
    };
    const onData = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      receivedBytes += buffer.byteLength;
      if (receivedBytes > maxBytes) {
        settled = true;
        cleanup();
        req.resume();
        reject(new HttpBodyTooLargeError());
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    const onError = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });

  if (!raw.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new InvalidJsonBodyError();
  }
}
