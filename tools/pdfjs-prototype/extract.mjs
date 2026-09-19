// Uses the Foundry-installed PDF.js supplied by the caller; no MuPDF dependency.
import {cards,traits} from './layout-parser.mjs';
const bounds=ps=>[Math.min(...ps.map(p=>p[0])),Math.min(...ps.map(p=>p[1])),Math.max(...ps.map(p=>p[0])),Math.max(...ps.map(p=>p[1]))];
const point=([x,y],m)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];

export async function readLayout(page,pdfjs){
  const [content,operators]=await Promise.all([page.getTextContent({disableNormalization:true}),page.getOperatorList()]);
  const viewport=page.getViewport({scale:1}),lines=[],paths=[],warnings=[];
  if(page.rotate!==0)throw new Error('Rotated pages are outside this prototype.');
  let line,lastY,lastX;
  for(const item of content.items){
    if(!('str' in item))continue;
    if(!item.str){if(item.hasEOL)line=null;continue;}
    const matrix=pdfjs.Util.transform(viewport.transform,item.transform),size=Math.hypot(matrix[2],matrix[3]);
    if(Math.abs(matrix[1])>0.01 || Math.abs(matrix[2])>0.01)throw new Error('Rotated text is outside this prototype.');
    // PDF.js's documented text styles omit original font names. This resolved
    // font cache is version-sensitive; keep that dependency isolated here.
    const font=page.commonObjs.get(item.fontName),name=font.name;
    if(typeof name!=='string')throw new Error('Bundled PDF.js did not expose font names.');
    const style=content.styles[item.fontName],x=matrix[4],y=matrix[5];
    const bbox=[x,y-(style.ascent??0.8)*size,x+item.width,y-(style.descent??-0.2)*size];
    const span={text:item.str,font:name,size,bold:/bold/i.test(name),italic:/italic|oblique/i.test(name),bbox};
    if(!line || Math.abs(lastY-y)>0.5 || x-lastX>size*1.5 || x<lastX-size){line={bbox:[...bbox],spans:[]};lines.push(line);}
    line.spans.push(span);line.bbox=bounds([[line.bbox[0],line.bbox[1]],[line.bbox[2],line.bbox[3]],[bbox[0],bbox[1]],[bbox[2],bbox[3]]]);
    lastY=y;lastX=x+item.width;if(item.hasEOL)line=null;
  }
  const O=pdfjs.OPS,stack=[];
  let matrix=viewport.transform,width=1,subpaths=[],current=null;
  function close(){if(current?.points.length){const first=current.points[0],last=current.points.at(-1);if(first[0]!==last[0] || first[1]!==last[1]){current.segments.push([last,first]);current.points.push(first);}current.closed=true;}}
  function paint(fill,stroke){
    for(const p of subpaths){
      const vertices=p.closed?p.points.slice(0,-1):p.points;
      const rect=!p.curved && p.closed && vertices.length===4 && p.segments.every(([a,b])=>Math.abs(a[0]-b[0])<0.01 || Math.abs(a[1]-b[1])<0.01)?bounds(vertices):null;
      paths.push({fill,width:stroke?width*Math.sqrt(Math.abs(matrix[0]*matrix[3]-matrix[1]*matrix[2])):0,rect,segments:p.segments});
    }
    subpaths=[];current=null;
  }
  for(let i=0;i<operators.fnArray.length;i++){
    const op=operators.fnArray[i],args=operators.argsArray[i];
    switch(op){
      case O.save: stack.push({matrix:[...matrix],width});break;
      case O.restore: {const state=stack.pop();if(state)({matrix,width}=state);break;}
      case O.transform:matrix=pdfjs.Util.transform(matrix,args);break;
      case O.setLineWidth:width=args[0];break;
      case O.setGState:for(const [key,value] of args[0])if(key==='LW')width=value;break;
      case O.paintFormXObjectBegin:stack.push({matrix:[...matrix],width});if(args[0])matrix=pdfjs.Util.transform(matrix,args[0]);break;
      case O.paintFormXObjectEnd:{const state=stack.pop();if(state)({matrix,width}=state);break;}
      case O.constructPath:{
        const [ops,coords]=args;let k=0;
        const move=(x,y)=>{current={points:[point([x,y],matrix)],segments:[],closed:false,curved:false};subpaths.push(current);};
        const to=(x,y)=>{const p=point([x,y],matrix);current.segments.push([current.points.at(-1),p]);current.points.push(p);};
        for(const code of ops){
          if(code===O.rectangle){const [x,y,w,h]=coords.slice(k,k+4);k+=4;move(x,y);to(x+w,y);to(x+w,y+h);to(x,y+h);close();}
          else if(code===O.moveTo){move(coords[k++],coords[k++]);}
          else if(code===O.lineTo){to(coords[k++],coords[k++]);}
          else if(code===O.closePath)close();
          else if([O.curveTo,O.curveTo2,O.curveTo3].includes(code)){const n=code===O.curveTo?6:4;current.curved=true;current.points.push(point([coords[k+n-2],coords[k+n-1]],matrix));k+=n;}
          else throw new Error(`Unsupported PDF.js path opcode ${code}`);
        }break;
      }
      case O.closePath:close();break;
      case O.stroke:paint(false,true);break;
      case O.closeStroke:close();paint(false,true);break;
      case O.fill:case O.eoFill:paint(true,false);break;
      case O.fillStroke:case O.eoFillStroke:paint(true,true);break;
      case O.closeFillStroke:case O.closeEOFillStroke:close();paint(true,true);break;
      case O.endPath:subpaths=[];current=null;break;
    }
  }
  return {lines,paths,warnings};
}

export async function extractPage(bytes,pageNumber,kind,{pdfjs,baseURL,worker}={}){
  if(!pdfjs)throw new Error('PDF.js must be supplied by the host.');
  if(pdfjs.version!=='4.0.379')throw new Error(`This prototype was validated with PDF.js 4.0.379; found ${pdfjs.version}. Recheck the font/path adapter before using this version.`);
  if(!['cards','traits'].includes(kind))throw new Error('Choose cards or traits.');
  const task=pdfjs.getDocument({data:bytes.slice(),worker,fontExtraProperties:true,disableFontFace:true,isEvalSupported:false,useWorkerFetch:!!baseURL && /^https?:/.test(baseURL),
    ...(baseURL?{cMapUrl:new URL('web/cmaps/',baseURL).href,cMapPacked:true,standardFontDataUrl:new URL('web/standard_fonts/',baseURL).href}:{} )});
  // No password prompt in this probe: reject rather than wait indefinitely.
  let rejectPassword;
  const passwordFailure=new Promise((_,reject)=>{rejectPassword=reject;});
  task.onPassword=()=>rejectPassword(new Error('Password-protected PDFs are outside this prototype.'));
  try{
    const doc=await Promise.race([task.promise,passwordFailure]);
    if(!Number.isInteger(pageNumber)||pageNumber<1||pageNumber>doc.numPages)throw new Error(`Page must be between 1 and ${doc.numPages}.`);
    const page=await doc.getPage(pageNumber),data=await readLayout(page,pdfjs);
    const result={page:pageNumber,kind,...(kind==='cards'?cards(data):traits(data)),fontSummary:{bold:0,italic:0},warnings:data.warnings};
    for(const span of data.lines.flatMap(l=>l.spans))for(const key of ['bold','italic'])if(span[key])result.fontSummary[key]+=span.text.replace(/\s/g,'').length;
    return result;
  }finally{await task.destroy();}
}
