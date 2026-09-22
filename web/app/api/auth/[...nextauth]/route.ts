import NextAuth, { AuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";

const AGENT_URL = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "https://agent.mindzed.tech";
const AGENT_SECRET = process.env.AGENT_SECRET || "mindzed-insecure-dev-secret-change-me";

export const authOptions: AuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID || "",
      clientSecret: process.env.GITHUB_SECRET || "",
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, profile }) {
      const githubUsername = (profile as { login?: string })?.login || user.name || "";
      if (!githubUsername) return false;

      // 1. Check if username is in static ALLOWED_GITHUB_USERS env (if provided)
      const allowedEnv = process.env.ALLOWED_GITHUB_USERS;
      if (allowedEnv) {
        const allowedList = allowedEnv.split(",").map((u) => u.trim().toLowerCase());
        if (allowedList.includes(githubUsername.toLowerCase())) {
          return true;
        }
      }

      // 2. Query Agent / PostgreSQL whitelist
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        // First check whitelist
        const res = await fetch(`${AGENT_URL}/api/v1/auth/whitelist`, {
          signal: controller.signal,
          headers: { "X-Agent-Secret": AGENT_SECRET },
          cache: "no-store",
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          // If no admin exists yet, automatically claim this first user as admin!
          if (!data.has_admin) {
            await fetch(`${AGENT_URL}/api/v1/auth/whitelist/claim`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Agent-Secret": AGENT_SECRET,
              },
              body: JSON.stringify({ username: githubUsername }),
            });
            return true;
          }

          // If admin exists, check if user is in the whitelist
          const isWhitelisted = data.users.some(
            (u: { username: string }) => u.username.toLowerCase() === githubUsername.toLowerCase()
          );
          if (isWhitelisted) {
            return true;
          }
        }
      } catch (err) {
        console.warn("Could not verify against live agent, permitting local dev user", err);
      }

      // Fallback: If GitHub OAuth is in dev mode without env vars or agent is offline
      if (!process.env.GITHUB_ID || !process.env.GITHUB_SECRET) {
        return true;
      }

      return false; // Deny access if not whitelisted
    },
    async jwt({ token, profile }) {
      if (profile && (profile as { login?: string }).login) {
        token.username = (profile as { login?: string }).login;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { username?: string }).username = (token.username as string) || session.user.name || "";
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || "mindzed-jwt-session-secret-change-me",
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
