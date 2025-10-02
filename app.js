function uid(){return Math.random().toString(36).slice(2)+Date.now().toString(36)}
const STORAGE_KEY='stutra_v1';
const MOTIVATIONS=[
  "Small sessions add up. 20 minutes now beats 0 later.",
  "Future you is cheering for you.",
  "Consistency > intensity. Keep going.",
  "You don’t need perfect, you need progress.",
  "One more card. One more page. Let’s go!",
  "Deep work starts with a single minute."
];

function load(){try{const raw=localStorage.getItem(STORAGE_KEY);return raw?JSON.parse(raw):null}catch{return null}}
function save(state){localStorage.setItem(STORAGE_KEY, JSON.stringify(state))}
function startOfMonth(d=new Date()){return new Date(d.getFullYear(), d.getMonth(), 1)}
function startOfYear(d=new Date()){return new Date(d.getFullYear(), 0, 1)}

function defaultState(){
  const id=uid();
  return {
    me:{id, username:""},
    subjects:[],
    sessions:[], // {id, subjectId, start, end, duration(seconds)}
    friends:[],  // {id, username, subjects, sessions}
  };
}

function stutraCharts(){
  return {
    monthChart:null, yearChart:null,
    renderMonth(data){
      const ctx=document.getElementById('monthChart');
      const labels=data.map(x=>x.label);
      const mins=data.map(x=>Math.round(x.seconds/60));
      if(this.monthChart){ this.monthChart.destroy() }
      this.monthChart=new Chart(ctx, {type:'bar', data:{labels, datasets:[{label:'Minutes', data:mins}]}, options:{responsive:true, maintainAspectRatio:false}});
    },
    renderYear(data){
      const ctx=document.getElementById('yearChart');
      const labels=data.map(x=>x.label);
      const mins=data.map(x=>Math.round(x.seconds/60));
      if(this.yearChart){ this.yearChart.destroy() }
      this.yearChart=new Chart(ctx, {type:'bar', data:{labels, datasets:[{label:'Minutes', data:mins}]}, options:{responsive:true, maintainAspectRatio:false}});
    }
  }
}

function stutra(){
  return {
    tabs:['Today','Month','Year','Friends'],
    tab:'Today',
    me:{id:'',username:''},
    subjects:[],
    sessions:[],
    friends:[],
    charts:stutraCharts(),
    // UI state
    newSubject:'',
    timer:{mode:'stopwatch', subjectId:'', countdownMins:25},
    running:false, startTs:0, elapsed:0, ticker:null,
    showAccount:false, showFriendModal:false, friendModalData:null, friendCode:'', friendImportMsg:'',
    motivation:MOTIVATIONS[Math.floor(Math.random()*MOTIVATIONS.length)],

    init(){
      const s=load() || defaultState();
      Object.assign(this, s);
      // ensure structure
      this.me=this.me||{id:uid(),username:''};
      this.subjects=this.subjects||[]; this.sessions=this.sessions||[]; this.friends=this.friends||[];
      save(this.snapshot());
      queueMicrotask(()=>{ this.refreshCharts() });
      document.addEventListener('visibilitychange', ()=>{ if(document.hidden && this.running) this.pause() });
    },
    snapshot(){ return {me:this.me, subjects:this.subjects, sessions:this.sessions, friends:this.friends} },
    persist(){ save(this.snapshot()) },

    // Account
    openAccountModal(){ this.showAccount=true },
    saveAccount(){ this.showAccount=false; this.persist() },

    // Subjects
    addSubject(){
      const name=this.newSubject.trim(); if(!name) return;
      this.subjects.push({id:uid(), name}); this.newSubject=''; this.persist();
    },
    deleteSubject(id){
      if(!confirm('Delete subject?')) return;
      this.subjects=this.subjects.filter(s=>s.id!==id);
      this.sessions=this.sessions.filter(x=>x.subjectId!==id);
      if(this.timer.subjectId===id) this.timer.subjectId='';
      this.persist(); this.refreshCharts();
    },
    subjectName(id){ const s=this.subjects.find(x=>x.id===id); return s? s.name : 'Unknown' },

    // Timer
    start(){
      if(!this.timer.subjectId) return;
      if(this.running) return;
      this.running=true;
      this.startTs=Date.now();
      if(this.timer.mode==='countdown'){
        this.elapsed=0;
        const targetMs=this.timer.countdownMins*60*1000;
        this.ticker=setInterval(()=>{
          this.elapsed = Date.now()-this.startTs;
          if(this.elapsed >= targetMs){ this.stopAndSave(); }
        }, 250);
      } else {
        this.ticker=setInterval(()=>{ this.elapsed = Date.now()-this.startTs; }, 250);
      }
    },
    pause(){
      if(!this.running) return;
      clearInterval(this.ticker); this.ticker=null;
      this.running=false;
    },
    stopAndSave(){
      if(!this.running && this.elapsed===0) return;
      clearInterval(this.ticker); this.ticker=null;
      const end=Date.now();
      const duration = Math.max(1, Math.round((this.running? end-this.startTs : this.elapsed)/1000));
      const sess={id:uid(), subjectId:this.timer.subjectId, start:this.startTs, end:end, duration};
      this.sessions.push(sess);
      this.running=false; this.elapsed=0; this.startTs=0;
      this.persist(); this.refreshCharts();
      alert(this.randomMotivation() + "\\nSaved " + this.formatMinutes(Math.round(duration/60)) + " on " + this.subjectName(sess.subjectId));
    },

    formatElapsed(ms){ const sec=Math.floor(ms/1000); const h=Math.floor(sec/3600); const m=Math.floor((sec%3600)/60); const s=sec%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` },
    formatMinutes(mins){ const h=Math.floor(mins/60), m=mins%60; return (h? h+'h ' : '') + m+'m' },
    formatDateTime(ts){ const d=new Date(ts); return d.toLocaleString() },

    // Today view helpers
    todaysTotals(){
      const start = new Date(); start.setHours(0,0,0,0);
      const end = new Date(start); end.setDate(start.getDate()+1);
      const map=new Map();
      for(const s of this.sessions){
        if(s.start>=start.getTime() && s.start<end.getTime()){
          const mins=Math.round(s.duration/60);
          map.set(s.subjectId, (map.get(s.subjectId)||0)+mins);
        }
      }
      return Array.from(map.entries()).map(([subjectId, minutes])=>({subjectId, subjectName:this.subjectName(subjectId), minutes})).sort((a,b)=>b.minutes-a.minutes);
    },
    recentMySessions(){ return this.sessions.slice().sort((a,b)=>b.start-a.start).slice(0,20) },

    // Month & Year charts
    refreshCharts(){
      const now=new Date();
      // month per day
      const daysInMonth=new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
      const dayTotals=new Array(daysInMonth).fill(0);
      for(const s of this.sessions){
        const d=new Date(s.start);
        if(d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear()){
          const idx=d.getDate()-1; dayTotals[idx]+=s.duration;
        }
      }
      const monthData=dayTotals.map((sec,i)=>({label:String(i+1), seconds:sec}));
      this.charts.renderMonth(monthData);

      // year per month
      const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const monthSec=new Array(12).fill(0);
      for(const s of this.sessions){
        const d=new Date(s.start);
        if(d.getFullYear()===now.getFullYear()){ monthSec[d.getMonth()]+=s.duration; }
      }
      const yearData=monthSec.map((sec,i)=>({label:monthNames[i], seconds:sec}));
      this.charts.renderYear(yearData);
    },
    monthTotalsBySubject(){
      const now=new Date();
      const map=new Map();
      for(const s of this.sessions){
        const d=new Date(s.start);
        if(d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear()){
          const mins=Math.round(s.duration/60);
          map.set(s.subjectId, (map.get(s.subjectId)||0)+mins);
        }
      }
      return Array.from(map.entries()).map(([subjectId, minutes])=>({subjectId, subjectName:this.subjectName(subjectId), minutes})).sort((a,b)=>b.minutes-a.minutes);
    },

    // Friends (share code = base64 JSON, last 30 days)
    exportShareCode(){
      try{
        const cutoff=Date.now()-30*24*60*60*1000;
        const sessions=this.sessions.filter(s=>s.start>=cutoff).map(s=>({subject:this.subjectName(s.subjectId), start:s.start, end:s.end, duration:s.duration}));
        const payload={id:this.me.id, username:this.me.username||'User', subjects:this.subjects.map(s=>s.name), sessions};
        const json=JSON.stringify(payload);
        return btoa(unescape(encodeURIComponent(json)));
      }catch(e){ return 'Error generating code' }
    },
    importFriend(){
      try{
        const json=decodeURIComponent(escape(atob(this.friendCode.trim())));
        const data=JSON.parse(json);
        const id=data.id || uid();
        const username=data.username || 'Friend';
        const subjNames=data.subjects||[];
        const subjMap=new Map(subjNames.map((n,i)=>[n, i+1]));
        const sessions=(data.sessions||[]).map(s=>({
          id:uid(),
          subjectId: subjMap.get(s.subject)||String(s.subject||'Unknown'),
          subjectName: s.subject || 'Unknown',
          start:s.start, end:s.end, duration:s.duration
        }));
        const friend={id, username, subjects: subjNames.map(n=>({id:subjMap.get(n), name:n})), sessions};
        const idx=this.friends.findIndex(f=>f.id===id);
        if(idx>=0) this.friends[idx]=friend; else this.friends.push(friend);
        this.friendImportMsg='Added!';
        this.friendCode='';
        this.persist();
      }catch(e){
        console.error(e);
        this.friendImportMsg='Invalid code';
      }
    },
    totalMinutesRange(friendSessions, days){
      const cutoff=Date.now()-days*24*60*60*1000;
      let sec=0; for(const s of friendSessions){ if(s.start>=cutoff) sec+=s.duration }
      return Math.round(sec/60);
    },
    friendsActivity(){
      const acts=[];
      for(const f of this.friends){
        for(const s of f.sessions){
          acts.push({id:uid(), username:f.username, subjectName:s.subjectName||'Subject', start:s.start, duration:s.duration});
        }
      }
      return acts.sort((a,b)=>b.start-a.start).slice(0,50);
    },
    friendTotals(friend){
      const map=new Map();
      for(const s of friend.sessions){
        const mins=Math.round(s.duration/60);
        const key=s.subjectName||'Subject';
        map.set(key, (map.get(key)||0)+mins);
      }
      return Array.from(map.entries()).map(([subjectName, minutes])=>({subjectName, minutes})).sort((a,b)=>b.minutes-a.minutes);
    },
    viewFriend(f){ this.friendModalData=f; this.showFriendModal=true },

    // Motivation
    randomMotivation(){ return MOTIVATIONS[Math.floor(Math.random()*MOTIVATIONS.length)] },
  }
}
