const express = require('express');
const fs      = require('fs');
const path    = require('path');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;
const DATA = path.join(__dirname, 'data');
const ADMIN_PASS = 'lekhanhhuyadmin207@@@';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── HELPERS ──
function readJSON(file, def=[]) {
  try {
    const p=path.join(DATA,file);
    if(!fs.existsSync(p)) return def;
    return JSON.parse(fs.readFileSync(p,'utf8'));
  } catch { return def; }
}
function writeJSON(file,data) {
  if(!fs.existsSync(DATA)) fs.mkdirSync(DATA,{recursive:true});
  fs.writeFileSync(path.join(DATA,file),JSON.stringify(data,null,2),'utf8');
}

// Init data files
(function(){
  ['dataacc.json','mondoupdate.json','lichsu.json','lichsucongtien.json'].forEach(f=>{
    if(!fs.existsSync(path.join(DATA,f))) writeJSON(f,[]);
  });
})();

// ══════════════════════════════════════════
// ADMIN AUTH (password riêng, không dùng tài khoản)
// ══════════════════════════════════════════
app.post('/api/admin/login', (req,res)=>{
  const {pass} = req.body;
  if(pass !== ADMIN_PASS) return res.json({ok:false,msg:'Mật khẩu admin sai!'});
  res.json({ok:true,token:'admin_'+Buffer.from(ADMIN_PASS).toString('base64')});
});

function verifyAdmin(req,res){
  const token = req.headers['x-admin-token']||req.body?.adminToken||req.query?.adminToken;
  const valid  = 'admin_'+Buffer.from(ADMIN_PASS).toString('base64');
  if(token!==valid){res.json({ok:false,msg:'Không có quyền admin'});return false;}
  return true;
}

// ══════════════════════════════════════════
// ADMIN APIs
// ══════════════════════════════════════════

// Danh sách users
app.get('/api/admin/users',(req,res)=>{
  if(!verifyAdmin(req,res))return;
  const accs=readJSON('dataacc.json',[]);
  res.json({ok:true,data:accs.map(({pass:_,...u})=>u)});
});

// Xoá user
app.delete('/api/admin/users/:email',(req,res)=>{
  if(!verifyAdmin(req,res))return;
  let accs=readJSON('dataacc.json',[]);
  accs=accs.filter(a=>a.email!==req.params.email);
  writeJSON('dataacc.json',accs);
  res.json({ok:true});
});

// Cộng tiền
app.post('/api/admin/topup',(req,res)=>{
  if(!verifyAdmin(req,res))return;
  const {targetEmail,amount} = req.body;
  if(!amount||amount<1000) return res.json({ok:false,msg:'Tối thiểu 1,000đ'});
  let accs=readJSON('dataacc.json',[]);
  const idx=accs.findIndex(a=>a.email===targetEmail);
  if(idx<0) return res.json({ok:false,msg:'Tài khoản không tồn tại'});
  accs[idx].balance=(accs[idx].balance||0)+(+amount);
  writeJSON('dataacc.json',accs);
  // Lịch sử user
  const hist=readJSON('lichsu.json',[]);
  hist.unshift({type:'nap',email:targetEmail,amount:+amount,note:'Admin cộng tiền',time:Date.now()});
  writeJSON('lichsu.json',hist);
  // Lịch sử admin
  const ah=readJSON('lichsucongtien.json',[]);
  ah.unshift({email:targetEmail,amount:+amount,time:Date.now()});
  writeJSON('lichsucongtien.json',ah);
  res.json({ok:true,balance:accs[idx].balance});
});

// Trừ tiền
app.post('/api/admin/deduct',(req,res)=>{
  if(!verifyAdmin(req,res))return;
  const {targetEmail,amount}=req.body;
  let accs=readJSON('dataacc.json',[]);
  const idx=accs.findIndex(a=>a.email===targetEmail);
  if(idx<0) return res.json({ok:false,msg:'Không tìm thấy tài khoản'});
  accs[idx].balance=Math.max(0,(accs[idx].balance||0)-(+amount));
  writeJSON('dataacc.json',accs);
  res.json({ok:true,balance:accs[idx].balance});
});

// Lịch sử cộng tiền admin
app.get('/api/admin/topup-history',(req,res)=>{
  if(!verifyAdmin(req,res))return;
  res.json({ok:true,data:readJSON('lichsucongtien.json',[])});
});

// Toàn bộ lịch sử
app.get('/api/admin/history',(req,res)=>{
  if(!verifyAdmin(req,res))return;
  res.json({ok:true,data:readJSON('lichsu.json',[])});
});

// Quản lý sản phẩm
app.get('/api/admin/products',(req,res)=>{
  if(!verifyAdmin(req,res))return;
  res.json({ok:true,data:readJSON('mondoupdate.json',[])});
});

app.post('/api/admin/products',(req,res)=>{
  if(!verifyAdmin(req,res))return;
  const {name,img,link,price,code}=req.body;
  if(!name||!price||!code) return res.json({ok:false,msg:'Thiếu thông tin'});
  const items=readJSON('mondoupdate.json',[]);
  if(items.find(i=>i.code===code)) return res.json({ok:false,msg:'Mã đã tồn tại'});
  items.unshift({name,img,link,price:+price,code,added:Date.now()});
  writeJSON('mondoupdate.json',items);
  res.json({ok:true});
});

app.delete('/api/admin/products/:code',(req,res)=>{
  if(!verifyAdmin(req,res))return;
  let items=readJSON('mondoupdate.json',[]);
  items=items.filter(i=>i.code!==req.params.code);
  writeJSON('mondoupdate.json',items);
  res.json({ok:true});
});

// Duyệt nạp tiền pending
app.get('/api/admin/pending',(req,res)=>{
  if(!verifyAdmin(req,res))return;
  const hist=readJSON('lichsu.json',[]).filter(h=>h.type==='nap_pending');
  res.json({ok:true,data:hist});
});

app.post('/api/admin/approve',(req,res)=>{
  if(!verifyAdmin(req,res))return;
  const {email,amount,histId}=req.body;
  if(!amount||amount<1000) return res.json({ok:false,msg:'Số tiền không hợp lệ'});
  let accs=readJSON('dataacc.json',[]);
  const idx=accs.findIndex(a=>a.email===email);
  if(idx<0) return res.json({ok:false,msg:'Không tìm thấy tài khoản'});
  accs[idx].balance=(accs[idx].balance||0)+(+amount);
  writeJSON('dataacc.json',accs);
  // Đổi pending → nap
  let hist=readJSON('lichsu.json',[]);
  if(histId!==undefined) {
    const hi=hist.find((_,i)=>i===histId);
    if(hi){hi.type='nap';hi.amount=+amount;hi.approvedAt=Date.now();}
  } else {
    hist.unshift({type:'nap',email,amount:+amount,note:'Admin duyệt',time:Date.now()});
  }
  writeJSON('lichsu.json',hist);
  const ah=readJSON('lichsucongtien.json',[]);
  ah.unshift({email,amount:+amount,type:'approve',time:Date.now()});
  writeJSON('lichsucongtien.json',ah);
  res.json({ok:true,balance:accs[idx].balance});
});

// ══════════════════════════════════════════
// USER APIs (giữ nguyên)
// ══════════════════════════════════════════
app.post('/api/register',(req,res)=>{
  const {email,pass,ip}=req.body;
  if(!email||!pass) return res.json({ok:false,msg:'Thiếu thông tin'});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.json({ok:false,msg:'Email không hợp lệ'});
  if(pass.length<8) return res.json({ok:false,msg:'Mật khẩu tối thiểu 8 ký tự'});
  let accs=readJSON('dataacc.json',[]);
  if(accs.find(a=>a.email===email)) return res.json({ok:false,msg:'Email đã được đăng ký'});
  const clientIP=ip||req.ip||req.headers['x-forwarded-for']||'unknown';
  accs.push({email,pass,balance:0,ip:clientIP,created:Date.now()});
  writeJSON('dataacc.json',accs);
  res.json({ok:true});
});

app.post('/api/login',(req,res)=>{
  const {email,pass}=req.body;
  const accs=readJSON('dataacc.json',[]);
  const acc=accs.find(a=>a.email===email&&a.pass===pass);
  if(!acc) return res.json({ok:false,msg:'Email hoặc mật khẩu không đúng'});
  const {pass:_,...safe}=acc;
  res.json({ok:true,user:safe});
});

app.get('/api/me',(req,res)=>{
  const email=req.query.email;
  const accs=readJSON('dataacc.json',[]);
  const acc=accs.find(a=>a.email===email);
  if(!acc) return res.json({ok:false});
  const {pass:_,...safe}=acc;
  res.json({ok:true,user:safe});
});

app.get('/api/products',(req,res)=>res.json(readJSON('mondoupdate.json',[])));

app.post('/api/buy',(req,res)=>{
  const {email,code}=req.body;
  const items=readJSON('mondoupdate.json',[]);
  const item=items.find(i=>i.code===code);
  if(!item) return res.json({ok:false,msg:'Sản phẩm không tồn tại'});
  let accs=readJSON('dataacc.json',[]);
  const idx=accs.findIndex(a=>a.email===email);
  if(idx<0) return res.json({ok:false,msg:'Tài khoản không tồn tại'});
  if((accs[idx].balance||0)<item.price) return res.json({ok:false,msg:'Số dư không đủ'});
  accs[idx].balance-=item.price;
  writeJSON('dataacc.json',accs);
  const hist=readJSON('lichsu.json',[]);
  hist.unshift({type:'mua',email,amount:-item.price,name:item.name,code:item.code,link:item.link,time:Date.now()});
  writeJSON('lichsu.json',hist);
  res.json({ok:true,link:item.link,balance:accs[idx].balance});
});

app.post('/api/nap-request',(req,res)=>{
  const {email}=req.body;
  const hist=readJSON('lichsu.json',[]);
  hist.unshift({type:'nap_pending',email,amount:0,note:'Đợi admin xác nhận',time:Date.now()});
  writeJSON('lichsu.json',hist);
  res.json({ok:true});
});

app.get('/api/history',(req,res)=>{
  const {email}=req.query;
  res.json(readJSON('lichsu.json',[]).filter(h=>h.email===email));
});

app.listen(PORT,()=>console.log(`✅ Server: http://localhost:${PORT}`));
