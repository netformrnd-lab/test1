-- 영상 제작 작업실(video-studio) 테이블
-- Supabase SQL Editor 에서 한 번 실행하세요.
--
-- · 모든 테이블은 RLS 를 켜고 정책을 두지 않습니다 → 브라우저(anon/로그인 사용자)는 직접 읽기·쓰기 불가.
--   오직 Worker 가 service_role 키로만 접근합니다. (API 키 암호문이 화면으로 새지 않게)
-- · API 키는 Worker 가 AES-GCM 으로 암호화해 cipher/iv 로만 저장합니다(평문 저장 안 함).

create extension if not exists pgcrypto;

-- 서비스 연결(Claude / OpenAI / HeyGen)
create table if not exists studio_secrets (
  provider    text primary key check (provider in ('claude','openai','heygen')),
  cipher      text not null,
  iv          text not null,
  model       text not null default '',
  checked_at  timestamptz,
  updated_at  timestamptz not null default now()
);

-- 아바타·음성·동의·하루 제한 (한 줄만 사용: id=1)
create table if not exists studio_settings (
  id          int primary key default 1 check (id = 1),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- 브랜드 자료실(영상 근거 자료)
create table if not exists studio_sources (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  provenance  text not null,
  content     text not null,
  approved    boolean not null default false,
  created_by  uuid,
  created_at  timestamptz not null default now()
);

-- 제작 작업 (진행 단계·대본·검수·영상 결과는 data jsonb 에 보관)
create table if not exists studio_jobs (
  id            uuid primary key default gen_random_uuid(),
  request_id    text unique not null,
  status        text not null default 'queued',
  step          int  not null default 0,
  revision      int  not null default 0,
  input         jsonb not null,
  data          jsonb not null default '{}'::jsonb,
  locked_until  timestamptz,
  created_by    uuid,
  created_at    timestamptz not null default now()
);
create index if not exists studio_jobs_created_idx on studio_jobs (created_at desc);

alter table studio_secrets  enable row level security;
alter table studio_settings enable row level security;
alter table studio_sources  enable row level security;
alter table studio_jobs     enable row level security;
-- (정책 없음 = service_role 외 접근 불가)

-- 완료! 다음: video-studio 폴더를 Cloudflare Pages 로 배포하고 환경변수 3개를 넣으세요 (README.md 참고).
