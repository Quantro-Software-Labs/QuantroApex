import { FastifyRequest, FastifyReply } from 'fastify';
import { Readable } from 'stream';

export const RAW_BODY_MAX_BYTES = 1048576; // 1 MB

export function rawBodyPreParsingHook(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: Readable,
  done: (err: Error | null, stream?: Readable) => void,
) {
  const chunks: Buffer[] = [];
  let totalLength = 0;

  payload.on('data', (chunk: Buffer) => {
    totalLength += chunk.length;
    if (totalLength > RAW_BODY_MAX_BYTES) {
      const err: any = new Error('Payload too large: exceeds 1 MB limit');
      err.statusCode = 413;
      payload.destroy(err);
      return done(err);
    }
    chunks.push(chunk);
  });

  payload.on('end', () => {
    const rawBuffer = Buffer.concat(chunks);
    (request as any).rawBody = rawBuffer;
    done(null, Readable.from(rawBuffer));
  });

  payload.on('error', (err) => {
    done(err);
  });
}
