from PIL import Image
W,H=40,18
g=[['.']*W for _ in range(H)]
def r(x0,y0,x1,y1,c):
    for y in range(y0,y1+1):
        for x in range(x0,x1+1):
            if 0<=x<W and 0<=y<H: g[y][x]=c
# rear body: angled butt
r(1,6,25,11,'m'); r(0,7,0,11,'d'); r(1,6,25,6,'l'); r(1,11,25,11,'d'); r(0,11,6,12,'d')
# handguard
r(26,7,33,10,'m'); r(26,7,33,7,'l'); r(26,10,33,10,'d')
# barrel + muzzle
r(34,8,37,9,'d'); r(34,8,37,8,'m'); r(38,7,39,10,'d')
# optic rail + scope
r(12,5,23,5,'d'); r(13,2,22,4,'d'); r(14,2,21,2,'m'); r(12,3,12,3,'b'); r(23,3,23,3,'b')
# ejection port
r(15,8,18,8,'b')
# magazine (behind the grip, slanted)
r(8,12,11,14,'d'); r(9,15,12,16,'d'); r(9,12,10,14,'m'); r(10,15,10,15,'m')
# trigger guard loop
r(15,12,19,12,'d'); r(15,13,15,14,'d'); r(15,15,19,15,'d'); r(18,13,18,13,'b')
# pistol grip
r(20,12,22,16,'d'); r(21,13,21,15,'m'); r(21,17,23,17,'d')
pal={'d':(62,67,76),'m':(106,113,125),'l':(172,179,190),'b':(217,164,65),'k':(14,15,17)}
o=[row[:] for row in g]
for y in range(H):
    for x in range(W):
        if g[y][x]=='.':
            if any(0<=x+dx<W and 0<=y+dy<H and g[y+dy][x+dx]!='.' for dx,dy in((1,0),(-1,0),(0,1),(0,-1))): o[y][x]='k'
im=Image.new('RGBA',(W,H),(0,0,0,0))
for y in range(H):
    for x in range(W):
        if o[y][x]!='.': im.putpixel((x,y),pal[o[y][x]]+(255,))
im.save('gun.png')
rects=[]
for y in range(H):
    x=0
    while x<W:
        c=o[y][x]
        if c=='.': x+=1; continue
        s=x
        while x<W and o[y][x]==c: x+=1
        rects.append(f'<rect x="{s}" y="{y}" width="{x-s}" height="1" fill="#%02x%02x%02x"/>'%pal[c])
open('gun.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" shape-rendering="crispEdges">'+''.join(rects)+'</svg>')
# icons: graphite tile, gun centered, nearest scaling
def icon(S, frac, tile=True):
    c=Image.new('RGBA',(S,S),(0,0,0,0))
    if tile:
        from PIL import ImageDraw
        big=Image.new('RGBA',(S*4,S*4),(0,0,0,0)); ImageDraw.Draw(big).rounded_rectangle([S*0.24,S*0.24,S*3.76,S*3.76],radius=S*0.8,fill=(27,28,32,255))
        c=big.resize((S,S),Image.LANCZOS)
    k=max(1,int(S*frac/W)); gi=im.resize((W*k,H*k),Image.NEAREST)
    c.alpha_composite(gi,((S-gi.width)//2,(S-gi.height)//2)); return c
icon(512,0.80).save('icon_preview.png')
import os
dens={'mdpi':1,'hdpi':1.5,'xhdpi':2,'xxhdpi':3,'xxxhdpi':4}
for d,m in dens.items():
    p=f'/home/claude/apk/proj/res/mipmap-{d}'; os.makedirs(p,exist_ok=True)
    icon(int(48*m),0.84).save(p+'/ic_launcher.png'); icon(int(108*m),0.62,tile=False).save(p+'/ic_fg.png')
print('ok')
