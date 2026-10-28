# 설명하기 코드만 바꾼다 (다음 묶음이 '구역 편집'이면 그 앞까지, 아니면 '디자인 키트' 앞까지)
P = '../pm-workbench.html'
s = open(P).read()
a = s.index('/* 설명하기: 팀장님께 확인받거나')
ends = [s.index(m, a) for m in ('/* 구역 편집:', '/* 디자인 키트: AI는 페이지 나누기') if m in s[a:]]
b = min(ends)
s = s[:a] + open('tell.js').read().rstrip() + '\n' + s[b:]
open(P, 'w').write(s); print('ok', s.count('const KE_LABEL'), s.count('const TELL_RULES'))
