(function(){'use strict';
var D=document,H=D.documentElement,$=function(s,r){return(r||D).querySelector(s)},$$=function(s,r){return Array.prototype.slice.call((r||D).querySelectorAll(s))};
var STORE='https://amarix007.store/',LK='amx_dl_lang',RM=matchMedia('(prefers-reduced-motion: reduce)').matches,MOB=matchMedia('(max-width:900px)').matches;
var EN={n1:'Features',n2:'Install',n3:'Security',n4:'FAQ',cta:'Install App',chip:'PWA · No Google Play · Free',h1:'Your Digital World. One Destination.',lead:'Discover a complete digital experience that brings products and digital services together in one place, with smart, smooth shopping.',open:'Explore the Store',open2:'Open Store',
f_h:'Everything you need, digitally',f1h:'Digital products & services',f1p:'Subscriptions, AI subscriptions, tools and digital products in one store.',f2h:'Game top-ups',f2p:'Top up supported games and products inside the store.',f3h:'Boost services',f3p:'A dedicated page with search and filters by platform and type.',f4h:'Account & wallet',f4p:'A personal account and a wallet to manage balance and payments.',f5h:'Order tracking',f5p:'Follow the status of every order from your orders page.',f6h:'Partner program',f6p:'A referral link and a partner dashboard for clicks, sign-ups and orders.',
i_h:'Just three steps',os1:'Android',os2:'iPhone / iOS',os3:'Desktop',a1:'Open amarix007.store in Chrome.',a2:'Tap "Install App", or the ⋮ menu then "Install app".',a3:'Open AMARIX007 from your home screen.',s1:'Open amarix007.store in Safari.',s2:'Tap Share ⎙ then "Add to Home Screen".',s3:'Tap "Add", then open the app from your home screen.',d1:'Open amarix007.store in Chrome or Edge.',d2:'Click "Install App" or the install icon in the address bar.',d3:'Open the app in its own window.',
t_h:'Trust & security',t1h:'HTTPS connection',t1p:'The store runs over an encrypted connection.',t2h:'Accounts',t2p:'Purchases and orders require signing in.',t3h:'Order tracking',t3p:'Your orders and their status in one place.',t4h:'Strict security policy',t4p:'The store uses a CSP policy that blocks external scripts.',
q_h:'FAQ',q1:'How do I install AMARIX007?',r1:'Tap "Install App". If no install prompt appears, follow your device steps in the Install section.',q2:'Is it available on Android?',r2:'Yes, install it from Chrome as a web app (PWA).',q3:'Can I install it on iPhone?',r3:'Yes, via Safari: Share, then "Add to Home Screen".',q4:'Do I need Google Play?',r4:'No. It is a web app installed straight from the browser; there is no APK file.',q5:'Can I use the store in the browser?',r5:'Yes, the full store works in the browser without installing.',q6:'Is installation free?',r6:'Yes, installing is free.',q7:'How do I contact support?',r7:'From the Support section inside the store after signing in; also see the FAQ page.',
c_h:'Elevate your digital experience.',fo1:'Store',fo2:'FAQ',fo3:'Policies',up:'⬆ Top',
st_ready:'Ready to install ✓',st_done:'App is installed ✓ — opening the store…',st_ios:'On iPhone: tap Share ⎙ then "Add to Home Screen".',st_man:'Install prompt unavailable in this browser. Use the browser menu → "Install app", or open the store.',st_ok:'Installing… ✓',st_no:'Installation cancelled. You can try again anytime.',st_stand:'You are using the installed app ✓'};
var AR={st_ready:'جاهز للتثبيت ✓',st_done:'التطبيق مثبّت ✓ — جارٍ فتح المتجر…',st_ios:'على iPhone: اضغط مشاركة ⎙ ثم «إضافة إلى الشاشة الرئيسية».',st_man:'نافذة التثبيت غير متاحة في هذا المتصفح. استخدم قائمة المتصفح ← «تثبيت التطبيق» أو افتح المتجر.',st_ok:'جارٍ التثبيت… ✓',st_no:'أُلغي التثبيت. يمكنك المحاولة في أي وقت.',st_stand:'أنت تستخدم التطبيق المثبّت ✓'};
var lang='ar',stKey='';
$$('[data-i18n]').forEach(function(e){AR[e.dataset.i18n]=e.textContent});
function split(){var h=$('#h1');if(!h)return;var t=h.textContent.trim();h.setAttribute('aria-label',t);h.textContent='';t.split(/\s+/).forEach(function(w,i){var s=D.createElement('span');s.className='w';s.setAttribute('aria-hidden','true');s.style.setProperty('--i',i);s.textContent=w+' ';h.appendChild(s)})}
function stat(){var m=(lang==='en'?EN:AR)[stKey]||'';$$('[data-istat]').forEach(function(e){e.textContent=m})}
function setStat(k){stKey=k;stat()}
function setLang(l,first){lang=l;H.lang=l;H.dir=l==='ar'?'rtl':'ltr';var d=l==='en'?EN:AR;$$('[data-i18n]').forEach(function(e){var k=e.dataset.i18n;if(d[k]!=null&&e.id!=='h1')e.textContent=d[k]});var h=$('#h1');if(h){h.textContent=d.h1;split()}$('#lang').textContent=l==='ar'?'EN':'AR';D.title=l==='ar'?'ثبّت تطبيق AMARIX007':'Install AMARIX007 App';if(!first)try{localStorage.setItem(LK,l)}catch(e){}stat()}
var saved;try{saved=localStorage.getItem(LK)}catch(e){}
setLang(saved==='en'?'en':'ar',true);
$('#lang').addEventListener('click',function(){setLang(lang==='ar'?'en':'ar')});
var nav=$('#nav'),bg=$('#burger'),lk=$('#links');
function sc(){nav.classList.toggle('sc',scrollY>20)}addEventListener('scroll',sc,{passive:true});sc();
bg.addEventListener('click',function(){var o=lk.classList.toggle('open');bg.setAttribute('aria-expanded',o)});
$$('a',lk).forEach(function(a){a.addEventListener('click',function(){lk.classList.remove('open');bg.setAttribute('aria-expanded','false')})});
$('#up').addEventListener('click',function(){scrollTo({top:0})});
/* reveal */
var rv=$$('.rv');
if('IntersectionObserver' in window&&!RM){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{threshold:.12});rv.forEach(function(e,i){e.style.transitionDelay=(i%4)*70+'ms';io.observe(e)})}else rv.forEach(function(e){e.classList.add('in')});
/* spotlight cards */
$$('.sp').forEach(function(c){c.addEventListener('pointermove',function(e){var r=c.getBoundingClientRect();c.style.setProperty('--mx',e.clientX-r.left+'px');c.style.setProperty('--my',e.clientY-r.top+'px')})});
/* tilt + magnetic (fine pointers only) */
if(!RM&&matchMedia('(pointer:fine)').matches){var ph=$('#phone');if(ph)addEventListener('pointermove',function(e){var x=e.clientX/innerWidth-.5,y=e.clientY/innerHeight-.5;ph.style.transform='rotateY('+(-14+x*16)+'deg) rotateX('+(6-y*12)+'deg)'},{passive:true});
$$('.mag').forEach(function(b){b.addEventListener('pointermove',function(e){var r=b.getBoundingClientRect();b.style.transform='translate('+(e.clientX-r.left-r.width/2)*.18+'px,'+(e.clientY-r.top-r.height/2)*.25+'px)'});b.addEventListener('pointerleave',function(){b.style.transform=''})})}
/* tabs */
var ua=navigator.userAgent,isIOS=/iphone|ipad|ipod/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1),isAnd=/android/i.test(ua);
function os(n){$$('[data-os]').forEach(function(b){b.setAttribute('aria-selected',b.dataset.os===n)});$$('#steps ol').forEach(function(o){o.classList.toggle('on',o.dataset.p===n)})}
$$('[data-os]').forEach(function(b){b.addEventListener('click',function(){os(b.dataset.os)})});
os(isIOS?'ios':isAnd?'android':'desktop');
/* PWA install */
var dp=null,standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
if(standalone)setStat('st_stand');
else if(isIOS)setStat('st_ios');
addEventListener('beforeinstallprompt',function(e){e.preventDefault();dp=e;setStat('st_ready')});
addEventListener('appinstalled',function(){dp=null;setStat('st_done');setTimeout(function(){location.href=STORE},1500)});
$$('.js-install').forEach(function(b){b.addEventListener('click',function(){
 if(standalone){location.href=STORE;return}
 if(dp){var p=dp;dp=null;p.prompt();p.userChoice.then(function(c){setStat(c&&c.outcome==='accepted'?'st_ok':'st_no')}).catch(function(){setStat('st_no')});return}
 if(isIOS){os('ios');setStat('st_ios')}else setStat('st_man');
 var s=$('#install');if(s)s.scrollIntoView({behavior:RM?'auto':'smooth'})})});
if('serviceWorker' in navigator)navigator.serviceWorker.register('../sw.js',{scope:'/'}).catch(function(){});
/* particles */
var cv=$('#fx');
if(cv&&!RM&&cv.getContext){var cx=cv.getContext('2d'),P=[],N=MOB?22:60,W,Hh,run=true;
function rs(){W=cv.width=innerWidth;Hh=cv.height=innerHeight}rs();addEventListener('resize',rs);
for(var i=0;i<N;i++)P.push({x:Math.random()*W,y:Math.random()*Hh,r:Math.random()*1.8+.4,v:Math.random()*.35+.1,a:Math.random()*.6+.2});
D.addEventListener('visibilitychange',function(){run=!D.hidden;if(run)fr()});
function fr(){if(!run)return;cx.clearRect(0,0,W,Hh);P.forEach(function(p){p.y-=p.v;if(p.y<-5){p.y=Hh+5;p.x=Math.random()*W}cx.globalAlpha=p.a;cx.fillStyle='#b9ff66';cx.beginPath();cx.arc(p.x,p.y,p.r,0,6.283);cx.fill()});requestAnimationFrame(fr)}fr()}
})();
