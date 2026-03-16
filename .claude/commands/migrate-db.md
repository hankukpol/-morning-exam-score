# DB 마이그레이션 실행

web/prisma/schema.prisma 변경 후 Supabase에 반영합니다.

## 실행 순서

**1단계: 스키마 검증**
```bash
cd web && npx prisma validate
```

**2단계: 마이그레이션 SQL 생성**
```bash
npx prisma migrate diff \
  --from-url $DATABASE_URL \
  --to-schema-datamodel prisma/schema.prisma \
  --script > /tmp/migration.sql
cat /tmp/migration.sql
```

**3단계: Supabase API로 실행**

환경변수에서 토큰을 읽어 Supabase Management API에 SQL을 실행합니다.
- Project ref: `psfsprodoedjjngldyzr`
- Endpoint: `POST https://api.supabase.com/v1/projects/psfsprodoedjjngldyzr/database/query`
- 인증: `sbp_67d96dd...` (SUPABASE_MANAGEMENT_TOKEN 환경변수)

**4단계: Prisma Client 재생성**
```bash
npx prisma generate
```

> ⚠️ IPv6 문제로 `prisma db push`는 이 PC에서 불가. 반드시 Management API 사용.
