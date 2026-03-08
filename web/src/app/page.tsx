import Link from "next/link";
import { getSetupState } from "@/lib/env";

const highlights = [
  {
    title: "기반 구축",
    description: "Next.js 14 App Router, Prisma 스키마, Supabase 연동 뼈대를 완료했습니다.",
  },
  {
    title: "관리자 인증",
    description: "Supabase Auth 세션과 Prisma AdminUser 역할을 결합해 RBAC 흐름을 시작점부터 분리했습니다.",
  },
  {
    title: "F-18 마이그레이션",
    description: "기존 수강생 명단 엑셀을 미리보기 후 upsert하는 UI/API/CLI 경로를 준비했습니다.",
  },
];

export default function Home() {
  const setup = getSetupState();

  return (
    <main className="min-h-screen bg-mist px-6 py-8 text-ink sm:px-10 lg:px-16">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="overflow-hidden rounded-[36px] border border-ink/10 bg-white shadow-panel">
          <div className="bg-hero-grid bg-[size:32px_32px] px-8 py-10 sm:px-10">
            <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
              Phase 1 Kickoff
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight sm:text-5xl">
              아침모의고사 운영을 웹 앱으로 옮기는 초기 베이스를 세팅했습니다.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-slate sm:text-lg">
              현재 범위는 PRD 기준 Phase 1입니다. 관리자 인증, 전체 Prisma 스키마, 수강생 엑셀
              마이그레이션 도구를 한 코드베이스로 묶어 둔 상태입니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/admin"
                className="inline-flex items-center rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-forest"
              >
                관리자 대시보드
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center rounded-full border border-ink/10 px-5 py-3 text-sm font-semibold transition hover:border-ember/30 hover:text-ember"
              >
                관리자 로그인
              </Link>
            </div>
          </div>
          <div className="grid gap-4 border-t border-ink/10 px-8 py-8 sm:grid-cols-3 sm:px-10">
            {highlights.map((item) => (
              <article key={item.title} className="rounded-3xl bg-mist p-5">
                <h2 className="text-lg font-semibold">{item.title}</h2>
                <p className="mt-3 text-sm leading-7 text-slate">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-[32px] border border-ink/10 bg-ink p-8 text-white shadow-panel">
            <p className="text-sm uppercase tracking-[0.3em] text-white/60">Setup Status</p>
            <div className="mt-5 space-y-3 text-sm leading-7 text-white/80">
              <p>
                Supabase 공개 키:{" "}
                <span className={setup.supabaseReady ? "text-[#9AE6B4]" : "text-[#FBD38D]"}>
                  {setup.supabaseReady ? "준비됨" : "미설정"}
                </span>
              </p>
              <p>
                PostgreSQL 연결:{" "}
                <span className={setup.databaseReady ? "text-[#9AE6B4]" : "text-[#FBD38D]"}>
                  {setup.databaseReady ? "준비됨" : "미설정"}
                </span>
              </p>
              <p>
                Service Role 키:{" "}
                <span className={setup.serviceRoleReady ? "text-[#9AE6B4]" : "text-[#FBD38D]"}>
                  {setup.serviceRoleReady ? "준비됨" : "선택 사항"}
                </span>
              </p>
            </div>
            {setup.missingKeys.length > 0 ? (
              <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
                <p className="font-semibold text-white">다음 키를 `.env.local`에 채워야 합니다.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {setup.missingKeys.map((key) => (
                    <span
                      key={key}
                      className="rounded-full border border-white/10 bg-white/10 px-3 py-1 font-mono text-xs"
                    >
                      {key}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-[32px] border border-ink/10 bg-white p-8 shadow-panel">
            <h2 className="text-2xl font-semibold">다음 단계</h2>
            <div className="mt-4 space-y-3 text-sm leading-7 text-slate">
              <p>1. Supabase 프로젝트를 만든 뒤 `.env.local`에 연결 정보를 넣습니다.</p>
              <p>2. `npm run db:generate` 후 `npm run db:deploy` 또는 `db:push`로 스키마를 반영합니다.</p>
              <p>3. 관리자 계정을 Supabase Auth에 생성하고 `admin_users` 테이블에 역할을 등록합니다.</p>
              <p>4. `/admin/migration`에서 기존 명단 파일을 미리보기 후 가져옵니다.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
