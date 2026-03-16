# 한국경찰학원 통합 관리 시스템 — Claude Code 가이드

## 프로젝트 구조

```
/                    ← 프로젝트 루트
├── web/             ← Next.js 14 App Router 앱
│   ├── prisma/schema.prisma
│   ├── src/app/admin/   ← 관리자 페이지
│   ├── src/app/api/     ← API 라우트
│   ├── src/lib/         ← 서비스 로직
│   └── src/components/  ← 컴포넌트
└── 개발계획/         ← PRD 문서 (읽기만, 수정 금지)
```

## 필수 PRD 참조 순서

모든 작업 전에 반드시 읽어야 하는 문서:
1. `개발계획/00_개발공통룰.md` — 코딩 규칙 (최우선 준수)
2. `개발계획/01_마스터플랜.md` — DB 스키마(§11), 개발 로드맵(§12)
3. 해당 기능 PRD (예: `개발계획/03_수강관리_PRD.md`)

## 핵심 비즈니스 규칙

### 학생 4대 데이터 (절대 규칙)
모든 화면에서 반드시 표시:
- `examNumber` — 학번 (시스템 전체 PK, 학원 자동채번)
- `name` — 이름
- `mobile` — 연락처 (DB 필드명 주의: `phone` → `mobile` 별칭 사용)
- `enrollments[]` — 수강내역

학생명/학번 클릭 → `/admin/students/[examNumber]` 이동 필수

### 인증
```typescript
import { getAdminSession } from '@/lib/auth'
const session = await getAdminSession()
if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
```

### API 응답 형식
```typescript
// 성공
return Response.json({ data: result })
// 오류
return Response.json({ error: '메시지' }, { status: 400 })
```

### DB 접근
```typescript
import { prisma } from '@/lib/prisma'
// Prisma ORM만 사용 — raw SQL 금지
```

## 기술 스택

- **Framework**: Next.js 14 App Router, TypeScript strict
- **DB**: PostgreSQL (Supabase), Prisma 6 ORM
- **Auth**: Supabase Auth (`@/lib/auth.ts`)
- **UI**: TailwindCSS, Radix UI
- **색상**: ember(`#C55A11`) 주 액션, forest(`#1F4D3A`) 헤더

## DB 마이그레이션 규칙

스키마 변경 → `/migrate-db` 스킬 사용 (Claude Code 전담):
```bash
# 1. schema.prisma 수정 후 검증
cd web && npx prisma validate

# 2. Supabase Management API로 실행
# POST https://api.supabase.com/v1/projects/psfsprodoedjjngldyzr/database/query
```
→ IPv6 문제로 `prisma db push` 불가. 반드시 Supabase API 사용.

## 수정 금지 파일 (외부 에이전트)

- `web/prisma/schema.prisma` → Claude Code 전담
- `web/src/lib/auth.ts`, `web/src/lib/prisma.ts` → Claude Code 전담
- `web/src/components/ui/*` → Claude Code 전담

## 개발 서버

```bash
cd web && npm run dev  # http://localhost:3000
```

## 학원 정보

- **학원명**: 한국경찰학원
- **주소**: 대구광역시 중구 중앙대로 390 센트럴엠빌딩
- **전화**: 053-241-0112
- **PG사**: 포트원(PortOne) + KSNET 갑(GAP)
- **오픈 목표**: 2026년 6월 이전
- **개발 우선순위**: ① 수강 등록+수납 → ② 성적·출결 → ③ 포털·시설
