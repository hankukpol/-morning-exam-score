import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_USER_ID_HEADER = "x-morning-auth-user-id";
const AUTH_USER_EMAIL_HEADER = "x-morning-auth-user-email";

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies.getAll().some((cookie) => {
    const name = cookie.name.toLowerCase();
    return name.startsWith("sb-") && name.includes("auth-token");
  });
}

function buildRequestHeaders(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete(AUTH_USER_ID_HEADER);
  headers.delete(AUTH_USER_EMAIL_HEADER);
  return headers;
}

function rebuildResponse(response: NextResponse, requestHeaders: Headers) {
  const nextResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  for (const cookie of response.cookies.getAll()) {
    nextResponse.cookies.set(cookie);
  }

  return nextResponse;
}

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.next({ request });
  }

  const hasAuthCookie = hasSupabaseAuthCookie(request);
  const requestHeaders = buildRequestHeaders(request);

  if (!hasAuthCookie) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname);

    return NextResponse.redirect(loginUrl);
  }

  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response = rebuildResponse(response, requestHeaders);
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: "", ...options });
        response = rebuildResponse(response, requestHeaders);
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname);

    return NextResponse.redirect(loginUrl);
  }

  requestHeaders.set(AUTH_USER_ID_HEADER, user.id);
  requestHeaders.set(AUTH_USER_EMAIL_HEADER, user.email ?? "");
  response = rebuildResponse(response, requestHeaders);

  return response;
}