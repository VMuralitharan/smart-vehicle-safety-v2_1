'use strict';

const crypto=require('node:crypto');

const TEMPLATE_MAX_LENGTH=240;
const FINAL_MESSAGE_MAX_LENGTH=300;
const DEFAULT_NORMAL_EVENT_TTL_MS=120000;
const DEFAULT_TEMPLATES={
 accident:'Smart Vehicle Safety Alert\nPossible accident detected.\nVehicle: {plateNumber}\nImpact: {impactG}g\nLocation: {locationUrl}',
 drowsiness:'Smart Vehicle Safety Alert\nDriver drowsiness detected.\nVehicle: {plateNumber}\nPlease contact the driver.\nLocation: {locationUrl}',
 emergencyButton:'Smart Vehicle Safety Alert\nMobile emergency request submitted.\nVehicle: {plateNumber}\nImmediate assistance may be required.\nLocation: {locationUrl}',
};
const EVENT_LABELS={accident:'Accident',drowsiness:'Drowsiness',emergencyButton:'Emergency button'};
const PLACEHOLDERS=['vehicleName','plateNumber','eventType','eventTime','impactG','locationUrl'];

function normalizePhone(value){
 const compact=String(value||'').trim().replace(/[\s().-]/g,'');
 if(/^0\d{9}$/.test(compact))return `+94${compact.slice(1)}`;
 if(/^94\d{9}$/.test(compact))return `+${compact}`;
 if(/^\+94\d{9}$/.test(compact))return compact;
 return null;
}
function validateTemplate(template){
 const value=String(template||'').trim();
 if(!value)return 'EMPTY_TEMPLATE';
 if(value.length>TEMPLATE_MAX_LENGTH)return 'TEMPLATE_TOO_LONG';
 if(/[^\x09\x0A\x0D\x20-\x7E]/.test(value))return 'NON_PLAIN_TEXT';
 const tokens=value.match(/\{[^{}]*\}/g)||[];
 for(const token of tokens)if(!PLACEHOLDERS.includes(token.slice(1,-1)))return 'UNSUPPORTED_PLACEHOLDER';
 if(/[{}]/.test(value.replace(/\{[^{}]*\}/g,'')))return 'INVALID_PLACEHOLDER_BRACES';
 return '';
}
function validCoordinates(value){
 return value&&Number.isFinite(value.latitude)&&Number.isFinite(value.longitude)&&
  Math.abs(value.latitude)<=90&&Math.abs(value.longitude)<=180&&!(value.latitude===0&&value.longitude===0);
}
function renderTemplate(template,data){
 let result=template;
 for(const key of PLACEHOLDERS)result=result.split(`{${key}}`).join(data[key]||'Unavailable');
 return result;
}
function eventPreferenceEnabled(contact,eventType){
 if(contact?.smsEnabled!==true)return false;
 return eventType==='accident'?contact.notifyAccident===true:
  eventType==='drowsiness'?contact.notifyDrowsiness===true:contact.notifyEmergencyButton===true;
}
function preferenceEnabled(contact,eventType){return eventPreferenceEnabled(contact,eventType)&&contact?.allowTestSms===true;}
function globalEventEnabled(config,eventType){
 return eventType==='accident'?config?.notifyAccident===true:
  eventType==='drowsiness'?config?.notifyDrowsiness===true:config?.notifyEmergencyButton===true;
}
function genuineEvent(eventType,eventData){
 if(eventData?.isTest===true||eventData?.smsSuppressed===true)return false;
 if(eventType==='accident')return eventData?.type==='accident'&&eventData?.source==='device';
 if(eventType==='drowsiness')return eventData?.type==='drowsiness'&&eventData?.eventType==='drowsiness'&&eventData?.source==='esp32cam_drowsiness';
 return eventData?.source==='mobile';
}
function normalEventEligible(config,eventType,eventData,vehicleId,{nowMs=Date.now(),notBeforeMs=0,maxAgeMs=DEFAULT_NORMAL_EVENT_TTL_MS}={}){
 const enabledAt=Number(config?.normalEnabledAt);const createdAt=Number(eventData?.createdAt);
 return config?.mode==='normal'&&Number.isFinite(enabledAt)&&enabledAt>0&&globalEventEnabled(config,eventType)&&
  Number.isFinite(createdAt)&&createdAt>=enabledAt&&createdAt>=notBeforeMs&&createdAt<=nowMs&&nowMs-createdAt<=maxAgeMs&&
  (!eventData?.vehicleId||eventData.vehicleId===vehicleId)&&genuineEvent(eventType,eventData);
}
function commandToken(eventId,contactId){
 return crypto.createHash('sha256').update(`${eventId}:${contactId}`).digest('hex').slice(0,16);
}
function safeCode(value){return String(value||'UNKNOWN').replace(/[^A-Z0-9_+-]/gi,'_').slice(0,48)||'UNKNOWN';}

class SmsDispatcher{
 constructor({db,vehicleId,port,getLatestLocation,isDeviceReady=()=>true,normalNotBeforeMs=0,normalEventTtlMs=DEFAULT_NORMAL_EVENT_TTL_MS}){
  this.db=db;this.vehicleId=vehicleId;this.port=port;this.getLatestLocation=getLatestLocation;this.isDeviceReady=isDeviceReady;
  this.normalNotBeforeMs=normalNotBeforeMs;this.normalEventTtlMs=normalEventTtlMs;
  this.queue=[];this.processing=false;this.active=null;this.confirmedSmsMode='test';this.normalModeEpoch=0;
 }
 isBusy(){return this.processing||this.active!==null;}
 async recoverInterrupted(){
  const root=this.db.ref(`smsDispatch/${this.vehicleId}`);const snapshot=await root.get();const updates={};
  snapshot.forEach(eventSnap=>eventSnap.forEach(contactSnap=>{const value=contactSnap.val()||{};
   if(value.state==='claimed'||value.state==='sending')updates[`${eventSnap.key}/${contactSnap.key}/state`]='uncertain',updates[`${eventSnap.key}/${contactSnap.key}/errorCode`]='BRIDGE_RESTARTED_DURING_DISPATCH';
  }));
  if(Object.keys(updates).length)await root.update(updates);
 }
 handleSerialLine(line){
  if(!line.startsWith('SMS_RESULT:'))return false;
  const match=/^SMS_RESULT:([a-f0-9]{16}):(accepted|failed|uncertain):([A-Za-z0-9_+.-]{1,48})$/.exec(line);
  if(!match){console.error('Invalid SMS result from Arduino.');return true;}
  if(!this.active||this.active.token!==match[1]){console.error(`Unexpected SMS result token ${match[1]}.`);return true;}
  const active=this.active;this.active=null;clearTimeout(active.timer);
  if(match[2]==='accepted')active.resolve({state:'accepted',code:safeCode(match[3])});
  else active.resolve({state:match[2],code:safeCode(match[3])});
  return true;
 }
 sendSerial(phone,message,token,dispatchMode){
  return new Promise(resolve=>{
   if(!this.port.isOpen){resolve({state:'failed',code:'SERIAL_PORT_CLOSED'});return;}
   if(this.active){resolve({state:'failed',code:'SERIAL_QUEUE_CONFLICT'});return;}
   if(!['test','normal'].includes(dispatchMode)){resolve({state:'failed',code:'INVALID_DISPATCH_MODE'});return;}
   if(dispatchMode==='test'&&!message.startsWith('TEST ONLY\n')){resolve({state:'failed',code:'TEST_PREFIX_REQUIRED'});return;}
   const phone64=Buffer.from(phone,'ascii').toString('base64');const message64=Buffer.from(message,'ascii').toString('base64');
   const command=`SMS_REQUEST:${token}:${dispatchMode.toUpperCase()}:${phone64}:${message64}\n`;
   const timer=setTimeout(()=>{if(this.active?.token===token){this.active=null;resolve({state:'uncertain',code:'ARDUINO_ACK_TIMEOUT'});}},65000);
   this.active={token,resolve,timer};
   this.port.write(command,error=>{if(error&&this.active?.token===token){this.active=null;clearTimeout(timer);resolve({state:'failed',code:'SERIAL_WRITE_FAILED'});}});
  });
 }
 enqueue(job){this.queue.push(job);void this.drain();}
 async skipJob(job,errorCode){
  await this.db.ref(`smsDispatch/${this.vehicleId}/${job.eventId}/${job.contactId}`).update({state:'skipped',errorCode,skippedAt:Date.now()});
 }
 async cancelPendingNormal(errorCode='SMS_MODE_CHANGED_BEFORE_SEND'){
  const cancelled=this.queue.filter(job=>job.dispatchMode==='normal');
  this.queue=this.queue.filter(job=>job.dispatchMode!=='normal');
  await Promise.all(cancelled.map(job=>this.skipJob(job,errorCode).catch(()=>{})));
  return cancelled.length;
 }
 async setConfirmedSmsMode(mode,{force=false}={}){
  if(!['test','normal'].includes(mode))throw new Error('Invalid confirmed SMS mode.');
  if(force||this.confirmedSmsMode!==mode)this.normalModeEpoch++;
  this.confirmedSmsMode=mode;
  return mode==='test'?this.cancelPendingNormal():0;
 }
 async revalidateNormalJob(job){
  const epoch=this.normalModeEpoch;
  if(this.confirmedSmsMode!=='normal')return {ok:false,code:'NORMAL_MODE_NOT_CONFIRMED'};
  if(!job.eventPath)return {ok:false,code:'EVENT_SOURCE_UNAVAILABLE'};
  const [configSnap,contactSnap,eventSnap]=await Promise.all([
   this.db.ref(`smsSettings/${this.vehicleId}/config`).get(),
   this.db.ref(`emergencyContacts/${this.vehicleId}/${job.contactId}`).get(),
   this.db.ref(job.eventPath).get(),
  ]);
  if(epoch!==this.normalModeEpoch||this.confirmedSmsMode!=='normal')return {ok:false,code:'SMS_MODE_CHANGED_BEFORE_SEND'};
  const config=configSnap.val()||{};const contact=contactSnap.val()||{};const eventData=eventSnap.val();
  if(!eventData)return {ok:false,code:'EVENT_NO_LONGER_AVAILABLE'};
  if(!normalEventEligible(config,job.eventType,eventData,this.vehicleId,{notBeforeMs:this.normalNotBeforeMs,maxAgeMs:this.normalEventTtlMs}))
   return {ok:false,code:'EVENT_NO_LONGER_ELIGIBLE'};
  if(!eventPreferenceEnabled(contact,job.eventType))return {ok:false,code:'CONTACT_NOT_ELIGIBLE'};
  const phone=normalizePhone(contact.phone);if(!phone)return {ok:false,code:'INVALID_PHONE'};
  return {ok:true,phone,epoch};
 }
 async revalidateTestJob(job){
  if(!job.eventPath)return {ok:false,code:'TEST_REQUEST_UNAVAILABLE'};
  const [contactSnap,requestSnap]=await Promise.all([
   this.db.ref(`emergencyContacts/${this.vehicleId}/${job.contactId}`).get(),
   this.db.ref(job.eventPath).get(),
  ]);
  const contact=contactSnap.val()||{};const request=requestSnap.val();
  if(!request)return {ok:false,code:'TEST_REQUEST_UNAVAILABLE'};
  if(request.contactId!==job.contactId||request.eventType!==job.eventType)return {ok:false,code:'TEST_REQUEST_MISMATCH'};
  if(!preferenceEnabled(contact,job.eventType))return {ok:false,code:'CONTACT_NOT_ELIGIBLE'};
  const phone=normalizePhone(contact.phone);if(!phone)return {ok:false,code:'INVALID_PHONE'};
  return {ok:true,phone};
 }
 async drain(){
  if(this.processing)return;this.processing=true;
  while(this.queue.length){const job=this.queue.shift();const dispatchRef=this.db.ref(`smsDispatch/${this.vehicleId}/${job.eventId}/${job.contactId}`);
   try{
    let validatedNormalEpoch=null;
    if(job.dispatchMode==='normal'){
     const check=await this.revalidateNormalJob(job);
     if(!check.ok){await this.skipJob(job,check.code);continue;}
     if(check.epoch!==this.normalModeEpoch||this.confirmedSmsMode!=='normal'){await this.skipJob(job,'SMS_MODE_CHANGED_BEFORE_SEND');continue;}
     job.phone=check.phone;validatedNormalEpoch=check.epoch;
    }
    await dispatchRef.update({state:'sending',attemptedAt:Date.now(),errorCode:null});
    if(job.dispatchMode==='normal'){
     const finalCheck=await this.revalidateNormalJob(job);
     if(!finalCheck.ok){await this.skipJob(job,finalCheck.code);continue;}
     job.phone=finalCheck.phone;validatedNormalEpoch=finalCheck.epoch;
    }else{
     const finalCheck=await this.revalidateTestJob(job);
     if(!finalCheck.ok){await this.skipJob(job,finalCheck.code);continue;}
     job.phone=finalCheck.phone;
    }
    if(job.dispatchMode==='normal'&&(validatedNormalEpoch!==this.normalModeEpoch||this.confirmedSmsMode!=='normal')){
     await this.skipJob(job,'SMS_MODE_CHANGED_BEFORE_SEND');continue;
    }
    if(!this.isDeviceReady()||!this.port.isOpen){await this.skipJob(job,'DEVICE_NOT_READY_BEFORE_SEND');continue;}
    const sendPromise=this.sendSerial(job.phone,job.message,job.token,job.dispatchMode);
    const result=await sendPromise;
    if(result.state==='accepted')await dispatchRef.update({state:'accepted',acceptedAt:Date.now(),errorCode:null});
    else await dispatchRef.update({state:result.state,errorCode:result.code});
   }catch(error){await dispatchRef.update({state:'uncertain',errorCode:'BRIDGE_DISPATCH_ERROR'}).catch(()=>{});console.error('SMS dispatch failed:',error.message);}
  }
  this.processing=false;
 }
 async claim(eventId,eventType,contactId,dispatchMode){
  const ref=this.db.ref(`smsDispatch/${this.vehicleId}/${eventId}/${contactId}`);
  const result=await ref.transaction(current=>current===null?{eventId,eventType,contactId,dispatchMode,state:'claimed',claimedAt:Date.now()}:undefined,undefined,false);
  return {committed:result.committed,ref};
 }
 async terminal(eventId,eventType,contactId,dispatchMode,state,errorCode){
  const claimed=await this.claim(eventId,eventType,contactId,dispatchMode);if(!claimed.committed)return;
  await claimed.ref.update({state,errorCode,attemptedAt:Date.now()});
 }
 async dispatchEvent({eventId,eventType,eventData={},eventPath=null,singleContactId=null,dispatchMode='normal'}){
  if(!['accident','drowsiness','emergencyButton'].includes(eventType))return;
  if(!['test','normal'].includes(dispatchMode))return;
  const [metaSnap,contactsSnap,templateSnap,mpuSnap,smsConfigSnap]=await Promise.all([
   this.db.ref(`vehicles/${this.vehicleId}/meta`).get(),this.db.ref(`emergencyContacts/${this.vehicleId}`).get(),
   this.db.ref(`smsSettings/${this.vehicleId}/templates/${eventType}`).get(),this.db.ref(`deviceConfig/${this.vehicleId}/mpu`).get(),
   this.db.ref(`smsSettings/${this.vehicleId}/config`).get(),
  ]);
  const meta=metaSnap.val()||{};const contacts=contactsSnap.val()||{};const mpuConfig=mpuSnap.val()||{};const smsConfig=smsConfigSnap.val()||{};
  const candidates=Object.entries(contacts).filter(([id])=>!singleContactId||id===singleContactId);
  if(dispatchMode==='test'&&mpuConfig.benchTestMode!==true){for(const [id] of candidates)await this.terminal(eventId,eventType,id,dispatchMode,'skipped','BENCH_TEST_MODE_REQUIRED');return;}
  if(dispatchMode==='normal'&&!normalEventEligible(smsConfig,eventType,eventData,this.vehicleId,{notBeforeMs:this.normalNotBeforeMs,maxAgeMs:this.normalEventTtlMs}))return;
  const template=templateSnap.exists()?String(templateSnap.val()):DEFAULT_TEMPLATES[eventType];const templateError=validateTemplate(template);
  const captured=validCoordinates(eventData)?eventData:null;const latest=this.getLatestLocation?.();
  const locationUrl=captured?`https://maps.google.com/?q=${captured.latitude},${captured.longitude}`:
   validCoordinates(latest)?`Latest known location: https://maps.google.com/?q=${latest.latitude},${latest.longitude}`:'Location unavailable';
  const rendered=templateError?'':renderTemplate(template,{vehicleName:String(meta.name||this.vehicleId),plateNumber:String(meta.plateNumber||'Unknown'),
   eventType:EVENT_LABELS[eventType],eventTime:new Date(eventData.createdAt||Date.now()).toISOString(),
   impactG:Number.isFinite(eventData.impactG)?Number(eventData.impactG).toFixed(2):'Unavailable',locationUrl});
  const message=dispatchMode==='test'?`TEST ONLY\nNo emergency response required.\n${rendered}`:rendered;
  for(const [contactId,contact] of candidates){
   const consent=dispatchMode==='test'?preferenceEnabled(contact,eventType):eventPreferenceEnabled(contact,eventType);
   if(!consent){if(singleContactId)await this.terminal(eventId,eventType,contactId,dispatchMode,'skipped','CONTACT_NOT_ELIGIBLE');continue;}
   const phone=normalizePhone(contact.phone);if(!phone){await this.terminal(eventId,eventType,contactId,dispatchMode,'failed','INVALID_PHONE');continue;}
   if(templateError){await this.terminal(eventId,eventType,contactId,dispatchMode,'failed',templateError);continue;}
   if(message.length>FINAL_MESSAGE_MAX_LENGTH){await this.terminal(eventId,eventType,contactId,dispatchMode,'failed','RENDERED_MESSAGE_TOO_LONG');continue;}
   if(/[^\x09\x0A\x0D\x20-\x7E]/.test(message)||/\{[^{}]+\}/.test(message)){await this.terminal(eventId,eventType,contactId,dispatchMode,'failed','INVALID_RENDERED_MESSAGE');continue;}
   if(!this.isDeviceReady()||!this.port.isOpen){await this.terminal(eventId,eventType,contactId,dispatchMode,'failed','SIM808_NOT_READY');continue;}
   const claimed=await this.claim(eventId,eventType,contactId,dispatchMode);if(!claimed.committed)continue;
   this.enqueue({eventId,eventType,contactId,phone,message,eventPath,dispatchMode,token:commandToken(eventId,contactId)});
  }
 }
}

module.exports={SmsDispatcher,DEFAULT_TEMPLATES,DEFAULT_NORMAL_EVENT_TTL_MS,normalizePhone,validateTemplate,renderTemplate,validCoordinates,preferenceEnabled,eventPreferenceEnabled,globalEventEnabled,genuineEvent,normalEventEligible,commandToken};
