# 새 모듈 생성 가이드

새로운 기능 모듈을 만들 때 필요한 파일 목록과 템플릿입니다.

## 생성할 파일 목록

```
web/src/
├── app/
│   ├── admin/[모듈명]/
│   │   ├── page.tsx              ← 목록 페이지 (Server Component)
│   │   ├── [id]/
│   │   │   └── page.tsx          ← 상세 페이지
│   │   └── new/
│   │       └── page.tsx          ← 등록 페이지
│   └── api/[모듈명]/
│       ├── route.ts              ← GET(목록), POST(등록)
│       └── [id]/
│           └── route.ts          ← GET, PATCH, DELETE
├── components/[모듈명]/
│   ├── [모듈명]-list.tsx         ← 목록 Client Component
│   ├── [모듈명]-form.tsx         ← 등록/수정 폼
│   └── [모듈명]-detail.tsx       ← 상세 뷰
└── lib/[모듈명]/
    └── service.ts                ← 비즈니스 로직
```

## 인증 체크 (모든 API에 필수)

```typescript
import { getAdminSession } from '@/lib/auth'
const session = await getAdminSession()
if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
```

## 학생 연동 (학생 관련 모듈 필수)

```typescript
// Prisma 조회 시 학생 정보 포함
const data = await prisma.someModel.findMany({
  include: {
    student: {
      select: { examNumber: true, name: true, phone: true }
    }
  }
})
```

## 참조 문서

- `개발계획/00_개발공통룰.md` (전체)
- `개발계획/01_마스터플랜.md` (§11 DB 스키마)
- 해당 기능 PRD 파일
