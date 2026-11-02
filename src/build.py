import pathlib
d=pathlib.Path(__file__).parent
t=(d/'template.html').read_text()
for k,f in (('/*CSS*/','style.css'),('/*XL*/','xlsx-lite.js'),('/*APP*/','app.js')):
    t=t.replace(k,(d/f).read_text())
(d.parent/'index.html').write_text(t)
print(len(t))
