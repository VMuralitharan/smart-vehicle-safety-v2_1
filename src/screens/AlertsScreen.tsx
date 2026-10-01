import React,{useEffect,useState} from 'react';
import {Alert,Text,View} from 'react-native';
import {ActionButton,Card,Heading,Info} from '../components/UI';
import {colors as c} from '../components/theme';
import {clearResolvedIncident,reviewIncident,updateRequestStatus,watchEmergencyNumbers,watchIncidents,watchOwnerRequests,watchReviews} from '../lib/database';
import {isValidPhoneNumber,openPhoneDialer} from '../lib/phone';
import type {EmergencyNumberType,EmergencyNumbers,HelpRequest,Incident,IncidentReview,Vehicle} from '../lib/types';

const emergencyLabels:Record<EmergencyNumberType,string>={ambulance:'Ambulance',police:'Police'};
const requestLabel=(item:HelpRequest)=>item.type.replace('_',' ');
const hasValidCoordinates=(item:{latitude?:number;longitude?:number})=>typeof item.latitude==='number'&&typeof item.longitude==='number'&&Math.abs(item.latitude)<=90&&Math.abs(item.longitude)<=180&&!(item.latitude===0&&item.longitude===0);
const isDrowsinessIncident=(item:Incident)=>item.type==='drowsiness'||item.eventType==='drowsiness';

export function AlertsScreen({vehicle,onTrack,onOpenSettings,onManageVehicle}:{vehicle:Vehicle;onTrack:(event:HelpRequest|Incident)=>void;onOpenSettings:()=>void;onManageVehicle:()=>void}){
 const [incidents,setIncidents]=useState<Incident[]>([]),[requests,setRequests]=useState<HelpRequest[]>([]);
 const [reviews,setReviews]=useState<Record<string,IncidentReview>>({});
 const [emergencyNumbers,setEmergencyNumbers]=useState<EmergencyNumbers>({});
 const [busy,setBusy]=useState(''),[error,setError]=useState(''),[filter,setFilter]=useState<'all'|'open'>('all');
 useEffect(()=>{setIncidents([]);setRequests([]);setReviews({});setEmergencyNumbers({});const a=watchIncidents(vehicle.id,setIncidents,setError);
 const b=watchOwnerRequests(vehicle.id,setRequests,setError);const d=watchReviews(vehicle.id,setReviews);
 const e=watchEmergencyNumbers(vehicle.id,setEmergencyNumbers,setError);
 return()=>{a();b();d();e();};},[vehicle.id]);
 const run=async(key:string,fn:()=>Promise<unknown>)=>{setBusy(key);try{await fn();}catch(e:any){Alert.alert('Update failed',e?.message||'Try again.');}finally{setBusy('');}};
 const confirmDial=(title:string,phone:string,context:string)=>Alert.alert(`Call ${title}?`,`Event: ${context}\nPhone: ${phone}\n\nThe phone dialer will open so you can confirm the call.`,[
  {text:'Cancel',style:'cancel'},
  {text:'Open dialer',onPress:async()=>{try{await openPhoneDialer(phone);}catch(e:any){Alert.alert('Unable to open dialer',e?.message||'Phone calls are not supported on this device.');}}},
 ]);
 const callEmergency=(item:HelpRequest)=>{
  const configured=(Object.keys(emergencyLabels) as EmergencyNumberType[]).filter(type=>emergencyNumbers[type]?.phone&&emergencyNumbers[type]?.verifiedAt);
  if(!configured.length){Alert.alert('Emergency phone number not configured. Add a number in Settings.','No verified emergency number is saved for this vehicle.',[
   {text:'Cancel',style:'cancel'},{text:'Open Settings',onPress:onOpenSettings},
  ]);return;}
  if(configured.length===1){const type=configured[0];confirmDial(emergencyLabels[type],emergencyNumbers[type]!.phone,requestLabel(item));return;}
  Alert.alert('Choose emergency contact',`Request type: ${requestLabel(item)}`,[
   ...configured.map(type=>({text:emergencyLabels[type],onPress:()=>confirmDial(emergencyLabels[type],emergencyNumbers[type]!.phone,requestLabel(item))})),
   {text:'Cancel',style:'cancel' as const},
  ]);
 };
 const callDriver=(context:string)=>{
  if(!vehicle.meta.driverPhone||!isValidPhoneNumber(vehicle.meta.driverPhone)){Alert.alert('Driver phone number unavailable','Please update the vehicle details with a valid driver phone number.',[
   {text:'Cancel',style:'cancel'},{text:'Edit vehicle',onPress:onManageVehicle},
  ]);return;}
  confirmDial('Driver',vehicle.meta.driverPhone,context);
 };
 const clearAccident=(item:Incident)=>Alert.alert('Clear resolved accident?',
  'This will remove the resolved accident from the Alerts list. The original hardware incident remains preserved in Firebase.',[
   {text:'Cancel',style:'cancel'},
   {text:'Clear',style:'destructive',onPress:()=>run(`clear-${item.id}`,()=>clearResolvedIncident(vehicle.id,item.id))},
  ]);
 const renderLocationAndDriverActions=(item:HelpRequest|Incident,context:string)=><View style={{flexDirection:'row'}}>
  <View style={{flex:1,marginRight:4}}><ActionButton title="View Location" variant="secondary" onPress={()=>onTrack(item)}/></View>
  <View style={{flex:1,marginLeft:4}}><ActionButton title="Call Driver" variant="secondary" onPress={()=>callDriver(context)}/></View>
 </View>;
 const visibleIncidents=incidents.filter(item=>!reviews[item.id]?.clearedAt);
 const filteredIncidents=visibleIncidents.filter(item=>filter==='all'||(!reviews[item.id]?.acknowledgedAt&&!reviews[item.id]?.resolvedAt));
 return <View><Heading title="Incidents & requests" subtitle="Hardware alerts and mobile requests are recorded separately."/>
 {error?<Info text={error}/>:null}
 <ActionButton title={filter==='all'?'✓ All events':'Show all events'} variant={filter==='all'?'primary':'secondary'} onPress={()=>setFilter('all')}/>
 <ActionButton title={filter==='open'?'✓ Needs attention':'Needs attention only'} variant={filter==='open'?'primary':'secondary'} onPress={()=>setFilter('open')}/>
 <Text style={{color:c.navy,fontSize:18,fontWeight:'900',marginVertical:13}}>Device-generated incidents ({visibleIncidents.length})</Text>
 {!filteredIncidents.length?<Info text={visibleIncidents.length?'No incidents match the selected filter.':'No active hardware incidents. Cleared accident records remain preserved in Firebase.'}/>:filteredIncidents.map(item=><Card key={item.id}>
 {item.isTest?<View style={{alignSelf:'flex-start',backgroundColor:c.yellowPale,borderRadius:20,paddingHorizontal:12,paddingVertical:6,marginBottom:8}}><Text style={{color:c.yellow,fontWeight:'900'}}>{isDrowsinessIncident(item)?'TEST DROWSINESS':'TEST ACCIDENT'}</Text></View>:null}
 <Text style={{color:item.type==='accident'?c.red:c.yellow,fontWeight:'900',fontSize:17,textTransform:'capitalize'}}>{item.isTest?'Automatic test event':item.type}</Text>
 <Text style={{color:c.text,marginTop:7}}>{item.message||'Device event'}</Text>
 {item.type==='accident'?<Text style={{color:c.navy,marginTop:7,fontWeight:'800'}}>Acceleration: {typeof item.impactG==='number'&&Number.isFinite(item.impactG)?`${item.impactG.toFixed(2)} g`:'Unavailable'}</Text>:null}
 {isDrowsinessIncident(item)?<Text style={{color:c.navy,marginTop:7,fontWeight:'800'}}>Continuous eye closure: {typeof item.durationMs==='number'?`${(item.durationMs/1000).toFixed(1)} seconds`:'Unavailable'}</Text>:null}
 {item.smsSuppressed?<Text style={{color:c.green,fontSize:12,fontWeight:'800',marginTop:6}}>PHASE 1: SMS suppressed</Text>:null}
 <Text style={{color:c.muted,marginTop:5,fontSize:12}}>Incident: {item.createdAt?new Date(item.createdAt).toLocaleString():'Time unknown'} · Source: {item.source||'device'}</Text>
 <Text selectable style={{color:c.muted,marginTop:5,fontSize:12}}>{hasValidCoordinates(item)?`${item.type==='accident'?'Accident':'Event'} location: ${item.latitude}, ${item.longitude}`:`${item.type==='accident'?'Accident':'Event'} location not captured. View Location will use the latest vehicle location if available.`}</Text>
 <Text style={{color:c.muted,marginTop:5,fontSize:12}}>Review: {reviews[item.id]?.resolvedAt?'Resolved':reviews[item.id]?.acknowledgedAt?'Acknowledged':'Open'}</Text>
 {renderLocationAndDriverActions(item,isDrowsinessIncident(item)?(item.isTest?'TEST DROWSINESS':'Drowsiness alert'):item.isTest?'TEST ACCIDENT':'Automatic accident alert')}
 {!reviews[item.id]?.acknowledgedAt?<ActionButton title="Acknowledge" variant="secondary" disabled={busy===item.id} onPress={()=>run(item.id,()=>reviewIncident(vehicle.id,item.id,'acknowledged'))}/>:null}
 {!reviews[item.id]?.resolvedAt?<ActionButton title="Mark resolved" variant="secondary" disabled={busy===item.id} onPress={()=>run(item.id,()=>reviewIncident(vehicle.id,item.id,'resolved'))}/>:null}
 {item.type==='accident'&&reviews[item.id]?.resolvedAt?<ActionButton title="Clear resolved accident" variant="secondary" disabled={busy===`clear-${item.id}`} onPress={()=>clearAccident(item)}/>:null}
 </Card>)}
 <Text style={{color:c.navy,fontSize:18,fontWeight:'900',marginVertical:13}}>Mobile assistance requests ({requests.length})</Text>
 {!requests.length?<Info text="No in-app requests have been submitted for this bus."/>:requests.filter(x=>filter==='all'||x.status==='pending').map(item=><Card key={item.id}>
 <Text style={{fontSize:17,fontWeight:'900',color:c.red,textTransform:'capitalize'}}>{requestLabel(item)} · {item.status}</Text>
 <Text style={{color:c.muted,marginTop:5,fontSize:12}}>Submitted by {item.createdByName||'App user'} · {item.createdAt?new Date(item.createdAt).toLocaleString():'Unknown time'}</Text>
 <Text style={{color:c.text,marginTop:7}}>{item.message}</Text>
 {item.latitude!==undefined&&item.longitude!==undefined?<Text selectable style={{fontSize:12,color:c.muted,marginTop:5}}>Location when request was submitted: {item.latitude}, {item.longitude} ({item.locationUpdatedAt?new Date(item.locationUpdatedAt).toLocaleString():'Time unknown'})</Text>:<Text style={{fontSize:12,color:c.muted,marginTop:5}}>Location when request was submitted: unavailable</Text>}
 <ActionButton title="Call Emergency" variant="danger" onPress={()=>callEmergency(item)}/>
 {renderLocationAndDriverActions(item,requestLabel(item))}
 {item.status==='pending'?<ActionButton title="Acknowledge request" variant="secondary" disabled={busy===item.id} onPress={()=>run(item.id,()=>updateRequestStatus(vehicle.id,item.id,'acknowledged'))}/>:null}
 {item.status!=='resolved'?<ActionButton title="Mark resolved" variant="secondary" disabled={busy===item.id} onPress={()=>run(item.id,()=>updateRequestStatus(vehicle.id,item.id,'resolved'))}/>:null}
 </Card>)}
 <Text style={{fontSize:12,color:c.muted,marginVertical:12}}>Acknowledgement means the owner reviewed the record. It does not prove a call or SMS was delivered.</Text>
 </View>;
}
