import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const entries=JSON.parse(await fs.readFile(path.join(root,'qa/rendered-frame-times.json'),'utf8'));
const font='Nimbus Sans';
async function sheet(selected, cols, width, output, titles) {
  const tile=width/cols, caption=40, height=tile*9/16;
  const rows=Math.ceil(selected.length/cols), total=rows*(height+caption);
  const layers=[];
  for(let i=0;i<selected.length;i++) {
    const frame=selected[i], x=(i%cols)*tile, y=Math.floor(i/cols)*(height+caption);
    const image=await sharp(path.join(root,'qa/rendered-frames',frame.file)).resize(tile,height).png().toBuffer();
    layers.push({input:image,left:x,top:y+caption});
    const label=titles?.[i] ?? `${frame.time.toFixed(2)}s`;
    const svg=`<svg width="${tile}" height="${caption}"><text x="18" y="28" fill="#f3f3f2" font-family="${font}" font-size="22">${label}</text></svg>`;
    layers.push({input:Buffer.from(svg),left:x,top:y});
  }
  await sharp({create:{width,height:total,channels:3,background:'#18191B'}}).composite(layers).png().toFile(output);
}
const heroTimes=[3.5,9.4,22.5,28,34,40];
await sheet(heroTimes.map(time=>entries.find(e=>e.time===time)),2,1920,path.join(root,'../contact-sheet.png'),[
 'Opening','Home server + external HDD','Tailscale + native devices','Direct home streaming','Remote viewing','Better Watch'
]);
for(let offset=0;offset<entries.length;offset+=9) {
  await sheet(entries.slice(offset,offset+9),3,1920,path.join(root,`qa/rendered-audit-${offset/9+1}.png`));
}
console.log('Created final contact sheet and five audit sheets from the encoded MP4.');
