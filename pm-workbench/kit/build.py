import json, re, sys
css = open('kit.css').read()
css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
css = '\n'.join(l.strip() for l in css.splitlines() if l.strip())
run = open('kit-run.js').read()
run = '\n'.join(l for l in run.splitlines() if not re.match(r'^\s*(//|/\*.*\*/\s*$)', l))
run = '\n'.join(l.strip() for l in run.splitlines() if l.strip())
def js(s):
    return json.dumps(s, ensure_ascii=False).replace('</', '<\\/').replace('<!--', '<\\!--')
src = open('kit-render.js').read()
src = src.replace("'__KIT_CSS__'", js(css)).replace("'__KIT_RUN__'", js(run))
assert '</script' not in src.lower() and '<!--' not in src, 'unsafe'
open('kit-render.built.js', 'w').write(src)
print('css', len(css), 'run', len(run), 'render', len(src))
