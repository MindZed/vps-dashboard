import NextAuth, { AuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import { getAgentUpstreamHeaders } from "@/lib/upstream-auth";

const AGENT_URL = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "https://agent.mindzed.tech";

export const authOptions: AuthOptions = {
  providers: [
    ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET
      ? [
          GithubProvider({
            clientId: process.env.GITHUB_ID,
            clientSecret: process.env.GITHUB_SECRET,
          }),
        ]
      : []),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, profile }) {
      const githubUsername = (profile as { login?: string })?.login || user.name || "";
      if (!githubUsername) return false;

      const cleanGithubUser = githubUsername.replace(/^@/, "").toLowerCase();

      // 1. Check if username is in static ALLOWED_GITHUB_USERS env (if provided)
      const allowedEnv = process.env.ALLOWED_GITHUB_USERS;
      if (allowedEnv) {
        const allowedList = allowedEnv.split(",").map((u) => u.trim().replace(/^@/, "").toLowerCase());
        if (allowedList.includes(cleanGithubUser)) {
          return true;
        }
      }

      // 2. Query Agent file-based whitelist (protected by Cloudflare Zero Trust & Agent Secret)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(`${AGENT_URL}/api/v1/auth/whitelist`, {
          signal: controller.signal,
          headers: getAgentUpstreamHeaders(),
          cache: "no-store",
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();

          const adminName = (data.admin || "").replace(/^@/, "").toLowerCase();
          // 2a. If user is the designated primary admin, allow
          if (adminName && adminName === cleanGithubUser) {
            return true;
          }

          // 2b. If no admin exists yet, automatically claim this first user as primary admin
          if (!data.has_admin) {
            await fetch(`${AGENT_URL}/api/v1/auth/whitelist/claim`, {
              method: "POST",
              headers: getAgentUpstreamHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({ username: cleanGithubUser }),
            });
            return true;
          }

          // 2c. Check if user is on the approved team whitelist
          const isWhitelisted = (data.users || []).some(
            (u: { username: string }) => (u.username || "").replace(/^@/, "").toLowerCase() === cleanGithubUser
          );
          if (isWhitelisted) {
            return true;
          }
        }
      } catch (err) {
        console.warn("Could not verify against live agent whitelist:", err);
      }

      // Fallback: If strictly in local development mode without GitHub OAuth credentials
      if (process.env.NODE_ENV === "development" && (!process.env.GITHUB_ID || !process.env.GITHUB_SECRET)) {
        return true;
      }

      return false; // Deny access if not whitelisted
    },
    async jwt({ token, profile, user }) {
      if (profile && (profile as { login?: string }).login) {
        token.username = (profile as { login?: string }).login;
      } else if (user?.name) {
        token.username = user.name;
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
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };

