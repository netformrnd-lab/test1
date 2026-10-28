# 고친 키트(렌더러+워크벤치 연결)를 워크벤치에 다시 넣는다. 끝 표시가 없으면 예전 끝(링크 목록 함수)까지 바꾼다
P = '../pm-workbench.html'
s = open(P).read()
a = s.index('/* 디자인 키트: AI는 페이지 나누기')
m = '/* 디자인 키트 끝 */\n'
if m in s[a:]: b = s.index(m, a) + len(m)
else:
    e = ".join('')}</ul></div>`;\n}\n"
    b = s.index(e, s.index('function xsLinksHTML(run, canW){', a)) + len(e)
kit = open('kit-render.built.js').read().rstrip() + '\n' + open('kit-wb.js').read().rstrip() + '\n'
s = s[:a] + kit + s[b:]
open(P, 'w').write(s)
print('reinjected', len(s), s.count('function xsLinksHTML'), s.count('/* 디자인 키트 끝 */'))
