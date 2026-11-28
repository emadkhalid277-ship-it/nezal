import type { IncomingMessage, ServerResponse } from 'node:http';

export interface ApiRequestLike extends IncomingMessage {
  body?: unknown;
  query?: Record<string, unknown>;
}

export type ApiResponseLike = ServerResponse;

export declare function handleCloudinaryHealthRequest(
  req: ApiRequestLike,
  res: ApiResponseLike
): Promise<void>;

export declare function handleCloudinarySignRequest(
  req: ApiRequestLike,
  res: ApiResponseLike
): Promise<void>;
