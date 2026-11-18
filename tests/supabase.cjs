const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes=new Map();
function node(key){if(!nodes.has(key))nodes.set(key,{style:{},dataset:{},classList:{remove(){},toggle(){}},querySelectorAll(){return []},querySelector(s){return node(s)},addEventListener(){},prepend(){},append(){},remove(){},focus(){},setSelectionRange(){}});return nodes.get(key)}
const data=new Map();const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
let failure=false;const requests=[];
const snapshot={profile:{id:'profile-id',role:'clinic',name:'Clínica real'},clients:[],prescriptions:[],notifications:[],payments:[]};
const ctx=vm.createContext({console,structuredClone,Intl,Date,Math,URL,Blob,JSON,Number,String,Array,Object,FormData,localStorage:storage,sessionStorage:storage,document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){},createElement:()=>node('new')},location:{pathname:'/',origin:'https://test.example',assign(){}},window:{scrollTo(){},addEventListener(){},print(){},open(){}},navigator:{},setTimeout(){},setInterval(){},fetch:async(url,options)=>{requests.push({url,options});return {ok:!failure,json:async()=>failure?{message:'permission denied'}:structuredClone(snapshot)}}});
for(const path of ['app.js','workflows.js','supabase-config.js','supabase-live.js'])vm.runInContext(fs.readFileSync(path,'utf8'),ctx);
const run=s=>vm.runInContext(s,ctx);
(async()=>{
 assert.equal(run('state.clients.length'),0,'no demo patients');
 assert.equal(requests.length,0,'no anonymous data loading');
 assert.equal(run('demoAccounts.some(a=>a.password)'),false,'no hardcoded passwords');
 run("keepSession({access_token:'test-jwt',refresh_token:'test-refresh',expires_in:3600})");
 await run("command('validate',{code:'VF-TEST'})");
 assert.equal(JSON.parse(requests[0].options.body).action,'validate');
 assert.equal(requests[0].options.headers.Authorization,'Bearer test-jwt');
 assert.equal(run('role'),'clinic');
 failure=true;
 await assert.rejects(run("command('create',{name:'Should not be saved'})"),/permission denied/);
 assert.equal(run('state.clients.length'),0,'failed writes do not mutate clients');
 assert.equal(run('sbBusy'),false,'failure releases busy state');
 assert.equal(data.has('visioflow-demo-v1'),false,'no clinical state in localStorage');
 failure=false;
 for(const r of ['institution','clinic','optics','admin'])run(`role='${r}';for(const [key] of menu[role])go(key)`);
 console.log('PASS: startup, authenticated RPC, failure propagation, no local fallback, all dashboard routes.');
})().catch(e=>{console.error(e);process.exitCode=1});
