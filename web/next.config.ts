import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["echarts", "zrender", "echarts-for-react"],
  // Allow SVGs and images
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
