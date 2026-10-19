import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` would otherwise generate untracked AGENTS.md/CLAUDE.md; agent rules live in `.context/`
  agentRules: false,
};

export default nextConfig;
