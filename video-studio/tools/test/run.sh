#!/usr/bin/env bash
# 작업실 서버 자체 시험 (외부 API는 모두 가짜 응답) — Cloudflare 배포본과 같은 방식으로 빌드
set -e
cd "$(dirname "$0")"
node ../../build.mjs >/dev/null
sed "s#import('pdf-parse/lib/pdf-parse.js')#Promise.resolve(null)#" ../../deploy/worker.js > w.mjs
node worker.test.mjs
