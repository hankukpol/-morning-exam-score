import {
  AdminRole,
  AdminMemoColor,
  AdminMemoScope,
  AdminMemoStatus,
  AbsenceCategory,
  AttendType,
  ExamType,
  NoticeTargetType,
  NotificationType,
  ScoreSource,
  StudentType,
  Subject,
} from "@prisma/client";

export const ROLE_LEVEL: Record<AdminRole, number> = {
  VIEWER: 0,
  TEACHER: 1,
  SUPER_ADMIN: 2,
};

export const ROLE_LABEL: Record<AdminRole, string> = {
  VIEWER: "조회 전용",
  TEACHER: "강사",
  SUPER_ADMIN: "최고 관리자",
};

export const EXAM_TYPE_LABEL: Record<ExamType, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

export const EXAM_TYPE_VALUES = Object.values(ExamType);

export const STUDENT_TYPE_LABEL: Record<StudentType, string> = {
  NEW: "신규",
  EXISTING: "기존",
};

export const STUDENT_TYPE_VALUES = Object.values(StudentType);

export const SUBJECT_LABEL: Record<Subject, string> = {
  POLICE_SCIENCE: "경찰학",
  CONSTITUTIONAL_LAW: "헌법",
  CRIMINOLOGY: "범죄학",
  CRIMINAL_PROCEDURE: "형사소송법",
  CRIMINAL_LAW: "형법",
  CUMULATIVE: "누적 모의고사",
};

export const SUBJECT_VALUES = Object.values(Subject);

export function getSubjectDisplayLabel(subject: Subject, displaySubjectName?: string | null) {
  const normalized = displaySubjectName?.trim();
  return normalized || SUBJECT_LABEL[subject];
}
export const EXAM_TYPE_SUBJECTS: Record<ExamType, Subject[]> = {
  GONGCHAE: [
    Subject.CONSTITUTIONAL_LAW,
    Subject.CRIMINAL_LAW,
    Subject.CRIMINAL_PROCEDURE,
    Subject.POLICE_SCIENCE,
    Subject.CUMULATIVE,
  ],
  GYEONGCHAE: [
    Subject.CRIMINOLOGY,
    Subject.CRIMINAL_LAW,
    Subject.CRIMINAL_PROCEDURE,
    Subject.POLICE_SCIENCE,
    Subject.CUMULATIVE,
  ],
};

export const ATTEND_TYPE_LABEL: Record<AttendType, string> = {
  NORMAL: "정상",
  LIVE: "라이브",
  EXCUSED: "사유 결시",
  ABSENT: "무단 결시",
};

export const ATTENDANCE_STATUS_RULES = {
  weeklyWarning1Absences: 1,
  weeklyWarning2Absences: 2,
  weeklyDropoutAbsences: 3,
  monthlyDropoutAbsences: 8,
} as const;

export const SCORE_SOURCE_LABEL: Record<ScoreSource, string> = {
  OFFLINE_UPLOAD: "오프라인 업로드",
  ONLINE_UPLOAD: "온라인 업로드",
  MANUAL_INPUT: "직접 입력",
  PASTE_INPUT: "붙여넣기 입력",
  MIGRATION: "기존 데이터 이관",
};

export const ABSENCE_CATEGORY_LABEL: Record<AbsenceCategory, string> = {
  MILITARY: "군입대",
  MEDICAL: "병원",
  FAMILY: "경조사",
  OTHER: "기타",
};

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  WARNING_1: "1차 경고",
  WARNING_2: "2차 경고",
  DROPOUT: "탈락",
  ABSENCE_NOTE: "사유서",
  POINT: "포인트 지급",
  NOTICE: "일반 공지",
  SCORE_DEADLINE: "성적 입력 마감",};

export const NOTICE_TARGET_LABEL: Record<NoticeTargetType, string> = {
  ALL: "전체",
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
};

export const ADMIN_MEMO_STATUS_LABEL: Record<AdminMemoStatus, string> = {
  OPEN: "해야 할 일",
  IN_PROGRESS: "진행 중",
  DONE: "완료",
};

export const ADMIN_MEMO_SCOPE_LABEL: Record<AdminMemoScope, string> = {
  PRIVATE: "개인 메모",
  TEAM: "공용 메모",
};

export const ADMIN_MEMO_COLOR_LABEL: Record<AdminMemoColor, string> = {
  SAND: "샌드",
  MINT: "민트",
  SKY: "스카이",
  ROSE: "로즈",
  SLATE: "슬레이트",
};

export type NavItem = {
  href: string;
  label: string;
  description: string;
  minRole: AdminRole;
  group: string;
};

export const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    href: "/admin",
    label: "대시보드",
    description: "오늘의 시험, 경고 및 탈락, 미처리 알림 요약",
    minRole: AdminRole.VIEWER,
    group: "메인",
  },
  {
    href: "/admin/analytics",
    label: "성적 종합 분석",
    description: "일간, 주간, 과목별 개인 분석 차트",
    minRole: AdminRole.VIEWER,
    group: "메인",
  },
  {
    href: "/admin/students/analyze",
    label: "학생 누적 성적",
    description: "학생 검색으로 전체 기간 누적 성적과 취약 유형 조회",
    minRole: AdminRole.VIEWER,
    group: "메인",
  },
  {
    href: "/admin/students/compare",
    label: "학생 비교 분석",
    description: "두 학생의 기간별 성적과 출결 지표를 같은 기준으로 비교",
    minRole: AdminRole.VIEWER,
    group: "메인",
  },  {
    href: "/admin/periods",
    label: "시험 등록",
    description: "기간 생성, 회차 자동 생성, 취소 및 수정 관리",
    minRole: AdminRole.TEACHER,
    group: "학사 관리",
  },
  {
    href: "/admin/students",
    label: "전체 명단 관리",
    description: "명단 조회, CRUD, 붙여넣기 등록",
    minRole: AdminRole.TEACHER,
    group: "학사 관리",
  },
  {
    href: "/admin/students/transfer",
    label: "수험번호 이전",
    description: "잘못 등록된 수험번호의 연결 데이터를 새 번호로 이전",
    minRole: AdminRole.TEACHER,
    group: "학사 관리",
  },
  {
    href: "/admin/students/merge",
    label: "학생 병합",
    description: "중복 등록된 학생 계정의 연결 데이터를 하나로 병합",
    minRole: AdminRole.TEACHER,
    group: "학사 관리",
  },
  {
    href: "/admin/counseling",
    label: "학생 면담",
    description: "면담 기록, 목표 점수, 최근 4주 요약",
    minRole: AdminRole.TEACHER,
    group: "학사 관리",
  },
  {
    href: "/admin/absence-notes",
    label: "사유서 관리",
    description: "사유 결시 등록, 승인 및 반려, 소급 처리",
    minRole: AdminRole.TEACHER,
    group: "학사 관리",
  },
  {
    href: "/admin/scores/input",
    label: "성적 업로드",
    description: "오프라인, 온라인, 붙여넣기 업로드",
    minRole: AdminRole.TEACHER,
    group: "성적 관리",
  },
  {
    href: "/admin/scores/edit",
    label: "성적 수정",
    description: "회차별 성적 조회, 수정, 삭제",
    minRole: AdminRole.TEACHER,
    group: "성적 관리",
  },
  {
    href: "/admin/attendance/calendar",
    label: "출결 캘린더",
    description: "날짜별 경고, 결시, 탈락 현황",
    minRole: AdminRole.VIEWER,
    group: "성적 관리",
  },
  {
    href: "/admin/results/weekly",
    label: "주간 성적 현황",
    description: "주차별 전체 및 신규생 출감 집계",
    minRole: AdminRole.VIEWER,
    group: "성적 현황",
  },
  {
    href: "/admin/results/monthly",
    label: "월간 성적 현황",
    description: "월별 평균, 참여율, 결석 집계",
    minRole: AdminRole.VIEWER,
    group: "성적 현황",
  },
  {
    href: "/admin/results/integrated",
    label: "2개월 통합 현황",
    description: "기간 전체 통합 출감과 참여율",
    minRole: AdminRole.VIEWER,
    group: "성적 현황",
  },
  {
    href: "/admin/dropout",
    label: "경고·탈락 판정",
    description: "주 3회 및 월 8회 기준 자동 판정",
    minRole: AdminRole.VIEWER,
    group: "판정 관리",
  },
  {
    href: "/admin/points",
    label: "포인트 관리",
    description: "개근 포인트 산정 및 수동 지급",
    minRole: AdminRole.TEACHER,
    group: "판정 관리",
  },
  {
    href: "/admin/notices",
    label: "학생 공지",
    description: "학생 대상 공지 작성 및 발행",
    minRole: AdminRole.TEACHER,
    group: "알림·공지",
  },
  {
    href: "/admin/memos",
    label: "운영 메모",
    description: "관리자·직원 협업 메모와 할 일 보드",
    minRole: AdminRole.TEACHER,
    group: "알림·공지",
  },
  {
    href: "/admin/notifications",
    label: "알림 발송",
    description: "자동 및 수동 발송, 수신 동의, 발송 이력",
    minRole: AdminRole.TEACHER,
    group: "알림·공지",
  },
  {
    href: "/admin/query",
    label: "교차표 조회",
    description: "날짜별 과목별 수강생 집계 통합 조회",
    minRole: AdminRole.VIEWER,
    group: "시스템 도구",
  },
  {
    href: "/admin/export",
    label: "데이터 내보내기",
    description: "수강생 명단과 raw 성적 다운로드",
    minRole: AdminRole.VIEWER,
    group: "시스템 도구",
  },
  {
    href: "/admin/migration",
    label: "레거시 데이터 이관",
    description: "기존 운영 데이터 파일 이관",
    minRole: AdminRole.SUPER_ADMIN,
    group: "시스템 도구",
  },
  {
    href: "/admin/audit-log",
    label: "운영 감사 로그",
    description: "관리자 작업 이력 추적",
    minRole: AdminRole.SUPER_ADMIN,
    group: "시스템 도구",
  },
  {
    href: "/admin/settings/accounts",
    label: "관리자 계정",
    description: "Supabase Auth 연동 계정 관리",
    minRole: AdminRole.SUPER_ADMIN,
    group: "설정",
  },
  {
    href: "/admin/settings/absence-policies",
    label: "사유 정책",
    description: "사유별 출석 포함 및 개근 인정 기본값 관리",
    minRole: AdminRole.TEACHER,
    group: "설정",
  },
  {
    href: "/admin/settings/notifications",
    label: "SMS 알림 설정",
    description: "Solapi 키와 발신 번호 설정",
    minRole: AdminRole.SUPER_ADMIN,
    group: "설정",
  },
];

export const STUDENT_MIGRATION_FIELDS = [
  { key: "examNumber", label: "수험번호", required: true },
  { key: "name", label: "이름", required: true },
  { key: "phone", label: "연락처", required: false },
  { key: "generation", label: "기수", required: false },
  { key: "className", label: "반", required: false },
  { key: "registeredAt", label: "등록일", required: false },
  { key: "onlineId", label: "온라인 ID", required: false },
  { key: "note", label: "메모", required: false },
] as const;

export type StudentMigrationFieldKey =
  (typeof STUDENT_MIGRATION_FIELDS)[number]["key"];

export const STUDENT_PASTE_FIELDS = [
  { key: "examNumber", label: "수험번호" },
  { key: "name", label: "이름" },
  { key: "phone", label: "연락처" },
  { key: "generation", label: "기수" },
  { key: "className", label: "반" },
  { key: "registeredAt", label: "등록일" },
] as const;

export type StudentPasteFieldKey =
  (typeof STUDENT_PASTE_FIELDS)[number]["key"];

export const DUPLICATE_STRATEGY_LABEL = {
  UPDATE: "업데이트",
  SKIP: "건너뛰기",
  OVERWRITE: "덮어쓰기",
} as const;



