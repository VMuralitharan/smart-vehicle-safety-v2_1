import React,{useEffect,useState} from 'react';
import {Alert,Text,View} from 'react-native';
import {ActionButton,Card,Field,Heading,Info} from '../components/UI';
import {colors as c} from '../components/theme';
import {createHelpRequest,watchMyRequests,watchOwnerRequests} from '../lib/database';
import type {HelpRequest,Profile,RequestType,Role,Vehicle} from '../lib/types';
import {AccidentDetectionSettings} from './AccidentDetectionSettings';
const TYPES:{id:RequestType;label:string;icon:string}[]=[
 {id:'medical',label:'Medical emergency',icon:'✚'},
 {id:'security',label:'Security threat',icon:'!'},
 {id:'vehicle_issue',label:'Vehicle safety issue',icon:'▣'},
 {id:'other',label:'Other emergency',icon:'…'},
];
export function HelpScreen({uid,profile,vehicle,role}:{uid:string;profile:Profile;vehicle:Vehicle;role:Role}){
 const [type,setType]=useState<RequestType|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [history,setHistory]=useState<HelpRequest[]>([]),[failure,setFailure]=useState('');
 useEffect(()=>role==='owner'?watchOwnerRequests(vehicle.id,setHistory,setFailure):watchMyRequests(uid,x=>setHistory(x.filter(y=>y.vehicleId===vehicle.id)),setFailure),[role,uid,vehicle.id]);
 const submit=()=>{
  if(!type)return;
  Alert.alert('Submit assistance request?',
  `Bus: ${vehicle.meta.plateNumber}\nType: ${TYPES.find(x=>x.id===type)?.label}\n\nThis will create a Firebase incident visible to the vehicle owner while their app is online. It does not send SMS or call emergency services.`,[
   {text:'Cancel',style:'cancel'}, {text:'Submit request',onPress:async()=>{
    setBusy(true);try{const result=await createHelpRequest(uid,profile,vehicle.id,type,message);
     setType(null);setMessage('');Alert.alert('Request recorded',result.indexed?'Your request is stored in Firebase. This does not confirm someone has seen it.':'The request is saved for the owner, but your personal history index could not be updated. Check your connection.');
    }catch(e:any){Alert.alert('Unable to send',e?.message||'Check internet and membership.');}finally{setBusy(false);}
   }}]);
 };
 return <View><Heading title="Request assistance" subtitle={`For ${vehicle.meta.plateNumber} · ${role==='passenger'?'Passenger':'Vehicle owner'}`}/>
 <Card><Text style={{fontSize:17,fontWeight:'900',color:c.navy,marginBottom:10}}>What do you need help with?</Text>
 {TYPES.map(item=><ActionButton key={item.id} title={`${item.icon}  ${item.label}${type===item.id?'  ✓':''}`} variant={type===item.id?'danger':'secondary'} onPress={()=>setType(item.id)}/>)}
 <View style={{height:13}}/><Field label="Details (optional)" value={message} onChangeText={setMessage} multiline placeholder="Briefly describe the situation"/>
 <ActionButton title={busy?'Sending…':'Submit assistance request'} variant="danger" disabled={busy||!type} onPress={submit}/>
 <Text style={{fontSize:12,color:c.muted,marginTop:10}}>In-app reports require internet. A report is not the same as an emergency services dispatch.</Text></Card>
 {role==='owner'?<AccidentDetectionSettings uid={uid} vehicle={vehicle} embedded/>:null}
 <Heading title={role==='passenger'?'My request history':'Vehicle assistance requests'} subtitle="Stored in Firebase"/>
 {failure?<Info text={failure}/>:null}
 {!history.length?<Info text="No requests recorded yet."/>:history.map(item=><Card key={item.id}>
 <Text style={{color:c.navy,fontWeight:'900',textTransform:'capitalize'}}>{item.type.replace('_',' ')}</Text>
 <Text style={{color:c.muted,marginTop:5}}>Status: {item.status||'pending'} · {item.createdAt?new Date(item.createdAt).toLocaleString():'Time pending'}</Text>
 <Text style={{color:c.text,marginTop:6}}>{item.message}</Text></Card>)}
 </View>;
}
