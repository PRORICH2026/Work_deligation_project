const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL='mysql://test:test@127.0.0.1:1/test';
process.env.JWT_SECRET='performance-test-secret';
const {buildPerformance,classifyTask,targetEndOfDay,indiaMidnight,percentage}=require('../dist/src/services/performanceScoring.js');
const {performanceFilters}=require('../dist/src/routes/performance.js');
const {db}=require('../dist/src/config/db.js');
const {createToken}=require('../dist/src/lib/auth.js');
const at=s=>Date.parse(s+'+05:30');
const now=at('2026-10-02T12:00:00');
const created=at('2026-09-30T10:00:00');
const task={id:1,departmentId:1,assignedEmployeeId:1,assignedEaId:2,status:'IN_PROGRESS',createdMs:created,assignmentMs:created+5400000,historyAssignmentMs:null,completedMs:null,targetDate:'2026-09-30'};
const persons=[{id:1,kind:'EMPLOYEE',name:'Employee One',departmentId:1,departmentName:'One'},{id:2,kind:'EA',name:'EA One',departmentId:2,departmentName:'Two'},{id:3,kind:'EMPLOYEE',name:'Employee Two',departmentId:2,departmentName:'Two'}];
const filters={type:'ALL',search:''};
const report=(tasks,extra={})=>buildPerformance(tasks,persons,{...filters,...extra},now);
test('exactly 2-hour assignment is on time',()=>assert.equal(classifyTask({...task,assignmentMs:created+7200000},now).assignment,'ON TIME'));
test('2 hours plus 1 second assignment is delayed',()=>assert.equal(classifyTask({...task,assignmentMs:created+7201000},now).assignment,'DELAYED'));
test('unassigned before or exactly at SLA is not due; after SLA delayed',()=>{
 const t={...task,assignedEmployeeId:null,assignmentMs:null,status:'NEW'};
 for(const offset of [7199999,7200000])assert.equal(classifyTask(t,created+offset).assignment,'NOT DUE');
 assert.equal(classifyTask(t,created+7200001).assignment,'DELAYED');
 assert.equal(report([t]).people[0].assigned,0);
});
test('target end-of-day completion is on time, with exact India milliseconds',()=>{
 const deadline=targetEndOfDay('2026-09-30');assert.equal(deadline,Date.parse('2026-09-30T18:29:59.999Z'));
 assert.equal(classifyTask({...task,status:'COMPLETED',completedMs:deadline},now).outcome,'ON TIME');
});
test('one millisecond after target end-of-day is delayed',()=>assert.equal(classifyTask({...task,status:'COMPLETED',completedMs:targetEndOfDay(task.targetDate)+1},now).outcome,'DELAYED'));
test('open overdue task is delayed; exact EOD remains not due',()=>{
 assert.equal(classifyTask(task,now).outcome,'DELAYED');assert.equal(classifyTask(task,now).overdue,true);
 assert.equal(classifyTask(task,targetEndOfDay(task.targetDate)).outcome,'NOT DUE');
});
test('future tasks not due; pending/delayed statuses and revisions add no penalty',()=>{
 for(const status of ['IN_PROGRESS','ON_HOLD','DELAYED'])assert.equal(classifyTask({...task,status,targetDate:'2026-10-10',delayCount:3,targetDateUpdateCount:3},now).outcome,'NOT DUE');
 assert.equal(report([{...task,targetDate:'2026-10-10'}]).people[0].score,null);
});
test('cancelled tasks excluded from employee and both EA checkpoints',()=>{
 assert.equal(classifyTask({...task,status:'CANCELLED'},now),null);
 for(const p of report([{...task,status:'CANCELLED'}]).people){assert.equal(p.assigned,0);assert.equal(p.eligible,0);assert.equal(p.score,null)}
});
test('zero denominator and unknown evidence never fabricate scores',()=>{
 assert.equal(percentage(0,0),null);
 for(const p of report([]).people)assert.equal(p.score,null);
 const p=report([{...task,status:'COMPLETED',completedMs:null,targetDate:null,assignmentMs:null}]).people[0];assert.equal(p.score,null);assert.equal(p.outcome.unknown,1);
 assert.equal(targetEndOfDay('2026-02-30'),null);
});
test('primary assignment timestamp wins; history fallback belongs to assigned EA regardless of actor',()=>{
 const history=created+7201000;
 assert.equal(classifyTask({...task,historyAssignmentMs:history},now).assignmentSource,'eaFirstActionAt');
 const t={...task,assignmentMs:null,historyAssignmentMs:history,changedById:999};
 assert.equal(classifyTask(t,now).assignmentSource,'NEW -> IN_PROGRESS history');
 assert.equal(report([t]).people.find(p=>p.kind==='EA').assignment.delayed,1);
 assert.equal(classifyTask({...task,assignmentMs:created-1,historyAssignmentMs:created+1000},now).assignment,'ON TIME');
});
test('employee exact percentage: eight on-time of ten eligible is 80 percent',()=>{
 const tasks=Array.from({length:12},(_,i)=>({...task,id:i+1,status:i<10?'COMPLETED':'IN_PROGRESS',targetDate:i>=10?'2026-10-10':task.targetDate,completedMs:i<8?created+10000:i<10?targetEndOfDay(task.targetDate)+1:null}));
 const p=report(tasks).people[0];assert.equal(p.assigned,12);assert.equal(p.outcome.notDue,2);assert.equal(p.eligible,10);assert.equal(p.onTime,8);assert.equal(p.score,80);
});
test('EA exact checkpoint percentage: sixteen of eighteen is 88.9 percent',()=>{
 const tasks=Array.from({length:10},(_,i)=>({...task,id:i+1,assignmentMs:created+(i===9?7201000:5400000),status:i<8?'COMPLETED':'IN_PROGRESS',targetDate:i>=8?'2026-10-10':task.targetDate,completedMs:i<7?created+10000:i===7?targetEndOfDay(task.targetDate)+1:null}));
 const p=report(tasks).people.find(p=>p.kind==='EA');assert.equal(p.assignment.eligible,10);assert.equal(p.assignment.onTime,9);assert.equal(p.outcome.eligible,8);assert.equal(p.outcome.onTime,7);assert.equal(p.outcome.notDue,2);assert.equal(p.eligible,18);assert.equal(p.onTime,16);assert.equal(p.score,88.9);
});
test('department filtering uses employee membership and EA delegation department',()=>{
 const tasks=[task,{...task,id:2,assignedEmployeeId:3,departmentId:2}];
 const r=report(tasks,{departmentId:1});assert.equal(r.people.some(p=>p.kind==='EMPLOYEE'&&p.id===3),false);assert.equal(r.people.find(p=>p.kind==='EA').assigned,1);assert.equal(r.summary.totalDelegations,1);
});
test('reporting period uses inclusive India created date, not completion date',()=>{
 const tasks=[{...task,id:1,createdMs:indiaMidnight('2026-09-30')-1},{...task,id:2,createdMs:indiaMidnight('2026-09-30')},{...task,id:3,createdMs:indiaMidnight('2026-10-01')-1},{...task,id:4,createdMs:indiaMidnight('2026-10-01')}];
 assert.deepEqual(report(tasks,{fromDate:'2026-09-30',toDate:'2026-09-30'}).people[0].details.map(d=>d.id),[2,3]);
});
test('type/search filters and unattributed EA work preserve employee outcomes',()=>{
 assert.equal(report([task],{type:'EA'}).people.every(p=>p.kind==='EA'),true);
 assert.equal(report([task],{search:'employee one'}).people.length,1);
 const r=report([{...task,assignedEaId:null}]);assert.equal(r.summary.unattributed,1);assert.equal(r.people.find(p=>p.kind==='EA').assigned,0);assert.equal(r.people[0].assigned,1);
});
test('India SLA results are independent of Node timezone',()=>{
 const {execFileSync}=require('node:child_process');
 const script="const s=require('./dist/src/services/performanceScoring.js'); process.stdout.write(String(s.targetEndOfDay('2026-09-30')))";
 for(const tz of ['UTC','Asia/Kolkata','America/Los_Angeles'])assert.equal(Number(execFileSync(process.execPath,['-e',script],{env:{...process.env,TZ:tz},encoding:'utf8'})),Date.parse('2026-09-30T18:29:59.999Z'));
});
test('filter validation rejects bad dates, inverted ranges, arrays and injection',()=>{
 for(const q of [{fromDate:'2026-02-30'},{fromDate:'2026-10-01',toDate:'2026-09-01'},{departmentId:'1 OR 1=1'},{type:'ADMIN'},{search:['a','b']},{toDate:'2026-09-31'}])assert.equal(performanceFilters.safeParse(q).success,false);
 assert.equal(performanceFilters.safeParse({fromDate:'2024-02-29',toDate:'2024-02-29',departmentId:'1'}).success,true);
});
let server,base,currentRole='MD',active=1,queries=[];
before(async()=>{
 db.query=async(sql,params)=>{queries.push({sql,params});if(sql.startsWith('SELECT role'))return [[{role:currentRole,isActive:active}]];if(sql.includes("'EMPLOYEE' AS kind"))return [persons];if(sql.includes('FROM Task t LEFT JOIN Employee'))return [[task]];return [[]]};
 const app=require('express')();app.use(require('cookie-parser')());app.use('/',require('../dist/src/routes/performance.js').default);
 server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});base=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{await new Promise(r=>server.close(r));await db.end()});
function request(role,path=''){return fetch(base+'/'+path,{headers:role?{Cookie:`delegation_token=${createToken({userId:1,email:'test@example.com',role})}`}:{}})}
test('MD-only API rejects every other role and unauthenticated requests',async()=>{
 for(const role of ['ADMIN','HR','EA','EMPLOYEE','DEPARTMENT_HOD','PROCESS','SC_TEAM'])assert.equal((await request(role)).status,403);
 assert.equal((await request()).status,401);assert.equal((await request('MD')).status,200);
});
test('current inactive or demoted MD cannot use an old MD token',async()=>{
 active=0;assert.equal((await request('MD')).status,403);active=1;currentRole='ADMIN';assert.equal((await request('MD')).status,403);currentRole='MD';
});
test('parameterized filters and bulk query count are independent of person count',async()=>{
 queries=[];const response=await request('MD','?departmentId=1&type=EMPLOYEE&fromDate=2026-09-01&toDate=2026-09-30&search=Employee');assert.equal(response.status,200);assert.equal(queries.length,4);
 assert.deepEqual(queries[1].params,['2026-09-01','2026-09-30',1,1]);assert.match(queries[1].sql,/t.status <> 'CANCELLED'/);assert.match(queries[1].sql,/t.createdAt < DATE_ADD/);
 const result=(await response.json()).data;assert.equal(result.people.length,1);assert.equal(result.people[0].kind,'EMPLOYEE');assert.equal(result.people[0].assigned,1);
});
