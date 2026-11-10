import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 리뉴얼 화면은 /new에서 / 로 옮겼다 (예전 링크·즐겨찾기 호환)
  async redirects() {
    return [{ source: "/new", destination: "/", permanent: false }];
  },
};

export default nextConfig;
