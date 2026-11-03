/* Clicking opens WJX; dragging only repositions. No analytics added here. */
(()=>{
  'use strict';
  if(document.getElementById('classroomSurveyFloat'))return;
  const script=document.currentScript;
  const base=new URL('.',script?.src||location.href);
  const link=document.createElement('a');
  link.id='classroomSurveyFloat';link.className='classroom-survey-float';
  link.href='https://v.wjx.cn/vm/hS3Oas6.aspx#';link.target='_blank';link.rel='noopener noreferrer';
  link.setAttribute('aria-label','填写课后问卷（在新标签页打开；可拖动位置）');
  link.title='点击填写问卷；拖动可调整位置。打开问卷需要联网。';
  const img=document.createElement('img');img.src=new URL('survey-cat.png',base).href;img.alt='问卷调研';img.draggable=false;
  link.append(img);document.body.append(link);
  const storageKey='classroom_survey_position_v1';
  let dragging=null,suppressUntil=0,placed=false;
  function place(x,y){const r=link.getBoundingClientRect();const maxX=Math.max(0,innerWidth-r.width),maxY=Math.max(0,innerHeight-r.height);
    x=Math.min(maxX,Math.max(0,x));y=Math.min(maxY,Math.max(0,y));
    link.style.left=x+'px';link.style.top=y+'px';link.style.right='auto';link.style.bottom='auto';placed=true;return {x,y};}
  try{const pos=JSON.parse(sessionStorage.getItem(storageKey)||'null');if(pos&&Number.isFinite(pos.x)&&Number.isFinite(pos.y))place(pos.x,pos.y);}catch{}
  link.addEventListener('pointerdown',e=>{if(!e.isPrimary||e.button!==0)return;const r=link.getBoundingClientRect();dragging={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top,moved:false};link.setPointerCapture(e.pointerId);});
  link.addEventListener('pointermove',e=>{if(!dragging||e.pointerId!==dragging.id)return;const dx=e.clientX-dragging.x,dy=e.clientY-dragging.y;
    if(!dragging.moved&&Math.hypot(dx,dy)<6)return;
    dragging.moved=true;link.classList.add('is-dragging');place(dragging.left+dx,dragging.top+dy);});
  function finish(e){if(!dragging||e.pointerId!==dragging.id)return;const moved=dragging.moved;dragging=null;link.classList.remove('is-dragging');
    if(moved){suppressUntil=Date.now()+400;const r=link.getBoundingClientRect();try{sessionStorage.setItem(storageKey,JSON.stringify({x:r.left,y:r.top}));}catch{}}
    if(link.hasPointerCapture(e.pointerId))link.releasePointerCapture(e.pointerId);}
  link.addEventListener('pointerup',finish);link.addEventListener('pointercancel',finish);link.addEventListener('lostpointercapture',finish);
  link.addEventListener('click',e=>{if(e.detail!==0&&Date.now()<suppressUntil){e.preventDefault();e.stopPropagation();}});
  link.addEventListener('dragstart',e=>e.preventDefault());
  window.addEventListener('resize',()=>{if(placed){const r=link.getBoundingClientRect();place(r.left,r.top);}});
})();
