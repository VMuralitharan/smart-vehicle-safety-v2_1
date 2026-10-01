import React,{useEffect,useRef,useState} from 'react';
import {Alert,KeyboardAvoidingView,Platform,Text,View} from 'react-native';
import {ActionButton,Card,Field,Heading,Info,Loading,SmallLabel} from '../components/UI';
import {colors as c} from '../components/theme';
import {saveMpuConfig,watchMpuConfig,watchMpuConfigStatus} from '../lib/database';
import type {MpuConfig,MpuConfigStatus,Vehicle} from '../lib/types';

const DEFAULTS:Omit<MpuConfig,'revision'>={thresholdG:2.3,requiredSamples:2,cooldownMs:30000,benchTestMode:true};
const THRESHOLD_TOLERANCE=0.011;

function isStoredConfigValid(value:any):value is MpuConfig{
 return value&&typeof value.thresholdG==='number'&&value.thresholdG>=1.2&&value.thresholdG<=8&&
  Number.isInteger(value.requiredSamples)&&value.requiredSamples>=2&&value.requiredSamples<=20&&
  Number.isInteger(value.cooldownMs)&&value.cooldownMs>=5000&&value.cooldownMs<=120000&&
  Number.isInteger(value.revision)&&value.revision>=1&&value.benchTestMode===true;
}
function sameConfig(a:MpuConfig|null,b:MpuConfig|null){
 if(!a||!b)return a===b;
 return Math.abs(a.thresholdG-b.thresholdG)<0.0001&&a.requiredSamples===b.requiredSamples&&
  a.cooldownMs===b.cooldownMs&&a.revision===b.revision&&a.benchTestMode===b.benchTestMode;
}
function statusMatches(status:MpuConfigStatus,config:MpuConfig){
 return status.state==='applied'&&status.revision===config.revision&&
  typeof status.thresholdG==='number'&&Math.abs(status.thresholdG-config.thresholdG)<=THRESHOLD_TOLERANCE&&
  status.requiredSamples===config.requiredSamples&&status.cooldownMs===config.cooldownMs&&status.benchTestMode===config.benchTestMode;
}
function parseInputs(threshold:string,samples:string,cooldownSeconds:string){
 if(!threshold.trim())return {error:'Enter an impact threshold.'};
 const thresholdNumber=Number(threshold);
 if(!Number.isFinite(thresholdNumber)||thresholdNumber<1.2||thresholdNumber>8)return {error:'Impact threshold must be between 1.20g and 8.00g.'};
 if(!samples.trim())return {error:'Enter the required consecutive samples.'};
 const samplesNumber=Number(samples);
 if(!Number.isInteger(samplesNumber)||samplesNumber<2||samplesNumber>20)return {error:'Required consecutive samples must be a whole number from 2 to 20.'};
 if(!cooldownSeconds.trim())return {error:'Enter an alert cooldown.'};
 const cooldownNumber=Number(cooldownSeconds);
 if(!Number.isInteger(cooldownNumber)||cooldownNumber<5||cooldownNumber>120)return {error:'Alert cooldown must be a whole number from 5 to 120 seconds.'};
 return {values:{thresholdG:Number(thresholdNumber.toFixed(2)),requiredSamples:samplesNumber,
  cooldownMs:cooldownNumber*1000,benchTestMode:true as const}};
}

export function AccidentDetectionSettings({uid,vehicle,onBack,embedded=false}:{uid:string;vehicle:Vehicle;onBack?:()=>void;embedded?:boolean}){
 const [threshold,setThreshold]=useState(DEFAULTS.thresholdG.toFixed(2));
 const [samples,setSamples]=useState(String(DEFAULTS.requiredSamples));
 const [cooldown,setCooldown]=useState(String(DEFAULTS.cooldownMs/1000));
 const [config,setConfig]=useState<MpuConfig|null>(null),[status,setStatus]=useState<MpuConfigStatus|null>(null);
 const [configLoading,setConfigLoading]=useState(true),[statusLoading,setStatusLoading]=useState(true);
 const [configError,setConfigError]=useState(''),[statusError,setStatusError]=useState(''),[storedInvalid,setStoredInvalid]=useState('');
 const [conflict,setConflict]=useState(''),[saving,setSaving]=useState(false),[pendingSince,setPendingSince]=useState<number|null>(null),[now,setNow]=useState(Date.now());
 const baselineRef=useRef<MpuConfig|null>(null),dirtyRef=useRef(false),userEditedRef=useRef(false),activeVehicleRef=useRef(vehicle.id),mountedRef=useRef(true),savingRef=useRef(false);
 const authorized=Boolean(uid)&&vehicle.meta.ownerUid===uid;
 const loadDraft=(value:MpuConfig|null)=>{
  const source=value||DEFAULTS;
  setThreshold(source.thresholdG.toFixed(2));setSamples(String(source.requiredSamples));setCooldown(String(source.cooldownMs/1000));
  baselineRef.current=value;dirtyRef.current=false;userEditedRef.current=false;setConflict('');setStoredInvalid('');
 };
 useEffect(()=>{mountedRef.current=true;return()=>{mountedRef.current=false;};},[]);
 useEffect(()=>{
  activeVehicleRef.current=vehicle.id;baselineRef.current=null;dirtyRef.current=false;userEditedRef.current=false;setConfig(null);setStatus(null);
  setConfigError('');setStatusError('');setStoredInvalid('');setConflict('');setPendingSince(null);setConfigLoading(true);setStatusLoading(true);loadDraft(null);
  if(!authorized){setConfigLoading(false);setStatusLoading(false);setConfigError('Only this vehicle’s authenticated owner can access calibration settings.');return;}
  const stopConfig=watchMpuConfig(vehicle.id,value=>{
   setConfigLoading(false);setConfigError('');setConfig(value);
   if(value&&!isStoredConfigValid(value)){
    baselineRef.current=value;setStoredInvalid('Firebase contains invalid calibration values. Use Restore Test Defaults or correct the record before saving.');return;
   }
   if(dirtyRef.current){
    if(!sameConfig(value,baselineRef.current))setConflict('Calibration changed in Firebase while you were editing. Reload the latest values before saving.');
    return;
   }
   loadDraft(value);
  },message=>{setConfigLoading(false);setConfigError(message);});
  const stopStatus=watchMpuConfigStatus(vehicle.id,value=>{setStatusLoading(false);setStatusError('');setStatus(value);},message=>{setStatusLoading(false);setStatusError(message);});
  return()=>{stopConfig();stopStatus();};
 },[vehicle.id,authorized]);
 useEffect(()=>{if(!pendingSince)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[pendingSince]);
 const parsed=parseInputs(threshold,samples,cooldown);
 const draftConfig=parsed.values&&config?{...parsed.values,revision:config.revision}:null;
 const hasChanges=Boolean(parsed.values)&&(!config||!draftConfig||!sameConfig(draftConfig,config));
 useEffect(()=>{dirtyRef.current=userEditedRef.current&&hasChanges;},[hasChanges,config]);
 const change=(setter:(value:string)=>void)=>(value:string)=>{userEditedRef.current=true;dirtyRef.current=true;setter(value);};
 const adjustThreshold=(amount:number)=>{const current=Number(threshold);const next=Math.min(8,Math.max(1.2,(Number.isFinite(current)?current:DEFAULTS.thresholdG)+amount));userEditedRef.current=true;dirtyRef.current=true;setThreshold(next.toFixed(2));};
 const commit=async(values:Omit<MpuConfig,'revision'>)=>{
  if(savingRef.current)return;
  if(activeVehicleRef.current!==vehicle.id){Alert.alert('Vehicle changed','Reopen calibration settings for the selected vehicle.');return;}
  if(!authorized){Alert.alert('Access denied','Only this vehicle’s owner can change calibration settings.');return;}
  const targetVehicleId=vehicle.id,expected=baselineRef.current;
  savingRef.current=true;setSaving(true);
  try{
   const saved=await saveMpuConfig(uid,targetVehicleId,expected,values);
   if(!mountedRef.current||activeVehicleRef.current!==targetVehicleId)return;
   setConfig(saved);loadDraft(saved);setPendingSince(Date.now());setNow(Date.now());
   Alert.alert('Calibration saved','Configuration saved to Firebase. Waiting for Arduino confirmation.');
  }catch(e:any){
   if(mountedRef.current&&activeVehicleRef.current===targetVehicleId)Alert.alert('Unable to save calibration',e?.message||'Check your connection and try again.');
  }finally{
   savingRef.current=false;
   if(mountedRef.current&&activeVehicleRef.current===targetVehicleId)setSaving(false);
  }
 };
 const save=()=>{if(!parsed.values){Alert.alert('Check calibration values',parsed.error||'Enter valid values.');return;}commit(parsed.values);};
 const restore=()=>Alert.alert('Restore Test Defaults?','This saves the controlled-test defaults as a new revision. The existing revision will not be reset.',[
  {text:'Cancel',style:'cancel'},{text:'Restore',onPress:()=>commit(DEFAULTS)},
 ]);
 const reload=()=>{if(config&&isStoredConfigValid(config))loadDraft(config);};
 let statusTitle='Pending Arduino confirmation',statusText='Waiting for Arduino confirmation...',statusColor=c.yellow,statusBackground=c.yellowPale;
 if(configError||statusError){statusTitle='Connection or permission error';statusText=configError||statusError;statusColor=c.red;statusBackground=c.redPale;}
 else if(configLoading||statusLoading){statusTitle='Loading';statusText='Loading configuration and Arduino status...';}
 else if(!config){statusTitle='Not configured';statusText='No MPU6050 calibration configuration exists for this vehicle.';}
 else if(storedInvalid){statusTitle='Configuration mismatch';statusText=storedInvalid;statusColor=c.red;statusBackground=c.redPale;}
 else if(status&&statusMatches(status,config)){statusTitle='Applied successfully';statusText='Arduino confirmed every value for the current revision.';statusColor=c.green;statusBackground=c.greenPale;}
 else if(status?.state==='applied'&&typeof status.revision==='number'&&status.revision>=config.revision){statusTitle='Configuration mismatch';statusText='Arduino acknowledgement does not match the current Firebase configuration.';statusColor=c.red;statusBackground=c.redPale;}
 const delayed=statusTitle==='Pending Arduino confirmation'&&pendingSince!==null&&now-pendingSince>=15000;
 if(configLoading)return <Loading/>;
 return <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined}><View>
 <Heading title={embedded?'Accident detection calibration':'Accident Detection Settings'} subtitle={`${vehicle.meta.name} · ${vehicle.meta.plateNumber}`}/>
 {!authorized?<><Info text="Only this vehicle’s authenticated owner can access calibration settings."/>{!embedded&&onBack?<ActionButton title="Back to vehicle management" variant="secondary" onPress={onBack}/>:null}</>:<>
 {configError?<Info text={`Firebase error: ${configError}`}/>:null}
 {storedInvalid?<Info text={storedInvalid}/>:null}
 {conflict?<Card><Text style={{color:c.red,fontWeight:'800'}}>{conflict}</Text><ActionButton title="Reload latest configuration" variant="secondary" onPress={reload}/></Card>:null}
 <Card><Text style={{fontSize:17,fontWeight:'900',color:c.navy,marginBottom:13}}>Calibration values</Text>
 <Field label="Impact threshold (g)" value={threshold} onChangeText={change(setThreshold)} keyboardType="decimal-pad" placeholder="2.30"/>
 <View style={{flexDirection:'row',marginBottom:8}}><View style={{flex:1,marginRight:4}}><ActionButton title="− 0.10g" variant="secondary" disabled={saving} onPress={()=>adjustThreshold(-0.1)}/></View><View style={{flex:1,marginLeft:4}}><ActionButton title="+ 0.10g" variant="secondary" disabled={saving} onPress={()=>adjustThreshold(0.1)}/></View></View>
 <Field label="Required consecutive samples" value={samples} onChangeText={change(setSamples)} keyboardType="number-pad" placeholder="2"/>
 <Field label="Alert cooldown (seconds)" value={cooldown} onChangeText={change(setCooldown)} keyboardType="number-pad" placeholder="30"/>
 <SmallLabel>Bench Test Mode</SmallLabel><View style={{alignSelf:'flex-start',backgroundColor:c.greenPale,borderRadius:20,paddingHorizontal:13,paddingVertical:7,marginTop:4,marginBottom:8}}><Text style={{color:c.green,fontWeight:'900'}}>ENABLED</Text></View>
 <Text style={{color:c.muted,fontSize:12}}>Bench Test Mode is locked on for this research prototype.</Text>
 {parsed.error?<Text style={{color:c.red,fontSize:12,marginTop:10}}>{parsed.error}</Text>:null}
 <ActionButton title={saving?'Saving…':'Save Calibration'} disabled={saving||Boolean(parsed.error)||Boolean(storedInvalid)||Boolean(conflict)||!hasChanges} onPress={save}/>
 <ActionButton title="Restore Test Defaults" variant="secondary" disabled={saving||Boolean(configError)} onPress={restore}/>
 </Card>
 <Card><Text style={{fontSize:17,fontWeight:'900',color:c.navy}}>Arduino application status</Text>
 <View style={{alignSelf:'flex-start',backgroundColor:statusBackground,borderRadius:20,paddingHorizontal:13,paddingVertical:7,marginTop:12}}><Text style={{color:statusColor,fontWeight:'900'}}>{statusTitle}</Text></View>
 <Text style={{color:c.text,marginTop:10}}>{statusText}</Text>
 {delayed?<Text style={{color:c.yellow,fontWeight:'800',marginTop:8}}>Configuration saved to Firebase, but Arduino has not confirmed it yet.</Text>:null}
 <Text style={{color:c.muted,fontSize:12,marginTop:10}}>Firebase revision: {config?.revision??'Not configured'}</Text>
 <Text style={{color:c.muted,fontSize:12,marginTop:4}}>Applied revision: {status?.revision??'Not reported'}</Text>
 <Text style={{color:c.muted,fontSize:12,marginTop:4}}>Applied time: {status?.appliedAt?new Date(status.appliedAt).toLocaleString():'Not reported'}</Text>
 </Card>
 {!embedded&&onBack?<ActionButton title="Back to vehicle management" variant="secondary" disabled={saving} onPress={onBack}/>:null}
 </>}
 </View></KeyboardAvoidingView>;
}
