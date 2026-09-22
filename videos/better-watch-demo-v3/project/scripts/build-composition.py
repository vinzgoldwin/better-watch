"""Build the approved A direction. index.html remains directly editable.

SVG drawings share the storyboard's native-screen proportions and original art.
Each visible unit has an ID, static hero geometry, and an entrance on the root
GSAP timeline. Scene-container dissolves handle all non-final departures.
"""
from pathlib import Path
import json
import shutil
import art as a

ROOT = Path(__file__).resolve().parent.parent
scenes = []
tweens = []


def unit(name, drawing, at, kind='rise', duration=.68):
    poses = {
        'rise': {'y':22}, 'left':{'x':-28}, 'right':{'x':32},
        'scale': {'scale':.93, 'transformOrigin':'50% 50%'},
        'ribbon': {'scale':.85,'rotation':-4,'transformOrigin':'50% 50%'},
        'fade': {}, 'line': {'scaleX':0,'transformOrigin':'0% 50%'},
    }
    ease = {'rise':'power3.out','left':'power2.out','right':'expo.out','scale':'sine.out','ribbon':'power3.out','fade':'sine.out','line':'power2.out'}[kind]
    # Titles settle after the previous title has dissolved, avoiding double text.
    title_starts = {'server-heading':4.6, 'server-copy':4.82, 'android-heading':10.6, 'ipad-heading':13.05, 'mac-heading':15.65, 'tv-heading':18.25, 'family-heading':20.85, 'local-heading':24.6, 'remote-heading':30.6}
    at = title_starts.get(name, at)
    config = {**poses[kind], 'opacity':0, 'duration':duration, 'ease':ease}
    tweens.append(f'tl.from("#{name}", {json.dumps(config)}, {at});')
    return f'<g id="{name}">{drawing}</g>'


def scene(name, start, end, contents, label):
    scenes.append({'id':name,'start':start,'end':end,'body':contents,'label':label})


def marker(name, start, x, y, length, travel, count):
    # Finite transform-only markers communicate actual movie-data direction.
    body = unit(name,a.dot(x,y,4.5),start,'fade',.35)
    tweens.append(f'tl.to("#{name}", {{x:{length},duration:{travel},ease:"none",repeat:{count-1}}}, {start+.35});')
    return body


# 0–4: Approved logo, brand, library glimpse.
b = unit('opening-ribbon',a.use('ribbon',58,130,173,173),.2,'ribbon',1.05)
b += unit('opening-title',a.text(58,467,'Better Watch',68,a.WHITE,700),.45,'left',.8)
b += unit('opening-mac',a.screen(334,69,560,'mac'),.72,'right',1.15)
tweens.append('tl.to("#opening-mac", {scale:1.022,transformOrigin:"50% 50%",duration:1.6,ease:"sine.inOut"}, 2.1);')
scene('opening',0,4,b,'Better Watch and a synthetic movie library')

# 4–10: Actual intended setup, never a measured uptime claim.
b = unit('server-heading',a.text(58,108,'Old computer. New purpose.',46,a.WHITE,700),4.12,'rise',.66)
b += unit('server-copy',a.text(58,165,'Set it up for day-and-night access.',26,a.MUTED),4.38,'left',.72)
b += unit('computer',a.server(214,214,1.25,False),4.28,'scale',.94)
cable = a.path('M453 300H485Q495 300 495 312V365Q495 378 508 378H542','#74767C',3)
b += unit('drive-cable',cable,5.55,'line',.7)
drive = a.rect(542,321.5,85,148.75,'#292A2D',12,'#74767C',2)
drive += a.path('M561 347H608M561 359H608M561 371H608','#595B60',2)+a.dot(583,444,3.7)
b += unit('hard-drive',drive,5.80,'right',.75)
b += unit('server-label',a.text(334,391,'Movie server',23,anchor='middle'),6.05,'fade',.8)
b += unit('drive-label',a.text(583,499,'External HDD',20,a.MUTED,anchor='middle'),6.20,'rise',.64)
# A finite day-to-night progression illustrates the intended availability.
sun=a.dot(76,450,12,a.CORAL)+a.path('M76 428V422M76 472V478M54 450H48M98 450H104M60 434L55 429M92 466L97 471',a.CORAL,2)
moon=a.path('M157 436A17 17 0 1 0 179 458A18 18 0 0 1 157 436Z','none',0,a.MUTED)
b += unit('day-night',sun+a.path('M111 450H138','#595B60',2)+moon,6.65,'fade',.7)
b += unit('day-night-progress',a.rect(111,448.5,27,3,a.CORAL,1.5),7.8,'line',1.55)
scene('server',4,10,b,'A repurposed movie server and external HDD')

# 10–20.4: Native screen close-ups precede the complete family.
closeups = [
 ('android',10,12.6,'Android phone','phone',572,74,206),
 ('ipad',12.6,15.2,'iPad','ipad',355,74,504),
 ('mac',15.2,17.8,'Mac','mac',250,106,640),
 ('tv',17.8,20.4,'Google TV / Android TV','tv',252,101,642),
]
for name,start,end,label,mode,x,y,width in closeups:
    heading_size = 42 if mode=='tv' else 51
    heading_y = 82 if mode in ('mac','tv') else 184
    b = unit(name+'-heading',a.text(58,heading_y,label,heading_size,a.WHITE,700),start+.12,'left',.44)
    if mode in ('phone','ipad'):
        b += unit(name+'-ribbon',a.use('ribbon',66,246,104,104),start+.30,'scale',.54)
    else:
        b += unit(name+'-ribbon',a.use('ribbon',62,188,75,75),start+.32,'scale',.55)
    b += unit(name+'-screen',a.screen(x,y,width,mode),start+.2,'right',.6)
    scene(name,start,end,b,label+' native library illustration')

# 20.4–24: Wide view, matching synthetic covers make the shared library obvious.
start=20.4
b = unit('family-heading',a.text(58,86,'One library. Across your devices.',44,a.WHITE,700),start+.08,'rise',.5)
b += unit('family-server',a.server(142,174,.60,False)+a.text(200,256,'Home server',18,a.MUTED,anchor='middle'),start+.20,'scale',.55)
b += unit('family-tailscale',a.text(351,211,'Connected with Tailscale',27,a.CORAL),start+.30,'left',.55)
network=a.path('M258 206H297V262H813M186 262V309M443 262V294M629 262V282M813 262V316',a.CORAL,3)
b += unit('family-paths',network,start+.45,'line',.72)
for i,(name,x,y,width,mode,lx,ly,label) in enumerate([
 ('mac',56,309,260,'mac',186,494,'Mac'),
 ('ipad',343,294,204,'ipad',445,494,'iPad'),
 ('phone',580,282,99,'phone',629,494,'Android phone'),
 ('tv',718,316,190,'tv',813,480,'Google TV / Android TV'),
]):
    labelsize = 16 if name=='tv' else 18
    b += unit('family-'+name,a.screen(x,y,width,mode)+a.text(lx,ly,label,labelsize,a.WHITE,anchor='middle'),start+.57+i*.1,['rise','right','scale','left'][i],.62)
scene('family',start,24,b,'Tailscale connects the home server and four native clients')

# 24–30: Direct local traffic remains within the home.
b = unit('local-heading',a.text(58,88,'Same home Wi-Fi.',49,a.WHITE,700),24.12,'rise',.75)
b += unit('local-house',a.house(89,166,780,287),24.30,'scale',.8)
b += unit('local-server',a.server(150,269,.77),24.58,'left',.75)
b += unit('local-tablet',a.screen(581,278,200,'ipad',True),24.80,'right',.88)
b += unit('local-qualifier',a.text(480,257,'No internet data used for movies.',24,a.CORAL,anchor='middle'),25.10,'fade',.68)
# The iPad's outer shell is 760 by 580; connect to its left-edge midpoint.
local_path_y = 278 + 200 * (580/760) / 2
local_path_start, local_path_end = 150 + .77*330, 581
b += unit('local-path',a.rect(local_path_start,local_path_y-2,local_path_end-local_path_start,4,a.CORAL,2),25.40,'line',.65)
b += unit('local-benefit',a.text(480,498,'Strong Wi-Fi helps avoid buffering.',29,a.WHITE,700,'middle'),25.60,'rise',.75)
b += marker('local-packet',26.2,local_path_start+4.5,local_path_y,local_path_end-local_path_start-9,1.6,2)
scene('local',24,30,b,'A direct local movie connection stays inside the home network')

# 30–37: Explicit internet link; same synthetic film on the away device.
b = unit('remote-heading',a.text(58,91,'Away from home. Still your library.',43,a.WHITE,700),30.12,'rise',.75)
b += unit('remote-house',a.house(62,177,323,253),30.3,'scale',.88)
b += unit('remote-server',a.server(110,273,.65),30.53,'left',.75)
b += unit('remote-tablet',a.screen(589,219,290,'ipad',True),30.7,'right',.8)
remote_path_y = 219 + 290 * (580/760) / 2
remote_path_start, remote_path_end = 385, 589
b += unit('remote-path',a.rect(remote_path_start,remote_path_y-2,remote_path_end-remote_path_start,4,a.CORAL,2),31.00,'line',.78)
b += unit('internet-label',a.text((remote_path_start+remote_path_end)/2,remote_path_y-35,'Internet',24,a.CORAL,anchor='middle'),31.25,'fade',.75)
b += unit('upload-label',a.text(224,478,'Home upload',22,a.MUTED,anchor='middle'),31.52,'rise',.6)
b += unit('download-label',a.text(735,478,'Remote download',22,a.MUTED,anchor='middle'),31.68,'left',.65)
b += marker('remote-packet',32.2,remote_path_start+4.5,remote_path_y,remote_path_end-remote_path_start-9,1.8,2)
scene('remote',30,37,b,'A home server streams over the internet to a remote iPad')

# 37–43: Approved quiet closing, with a deliberate music tail.
b = unit('closing-ribbon',a.use('ribbon',363,87,234,234),37.2,'ribbon',1.05)
b += unit('closing-title',a.text(480,414,'Better Watch',73,a.WHITE,700,'middle'),37.62,'rise',.86)
scene('closing',37,43,b,'Better Watch closing ribbon')
tweens.append('tl.to("#closing-ribbon", {opacity:0,duration:1.15,ease:"sine.in"}, 41.55);')
tweens.append('tl.to("#closing-title", {opacity:0,duration:1.1,ease:"power2.in"}, 41.7);')

# Crossfades happen at the boundary, while outgoing content is still intact.
# The close-ups share a stable screen plane with a subtle scale match.
transitions=[]
for i,s in enumerate(scenes[1:],1):
    old=scenes[i-1]['id']; new=s['id']; t=s['start']
    duration=.55 if new not in ('ipad','mac','tv','family') else .42
    transitions.append(f'tl.to("#scene-{old}", {{opacity:0,duration:{duration},ease:"sine.inOut"}}, {t});')
    transitions.append(f'tl.fromTo("#scene-{new}", {{opacity:0}}, {{opacity:1,duration:{duration},ease:"sine.inOut",immediateRender:false}}, {t});')
    if new in ('ipad','mac','tv'):
        transitions.append(f'tl.from("#scene-{new} .scene-content", {{scale:.975,transformOrigin:"66% 50%",duration:.6,ease:"power2.out"}}, {t});')

css='''@font-face{font-family:"Nimbus Sans";src:url("assets/NimbusSans-Regular.otf") format("opentype");font-weight:400;font-display:block}
@font-face{font-family:"Nimbus Sans";src:url("assets/NimbusSans-Bold.otf") format("opentype");font-weight:700;font-display:block}
*{box-sizing:border-box}html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#18191B;font-family:"Nimbus Sans",sans-serif}
#root{position:relative;width:1920px;height:1080px;background:#18191B;overflow:hidden}
.scene{position:absolute;inset:0;width:1920px;height:1080px;overflow:hidden;background:#18191B;opacity:0;pointer-events:none}
.scene:first-of-type{opacity:1}.scene-content{display:flex;flex-direction:column;gap:0;width:100%;height:100%;padding:0;box-sizing:border-box}
.scene-content>svg{display:block;width:100%;height:100%;flex:none;overflow:hidden}
svg text{font-family:"Nimbus Sans",sans-serif;font-variant-numeric:tabular-nums}
'''
parts=['<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=1920,height=1080"><title>Better Watch</title><script src="assets/gsap.min.js"></script><style>'+css+'</style></head><body>']
parts.append('<div id="root" data-composition-id="better-watch" data-start="0" data-duration="43" data-width="1920" data-height="1080" data-fps="30">')
parts.append('<svg width="0" height="0" aria-hidden="true" style="position:absolute"><defs>'+a.defs+'</defs></svg>')
for i,s in enumerate(scenes):
    visibility=' style="opacity:1"' if i==0 else ''
    parts.append(f'<section id="scene-{s["id"]}" class="scene" aria-label="{s["label"]}"{visibility}><div id="content-{s["id"]}" class="scene-content"><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1920" height="1080" viewBox="0 0 960 540">{s["body"]}</svg></div></section>')
parts.append('<audio id="music" src="assets/home-library.wav" data-start="0" data-duration="43" data-track-index="1" data-volume="1"></audio></div>')
parts.append('<script>\nwindow.__timelines = window.__timelines || {};\nconst tl = gsap.timeline({paused:true});\n'+ '\n'.join(tweens+transitions)+'\nwindow.__timelines["better-watch"] = tl;\ntl.seek(0);\n</script></body></html>\n')
(ROOT/'index.html').write_text('\n'.join(parts))
(ROOT/'scene-map.json').write_text(json.dumps([{k:v for k,v in s.items() if k!='body'} for s in scenes],indent=2)+'\n')
shutil.copyfile(ROOT/'node_modules/gsap/dist/gsap.min.js',ROOT/'assets/gsap.min.js')
print(f'Built {len(scenes)} scene planes and {len(tweens)+len(transitions)} deterministic timeline entries over 43 seconds.')
