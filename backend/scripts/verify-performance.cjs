// Read-only local verification against independent wall-clock classifications.
require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
async function main() {
 const target = new URL(process.env.DATABASE_URL);
 assert.ok(['localhost','127.0.0.1'].includes(target.hostname) && target.pathname === '/delegation_management');
 assert.notEqual(process.env.NODE_ENV, 'production');
 const {db} = require('../dist/src/config/db.js');
 const express = require('express'); const app = express(); app.use(express.json(), require('cookie-parser')());
 app.use('/performance', require('../dist/src/routes/performance.js').default);
 const server = await new Promise(resolve => { const s = app.listen(0,'127.0.0.1',()=>resolve(s)); });
 const base = `http://127.0.0.1:${server.address().port}`;
 try {
   const [users] = await db.query("SELECT id,email,role FROM `User` WHERE email IN ('md.test@prorich.local','admin.test@prorich.local','hr.test@prorich.local','ea.test@prorich.local','employee.test@prorich.local')");
   const {createToken} = require('../dist/src/lib/auth.js');
   const cookies = Object.fromEntries(users.map(u => [u.role, `delegation_token=${createToken({userId:u.id,email:u.email,role:u.role})}`]));
   async function request(q='', role='MD') { const r=await fetch(base+'/performance'+q,{headers:{Cookie:cookies[role]}});return {status:r.status,body:await r.json()}; }
   for (const role of ['ADMIN','HR','EA','EMPLOYEE']) assert.equal((await request('',role)).status,403);
   const result = await request(); assert.equal(result.status,200);
   const [tasks] = await db.query(`SELECT id,assignedEmployeeId,assignedEaId,departmentId,status,
     DATE_FORMAT(createdAt,'%Y-%m-%d %H:%i:%s.%f') AS created,
     DATE_FORMAT(completedAt,'%Y-%m-%d %H:%i:%s.%f') AS completed,
     DATE_FORMAT(eaFirstActionAt,'%Y-%m-%d %H:%i:%s.%f') AS assigned,
     DATE_FORMAT(currentTargetDate,'%Y-%m-%d') AS target FROM Task`);
   const [history] = await db.query("SELECT taskId,DATE_FORMAT(MIN(createdAt),'%Y-%m-%d %H:%i:%s.%f') AS assigned FROM TaskStatusHistory WHERE fromStatus='NEW' AND toStatus='IN_PROGRESS' GROUP BY taskId");
   const historyMap=new Map(history.map(h=>[h.taskId,h.assigned]));
   const time=v=>v?Date.parse(v.replace(' ','T').slice(0,23)+'+05:30'):null;
   function outcome(t,now){if(!t.target)return 'UNKNOWN';const deadline=Date.parse(t.target+'T23:59:59.999+05:30');if(t.status==='COMPLETED'){const complete=time(t.completed);return complete===null||complete>now||complete<time(t.created)?'UNKNOWN':complete<=deadline?'ON TIME':'DELAYED'}return now>deadline?'DELAYED':'NOT DUE'}
   function assignment(t,now){const created=time(t.created);if(created===null||created>now)return 'UNKNOWN';const deadline=created+7200000;if(t.assignedEmployeeId===null)return now>deadline?'DELAYED':'NOT DUE';const actual=[time(t.assigned),time(historyMap.get(t.id))].find(v=>v!==null&&v>=created&&v<=now);return actual===undefined?'UNKNOWN':actual<=deadline?'ON TIME':'DELAYED'}
   let checks=0;
   const departments=result.body.data.departments;
   const scenarios=['','?type=EMPLOYEE','?type=EA','?fromDate=2000-01-01&toDate=2000-01-01','?fromDate=2026-09-30&toDate=2026-09-30',...departments.map(d=>`?departmentId=${d.id}`)];
   for(const q of scenarios) {
     const response=await request(q);assert.equal(response.status,200);const data=response.body.data;const f=new URLSearchParams(q);const unique=new Map();const checkpoints=new Map();const now=Date.parse(data.asOf);
     for(const p of data.people){
       if(f.has('type'))assert.equal(p.kind,f.get('type'));
       if(p.kind==='EMPLOYEE'&&f.has('departmentId'))assert.equal(p.departmentId,Number(f.get('departmentId')));
       const cohort=tasks.filter(t=>t.status!=='CANCELLED'&&(!f.has('fromDate')||t.created.slice(0,10)>=f.get('fromDate'))&&(!f.has('toDate')||t.created.slice(0,10)<=f.get('toDate'))&&(p.kind==='EMPLOYEE'?t.assignedEmployeeId===p.id:t.assignedEaId===p.id&&(!f.has('departmentId')||t.departmentId===Number(f.get('departmentId')))));
       cohort.forEach(t=>unique.set(t.id,t));assert.equal(p.assigned,cohort.length);
       let eligible=0,onTime=0;
       for(const [key,classify] of [['outcome',outcome],...(p.kind==='EA'?[['assignment',assignment]]:[])]){
         const results=cohort.map(t=>{const v=classify(t,now);checkpoints.set(t.id+':'+key,v);return v});
         const good=results.filter(v=>v==='ON TIME').length,bad=results.filter(v=>v==='DELAYED').length;
         assert.equal(p[key].onTime,good);assert.equal(p[key].delayed,bad);assert.equal(p[key].eligible,good+bad);assert.equal(p[key].notDue,results.filter(v=>v==='NOT DUE').length);assert.equal(p[key].unknown,results.filter(v=>v==='UNKNOWN').length);eligible+=good+bad;onTime+=good;
       }
       assert.equal(p.eligible,eligible);assert.equal(p.score,eligible?Math.round(1000*onTime/eligible)/10:null);checks++;
     }
     assert.equal(data.summary.totalDelegations,unique.size);
     assert.equal(data.summary.onTime,[...checkpoints.values()].filter(v=>v==='ON TIME').length);
     assert.equal(data.summary.delayed,[...checkpoints.values()].filter(v=>v==='DELAYED').length);
   }
   if(result.body.data.people.length){const p=result.body.data.people[0];const r=await request('?search='+encodeURIComponent(p.name));assert.ok(r.body.data.people.every(row=>row.name.toLowerCase().includes(p.name.toLowerCase())));}
   for(const q of ['?fromDate=2026-02-30','?fromDate=2026-10-01&toDate=2026-01-01','?departmentId=bad'])assert.equal((await request(q)).status,400);
   // Changing only this connection's session timezone must not shift stored India data.
   const connection=await db.getConnection();const originalQuery=db.query;
   const [[zone]]=await connection.query('SELECT @@session.time_zone AS zone');
   try{db.query=connection.query.bind(connection);const results=[];for(const z of ['+00:00','+05:30']){await connection.query('SET time_zone = ?',[z]);const r=await request('?fromDate=2026-09-01&toDate=2026-09-30');assert.equal(r.status,200);results.push(r.body.data.people)}assert.deepEqual(results[0],results[1]);}
   finally{db.query=originalQuery;await connection.query('SET time_zone = ?',[zone.zone]);connection.release()}
   console.log(JSON.stringify({result:'PASS',summary:result.body.data.summary,departmentScenarios:departments.length,personComparisons:checks,checks:'MD access, denied roles, department/type/date/search, independent checkpoint math and DB session timezone invariance',databaseRowWrites:0}));
 } finally { await new Promise(resolve=>server.close(resolve)); await db.end(); }
}
main().catch(() => { console.error('Performance local verification FAILED; sensitive details suppressed.'); process.exitCode=1; });
