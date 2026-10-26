#!/bin/bash
# 세션 시작 시 'main 최신화' 자동화.
# 클라우드 세션(Claude Code web)에서만, 작업 브랜치에 origin/main 을 병합해
# 운영팀이 올린 최신 변경을 반영한 상태로 수정이 시작되게 한다.
# (수정 전 메인 최신화 규칙을 사람이 잊어도 자동 보장)
set -uo pipefail

# 로컬에서 직접 git 다루는 환경에서는 건드리지 않음 (클라우드 세션만)
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then exit 0; fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}" 2>/dev/null || exit 0

cur="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo)"
if [ -z "$cur" ] || [ "$cur" = "main" ]; then
  echo "[main-sync] 현재 브랜치 '$cur' — 스킵"
  exit 0
fi

if ! git fetch origin main --quiet 2>/dev/null; then
  echo "[main-sync] origin/main fetch 실패(네트워크?) — 스킵. 필요하면 'git fetch origin main' 수동 실행"
  exit 0
fi

behind="$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)"
if [ "${behind:-0}" = "0" ]; then
  echo "[main-sync] 이미 origin/main 최신 반영됨 (브랜치 '$cur')"
  exit 0
fi

if git merge --no-edit origin/main >/dev/null 2>&1; then
  echo "[main-sync] ✅ origin/main 커밋 ${behind}개를 '$cur' 에 병합 완료 — 최신 상태에서 작업하세요"
else
  git merge --abort >/dev/null 2>&1 || true
  echo "[main-sync] ⚠️ origin/main 병합 중 충돌 발생 — 자동 중단함. 'git merge origin/main' 로 수동 해결 필요"
fi
exit 0
