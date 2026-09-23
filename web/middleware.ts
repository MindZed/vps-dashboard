import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized: ({ token }) => !!token,
  },
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - api/auth (NextAuth API routes)
     * - login (custom login page)
     * - _next/static, _next/image (static files)
     * - favicon.ico, manifest.json, icons/*
     */
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico|manifest.json|icons).*)",
  ],
};
