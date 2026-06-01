let countdownInterval=null;

export function updateCountdown(s){
  const start=new Date(s.startDate);start.setHours(0,0,0,0);
  const end=new Date(start);end.setDate(end.getDate()+75);
  const now=new Date();
  const diff=end-now;
  if(diff<=0){
    document.getElementById('cd-days').textContent='00';
    document.getElementById('cd-hours').textContent='00';
    document.getElementById('cd-mins').textContent='00';
    document.getElementById('cd-secs').textContent='00';
    return;
  }
  const days=Math.floor(diff/86400000);
  const hours=Math.floor((diff%86400000)/3600000);
  const mins=Math.floor((diff%3600000)/60000);
  const secs=Math.floor((diff%60000)/1000);
  document.getElementById('cd-days').textContent=String(days).padStart(2,'0');
  document.getElementById('cd-hours').textContent=String(hours).padStart(2,'0');
  document.getElementById('cd-mins').textContent=String(mins).padStart(2,'0');
  document.getElementById('cd-secs').textContent=String(secs).padStart(2,'0');
}

export function startCountdown(s){
  if(countdownInterval)clearInterval(countdownInterval);
  updateCountdown(s);
  countdownInterval=setInterval(()=>updateCountdown(s),1000);
}

export function stopCountdown(){
  if(countdownInterval)clearInterval(countdownInterval);
  countdownInterval=null;
}
