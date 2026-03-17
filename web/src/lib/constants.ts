import {
  AdminRole,
  AdminMemoColor,
  AdminMemoScope,
  AdminMemoStatus,
  AbsenceCategory,
  AttendType,
  AttendSource,
  ParseMatchStatus,
  ExamType,
  NoticeTargetType,
  NotificationType,
  ScoreSource,
  StudentType,
  Subject,
  ExamCategory,
  CourseType,
  EnrollmentStatus,
  EnrollSource,
  PaymentCategory,
  PaymentMethod,
  PaymentStatus,
  LockerZone,
  LockerStatus,
  RentalStatus,
  BookingStatus,
  PassType,
} from "@prisma/client";

export const ROLE_LEVEL: Record<AdminRole, number> = {
  VIEWER: 0,
  TEACHER: 1,
  COUNSELOR: 2,
  ACADEMIC_ADMIN: 3,
  MANAGER: 4,
  DEPUTY_DIRECTOR: 5,
  DIRECTOR: 6,
  SUPER_ADMIN: 7,
};

export const ROLE_LABEL: Record<AdminRole, string> = {
  VIEWER: "조회 전용",
  TEACHER: "강사",
  COUNSELOR: "상담",
  ACADEMIC_ADMIN: "교무행정",
  MANAGER: "실장",
  DEPUTY_DIRECTOR: "부원장",
  DIRECTOR: "원장",
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
  SCORE_DEADLINE: "성적 입력 마감",
  ENROLLMENT_COMPLETE: "수강 등록 완료",
  PAYMENT_COMPLETE: "수납 완료",
  REFUND_COMPLETE: "환불 완료",
};

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
    href: "/admin/enrollments",
    label: "수강 관리",
    description: "수강 등록, 상태 변경, 퇴원, 휴원 처리",
    minRole: AdminRole.COUNSELOR,
    group: "수강 관리",
  },
  {
    href: "/admin/enrollments/new",
    label: "수강 등록",
    description: "신규 수강 등록 (종합반 / 특강 단과)",
    minRole: AdminRole.COUNSELOR,
    group: "수강 관리",
  },
  {
    href: "/admin/payments",
    label: "수납 이력",
    description: "수납 처리 내역 조회 및 검색",
    minRole: AdminRole.COUNSELOR,
    group: "수강 관리",
  },
  {
    href: "/admin/payments/new",
    label: "수납 등록",
    description: "현금·이체 수납 등록 (수강료·교재·시설비)",
    minRole: AdminRole.COUNSELOR,
    group: "수강 관리",
  },
  {
    href: "/admin/settlements/daily",
    label: "일계표",
    description: "일별 수납 집계 및 현금 시재 마감 처리",
    minRole: AdminRole.COUNSELOR,
    group: "수강 관리",
  },
  {
    href: "/admin/settlements/monthly",
    label: "월계표",
    description: "월별 수납 집계 및 일별 수납 추이 조회",
    minRole: AdminRole.COUNSELOR,
    group: "수강 관리",
  },
  {
    href: "/admin/payments/links",
    label: "결제 링크",
    description: "온라인 결제 링크 생성·관리 (카카오톡·문자 전송용)",
    minRole: AdminRole.COUNSELOR,
    group: "수강 관리",
  },
  {
    href: "/admin/payments/unpaid",
    label: "미납 관리",
    description: "미납·부분납 수강생 조회 및 수납 처리 연결",
    minRole: AdminRole.COUNSELOR,
    group: "수강 관리",
  },
  {
    href: "/admin/payments/installments",
    label: "할부 관리",
    description: "분할납부 회차별 납부 현황 조회 및 납부 처리",
    minRole: AdminRole.COUNSELOR,
    group: "수강 관리",
  },
  {
    href: "/admin/payments/refunds",
    label: "환불 대기",
    description: "승인 대기 중인 환불 요청 검토 및 승인·거절 처리",
    minRole: AdminRole.MANAGER,
    group: "수강 관리",
  },
  {
    href: "/admin/enrollments/ledger",
    label: "수강대장",
    description: "기수·기간별 수강생 명단 조회 및 출력 (학원법 준수)",
    minRole: AdminRole.COUNSELOR,
    group: "수강 관리",
  },
  {
    href: "/admin/settlements/instructors",
    label: "강사 정산",
    description: "특강 강사별 수강료 배분 및 정산 현황",
    minRole: AdminRole.MANAGER,
    group: "수강 관리",
  },
  {
    href: "/admin/reports/monthly",
    label: "월간 운영 보고서",
    description: "수강생·수납·환불·출결·강사 정산 통합 월간 요약",
    minRole: AdminRole.MANAGER,
    group: "수강 관리",
  },
  {
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
    href: "/admin/classrooms",
    label: "담임반 관리",
    description: "담임반 학생 편성, 카카오톡 출석 파싱, 일별 출결 기록",
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
    href: "/admin/counseling/prospects",
    label: "상담 방문자",
    description: "미등록 예비 원생 상담 단계 관리 및 전환율 추적",
    minRole: AdminRole.COUNSELOR,
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
    href: "/admin/graduates",
    label: "합격자 관리",
    description: "필기합격·최종합격 등록 및 합격자 성적 기록 관리",
    minRole: AdminRole.TEACHER,
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
    href: "/admin/points/manage",
    label: "포인트 직접 관리",
    description: "학생 포인트 수동 지급 및 차감",
    minRole: AdminRole.MANAGER,
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
    href: "/admin/audit-logs",
    label: "감사 로그",
    description: "모든 중요 작업의 기록 조회 및 필터링",
    minRole: AdminRole.MANAGER,
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
  {
    href: "/admin/settings/courses",
    label: "강좌 마스터",
    description: "종합반·단과·특강 강좌 등록 및 수강료 관리",
    minRole: AdminRole.MANAGER,
    group: "설정",
  },
  {
    href: "/admin/settings/textbooks",
    label: "교재 관리",
    description: "교재 정보 및 재고 관리",
    minRole: AdminRole.MANAGER,
    group: "설정",
  },
  {
    href: "/admin/settings/comprehensive-products",
    label: "종합반 상품",
    description: "수험 유형별 수강 기간·수강료 상품 관리",
    minRole: AdminRole.MANAGER,
    group: "설정",
  },
  {
    href: "/admin/settings/cohorts",
    label: "기수 관리",
    description: "수험 유형별 기수(期數) 등록 및 기간 설정",
    minRole: AdminRole.MANAGER,
    group: "설정",
  },
  {
    href: "/admin/settings/staff",
    label: "직원 관리",
    description: "직원 계정 권한 역할 및 연락처 관리",
    minRole: AdminRole.MANAGER,
    group: "설정",
  },
  {
    href: "/admin/settings/instructors",
    label: "강사 관리",
    description: "강사 정보 및 정산 계좌 관리",
    minRole: AdminRole.MANAGER,
    group: "설정",
  },
  {
    href: "/admin/settings/special-lectures",
    label: "특강 단과",
    description: "특강·단과 강좌 등록, 과목별 강사·수강료·배분율 설정",
    minRole: AdminRole.MANAGER,
    group: "설정",
  },
  {
    href: "/admin/settings/point-policies",
    label: "포인트 정책",
    description: "포인트 지급 제도 템플릿 관리",
    minRole: AdminRole.ACADEMIC_ADMIN,
    group: "설정",
  },
  {
    href: "/admin/settings/academy",
    label: "학원 기본정보",
    description: "학원명, 원장, 사업자번호 등 기본 정보 설정",
    minRole: AdminRole.MANAGER,
    group: "설정",
  },
  {
    href: "/admin/settings/civil-exams",
    label: "공무원 시험 일정",
    description: "공채·경채 시험 일정 등록 및 관리",
    minRole: AdminRole.MANAGER,
    group: "설정",
  },
  {
    href: "/admin/settings/study-rooms",
    label: "스터디룸 설정",
    description: "스터디룸 목록 등록 및 관리",
    minRole: AdminRole.MANAGER,
    group: "설정",
  },
  {
    href: "/admin/settings/lockers",
    label: "사물함 초기 설정",
    description: "사물함 구역별 일괄 생성 및 관리",
    minRole: AdminRole.MANAGER,
    group: "설정",
  },
  {
    href: "/admin/settings/discount-codes",
    label: "할인 코드 관리",
    description: "추천인·입소·캠페인 할인 코드 발급 및 관리",
    minRole: AdminRole.MANAGER,
    group: "설정",
  },
  {
    href: "/admin/lockers",
    label: "사물함",
    description: "구역별 사물함 현황 조회, 배정·반납 처리",
    minRole: AdminRole.TEACHER,
    group: "시설 관리",
  },
  {
    href: "/admin/facilities/lockers",
    label: "사물함 관리",
    description: "사물함 배정, 대여 기록, 현황 조회",
    minRole: AdminRole.ACADEMIC_ADMIN,
    group: "시설 관리",
  },
  {
    href: "/admin/study-rooms",
    label: "스터디룸 관리",
    description: "날짜별 스터디룸 예약 현황 및 직원 배정",
    minRole: AdminRole.TEACHER,
    group: "시설 관리",
  },
  {
    href: "/admin/facilities/textbooks",
    label: "교재 판매",
    description: "교재 현장 판매 등록 및 오늘 판매 내역 조회",
    minRole: AdminRole.ACADEMIC_ADMIN,
    group: "시설 관리",
  },
];

export const PAYMENT_CATEGORY_LABEL: Record<PaymentCategory, string> = {
  TUITION: "수강료",
  FACILITY: "시설비",
  TEXTBOOK: "교재",
  MATERIAL: "교구·소모품",
  SINGLE_COURSE: "단과 POS",
  PENALTY: "위약금",
  ETC: "기타",
};

export const PAYMENT_CATEGORY_COLOR: Record<PaymentCategory, string> = {
  TUITION: "border-forest/30 bg-forest/10 text-forest",
  FACILITY: "border-sky-200 bg-sky-50 text-sky-800",
  TEXTBOOK: "border-amber-200 bg-amber-50 text-amber-800",
  MATERIAL: "border-purple-200 bg-purple-50 text-purple-800",
  SINGLE_COURSE: "border-ember/30 bg-ember/10 text-ember",
  PENALTY: "border-red-200 bg-red-50 text-red-700",
  ETC: "border-ink/20 bg-ink/5 text-slate",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "현금",
  CARD: "카드",
  TRANSFER: "계좌이체",
  POINT: "포인트",
  MIXED: "혼합",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: "처리 중",
  APPROVED: "완납",
  PARTIAL_REFUNDED: "부분 환불",
  FULLY_REFUNDED: "전액 환불",
  CANCELLED: "취소",
};

export const PAYMENT_STATUS_COLOR: Record<PaymentStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  APPROVED: "border-forest/30 bg-forest/10 text-forest",
  PARTIAL_REFUNDED: "border-orange-200 bg-orange-50 text-orange-700",
  FULLY_REFUNDED: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-ink/20 bg-ink/5 text-slate",
};

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

export const EXAM_CATEGORY_LABEL: Record<ExamCategory, string> = {
  GONGCHAE: "공채",
  GYEONGCHAE: "경채",
  SOGANG: "소방",
  CUSTOM: "기타",
};

export const COURSE_TYPE_LABEL: Record<CourseType, string> = {
  COMPREHENSIVE: "종합반",
  SPECIAL_LECTURE: "특강 단과",
};

export const ENROLLMENT_STATUS_LABEL: Record<EnrollmentStatus, string> = {
  PENDING: "신청",
  ACTIVE: "수강 중",
  WAITING: "대기",
  SUSPENDED: "휴원",
  COMPLETED: "수강 완료",
  WITHDRAWN: "퇴원",
  CANCELLED: "취소",
};

export const ENROLLMENT_STATUS_COLOR: Record<EnrollmentStatus, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-800",
  ACTIVE: "border-forest/30 bg-forest/10 text-forest",
  WAITING: "border-sky-200 bg-sky-50 text-sky-800",
  SUSPENDED: "border-purple-200 bg-purple-50 text-purple-800",
  COMPLETED: "border-ink/20 bg-ink/5 text-ink",
  WITHDRAWN: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-ink/20 bg-ink/5 text-slate",
};

export const ENROLL_SOURCE_LABEL: Record<EnrollSource, string> = {
  VISIT: "방문",
  PHONE: "전화",
  ONLINE: "온라인",
  REFERRAL: "소개",
  SNS: "SNS",
  OTHER: "기타",
};

export const DUPLICATE_STRATEGY_LABEL = {
  UPDATE: "업데이트",
  SKIP: "건너뛰기",
  OVERWRITE: "덮어쓰기",
} as const;

export const ATTEND_SOURCE_LABEL: Record<AttendSource, string> = {
  KAKAO_PARSE: "카카오톡 파싱",
  MANUAL: "수기 입력",
  IMPORT: "일괄 가져오기",
};

export const PARSE_MATCH_STATUS_LABEL: Record<ParseMatchStatus, string> = {
  MATCHED: "매칭 성공",
  UNMATCHED: "매칭 실패",
  AMBIGUOUS: "동명이인",
};

export const LOCKER_ZONE_LABEL: Record<LockerZone, string> = {
  CLASS_ROOM: "1강의실 방향",
  JIDEOK_LEFT: "지덕 좌",
  JIDEOK_RIGHT: "지덕 우",
};

export const LOCKER_STATUS_LABEL: Record<LockerStatus, string> = {
  AVAILABLE: "사용 가능",
  IN_USE: "사용 중",
  RESERVED: "예약됨",
  BROKEN: "고장",
  BLOCKED: "사용 불가",
};

export const LOCKER_STATUS_COLOR: Record<LockerStatus, string> = {
  AVAILABLE: "bg-forest/10 border-forest/30 text-forest",
  IN_USE: "bg-ember/10 border-ember/30 text-ember",
  RESERVED: "bg-amber-50 border-amber-200 text-amber-800",
  BROKEN: "bg-red-50 border-red-200 text-red-700",
  BLOCKED: "bg-ink/5 border-ink/20 text-slate",
};

export const RENTAL_STATUS_LABEL: Record<RentalStatus, string> = {
  ACTIVE: "대여 중",
  RETURNED: "반납 완료",
  EXPIRED: "기간 만료",
  CANCELLED: "취소",
};

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  CONFIRMED: "확정",
  CANCELLED: "취소",
  NOSHOW: "노쇼",
};

export const PASS_TYPE_LABEL: Record<PassType, string> = {
  WRITTEN_PASS: "필기합격",
  FINAL_PASS: "최종합격",
  APPOINTED: "임용",
  WRITTEN_FAIL: "필기불합격",
  FINAL_FAIL: "최종불합격",
};

export const PASS_TYPE_COLOR: Record<PassType, string> = {
  WRITTEN_PASS: "bg-sky-50 text-sky-700 border-sky-200",
  FINAL_PASS: "bg-forest/10 text-forest border-forest/20",
  APPOINTED: "bg-amber-50 text-amber-700 border-amber-200",
  WRITTEN_FAIL: "bg-ink/5 text-slate border-ink/10",
  FINAL_FAIL: "bg-red-50 text-red-600 border-red-200",
};



