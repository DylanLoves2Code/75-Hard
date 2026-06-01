import { TOTAL, STORAGE_KEY } from './constants.js';

export function getState(){return JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}
export function saveState(s){localStorage.setItem(STORAGE_KEY,JSON.stringify(s));}
export function defaultState(start,name){
  return {startDate:start,name:name||'',days:{},drinks:{},books:{},metrics:{},notes:{}};
}
export function getDayData(s,d){
  if(!s.days[d])s.days[d]={calorie:false,w1:false,w2:false,read:false,water:false,photo:false,w1label:'Workout 1',w2label:'Workout 2',waterCups:0};
  if(s.days[d].waterCups===undefined)s.days[d].waterCups=0;
  return s.days[d];
}
export function isDayComplete(s,d){
  const dd=getDayData(s,d);
  return dd.calorie&&dd.w1&&dd.w2&&dd.read&&dd.water&&dd.photo;
}
export function calcCurrentDay(){
  const s=getState();if(!s)return 1;
  const today=new Date();today.setHours(0,0,0,0);
  const start=new Date(s.startDate);start.setHours(0,0,0,0);
  const diff=Math.floor((today-start)/86400000)+1;
  return Math.max(1,Math.min(diff,TOTAL));
}
export function calcCurrentWeek(){return Math.ceil(calcCurrentDay()/7);}
export function getDateForDay(d){
  const s=getState();
  const start=new Date(s.startDate);start.setHours(0,0,0,0);
  const date=new Date(start);date.setDate(date.getDate()+d-1);
  return date;
}
export function formatDate(date){return date.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric'});}
export function calcStreak(s){
  let streak=0;const today=calcCurrentDay();
  for(let d=today;d>=1;d--){if(isDayComplete(s,d))streak++;else break;}
  return streak;
}
export function countCompleteDays(s){
  let n=0;const today=calcCurrentDay();
  for(let d=1;d<=today;d++){if(isDayComplete(s,d))n++;}
  return n;
}
