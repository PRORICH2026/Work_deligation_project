// Headless local browser checks. Uses existing local data and does not mutate it.
require('dotenv').config({ quiet: true });
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {spawn}=require('node:child_process');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const target=new URL(process.env.DATABASE_URL);assert.ok(['localhost','127.0.0.1'].includes(target.hostname)&&target.pathname==='/delegation_management');assert.notEqual(process.env.NODE_ENV,'production');
 const {db}=require('../dist/src/config/db.js');const express=require('express');const app=express();app.use(require('cors')({origin:true,credentials:true}),express.json(),require('cookie-parser')());
 for(const [route,file] of [['auth','auth'],['performance','performance'],['employees','employees'],['departments','departments'],['tasks','tasks'],['notifications','notifications']])app.use('/api/'+route,require('../dist/src/routes/'+file+'.js').default);
 const dist=path.resolve(__dirname,'../../frontend/dist');app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.sendFile(path.join(dist,'index.html')));
 const server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s))});const base=`http://localhost:${server.address().port}`;
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'delegation-browser-'));
 const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
 let ws;let send;
 try{
  const portFile=path.join(profile,'DevToolsActivePort');for(let i=0;!fs.existsSync(portFile)&&i<200;i++)await pause(50);assert.ok(fs.existsSync(portFile),'Browser startup');
  const port=fs.readFileSync(portFile,'utf8').split('\n')[0];const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let sequence=0;const pending=new Map();
  send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},10000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});ws.send(JSON.stringify({id,method,params}))});
  ws.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(Error(m.error.message));else p.resolve(m.result);}else if(m.method==='Fetch.requestPaused'){const u=new URL(m.params.request.url);send('Fetch.continueRequest',{requestId:m.params.requestId,url:base+u.pathname+u.search}).catch(()=>{});}};
  await send('Page.enable');await send('Network.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*/api/*'}]});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Browser evaluation failed');return r.result.value;};
  async function until(expression){for(let i=0;i<120;i++){if(await evaluate(expression))return;await pause(100);}throw Error('Browser condition timeout: '+expression);}
  const [users]=await db.query("SELECT id,email,role FROM `User` WHERE email IN ('md.test@prorich.local','admin.test@prorich.local','hr.test@prorich.local','ea.test@prorich.local','employee.test@prorich.local')");
  async function enter(role,route){const u=users.find(u=>u.role===role);const token=require('../dist/src/lib/auth.js').createToken({userId:u.id,email:u.email,role:u.role});await send('Network.setCookie',{name:'delegation_token',value:token,url:base,path:'/',httpOnly:true,sameSite:'Lax'});await send('Page.navigate',{url:base+route});}
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  console.log('Browser initialized');await enter('MD','/performance');await until("document.querySelectorAll('.performance-table-card').length===2");
  assert.ok(await evaluate("document.body.innerText.includes('Performance & Scoring')"));
  console.log('Performance page rendered');const desktop=await evaluate("(()=>{const r=document.querySelector('.performance-page').getBoundingClientRect();return {width:r.width,left:r.left,viewport:document.documentElement.clientWidth}})()");assert.equal(desktop.width,1320);assert.ok(Math.abs(desktop.left-(desktop.viewport-desktop.width)/2)<2);
  await evaluate("document.querySelector('.performance-table-card button').click()");await until("!!document.querySelector('.performance-dialog[open]')");assert.ok(await evaluate("document.querySelector('.performance-dialog').innerText.includes('Score:')"));await evaluate("document.querySelector('.performance-dialog button').click()");
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.ok(await evaluate("(()=>{const p=document.querySelector('.performance-page'),t=document.querySelector('.performance-table-scroll');return p.getBoundingClientRect().width<=390 && t.scrollWidth>t.clientWidth})()"));
  for(const role of ['ADMIN','HR','EA','EMPLOYEE']){await enter(role,'/performance');await until("location.pathname==='/tasks'");}
  await enter('MD','/employee-management');await until("location.pathname==='/tasks'");
  await enter('EMPLOYEE','/employee-management');await until("location.pathname==='/tasks'");
  for(const role of ['HR','EA']){await enter(role,'/employee-management');await until("document.querySelector('.em-table-wrap') && document.body.innerText.includes('TEST-EMP-001')");}
  await enter('ADMIN','/employee-management');await until("document.querySelector('.em-table-wrap') && document.body.innerText.includes('TEST-EMP-001')");
  assert.ok(await evaluate("(()=>{const p=document.querySelector('.employee-management'),t=document.querySelector('.em-table-wrap');return p.getBoundingClientRect().width<=390 && t.scrollWidth>t.clientWidth})()"));
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  const employee=await evaluate("(()=>{const r=document.querySelector('.employee-management').getBoundingClientRect();return {width:r.width,left:r.left,viewport:document.documentElement.clientWidth}})()");assert.equal(employee.width,1276);assert.ok(Math.abs(employee.left-(employee.viewport-employee.width)/2)<2);
  await evaluate("document.querySelector('.em-heading button').click()");await until("!!document.querySelector('.em-dialog[open]')");assert.ok(await evaluate("document.querySelector('.em-dialog select[name=departmentId]').options.length>1"));
  assert.ok(await evaluate("(()=>{const r=document.querySelector('.em-dialog').getBoundingClientRect();return Math.abs(r.left-(innerWidth-r.width)/2)<2})()"));
  await evaluate("document.querySelector('.em-modal-actions button').click()");
  await evaluate("(()=>{const input=document.querySelector('.em-filters input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'TEST-EMP-001');input.dispatchEvent(new Event('input',{bubbles:true}));})()");
  await until("document.querySelectorAll('.em-table-wrap tbody tr').length===1 && document.querySelector('.em-table-wrap tbody').innerText.includes('TEST-EMP-001')");
  await evaluate("document.querySelector('.em-actions button').click()");await until("!!document.querySelector('.em-dialog[open]')");assert.ok(await evaluate("document.querySelector('.em-dialog').innerText.includes('New Password')"));
  console.log('PASS: headless Chrome desktop/mobile centering, table overflow, live tables, score dialog, employee search/add/reset dialogs, MD page access and all requested direct-route restrictions');
 }finally{if(send){try{await send('Network.clearBrowserCookies');await send('Browser.close')}catch{}}ws?.close();chrome.kill();server.closeAllConnections();await new Promise(r=>server.close(r));await db.end();}
}
main().catch(error=>{console.error('Browser verification failed:',error.message.replace(/delegation_token=[^ ]+/g,'[redacted]'));process.exitCode=1});
