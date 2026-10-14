// Sockets module skeleton
export interface SocketEventPayload<T = unknown> {
  event: string;
  data: T;
  timestamp: string;
}
