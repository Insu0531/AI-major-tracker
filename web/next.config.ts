import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 리뉴얼 화면은 /new에서 / 로 옮겼다 (예전 링크·즐겨찾기 호환)
  async redirects() {
    // 구버전(/old)은 2026-11-11 삭제 → 예전 링크는 첫 화면으로
    return [
      { source: "/new", destination: "/", permanent: false },
      { source: "/old", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
