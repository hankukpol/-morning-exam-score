import {
  AdminRole,
  AbsenceCategory,
  AttendType,
  ExamType,
  NoticeTargetType,
  NotificationType,
  ScoreSource,
  StudentType,
  Subject,
} from "@/generated/prisma";

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
  CUMULATIVE: "누적 모의고사",
  CRIMINAL_LAW: "형법",
};

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
  NORMAL: "현장",
  LIVE: "온라인",
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
  POINT: "포인트 지급",
  NOTICE: "일반 공지",
};

export const NOTICE_TARGET_LABEL: Record<NoticeTargetType, string> = {
  ALL: "전체",
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
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
    description: "오늘 시험, 경고/탈락, 미처리 알림 요약",
    minRole: AdminRole.VIEWER,
    group: "메인",
  },
  {
    href: "/admin/analytics",
    label: "성적 종합 분석",
    description: "일일, 월간, 과목별 개인 분석 차트",
    minRole: AdminRole.VIEWER,
    group: "메인",
  },
  {
    href: "/admin/students/analyze",
    label: "학생 누적 성적 분석",
    description: "학생 검색으로 전체 기간 누적 성적과 취약 유형을 조회",
    minRole: AdminRole.VIEWER,
    group: "메인",
  },
  {
    href: "/admin/periods",
    label: "시험 기간 관리",
    description: "기간 생성, 세션 자동 생성, 취소/연기 관리",
    minRole: AdminRole.TEACHER,
    group: "학사 관리",
  },
  {
    href: "/admin/students",
    label: "수강생 명단",
    description: "명단 조회, CRUD, 붙여넣기 등록",
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
    label: "사유서 심사",
    description: "사유 결시 등록, 승인/반려, 소급 처리",
    minRole: AdminRole.TEACHER,
    group: "학사 관리",
  },
  {
    href: "/admin/scores/input",
    label: "성적 입력 (업로드)",
    description: "오프라인, 온라인, 붙여넣기 업로드",
    minRole: AdminRole.TEACHER,
    group: "성적 및 통계",
  },
  {
    href: "/admin/scores/edit",
    label: "성적 수정",
    description: "세션별 성적 조회, 수정, 삭제",
    minRole: AdminRole.TEACHER,
    group: "성적 및 통계",
  },
  {
    href: "/admin/attendance/calendar",
    label: "출결 캘린더",
    description: "날짜별 경고, 결시, 탈락 현황",
    minRole: AdminRole.VIEWER,
    group: "성적 및 통계",
  },
  {
    href: "/admin/results/weekly",
    label: "주간 성적/석차",
    description: "주차별 전체와 신규자 석차 집계",
    minRole: AdminRole.VIEWER,
    group: "성적/석차 표",
  },
  {
    href: "/admin/results/monthly",
    label: "월간 성적/석차",
    description: "월별 평균, 참여율, 결석 집계",
    minRole: AdminRole.VIEWER,
    group: "성적/석차 표",
  },
  {
    href: "/admin/results/integrated",
    label: "통합 2개월 성적",
    description: "기간 전체 통합 석차와 참여율",
    minRole: AdminRole.VIEWER,
    group: "성적/석차 표",
  },
  {
    href: "/admin/dropout",
    label: "탈락/경고 판정",
    description: "주 3회, 월 8회 기준 자동 판정",
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
    label: "공지사항",
    description: "학생 대상 공지 작성 및 발행",
    minRole: AdminRole.TEACHER,
    group: "알림 및 소통",
  },
  {
    href: "/admin/notifications",
    label: "알림 발송",
    description: "자동 및 수동 발송, 수신 동의, 발송 이력",
    minRole: AdminRole.TEACHER,
    group: "알림 및 소통",
  },
  {
    href: "/admin/query",
    label: "다차원 데이터 조회",
    description: "날짜별, 과목별, 수강생별 통합 조회",
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
    label: "구 시스템 파일 이전",
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
    description: "Supabase Auth 역할 연결",
    minRole: AdminRole.SUPER_ADMIN,
    group: "설정",
  },
  {
    href: "/admin/settings/notifications",
    label: "알림 연동 설정",
    description: "Solapi 키와 발신번호 설정",
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
