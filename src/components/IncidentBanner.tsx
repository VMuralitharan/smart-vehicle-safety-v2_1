import React,{useEffect,useRef,useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {colors as c} from './theme';
import {watchIncidents,watchOwnerRequests} from '../lib/database';
export function IncidentBanner({vehicleId,openAlerts}:{vehicleId:string;openAlerts:()=>void}){
 const [text,setText]=useState('');const seen=useRef<Set<string>>(new Set());const ready=useRef({device:false,requests:false});
 useEffect(()=>{seen.current=new Set();ready.current={device:false,requests:false};setText('');
 const a=watchIncidents(vehicleId,values=>{
 if(!ready.current.device){values.forEach(x=>seen.current.add('d'+x.id));ready.current.device=true;return;}
 const fresh=values.find(x=>!seen.current.has('d'+x.id));values.forEach(x=>seen.current.add('d'+x.id));
 if(fresh)setText(`New device event: ${fresh.eventType==='drowsiness'?'drowsiness':fresh.type}`);
 });
 const b=watchOwnerRequests(vehicleId,values=>{
 if(!ready.current.requests){values.forEach(x=>seen.current.add('r'+x.id));ready.current.requests=true;return;}
 const fresh=values.find(x=>!seen.current.has('r'+x.id));values.forEach(x=>seen.current.add('r'+x.id));
 if(fresh)setText(`New assistance request: ${fresh.type.replace('_',' ')}`);
 });return()=>{a();b();};},[vehicleId]);
 if(!text)return null;
 return <Pressable onPress={()=>{setText('');openAlerts();}} style={{backgroundColor:c.redPale,borderBottomWidth:1,borderColor:'#FBBFC3',padding:12}}>
 <Text style={{fontWeight:'900',color:c.red}}>{text} · View details</Text>
 <Text style={{fontSize:12,color:c.muted,marginTop:3}}>Foreground update. Background push notifications are not configured.</Text>
 </Pressable>;
}
