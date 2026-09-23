import NextAuth, { AuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";

const AGENT_URL = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "https://agent.mindzed.tech";
const AGENT_SECRET = process.env.AGENT_SECRET || process.env.NEXT_PUBLIC_AGENT_SECRET || "dfb2bd78acdzfdxarf379161b46bd31e0890610fab9028x1";

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
    CredentialsProvider({
      id: "admin-key",
      name: "Admin Master Key",
      credentials: {
        username: { label: "GitHub Username", type: "text", placeholder: "mindzed" },
        secretKey: { label: "Master Secret Key", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.secretKey) {
          return null;
        }

        // Validate secret key against AGENT_SECRET
        if (credentials.secretKey.trim() !== AGENT_SECRET.trim()) {
          return null;
        }

        return {
          id: credentials.username,
          name: credentials.username,
          email: `${credentials.username}@github.local`,
          image: `https://github.com/${credentials.username}.png`,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async signIn({ user, profile, account }) {
      // If signed in with master key credentials, permit access immediately
      if (account?.provider === "admin-key") {
        return true;
      }

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

      // 2. Query Agent file-based whitelist
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(`${AGENT_URL}/api/v1/auth/whitelist`, {
          signal: controller.signal,
          headers: { "X-Agent-Secret": AGENT_SECRET },
          cache: "no-store",
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();

          // 2a. If user is the designated primary admin, allow
          if (data.admin && data.admin.toLowerCase() === githubUsername.toLowerCase()) {
            return true;
          }

          // 2b. If no admin exists yet, automatically claim this first user as primary admin
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

          // 2c. Check if user is on the approved team whitelist
          const isWhitelisted = data.users.some(
            (u: { username: string }) => u.username.toLowerCase() === githubUsername.toLowerCase()
          );
          if (isWhitelisted) {
            return true;
          }
        }
      } catch (err) {
        console.warn("Could not verify against live agent whitelist:", err);
      }

      // Fallback: If GitHub OAuth is in local dev mode without credentials
      if (!process.env.GITHUB_ID || !process.env.GITHUB_SECRET) {
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
  secret: process.env.NEXTAUTH_SECRET || "mindzed-jwt-session-secret-change-me",
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
