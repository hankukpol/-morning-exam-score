import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        mist: "#F7F4EF",
        ember: "#C55A11",
        forest: "#1F4D3A",
        sand: "#E7D8C9",
        slate: "#4B5563",
        primary: "#1B4FBB", // 메인 블루 (버튼, 헤더, 활성 탭)
        "primary-dark": "#153D91", // 호버 상태
        "primary-light": "#EBF0FB", // 행 hover, 선택 배경
        "primary-muted": "#6B8ED6", // 비활성 탭, 보조 텍스트
        success: "#16A34A", // 정상 / 개근
        warning: "#D97706", // 경고
        danger: "#DC2626", // 탈락 / 에러
        "warn-light": "#FEF3C7",
        "danger-light": "#FEE2E2",
        // Sidebar background
        sidebar: "#0B1120",
        "sidebar-hover": "#1E293B",
      },
      boxShadow: {
        panel: "none", // 그림자 제거
      },
      backgroundImage: {
        "hero-grid":
          "linear-gradient(rgba(27,79,187,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(27,79,187,0.06) 1px, transparent 1px)", // primary color gradient
      },
      borderRadius: {
        none: "0px",
        sm: "0px",
        DEFAULT: "0px",
        md: "0px",
        lg: "0px",
        xl: "0px",
        "2xl": "0px",
        "3xl": "0px",
        full: "0px", // 강제로 모든 radius 제거
      },
    },
  },
  plugins: [],
};

export default config;
