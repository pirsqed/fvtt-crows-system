const norm = s => s.replace(/[’‘]/g, "'").replace(/–/g, "-").replace(/\s+/g, " ").trim();
const bounds = points => [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
const center = r => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
const inside = (p, r, t = 0) => p[0] >= r[0]-t && p[0] < r[2]+t && p[1] >= r[1]-t && p[1] < r[3]+t;
const order = divisor => (a,b) => Math.round(a[1]/divisor)-Math.round(b[1]/divisor) || a[0]-b[0];

function connections(segments, boxes) {
  const parents=segments.map((_,i)=>i);
  const root = i => parents[i]===i ? i : (parents[i]=root(parents[i]));
  const on = (p,[a,b]) => Math.abs(a[0]-b[0])<1
    ? Math.abs(p[0]-a[0])<=3 && p[1]>=Math.min(a[1],b[1])-3 && p[1]<=Math.max(a[1],b[1])+3
    : Math.abs(p[1]-a[1])<=3 && p[0]>=Math.min(a[0],b[0])-3 && p[0]<=Math.max(a[0],b[0])+3;
  for(let i=0;i<segments.length;i++) for(let j=i+1;j<segments.length;j++)
    if(segments[i].some(p=>on(p,segments[j])) || segments[j].some(p=>on(p,segments[i]))) parents[root(i)]=root(j);
  const groups=new Map();
  segments.forEach((seg,i)=>boxes.forEach((box,b)=>{if(seg.some(p=>inside(p,box,3))) {const key=root(i); if(!groups.has(key))groups.set(key,new Set()); groups.get(key).add(b);}}));
  return [...groups.values()].filter(g=>g.size>1).map(g=>[...g].sort((a,b)=>a-b)).sort((a,b)=>a[0]-b[0] || a.length-b.length);
}

function traits({lines,paths}) {
  const boxes=paths.filter(p=>p.fill && p.rect && p.rect[2]-p.rect[0]>80 && p.rect[3]-p.rect[1]>60).map(p=>p.rect).sort(order(20));
  const segments=paths.filter(p=>p.width>=3).flatMap(p=>p.segments);
  const records=boxes.map(box=>{
    let name=null, cost=null, starting=false; const desc=[];
    for(const line of lines.filter(l=>inside(center(l.bbox),box)).sort((a,b)=>a.bbox[1]-b.bbox[1])) {
      const t=norm(line.spans.map(s=>s.text).join("")); if(!t)continue;
      if(name===null && line.spans.some(s=>s.font.includes("Bold") && Math.round(s.size)===10)) {name=t;continue;}
      const match=t.match(/^XP Cost:\s*([\d,]+)\s*(\(Starting\))?/);
      if(match && cost===null) {cost=Number(match[1].replaceAll(",",""));starting=Boolean(match[2]);continue;}
      desc.push(t);
    }
    return {name,cost,starting,desc:desc.join(" ")};
  });
  return {boxes,segments,groups:connections(segments,boxes),records};
}

function cards({lines,paths}) {
  const verticals=[];
  for(const path of paths) {
    // PyMuPDF represents thin filled rectangles as one rectangle, not four lines.
    if(path.rect) {const r=path.rect;if(r[2]-r[0]<1.5 && r[3]-r[1]>1)verticals.push([r[0],r[1],r[3]]);}
    else for(const [a,b] of path.segments) if(Math.abs(a[0]-b[0])<0.5 && Math.abs(a[1]-b[1])>1)verticals.push([a[0],Math.min(a[1],b[1]),Math.max(a[1],b[1])]);
  }
  const bands=[];
  for(const [x,y0,y1] of verticals.filter(v=>v[2]-v[1]>=100)) {
    let band=bands.find(b=>Math.abs(b.y0-y0)<=3 && Math.abs(b.y1-y1)<=3);
    if(!band){band={y0,y1,xs:[]};bands.push(band);}band.xs.push(x);
  }
  const columns=[];
  for(const b of bands) {
    const clusters=[];
    for(const x of b.xs.sort((a,b)=>a-b)){if(clusters.length && Math.abs(x-clusters.at(-1).at(-1))<=3)clusters.at(-1).push(x);else clusters.push([x]);}
    const xs=clusters.map(c=>c.reduce((a,b)=>a+b,0)/c.length);
    for(let i=1;i<xs.length;i++)if(xs[i]-xs[i-1]>=60)columns.push([xs[i-1],b.y0,xs[i],b.y1]);
  }
  columns.sort(order(50));
  const records=[];
  const excluded=new Set(['Maneuver:','Maneuver','Action:','Action','Reaction:','Reaction','Duration:','Dur.','Target','UD','UD:','Slot','Slot:','Fine','Masterwork','Attack','Stack','Armor','12-16','17+','≤','≤11','<=11','Book']);
  for(const column of columns){
    const spans=lines.flatMap(l=>l.spans).filter(s=>s.text.trim() && inside(center(s.bbox),column)).sort((a,b)=>a.bbox[1]-b.bbox[1] || a.bbox[0]-b.bbox[0]);
    const grouped=[];
    for(const s of spans){const yc=center(s.bbox)[1];let l=grouped.at(-1);if(l && Math.abs(yc-l.yc)<=3.5){l.spans.push(s);l.yc=(l.yc+yc)/2;}else grouped.push({yc,spans:[s]});}
    for(const l of grouped){l.spans.sort((a,b)=>a.bbox[0]-b.bbox[0]);l.text="";let end=null;for(const s of l.spans){if(end!==null && s.bbox[0]-end>0.8 && !l.text.endsWith(" ") && !s.text.startsWith(" "))l.text+=" ";l.text+=s.text;end=s.bbox[2];}}
    const starts=[];
    grouped.forEach((l,i)=>{const s=l.spans[0],size=Math.round(s.size*10)/10;if(!(s.bold || s.italic && size>=9) || size<=7.6 || excluded.has(s.text.trim().split(' ')[0]) || excluded.has(s.text.trim()) || /12-16|17\+|≤/.test(l.text))return;
      if(/Stack\s*\d/.test(l.text) || grouped.slice(i+1,i+3).some(n=>/^\s*Stack\s*\d/.test(n.text) && n.spans.some(s=>s.bold)))starts.push(i);});
    starts.forEach((start,i)=>records.push({column:columns.indexOf(column),raw_lines:grouped.slice(start,starts[i+1]??grouped.length).map(l=>norm(l.text))}));
  }
  return {columns,records};
}

export {cards,traits};
