import { AdminRole } from "@prisma/client";
import { requireAdminContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 카카오 파서에 하드코딩된 키워드 (kakao-parser.ts 와 동기화)
const KEYWORD_GROUPS = [
  {
    id: "present",
    label: "출석 키워드",
    description: "학생이 출석했음을 나타내는 키워드 (AttendType.NORMAL)",
    color: "border-forest/20 bg-forest/5 text-forest",
    badgeColor: "border-forest/30 bg-forest/10 text-forest",
    keywords: [
      "동원했습니다",
      "동원",
      "출석합니다",
      "출석했습니다",
      "왔습니다",
      "자리했습니다",
      "착석했습니다",
      "공부시작",
      "시작합니다",
    ],
  },
  {
    id: "absent",
    label: "결석 키워드",
    description: "학생이 결석함을 나타내는 키워드 (AttendType.ABSENT)",
    color: "border-red-200 bg-red-50/50 text-red-700",
    badgeColor: "border-red-200 bg-red-50 text-red-700",
    keywords: [
      "결석합니다",
      "못가겠습니다",
      "결석",
      "빠지겠습니다",
    ],
  },
];

const SOURCE_FILE = "web/src/lib/attendance/kakao-parser.ts";

export default async function AttendanceKeywordsSettingsPage() {
  await requireAdminContext(AdminRole.TEACHER);

  const totalKeywords = KEYWORD_GROUPS.reduce((sum, g) => sum + g.keywords.length, 0);

  return (
    <div className="p-8 sm:p-10">
      {/* 헤더 */}
      <div className="inline-flex rounded-full border border-forest/20 bg-forest/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-forest">
        설정
      </div>
      <h1 className="mt-5 text-3xl font-semibold text-ink">출결 키워드 설정</h1>
      <p className="mt-4 max-w-3xl text-sm leading-8 text-slate sm:text-base">
        카카오톡 채팅 내보내기 파일을 파싱할 때 출석·결석 유형을 판별하는 키워드 목록입니다.
        이 키워드들은 학생이 카카오톡 채팅방에 입력한 메시지에서 출석 상태를 자동으로 인식하는 데
        사용됩니다.
      </p>

      {/* 현황 요약 카드 */}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[24px] border border-ink/10 bg-white px-5 py-4 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">총 키워드</p>
          <p className="mt-2 text-3xl font-bold text-ink">{totalKeywords}</p>
          <p className="mt-1 text-xs text-slate">전체 키워드 수</p>
        </div>
        <div className="rounded-[24px] border border-ink/10 bg-white px-5 py-4 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate">카테고리</p>
          <p className="mt-2 text-3xl font-bold text-ink">{KEYWORD_GROUPS.length}</p>
          <p className="mt-1 text-xs text-slate">출결 유형 분류</p>
        </div>
        <div className="col-span-2 rounded-[24px] border border-amber-200 bg-amber-50/50 px-5 py-4 shadow-panel">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">설정 상태</p>
          <p className="mt-2 text-base font-semibold text-amber-800">시스템 고정값</p>
          <p className="mt-1 text-xs text-amber-700">
            현재 키워드는 시스템에 고정되어 있습니다. 향후 업데이트에서 편집 기능이 추가될 예정입니다.
          </p>
        </div>
      </div>

      {/* 소스 파일 안내 */}
      <div className="mt-4 flex items-center gap-3 rounded-[20px] border border-ink/5 bg-mist/60 px-6 py-4">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="shrink-0 text-slate"
        >
          <path
            d="M3 2.5A1.5 1.5 0 0 1 4.5 1h7A1.5 1.5 0 0 1 13 2.5v11A1.5 1.5 0 0 1 11.5 15h-7A1.5 1.5 0 0 1 3 13.5v-11ZM4.5 2a.5.5 0 0 0-.5.5v11a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5v-11a.5.5 0 0 0-.5-.5h-7Z"
            fill="currentColor"
          />
          <path d="M6 5h4M6 7.5h4M6 10h2.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        </svg>
        <p className="text-sm text-slate">
          소스 파일:{" "}
          <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs font-mono text-ink">
            {SOURCE_FILE}
          </code>
          {" "}— 키워드를 수정하려면 이 파일을 직접 편집하세요.
        </p>
      </div>

      {/* 키워드 그룹 목록 */}
      <div className="mt-10 space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-ink">키워드 목록</h2>
          <span className="inline-flex rounded-full border border-ink/10 bg-mist px-3 py-1 text-xs font-semibold text-slate">
            읽기 전용
          </span>
        </div>

        {KEYWORD_GROUPS.map((group) => (
          <div
            key={group.id}
            className="overflow-hidden rounded-[28px] border border-ink/10 bg-white shadow-panel"
          >
            {/* 카드 헤더 */}
            <div className={`border-b border-ink/5 bg-mist/40 px-6 py-5`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-ink">{group.label}</h3>
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${group.color}`}
                    >
                      {group.keywords.length}개
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate">{group.description}</p>
                </div>
              </div>
            </div>

            {/* 키워드 뱃지 목록 */}
            <div className="px-6 py-5">
              <div className="flex flex-wrap gap-2">
                {group.keywords.map((keyword) => (
                  <span
                    key={keyword}
                    className={`inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium ${group.badgeColor}`}
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 하단 안내 */}
      <div className="mt-10 rounded-[24px] border border-ink/5 bg-mist/60 px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate">사용 안내</p>
        <ul className="mt-3 space-y-2 text-sm text-slate">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-forest">·</span>
            <span>
              이 키워드들은{" "}
              <strong className="text-ink">카카오톡 출결 메시지 파싱</strong>에 사용됩니다.
              담임반 관리 화면에서 카카오톡 내보내기 파일을 업로드하면 자동으로 적용됩니다.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-forest">·</span>
            <span>
              파싱 로직은 메시지 텍스트에 위 키워드가 <strong className="text-ink">포함</strong>되어 있는지
              확인합니다 (정확히 일치하지 않아도 됩니다).
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-forest">·</span>
            <span>
              키워드 편집 기능은 향후 업데이트에서 추가될 예정입니다. 현재는{" "}
              <code className="rounded bg-ink/5 px-1.5 py-0.5 text-xs font-mono">{SOURCE_FILE}</code>
              을 직접 수정하세요.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
