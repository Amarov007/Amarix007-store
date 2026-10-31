(()=>{
const URL_='https://pvuobngrybygohendwaz.supabase.co',KEY='sb_publishable_NSRPj4wYUw7f9i7KX09Ipg_mvhNOCVs';
let S=null;try{S=JSON.parse(localStorage.getItem('sb')||'null')}catch{}
const save=s=>{S=s;try{s?localStorage.setItem('sb',JSON.stringify(s)):localStorage.removeItem('sb')}catch{}};
const tok=j=>({access_token:j.access_token,refresh_token:j.refresh_token,exp:j.expires_at||Math.floor(Date.now()/1000)+j.expires_in,uid:j.user.id,email:j.user.email});
async function refresh(){const r=await fetch(URL_+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:S.refresh_token})});
  if(!r.ok){save(null);return}save(tok(await r.json()))}
async function req(path,{method='GET',body,hdr={},raw}={}){
  if(S&&S.exp-60<Date.now()/1000)await refresh();
  const h={apikey:KEY,...hdr};if(S)h.Authorization='Bearer '+S.access_token;
  if(body&&!raw)h['Content-Type']='application/json';
  let r;try{r=await fetch(URL_+path,{method,headers:h,body:raw?body:body?JSON.stringify(body):undefined})}catch{throw new Error('تعذر الاتصال بالخادم، تحقق من الإنترنت')}
  const t=await r.text();let j=null;try{j=t?JSON.parse(t):null}catch{}
  if(!r.ok)throw new Error(j?.error||j?.msg||j?.message||j?.error_description||'حدث خطأ، حاول مجدداً');
  return j}
const SB={req,get:p=>req('/rest/v1/'+p),rpc:(f,a)=>req('/rest/v1/rpc/'+f,{method:'POST',body:a||{}}),
  fn:(n,b)=>req('/functions/v1/'+n,{method:'POST',body:b}),
  ins:(t,b)=>req('/rest/v1/'+t,{method:'POST',body:b,hdr:{Prefer:'return=minimal'}}),
  upd:(t,f,b)=>req('/rest/v1/'+t+'?'+f,{method:'PATCH',body:b,hdr:{Prefer:'return=minimal'}}),
  del:(t,f)=>req('/rest/v1/'+t+'?'+f,{method:'DELETE'}),
  login:async(e,p)=>save(tok(await req('/auth/v1/token?grant_type=password',{method:'POST',body:{email:e,password:p}}))),
  signup:async(e,p)=>{const j=await req('/auth/v1/signup',{method:'POST',body:{email:e,password:p}});if(j.access_token)save(tok(j));else throw new Error('تم إنشاء الحساب، فعّل بريدك ثم سجّل الدخول')},
  logout:()=>{save(null)},sess:()=>S};
window.SB=SB;

const $=s=>document.querySelector(s);
const h=(t,a={},...c)=>{const e=document.createElement(t);for(const[k,v]of Object.entries(a)){if(k.startsWith('on'))e.addEventListener(k.slice(2),v);else if(k==='class')e.className=v;else e.setAttribute(k,v)}e.append(...c.flat().filter(x=>x!=null&&x!==false));return e};
window.H=h;
const toast=m=>{const t=$('#toast');t.textContent=m;t.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>t.style.display='none',3500)};
window.toast=toast;
const go=p=>{location.hash=p};
const th=localStorage.getItem('theme');if(th)document.documentElement.dataset.theme=th;
$('#theme')?.addEventListener('click',()=>{const d=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=d;try{localStorage.setItem('theme',d)}catch{}});

let CUR=[],cur=localStorage.getItem('cur')||'USD';
const money=u=>{const c=CUR.find(x=>x.code===cur)||{rate_to_usd:1,symbol:'$'};const v=u/c.rate_to_usd;return(v>=100?v.toFixed(0):v.toFixed(2))+' '+c.symbol};
const BADGE={refill:'تعويض',fast:'سريع',new:'جديد'},QUAL={normal:'عادي',high:'عالي',guarantee:'ضمان'};
const ST={pending:'قيد الانتظار',processing:'قيد التنفيذ',completed:'مكتمل',partial:'جزئي',failed:'فشل'};
const guard=async f=>{try{await f()}catch(e){toast(e.message)}};

function head(){const a=$('#acct');a.textContent=S?'حسابي':'دخول';a.onclick=()=>go(S?'#/wallet':'#/login')}

async function home(m){
  const cats=await SB.get('categories?select=*&active=eq.true&order=sort');
  m.replaceChildren(h('div',{class:'grid'},cats.map(c=>h('a',{class:'card cat',href:'#/c/'+c.slug},h('span',{},c.icon||'🛒'),c.name_ar))),
    S&&h('p',{},h('a',{href:'#/orders'},'طلباتي'),' · ',h('a',{href:'#/wallet'},'محفظتي')));
}

async function cat(m,slug){
  const[c]=await SB.get('categories?select=*&slug=eq.'+encodeURIComponent(slug));if(!c)return m.replaceChildren('القسم غير موجود');
  const items=await SB.get('catalog?select=*&category_id=eq.'+c.id);
  const st={q:'',sort:'cheap',f:{}},facets=[['platform','المنصة'],['ptype','النوع'],['quality','الجودة'],['country','الدولة']];
  const bar=h('div'),list=h('div',{class:'grid'});
  const q=h('input',{placeholder:'🔍 ابحث…'});q.oninput=()=>{st.q=q.value.trim().toLowerCase();draw()};
  const so=h('select',{},[['cheap','الأرخص'],['popular','الأشهر'],['new','الأحدث']].map(([v,t])=>h('option',{value:v},t)));so.onchange=()=>{st.sort=so.value;draw()};
  function draw(){
    bar.replaceChildren(...facets.map(([k,l])=>{const vals=[...new Set(items.map(i=>i[k]).filter(Boolean))];
      return vals.length?h('div',{class:'chips'},h('span',{class:'mut'},l+':'),[null,...vals].map(v=>h('button',{class:'chip'+((st.f[k]||null)===v?' on':''),onclick:()=>{st.f[k]=v;draw()}},v?(k==='quality'?QUAL[v]:v):'الكل'))):null}));
    let r=items.filter(i=>(!st.q||i.name_ar.toLowerCase().includes(st.q))&&Object.entries(st.f).every(([k,v])=>!v||i[k]===v));
    r.sort((a,b)=>st.sort==='cheap'?a.unit_price-b.unit_price:st.sort==='popular'?b.popularity-a.popularity:new Date(b.created_at)-new Date(a.created_at));
    list.replaceChildren(...(r.length?r.map(card):[h('p',{class:'mut'},'لا توجد نتائج')]));
  }
  function card(p){
    const box=h('div',{class:'card'}),form=h('div');
    box.append(h('div',{},(p.badges||[]).map(b=>h('span',{class:'badge'},BADGE[b]||b))),h('b',{},p.name_ar),
      h('div',{class:'price'},money(p.unit_price),p.unit_size>1&&h('span',{class:'mut'},' / '+p.unit_size)),
      h('button',{onclick:()=>{form.children.length?form.replaceChildren():order(p,form)}},'اطلب الآن'),form);return box}
  m.replaceChildren(h('h2',{},c.name_ar),q,so,bar,list);draw();
}

function order(p,box){
  const qty=h('input',{type:'number',value:p.min_qty,min:p.min_qty,max:p.max_qty,inputmode:'numeric'}),inp={};
  const total=h('div',{class:'price'});const calc=()=>total.textContent='الإجمالي: '+money(p.unit_price*(+qty.value||0)/p.unit_size);qty.oninput=calc;calc();
  const fields=(p.input_fields||[]).map(f=>{inp[f.key]=h('input',{placeholder:f.label});return h('label',{},f.label,inp[f.key])});
  const btn=h('button',{onclick:()=>guard(async()=>{
    if(!S)return go('#/login');btn.disabled=true;
    try{const f={};let target=null;for(const[k,e]of Object.entries(inp)){if(!e.value.trim())throw new Error('أكمل الحقول المطلوبة');k==='target'?target=e.value.trim():f[k]=e.value.trim()}
      const id=await SB.rpc('place_order',{p_product:p.id,p_qty:+qty.value,p_target:target,p_fields:f,p_idem:crypto.randomUUID()});
      SB.fn('provider-api',{action:'submit',order_id:id}).catch(()=>{});toast('تم إرسال طلبك ✅');go('#/orders')}
    finally{btn.disabled=false}})},'تأكيد الشراء');
  box.append(...fields,h('label',{},p.unit_size>1?'الكمية':'العدد',qty),total,btn)}

async function orders(m){
  if(!S)return go('#/login');
  const[os,ps]=await Promise.all([SB.get('orders?select=*&order=created_at.desc&limit=50'),SB.get('catalog?select=id,name_ar')]);
  const nm=Object.fromEntries(ps.map(p=>[p.id,p.name_ar]));
  m.replaceChildren(h('h2',{},'طلباتي'),...(os.length?os.map(o=>h('div',{class:'card',style:'margin-bottom:10px'},
    h('b',{},nm[o.product_id]||'منتج'),h('div',{class:'mut'},new Date(o.created_at).toLocaleString('ar')+' · '+money(o.price_charged)),
    h('div',{class:'st-'+o.status},ST[o.status]||o.status),o.delivery_data&&h('div',{class:'card'},h('b',{},'بيانات التسليم: '),h('code',{},o.delivery_data)),
    o.error&&o.status==='failed'&&h('div',{class:'mut'},'تم استرجاع المبلغ لمحفظتك'))):[h('p',{class:'mut'},'لا توجد طلبات بعد')]));
}

async function wallet(m){
  if(!S)return go('#/login');
  const[[w],led,pms,tops]=await Promise.all([SB.get('wallets?select=balance'),SB.get('wallet_ledger?select=*&order=created_at.desc&limit=20'),SB.get('payment_methods?select=*&active=eq.true&order=sort'),SB.get('payment_topups?select=*&order=created_at.desc&limit=10')]);
  const pm=h('select',{},pms.map(x=>h('option',{value:x.code},x.name_ar))),info=h('div',{class:'mut'}),amt=h('input',{type:'number',placeholder:'المبلغ',inputmode:'decimal'}),
    cs=h('select',{},CUR.map(c=>h('option',{value:c.code},c.name_ar))),tx=h('input',{placeholder:'رقم العملية / TxID (اختياري)'}),file=h('input',{type:'file',accept:'image/*'});
  const showInfo=()=>{const x=pms.find(p=>p.code===pm.value);info.textContent=x?Object.values(x.details).join(' — '):''};pm.onchange=showInfo;showInfo();
  const go2=h('button',{onclick:()=>guard(async()=>{
    if(!(+amt.value>0))throw new Error('أدخل مبلغاً صحيحاً');let path=null;const f=file.files[0];
    if(f){if(f.size>5e6)throw new Error('حجم الصورة كبير (الحد 5MB)');const ext=(f.name.split('.').pop()||'jpg').replace(/\W/g,'').slice(0,5);path=S.uid+'/'+crypto.randomUUID()+'.'+ext;
      await req('/storage/v1/object/payment-proofs/'+path,{method:'POST',raw:true,body:f,hdr:{'Content-Type':f.type||'image/jpeg'}})}
    if(!path&&!tx.value.trim())throw new Error('ارفع إثبات الدفع أو أدخل رقم العملية');
    await SB.ins('payment_topups',{user_id:S.uid,method:pm.value,amount:+amt.value,currency:cs.value,tx_ref:tx.value.trim()||null,proof_path:path});
    toast('تم إرسال طلب الشحن للمراجعة ✅');wallet(m)})},'إرسال طلب الشحن');
  m.replaceChildren(h('h2',{},'محفظتي'),h('div',{class:'card'},'الرصيد: ',h('span',{class:'price'},money(+w.balance))),
    h('h3',{},'شحن الرصيد'),h('div',{class:'card'},pm,info,amt,cs,tx,h('label',{class:'mut'},'صورة الإثبات',file),go2),
    tops.length&&h('h3',{},'طلبات الشحن'),...tops.map(t=>h('div',{class:'mut'},t.amount+' '+t.currency+' — '+({pending:'قيد المراجعة',approved:'مقبول',rejected:'مرفوض'})[t.status])),
    h('h3',{},'آخر الحركات'),...led.map(l=>h('div',{class:'mut'},(l.amount>0?'+':'')+money(+l.amount)+' · '+l.note+' · '+new Date(l.created_at).toLocaleDateString('ar'))),
    h('p',{},S.email,' ',h('button',{class:'sec',onclick:()=>{SB.logout();head();go('#/')}},'تسجيل الخروج')));
}

function login(m){
  const e=h('input',{type:'email',placeholder:'البريد الإلكتروني',autocomplete:'email'}),p=h('input',{type:'password',placeholder:'كلمة المرور (8 أحرف فأكثر)',autocomplete:'current-password'});
  const done=()=>{head();go('#/')};
  m.replaceChildren(h('h2',{},'تسجيل الدخول'),h('div',{class:'card'},e,p,
    h('button',{onclick:()=>guard(async()=>{await SB.login(e.value.trim(),p.value);done()})},'دخول'),' ',
    h('button',{class:'sec',onclick:()=>guard(async()=>{if(p.value.length<8)throw new Error('كلمة المرور قصيرة');await SB.signup(e.value.trim(),p.value);done()})},'إنشاء حساب')));
}

async function route(){
  const m=$('#app'),[,a,b]=location.hash.split('/');head();
  try{if(a==='c')await cat(m,b);else if(a==='orders')await orders(m);else if(a==='wallet')await wallet(m);else if(a==='login')login(m);else await home(m)}
  catch(e){m.replaceChildren(h('p',{},e.message))}
}
async function init(){
  try{CUR=await SB.get('currencies?select=*&active=eq.true')}catch{}
  const cs=$('#cur');if(cs){cs.replaceChildren(...CUR.map(c=>h('option',{value:c.code},c.code)));cs.value=cur;cs.onchange=()=>{cur=cs.value;try{localStorage.setItem('cur',cur)}catch{}route()}}
  if($('#app')&&!document.body.dataset.admin){addEventListener('hashchange',route);route()}
}
init();
})();