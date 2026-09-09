import { NextResponse, type NextRequest } from "next/server";

// The dashboard runs git, gh and Telegram operations from server actions, so it must only
// answer to the local machine. Binding to 127.0.0.1 is not enough against DNS rebinding,
// where a hostile site's domain resolves to 127.0.0.1: the Host header gives it away.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (!LOCAL_HOST.test(host)) {
    return new NextResponse("This dashboard only answers to localhost.", { status: 403 });
  }
  return NextResponse.next();
}
