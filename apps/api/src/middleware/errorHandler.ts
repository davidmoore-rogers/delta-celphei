import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "../observability/logger.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: "validation_error", message: "Invalid input", details: err.flatten() },
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  logger.error({ err, path: req.path }, "unhandled error");
  return res.status(500).json({
    error: { code: "internal_error", message: "An unexpected error occurred" },
  });
};

export function notFound(resource: string): HttpError {
  return new HttpError(404, "not_found", `${resource} not found`);
}
export function forbidden(message = "Forbidden"): HttpError {
  return new HttpError(403, "forbidden", message);
}
export function unauthorized(message = "Unauthorized"): HttpError {
  return new HttpError(401, "unauthorized", message);
}
export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, "bad_request", message, details);
}
export function conflict(message: string): HttpError {
  return new HttpError(409, "conflict", message);
}
