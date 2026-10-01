import React,{useEffect,useRef,useState} from 'react';
import {Alert,Text,View} from 'react-native';
import {ActionButton,Card,Field,Heading,Info,SmallLabel} from '../components/UI';
import {colors as c} from '../components/theme';
import {requestDrowsinessCalibration,saveDrowsinessDuration,watchDrowsinessCalibrationStatus,watchDrowsinessConfig,watchDrowsinessStatus} from '../lib/database';
import type {DrowsinessCalibrationStatus,DrowsinessConfig,DrowsinessStatus,Vehicle} from '../lib/types';

const DEFAULT_SECONDS=10;
const calibrationLabel=(status:DrowsinessCalibrationStatus|null)=>{
 if(!status)return 'No calibration activity reported.';
 if(status.state==='prepare_open')return 'Get ready: keep both eyes naturally open.';
 if(status.state==='sampling_open')return 'Sampling open eyes. Keep looking toward the camera.';
 if(status.state==='prepare_closed')return 'Get ready: gently close both eyes.';
 if(status.state==='sampling_closed')return 'Sampling closed eyes. Keep both eyes gently closed.';
 if(status.state==='complete')return 'Guided calibration completed and was applied.';
 if(status.state==='failed')return `Calibration failed: ${status.instruction||'Try again in even lighting.'}`;
 return status.instruction||'Waiting for detector service.';
};

export function DrowsinessDetectionSettings({uid,vehicle,onBack}:{uid:string;vehicle:Vehicle;onBack:()=>void}){
 const [config,setConfig]=useState<DrowsinessConfig|null>(null),[status,setStatus]=useState<DrowsinessStatus|null>(null);
 const [calibration,setCalibration]=useState<DrowsinessCalibrationStatus|null>(null),[seconds,setSeconds]=useState(String(DEFAULT_SECONDS));
 const [requestId,setRequestId]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false),[requesting,setRequesting]=useState(false);
 const activeVehicleRef=useRef(vehicle.id),savingRef=useRef(false);
 const authorized=Boolean(uid)&&vehicle.meta.ownerUid===uid;
 useEffect(()=>{
  activeVehicleRef.current=vehicle.id;setConfig(null);setStatus(null);setCalibration(null);setRequestId('');setError('');setSeconds(String(DEFAULT_SECONDS));
  if(!authorized){setError('Only this vehicle’s owner can access drowsiness settings.');return;}
  const a=watchDrowsinessConfig(vehicle.id,value=>{setConfig(value);setSeconds(String((value?.closureDurationMs??10000)/1000));},setError);
  const b=watchDrowsinessStatus(vehicle.id,setStatus,setError);
  const d=watchDrowsinessCalibrationStatus(vehicle.id,setCalibration,setError);
  return()=>{a();b();d();};
 },[vehicle.id,authorized]);
 const duration=Number(seconds),durationValid=Number.isInteger(duration)&&duration>=5&&duration<=120;
 const dirty=durationValid&&(!config||duration*1000!==config.closureDurationMs);
 const save=async()=>{
  if(savingRef.current)return;
  if(!durationValid){Alert.alert('Check duration','Enter a whole number from 5 to 120 seconds.');return;}
  const target=vehicle.id,expected=config;savingRef.current=true;setSaving(true);
  try{const saved=await saveDrowsinessDuration(uid,target,expected,duration*1000);if(activeVehicleRef.current!==target)return;setConfig(saved);Alert.alert('Saved','Waiting for the Python detector to confirm this revision.');}
  catch(e:any){if(activeVehicleRef.current===target)Alert.alert('Unable to save',e?.message||'Try again.');}
  finally{savingRef.current=false;if(activeVehicleRef.current===target)setSaving(false);}
 };
 const startCalibration=()=>Alert.alert('Start guided eye calibration?','The Python detector must be running. Face the camera in even light. You will first keep both eyes open, then gently close them when prompted. No image is stored or uploaded.',[
  {text:'Cancel',style:'cancel'},
  {text:'Start',onPress:async()=>{const target=vehicle.id;setRequesting(true);setCalibration(null);try{const id=await requestDrowsinessCalibration(target);if(activeVehicleRef.current===target)setRequestId(id);}catch(e:any){Alert.alert('Unable to request calibration',e?.message||'Try again.');}finally{if(activeVehicleRef.current===target)setRequesting(false);}}},
 ]);
 const applied=Boolean(config&&status?.appliedRevision===config.revision&&(status.state==='applied'||status.state==='awaiting_calibration'));
 const activeCalibration=!requestId||calibration?.requestId===requestId?calibration:null;
 return <View><Heading title="Drowsiness Detection Settings" subtitle={`${vehicle.meta.name} - ${vehicle.meta.plateNumber}`}/>
 <Info text="PHASE 1 TEST ONLY: ESP32-CAM JPEG frames are processed in memory by the local Python service. Images are not displayed, recorded, or uploaded. SMS and emergency dispatch are suppressed."/>
 {!authorized?<><Info text={error}/><ActionButton title="Back to vehicle management" variant="secondary" onPress={onBack}/></>:<>
 {error?<Info text={`Firebase error: ${error}`}/>:null}
 <Card><Text style={{fontSize:17,fontWeight:'900',color:c.navy}}>Continuous eye-closure duration</Text>
 <Field label="Duration (seconds)" value={seconds} onChangeText={setSeconds} keyboardType="number-pad" placeholder="10"/>
 <Text style={{color:c.muted,fontSize:12}}>Default: 10 seconds. Valid range: 5-120 seconds. UNKNOWN observations break continuous timing.</Text>
 {!durationValid?<Text style={{color:c.red,fontSize:12,marginTop:8}}>Enter a whole number from 5 to 120.</Text>:null}
 <ActionButton title={saving?'Saving...':'Save duration'} disabled={saving||!durationValid||!dirty} onPress={save}/>
 </Card>
 <Card><Text style={{fontSize:17,fontWeight:'900',color:c.navy}}>Detector application status</Text>
 <Text style={{color:applied?c.green:c.yellow,fontWeight:'900',marginTop:10}}>{applied?'Current revision applied':'Waiting for detector confirmation'}</Text>
 <Text style={{color:c.muted,fontSize:12,marginTop:8}}>Firebase revision: {config?.revision??'Not configured'}</Text>
 <Text style={{color:c.muted,fontSize:12,marginTop:4}}>Applied revision: {status?.appliedRevision??'Not reported'}</Text>
 <Text style={{color:c.muted,fontSize:12,marginTop:4}}>Eye state: {status?.eyeState??'UNKNOWN'}</Text>
 <Text style={{color:c.muted,fontSize:12,marginTop:4}}>Camera: {status?.cameraConnected===true?'Connected':status?.cameraConnected===false?'Unavailable':'Not reported'}</Text>
 <Text style={{color:c.muted,fontSize:12,marginTop:4}}>Result: {status?.resultCode??'Not reported'}</Text>
 </Card>
 <Card><Text style={{fontSize:17,fontWeight:'900',color:c.navy}}>Guided open/closed-eye calibration</Text>
 <Text style={{color:c.text,marginTop:8}}>{calibrationLabel(activeCalibration)}</Text>
 <SmallLabel>Calibration state</SmallLabel><Text style={{color:c.muted}}>{activeCalibration?.state??(requestId?'Waiting for Python service':'Not started')}</Text>
 {config?.calibrated?<Text style={{color:c.muted,fontSize:12,marginTop:8}}>Saved scores - open: {config.openEyeScore.toFixed(4)}, closed: {config.closedEyeScore.toFixed(4)}</Text>:<Text style={{color:c.yellow,fontSize:12,marginTop:8}}>Detection remains UNKNOWN until guided calibration succeeds.</Text>}
 <ActionButton title={requesting?'Requesting...':'Start guided calibration'} disabled={requesting||saving} onPress={startCalibration}/>
 </Card>
 <ActionButton title="Back to vehicle management" variant="secondary" disabled={saving||requesting} onPress={onBack}/>
 </>}
 </View>;
}
