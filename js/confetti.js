import { isDayComplete } from './state.js';

let lastAnimatedDay=null;

export function fireConfetti(){
  const c=document.getElementById('confetti-container');c.innerHTML='';c.classList.add('active');
  const colors=['#ff3c00','#f5c400','#00e676','#00b0ff','#ff1744','#ffffff','#d500f9'];
  for(let i=0;i<100;i++){
    const p=document.createElement('div');p.className='confetti-piece';
    p.style.left=Math.random()*100+'vw';
    p.style.background=colors[Math.floor(Math.random()*colors.length)];
    p.style.animationDuration=(1.5+Math.random()*2)+'s';
    p.style.animationDelay=(Math.random()*0.6)+'s';
    p.style.width=(6+Math.random()*8)+'px';p.style.height=(6+Math.random()*8)+'px';
    c.appendChild(p);
  }
  setTimeout(()=>{c.classList.remove('active');c.innerHTML='';},3500);
}

export function checkCompletionAnimation(s,day){
  if(isDayComplete(s,day)&&lastAnimatedDay!==day){lastAnimatedDay=day;fireConfetti();}
}

export function resetAnimatedDay(){
  lastAnimatedDay=null;
}
