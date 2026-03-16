# 배포 실행

현재 브랜치를 빌드하고 배포합니다.

## 사전 확인

```bash
cd web
npm run build  # 빌드 오류 확인
```

## 배포

```bash
cd "d:/앱 프로그램/아침모의고사 성적,출결관리"
./deploy.bat
```

## 배포 후 확인

```bash
# 최근 커밋 확인
git log --oneline -5

# 빌드 결과 확인
cat run-local-dev.log | tail -20
```

> 배포는 main 브랜치에서만 진행합니다.
