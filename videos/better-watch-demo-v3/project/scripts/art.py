"""Generate static review art only. No HyperFrames composition before selection."""

from pathlib import Path
from html import escape
import base64
import json

OUT = Path(__file__).resolve().parent.parent
ROOT = OUT
BG, SURFACE, CORAL, WHITE, MUTED = '#18191B', '#222325', '#FFA397', '#F3F3F2', '#B6B6BC'
FONT = 'Nimbus Sans, Helvetica, Arial, sans-serif'
logo = base64.b64encode((ROOT / 'assets/folded-play-ribbon.png').read_bytes()).decode()


def text(x, y, value, size=24, color=WHITE, weight=400, anchor='start'):
    return f'<text x="{x}" y="{y}" fill="{color}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}">{escape(value)}</text>'


def rect(x, y, w, h, fill=SURFACE, radius=0, stroke='none', sw=1):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'


def path(d, color=CORAL, width=3, fill='none', extra=''):
    return f'<path d="{d}" fill="{fill}" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round" {extra}/>'


def group(body, x=0, y=0, scale=1):
    return f'<g transform="translate({x} {y}) scale({scale})">{body}</g>'


def use(name, x, y, w, h):
    return f'<use href="#{name}" xlink:href="#{name}" x="{x}" y="{y}" width="{w}" height="{h}"/>'


def dot(x, y, r=5, fill=CORAL):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"/>'


def cover(index, x, y, w, h):
    return use('cover-' + str(index % 8), x, y, w, h)


titles = ['The quiet coast', 'Last train north', 'A distant summer', 'After the rain', 'The long way home', 'Blue hour', 'Night signals', 'The open road']
palettes = [('#263f4a', '#749799', '#c4d2ba'), ('#3e3b4c', '#8b8095', '#efb893'), ('#454a34', '#8e9975', '#ddcb99'), ('#283746', '#617c93', '#aebdc5'), ('#4e3a34', '#a16d52', '#e8c197'), ('#243e3d', '#618481', '#cfbe94'), ('#3d3d52', '#7a789a', '#d3b3c2'), ('#454331', '#979064', '#ead9b1')]
defs = '<symbol id="ribbon" viewBox="0 0 1254 1254"><image href="assets/folded-play-ribbon.png" width="1254" height="1254"/></symbol>'
for i, (dark, mid, light) in enumerate(palettes):
    art = rect(0, 0, 640, 360, dark) + dot(482, 90, 37, light)
    if i % 3 == 0:
        art += path('M0 247 130 93 263 257 427 185 640 285V360H0Z', 'none', 0, mid)
        art += path('M0 293 172 234 389 311 640 262V360H0Z', 'none', 0, dark)
        art += path('M0 321Q180 288 350 331T640 314', light, 3)
    elif i % 3 == 1:
        art += path('M0 280V172H74V231H142V114H231V220H288V165H359V244H446V139H522V210H603V280H640V360H0Z', 'none', 0, mid)
        art += path('M246 360 329 238 418 360M205 360 329 219 460 360', light, 3)
    else:
        art += path('M0 246Q120 138 265 256T640 215V360H0Z', 'none', 0, mid)
        art += path('M0 328Q270 213 640 307V360H0Z', 'none', 0, dark)
        art += path('M233 360Q367 284 330 254', light, 12)
    defs += f'<symbol id="cover-{i}" viewBox="0 0 640 360">{art}</symbol>'


def library(w=800, h=450, mode='tv'):
    """Illustrative reconstruction of actual navigation and landscape covers."""
    phone = mode == 'phone'
    sidebar = 0 if phone else w * .20
    margin = 15 if phone else 20
    out = rect(0, 0, w, h, BG)
    if not phone:
        out += rect(0, 0, sidebar, h, SURFACE)
        out += use('ribbon', 12, 17, 27, 27) + text(43, 36, 'Better Watch', 13, WHITE, 700)
        for i, name in enumerate(['All films', 'Favorites', 'Watch Later', 'Unwatched', 'Watched', 'Artists']):
            yy = 75 + i * 31
            if i == 0:
                out += rect(10, yy - 18, sidebar - 20, 27, '#343033')
            out += text(23, yy, name, 13, CORAL if i == 0 else WHITE)
        out += text(23, h - 31, 'Server', 13, MUTED)
    start = sidebar + margin
    out += text(start, 39, 'All films', 24 if not phone else 21, WHITE, 700)
    out += text(w - margin, 37, '8 films', 12, MUTED, anchor='end')
    out += rect(start, 54, w - start - margin, 28, SURFACE, 3, '#525358')
    out += text(start + 12, 73, 'Search films', 12, MUTED)
    out += text(start, 106, 'All categories', 12, CORAL)
    out += text(w - margin, 106, 'Newest', 12, CORAL, anchor='end')
    cols = 2 if phone or mode == 'ipad' else 4
    gap = 13
    tilew = (w - start - margin - gap * (cols - 1)) / cols
    tileh = tilew * 9 / 16
    rows = 3 if phone else 2
    for i in range(min(rows * cols, 8)):
        col, row = i % cols, i // cols
        xx, yy = start + col * (tilew + gap), 128 + row * (tileh + 43)
        out += cover(i, xx, yy, tilew, tileh)
        if mode == 'tv' and i == 0:
            out += rect(xx-3, yy-3, tilew+6, tileh+6, 'none', 0, CORAL, 2)
        out += text(xx, yy+tileh+18, titles[i], 10 if phone else 11, CORAL if i == 0 and mode == 'tv' else WHITE, 700)
        out += text(xx, yy+tileh+33, '2025 · Cinema', 9, MUTED)
    if mode == 'tv':
        out += path(f'M{start} {h-63}H{w-margin}', '#414145', 1)
        out += text(start, h-41, titles[0], 17, WHITE, 700)
        out += text(start, h-21, 'A journey along the coast, following the last light of summer.', 11, MUTED)
    return out


def screen(x, y, width, mode='mac', playing=False):
    if mode == 'phone':
        w, h, bezel, rad = 240, 475, 10, 29
    elif mode == 'ipad':
        w, h, bezel, rad = 720, 540, 20, 28
    else:
        w, h, bezel, rad = 800, 450, 13, 12
    out = rect(0, 0, w+bezel*2, h+bezel*2, '#0D0E10', rad, '#64656A', 2)
    content = library(w, h, mode)
    if playing:
        content = cover(0, 0, 0, w, h)
        content += rect(0, h-64, w, 64, '#18191B')
        content += text(22, h-39, titles[0], 18, WHITE, 700)
        content += path(f'M22 {h-19}H{w-22}', '#64656A', 3) + path(f'M22 {h-19}H{w*.39}', CORAL, 3)
        content += dot(w*.39, h-19, 4)
    out += group(content, bezel, bezel)
    if mode == 'phone':
        out += dot((w+2*bezel)/2, 7, 3, '#64656A')
    elif mode == 'mac':
        out += path(f'M-25 {h+bezel*2+3}H{w+bezel*2+25}L{w+bezel*2+8} {h+bezel*2+16}H-8Z', '#64656A', 2, '#393A3D')
    elif mode == 'tv':
        out += path(f'M140 {h+bezel*2}l-22 24M{w-114} {h+bezel*2}l22 24', '#64656A', 6)
    return group(out, x, y, width/(w+2*bezel))


def server(x, y, scale=1, hdd=True):
    out = path('M12 10H179L193 25V96L177 109H10L0 96V25Z', '#74767C', 2, '#303134')
    out += path('M1 29H191M12 109H177', '#595B60', 2)
    # Center the logo on the front face below the lid seam (y=29..109).
    out += use('ribbon', 67, 39.5, 59, 59) + dot(165, 90, 3)
    if hdd:
        out += path('M191 69H217Q225 69 225 77V117Q225 131 239 131H262', '#74767C', 3)
        out += rect(262, 86, 68, 119, '#292A2D', 10, '#74767C', 2)
        out += path('M277 105H315M277 114H315M277 123H315', '#595B60', 2)
        out += dot(295, 184, 3)
    return group(out, x, y, scale)


def house(x, y, w, h):
    return path(f'M{x} {y+75}L{x+w/2} {y} {x+w} {y+75}V{y+h}H{x}Z', '#53555A', 2)


def frame(body, label):
    return f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="960" height="540" viewBox="0 0 960 540" role="img" aria-label="{escape(label)}"><title>{escape(label)}</title><g font-family="{FONT}">{rect(0,0,960,540,BG)}{body}</g></svg>'
