import { NextResponse } from 'next/server';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const bad = (msg) => new ApiError(400, msg);

/** Wrap a route handler: JSON in/out, uniform error handling, no caching. */
export function wrap(fn) {
  return async (req, ctx) => {
    try {
      const out = await fn(req, ctx);
      return NextResponse.json(out ?? { ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (e) {
      if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
  };
}

export async function readBody(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
