import { v4 as uuidv4 } from "uuid";

export function generateCorrelationId(): string {
  return uuidv4();
}

export function getCorrelationId(headers: Headers): string {
  return headers.get("x-correlation-id") || generateCorrelationId();
}
