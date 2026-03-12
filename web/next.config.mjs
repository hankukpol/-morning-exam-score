/** @type {import("next").NextConfig} */
const nextConfig = {
  serverExternalPackages: ["exceljs"],
  typescript: {
    // 타입 체크는 로컬에서 수행 - 빌드 시간 단축
    ignoreBuildErrors: true,
  },
  eslint: {
    // ESLint도 로컬에서 수행 - 빌드 시간 단축
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
