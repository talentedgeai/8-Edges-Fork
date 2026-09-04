import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Coarse edge gate for /admin/*, /team/* and /portal/*: refreshes the Supabase session
// cookie and bounces unauthenticated requests to the right login page. This is
// defense-in-depth and UX, NOT the security boundary — requireAdmin() /
// requireTeamMember() in the layouts and every server action do the authoritative
// session + authorization check (middleware cannot gate server actions or RSC
// data fetches by itself).
export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // The login pages and auth callbacks must stay reachable without a session.
  // The invite callbacks carry the session in the URL *hash*, which never
  // reaches the server — bouncing them to login would strand the invite. The
  // /verify interstitials redeem an emailed token_hash for people who have no
  // session yet, so they must be reachable session-less too.
  if (
    pathname.startsWith("/admin/login") ||
    pathname.startsWith("/admin/verify") ||
    pathname.startsWith("/team/login") ||
    pathname.startsWith("/team/callback") ||
    pathname.startsWith("/team/verify") ||
    pathname.startsWith("/portal/login") ||
    pathname.startsWith("/portal/callback") ||
    pathname.startsWith("/portal/verify") ||
    pathname.startsWith("/api/auth")
  ) {
    return NextResponse.next({ request });
  }

  // Each surface has its own login page.
  const loginPath = pathname.startsWith("/team")
    ? "/team/login"
    : pathname.startsWith("/portal")
      ? "/portal/login"
      : "/admin/login";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // If auth isn't configured, pass through so marketing/preview builds still work.
  if (!url || !key) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  try {
    // Touching getUser() refreshes the session cookie when needed.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = loginPath;
      loginUrl.search = `?redirect=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(loginUrl);
    }

    return response;
  } catch {
    // Auth backend unreachable or misconfigured: fail safe to the login page
    // rather than 500-ing all of /admin or /team. requireAdmin() /
    // requireTeamMember() still gate every server action and RSC data fetch, so
    // this never weakens the boundary.
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = loginPath;
    loginUrl.search = `?redirect=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ["/admin/:path*", "/team/:path*", "/portal/:path*"],
};
