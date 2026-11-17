'use strict';
const path=require('path'),{fork,execFile}=require('child_process');
class TaskQueue {
  constructor({maxWaiting=4,timeoutMs=3600000,worker=path.join(__dirname,'task_worker.js')}={}) {
    this.pending=[];this.active=null;this.closed=false;this.maxWaiting=maxWaiting;this.timeoutMs=timeoutMs;this.worker=worker;
  }
  get busy(){return !!this.active;}
  get waiting(){return this.pending.length;}
  enqueue(type,payload,onEvent=()=>{}){
    if(this.closed || (this.active && this.pending.length>=this.maxWaiting))
      return Promise.reject(Object.assign(Error('Máy chủ đang đủ tác vụ. Vui lòng thử lại sau.'),{status:503}));
    return new Promise((resolve,reject)=>{this.pending.push({type,payload,onEvent,resolve,reject});this.next();});
  }
  next(){
    if(this.closed||this.active||!this.pending.length)return;
    const task=this.pending.shift();
    const child=fork(this.worker,[],{stdio:['ignore','pipe','pipe','ipc'],windowsHide:true});
    this.active={child,task};
    let result,error,finished=false,tail='';
    const finish=()=>{
      if(finished)return;finished=true;clearTimeout(timer);this.active=null;
      if(error)task.reject(error);else if(result!==undefined)task.resolve(result);
      else task.reject(Error('Tiến trình xử lý dừng bất thường. '+tail.slice(-250)));
      this.next();
    };
    const timer=setTimeout(()=>{error=Error('Tác vụ vượt thời gian cho phép.');this.kill(child,finish);},this.timeoutMs);
    child.stdout.on('data',()=>{});
    child.stderr.on('data',b=>{tail=(tail+b.toString()).slice(-3000);});
    child.on('message',message=>{
      if(message.type==='result')result=message.result;
      else if(message.type==='error')error=Object.assign(Error(message.error),{status:message.status});
      else task.onEvent(message);
    });
    child.once('error',e=>{error=e;finish();});
    child.once('exit',finish);
    child.send({type:task.type,payload:task.payload});
    task.onEvent({type:'started'});
  }
  kill(child,callback){
    if(process.platform==='win32')execFile('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},callback);
    else {child.kill('SIGKILL');callback?.();}
  }
  close(){
    this.closed=true;
    for(const t of this.pending.splice(0))t.reject(Error('Máy chủ đang khởi động lại.'));
    if(this.active){this.active.task.reject(Error('Máy chủ đang khởi động lại.'));this.kill(this.active.child);}
  }
}
module.exports={TaskQueue};
