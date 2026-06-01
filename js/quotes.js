export const QUOTES = [
  {q:"In war, the victorious strategist only seeks battle after the victory has been won.",a:"— Sun Tzu, The Art of War"},
  {q:"If you know the enemy and know yourself, you need not fear the result of a hundred battles.",a:"— Sun Tzu"},
  {q:"Opportunities multiply as they are seized.",a:"— Sun Tzu"},
  {q:"Let your plans be dark and impenetrable as night, and when you move, fall like a thunderbolt.",a:"— Sun Tzu"},
  {q:"The supreme art of war is to subdue the enemy without fighting.",a:"— Sun Tzu"},
  {q:"Victorious warriors win first and then go to war, while defeated warriors go to war first and then seek to win.",a:"— Sun Tzu"},
  {q:"I came, I saw, I conquered.",a:"— Julius Caesar"},
  {q:"As a rule, men worry more about what they can't see than about what they can.",a:"— Julius Caesar"},
  {q:"It is easier to find men who will volunteer to die, than to find those who are willing to endure pain with patience.",a:"— Julius Caesar"},
  {q:"No man is so brave that he is not disturbed by something unexpected.",a:"— Julius Caesar"},
  {q:"Fortune, which has a great deal of power in other matters but especially in war, can bring about great changes in a situation through very slight forces.",a:"— Julius Caesar"},
  {q:"I would rather be first in a village than second in Rome.",a:"— Julius Caesar"},
  {q:"You shall be conqueror not by strength of body but by strength of soul.",a:"— Alexander the Great"},
  {q:"There is nothing impossible to him who will try.",a:"— Alexander the Great"},
  {q:"Remember upon the conduct of each depends the fate of all.",a:"— Alexander the Great"},
  {q:"I am not afraid of an army of lions led by a sheep; I am afraid of an army of sheep led by a lion.",a:"— Alexander the Great"},
  {q:"Waste no more time arguing about what a good man should be. Be one.",a:"— Marcus Aurelius"},
  {q:"You have power over your mind, not outside events. Realize this, and you will find strength.",a:"— Marcus Aurelius"},
  {q:"The impediment to action advances action. What stands in the way becomes the way.",a:"— Marcus Aurelius"},
  {q:"Do not indulge in dreams of what you have not, but count the blessings actually present.",a:"— Marcus Aurelius"},
  {q:"If it is not right, do not do it; if it is not true, do not say it.",a:"— Marcus Aurelius"},
  {q:"Accept the things to which fate binds you, and love the people with whom fate brings you together.",a:"— Marcus Aurelius"},
  {q:"The first and greatest victory is to conquer yourself.",a:"— Plato"},
  {q:"We are twice armed if we fight with faith.",a:"— Plato"},
  {q:"Only the dead have seen the end of war.",a:"— Plato"},
  {q:"We must not look at goblin men, we must not buy their fruits.",a:"— Hannibal Barca (attr.)"},
  {q:"I will either find a way or make one.",a:"— Hannibal Barca"},
  {q:"We shall either find a way or make one.",a:"— Hannibal Barca"},
  {q:"Suffer the pain of discipline or suffer the pain of regret.",a:"— Attributed to various generals of antiquity"},
  {q:"An army of lions commanded by a deer will never be an army of lions.",a:"— Napoleon (echoing the ancients)"},
  {q:"He who sweats more in training bleeds less in battle.",a:"— Spartan maxim"},
  {q:"Come back with your shield, or on it.",a:"— Spartan mother's charge"},
  {q:"A smooth sea never made a skilled sailor.",a:"— Ancient proverb"},
  {q:"The tree that does not bend will break.",a:"— Ancient proverb"},
  {q:"Through me passage to the city of woe, through me passage to eternal pain.",a:"— Dante (warrior's gate)"},
  {q:"It is not the mountain we conquer but ourselves.",a:"— Edmund Hillary"},
  {q:"The general who advances without coveting fame and retreats without fearing disgrace is the jewel of the kingdom.",a:"— Sun Tzu"},
  {q:"Move swift as the wind and closely-formed as the wood; attack like the fire and be still as the mountain.",a:"— Sun Tzu"},
];

let quoteInterval=null;

export function setQuote(){
  const q=QUOTES[Math.floor(Math.random()*QUOTES.length)];
  document.getElementById('quote-text').textContent='"'+q.q+'"';
  document.getElementById('quote-attr').textContent=q.a;
}

export function startQuoteRotation(s){
  setQuote();
  if(quoteInterval)clearInterval(quoteInterval);
  quoteInterval=setInterval(setQuote,20000);
}

export function stopQuoteRotation(){
  if(quoteInterval)clearInterval(quoteInterval);
  quoteInterval=null;
}
