(()=>{
const SB=window.SB,h=window.H,toast=window.toast,$=s=>document.querySelector(s),m=$('#app');
const act=f=>async()=>{try{await f()}catch(e){toast(e.message)}};
const row=(...c)=>h('div',{class:'card row'},...c);
const inp=(ph,t='text')=>h('input',{placeholder:ph,type:t});
const ask=(q,d='')=>prompt(q,d);
let tab='providers';
const TABS={providers:'المزودون',services:'الخدمات',products:'المنتجات والأقسام',orders:'الطلبات',topups:'شحنات المحفظة',users:'المستخدمون',reports:'التقارير'};

async function providers(){
  const ps=await SB.get('providers?select=*&order=priority');
  const n=inp('الاسم'),t=h('select',{},['smm','numbers','topup','stock','custom'].map(x=>h('option',{},x))),u=inp('الرابط https://…'),s=inp('اسم السر مثل SMM_PROVIDER_2_KEY');
  m.replaceChildren(...ps.map(p=>h('div',{class:'card'},h('b',{},p.name),' ',h('span',{class:'mut'},p.type+' · أولوية '+p.priority+' · '+p.status),
    h('div',{class:'mut'},p.base_url+' ← '+p.secret_name),h('div',{},'الرصيد: '+(p.last_balance??'—')+(p.last_balance!=null&&+p.last_balance<+p.low_balance_threshold?' ⚠️ منخفض':'')),
    h('button',{onclick:act(async()=>{const r=await SB.fn('provider-api',{action:'test',provider_id:p.id});toast('الاتصال ناجح. الرصيد: '+r.balance+(r.low?' ⚠️ منخفض':''));providers()})},'اختبار الاتصال والرصيد'),
    h('button',{onclick:act(async()=>{const r=await SB.fn('provider-api',{action:'sync',provider_id:p.id});toast('تمت مزامنة '+r.count+' خدمة')})},'مزامنة الخدمات'),
    h('button',{class:'sec',onclick:act(async()=>{await SB.upd('providers','id=eq.'+p.id,{status:p.status==='active'?'disabled':'active'});providers()})},p.status==='active'?'تعطيل':'تفعيل'),
    h('button',{class:'sec',onclick:act(async()=>{const v=ask('الرابط (https)',p.base_url);if(v){await SB.upd('providers','id=eq.'+p.id,{base_url:v});providers()}})},'الرابط'),
    h('button',{class:'sec',onclick:act(async()=>{const v=ask('إعدادات JSON (spec للمزود المخصص)',JSON.stringify(p.config));if(v){await SB.upd('providers','id=eq.'+p.id,{config:JSON.parse(v)});toast('تم الحفظ')}})},'JSON'))),
    h('h3',{},'إضافة مزود'),row(n,t,u,s,h('button',{onclick:act(async()=>{await SB.ins('providers',{name:n.value,type:t.value,base_url:u.value,secret_name:s.value});providers()})},'إضافة')));
}

async function services(){
  const ps=await SB.get('providers?select=id,name'),prods=await SB.rpc('admin_products');
  const pv=h('select',{},ps.map(p=>h('option',{value:p.id},p.name))),q=inp('بحث في الخدمات'),out=h('div'),pr=h('select',{},prods.map(p=>h('option',{value:p.id},p.name_ar))),pri=inp('الأولوية (1 = الأول)','number');pri.value=1;
  const load=act(async()=>{const l=await SB.get('provider_services?select=*&provider_id=eq.'+pv.value+(q.value?'&name=ilike.*'+encodeURIComponent(q.value)+'*':'')+'&limit=40');
    out.replaceChildren(...l.map(s=>row(h('span',{},s.name+' — '+s.rate),h('button',{onclick:act(async()=>{await SB.ins('product_provider_routes',{product_id:pr.value,provider_service_id:s.id,priority:+pri.value||1});toast('تم الربط مع المنتج المحدد')})},'ربط'))))});
  m.replaceChildren(h('p',{class:'mut'},'اختر المنتج والأولوية ثم اضغط «ربط» (أولويات متعددة = Fallback)'),row(pv,q,h('button',{onclick:load},'عرض')),row('المنتج:',pr,pri),out);
}

async function products(){
  const cats=await SB.get('categories?select=*&order=sort'),ps=await SB.rpc('admin_products');
  const cn=inp('اسم القسم'),cs=inp('slug إنجليزي'),ck=h('select',{},['smm','numbers','ai','games','chat','custom'].map(x=>h('option',{},x))),ci=inp('أيقونة 🛒');
  const pc=h('select',{},cats.map(c=>h('option',{value:c.id},c.name_ar))),pn=inp('اسم المنتج'),pb=inp('سعر التكلفة $','number'),pu=inp('لكل كم (1 أو 1000)','number'),pmn=inp('أقل كمية','number'),pmx=inp('أكبر كمية','number'),pd=h('select',{},['provider','stock','manual'].map(x=>h('option',{},x))),pf=inp('حقول الإدخال JSON','text');
  pu.value=1;pmn.value=1;pmx.value=1;pf.value='[{"key":"player_id","label":"معرّف اللاعب"}]';
  m.replaceChildren(h('h3',{},'الأقسام'),...cats.map(c=>row(h('span',{},c.icon+' '+c.name_ar+' (ربح: '+(c.margin_pct??'عام')+'%)'),
    h('button',{class:'sec',onclick:act(async()=>{const v=ask('نسبة ربح القسم %',c.margin_pct??'');await SB.upd('categories','id=eq.'+c.id,{margin_pct:v===''?null:+v});products()})},'الربح'),
    h('button',{class:'sec',onclick:act(async()=>{await SB.upd('categories','id=eq.'+c.id,{active:!c.active});products()})},c.active?'إخفاء':'إظهار'))),
    h('h4',{},'قسم جديد'),row(cn,cs,ck,ci,h('button',{onclick:act(async()=>{await SB.ins('categories',{name_ar:cn.value,slug:cs.value,kind:ck.value,icon:ci.value});products()})},'إضافة')),
    h('h3',{},'المنتجات'),...ps.map(p=>row(h('span',{},p.name_ar+' · تكلفة '+p.base_price+' · ربح '+(p.margin_pct??'القسم/العام')+' · '+(p.active?'نشط':'مخفي')),
      h('button',{class:'sec',onclick:act(async()=>{await SB.upd('products','id=eq.'+p.id,{base_price:+ask('سعر التكلفة',p.base_price)});products()})},'التكلفة'),
      h('button',{class:'sec',onclick:act(async()=>{const v=ask('نسبة ربح % (فارغ=افتراضي)',p.margin_pct??'');await SB.upd('products','id=eq.'+p.id,{margin_pct:v===''?null:+v});products()})},'الربح'),
      h('button',{class:'sec',onclick:act(async()=>{const v=ask('سعر بيع ثابت (فارغ=حسب الربح)',p.price_override??'');await SB.upd('products','id=eq.'+p.id,{price_override:v===''?null:+v});products()})},'سعر ثابت'),
      h('button',{class:'sec',onclick:act(async()=>{await SB.upd('products','id=eq.'+p.id,{active:!p.active});products()})},p.active?'إخفاء':'إظهار'),
      p.delivery==='stock'&&h('button',{onclick:act(async()=>{const v=ask('الصق الأكواد، كل كود في سطر');if(v){await SB.ins('stock_codes',v.split(/[\n,]+/).map(x=>x.trim()).filter(Boolean).map(code=>({product_id:p.id,code})));toast('تمت إضافة الأكواد')}})},'مخزون'))),
    h('h4',{},'منتج جديد'),row(pc,pn,pb,pu,pmn,pmx,pd,pf,h('button',{onclick:act(async()=>{await SB.ins('products',{category_id:pc.value,name_ar:pn.value,base_price:+pb.value,unit_size:+pu.value,min_qty:+pmn.value,max_qty:+pmx.value,delivery:pd.value,input_fields:JSON.parse(pf.value)});products()})},'إضافة')));
}

async function orders(){
  const os=await SB.get('orders?select=*&order=created_at.desc&limit=50');
  m.replaceChildren(...os.map(o=>h('div',{class:'card'},h('b',{},o.status),' · '+o.price_charged+'$ · كمية '+o.qty,h('div',{class:'mut'},(o.target||'')+' '+JSON.stringify(o.fields)+(o.error?' · '+o.error:'')),
    h('button',{onclick:act(async()=>{const r=await SB.fn('provider-api',{action:'submit',order_id:o.id});toast('الحالة: '+r.status);orders()})},'إرسال / إعادة إرسال'),
    h('button',{class:'sec',onclick:act(async()=>{const r=await SB.fn('provider-api',{action:'status',order_id:o.id});toast('الحالة: '+r.status);orders()})},'تحديث الحالة'),
    h('button',{class:'sec',onclick:act(async()=>{const v=ask('بيانات التسليم (رقم/كود/ملاحظة)');if(v){await SB.upd('orders','id=eq.'+o.id,{status:'completed',delivery_data:v});orders()}})},'إكمال يدوي'),
    h('button',{class:'sec',onclick:act(async()=>{if(confirm('استرجاع المبلغ للمحفظة؟')){await SB.rpc('refund_order',{p_order:o.id,p_reason:'استرجاع إداري'});await SB.upd('orders','id=eq.'+o.id,{status:'failed'});orders()}})},'استرجاع'))));
}

async function topups(){
  const ts=await SB.get('payment_topups?select=*&order=created_at.desc&limit=40');
  m.replaceChildren(...ts.map(t=>h('div',{class:'card'},h('b',{},t.amount+' '+t.currency),' · '+t.method+' · '+t.status,h('div',{class:'mut'},'TxID: '+(t.tx_ref||'—')),
    t.proof_path&&h('button',{class:'sec',onclick:act(async()=>{const r=await SB.req('/storage/v1/object/sign/payment-proofs/'+t.proof_path,{method:'POST',body:{expiresIn:300}});window.open('https://pvuobngrybygohendwaz.supabase.co/storage/v1'+r.signedURL,'_blank','noopener')})},'عرض الإثبات'),
    t.status==='pending'&&h('span',{},h('button',{onclick:act(async()=>{await SB.rpc('review_topup',{p_topup:t.id,p_approve:true});topups()})},'قبول'),
      h('button',{class:'sec',onclick:act(async()=>{await SB.rpc('review_topup',{p_topup:t.id,p_approve:false,p_note:ask('سبب الرفض')||null});topups()})},'رفض')))));
}

async function users(){
  const us=await SB.get('profiles?select=*&order=created_at.desc&limit=50'),ws=await SB.get('wallets?select=*');
  const bal=Object.fromEntries(ws.map(w=>[w.user_id,w.balance]));
  m.replaceChildren(...us.map(u=>row(h('span',{},u.email+' · '+u.role+(u.banned?' · موقوف':'')+' · '+(bal[u.id]??0)+'$'),
    h('button',{onclick:act(async()=>{const v=+ask('مبلغ الشحن/الخصم (سالب للخصم)');const n=ask('السبب');if(v){await SB.rpc('admin_adjust_wallet',{p_user:u.id,p_amount:v,p_note:n||'تعديل إداري'});users()}})},'تعديل الرصيد'),
    h('button',{class:'sec',onclick:act(async()=>{await SB.rpc('admin_set_user',{p_user:u.id,p_banned:!u.banned});users()})},u.banned?'فك الحظر':'حظر'),
    h('button',{class:'sec',onclick:act(async()=>{const r=ask('الدور: user / staff / admin',u.role);if(r){await SB.rpc('admin_set_user',{p_user:u.id,p_role:r});if(r==='staff'){const p=ask('الصلاحيات مفصولة بفاصلة: orders,topups,catalog,providers,wallets,users','orders,topups');if(p)await SB.req('/rest/v1/staff_permissions?on_conflict=user_id',{method:'POST',body:{user_id:u.id,permissions:p.split(',').map(x=>x.trim())},hdr:{Prefer:'resolution=merge-duplicates,return=minimal'}})}users()}})},'الدور'))));
}

async function reports(){
  const[os,ps]=await Promise.all([SB.get('orders?select=product_id,qty,price_charged,refunded_amount,status&status=in.(completed,processing,partial,pending)'),SB.rpc('admin_products')]);
  const pm=Object.fromEntries(ps.map(p=>[p.id,p]));let rev=0,cost=0;const by={};
  for(const o of os){const p=pm[o.product_id],net=+o.price_charged-+o.refunded_amount,c=p?p.base_price*o.qty/p.unit_size:0;rev+=net;cost+=c;by[p?.name_ar||'؟']=(by[p?.name_ar||'؟']||0)+net-c}
  const top=Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,5);
  m.replaceChildren(h('div',{class:'card'},'عدد الطلبات: '+os.length),h('div',{class:'card'},'المبيعات: $'+rev.toFixed(2)),h('div',{class:'card'},'التكلفة التقديرية: $'+cost.toFixed(2)),h('div',{class:'card'},h('b',{},'صافي الربح: $'+(rev-cost).toFixed(2))),h('h4',{},'الأكثر ربحاً'),...top.map(([k,v])=>row(k+': $'+v.toFixed(2))));
}

const V={providers,services,products,orders,topups,users,reports};
function nav(){$('#tabs').replaceChildren(...Object.entries(TABS).map(([k,l])=>h('button',{class:k===tab?'on':'sec',onclick:()=>{tab=k;nav();run()}},l)))}
async function run(){try{await V[tab]()}catch(e){m.replaceChildren(h('p',{},e.message))}}
(async()=>{
  const s=SB.sess();if(!s)return m.replaceChildren(h('p',{},'سجّل الدخول من '),h('a',{href:'index.html#/login'},'صفحة الدخول'),' بحساب الأدمن ثم عد هنا.');
  try{const[p]=await SB.get('profiles?select=role&id=eq.'+s.uid);if(!p||!['admin','staff'].includes(p.role))return m.replaceChildren('ليست لديك صلاحية الدخول');}catch(e){return m.replaceChildren(e.message)}
  nav();run();
})();
})();