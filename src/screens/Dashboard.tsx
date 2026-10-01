import React,{useEffect,useState} from 'react';
import {Text,View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {ActionButton,Card,Heading,Info,SmallLabel} from '../components/UI';
import {brandGradient,colors as c} from '../components/theme';
import {devicePath,watchIncidents,watchValue,watchOwnerRequests} from '../lib/database';
import type {HelpRequest,Incident,Role,Vehicle,VehicleLocation,VehicleStatus} from '../lib/types';
const date=(t?:number)=>t?new Date(t).toLocaleString():'No device update';
function Tile({label,value,danger}:{label:string;value:string;danger?:boolean}){
 return <View style={{width:'48%',borderRadius:14,padding:14,backgroundColor:danger?c.redPale:c.white,borderWidth:1,borderColor:c.border,marginBottom:10}}>
 <SmallLabel>{label}</SmallLabel><Text style={{fontSize:16,fontWeight:'900',color:danger?c.red:c.navy}}>{value}</Text></View>;
}
export function Dashboard({vehicle,role,navigate}:{vehicle:Vehicle;role:Role;navigate:(tab:string)=>void}){
 const [status,setStatus]=useState<VehicleStatus|null>(null),[location,setLocation]=useState<VehicleLocation|null>(null);
 const [incidents,setIncidents]=useState<Incident[]>([]),[requests,setRequests]=useState<HelpRequest[]>([]);
 const [clock,setClock]=useState(Date.now()),[error,setError]=useState('');
 useEffect(()=>{setStatus(null);setLocation(null);setIncidents([]);setRequests([]);
 const a=watchValue<VehicleStatus>(`${devicePath(vehicle.id)}/status`,setStatus,setError);
 const b=watchValue<VehicleLocation>(`${devicePath(vehicle.id)}/location`,setLocation,setError);
 const d=role==='owner'?watchIncidents(vehicle.id,setIncidents,setError):()=>{};
 const e=role==='owner'?watchOwnerRequests(vehicle.id,setRequests,setError):()=>{};
 const timer=setInterval(()=>setClock(Date.now()),15000);
 return()=>{a();b();d();e();clearInterval(timer);};},[vehicle.id,role]);
 const online=typeof status?.updatedAt==='number' && clock-status.updatedAt < 60000 && clock>=status.updatedAt;
 const hasLoc=typeof location?.latitude==='number' && typeof location?.longitude==='number' &&
 Math.abs(location.latitude)<=90 && Math.abs(location.longitude)<=180;
 const freshLoc=hasLoc && typeof location?.updatedAt==='number' && clock-location.updatedAt<300000;
 return <View><Heading title={role==='owner'?'Vehicle overview':'My bus'} subtitle={`${vehicle.meta.plateNumber} · ${vehicle.meta.route||'No route assigned'}`}/>
 {error?<Info text={`Database error: ${error}`}/>:null}
 <LinearGradient colors={brandGradient} start={{x:0,y:0}} end={{x:1,y:0}} style={{borderRadius:24,padding:19,marginBottom:14,shadowColor:c.plum,shadowOpacity:0.18,shadowRadius:14,shadowOffset:{width:0,height:7},elevation:4}}><Text style={{fontSize:13,color:'rgba(255,255,255,0.76)'}}>Live device connection</Text>
 <Text style={{fontSize:23,color:c.white,fontWeight:'900',marginTop:4}}>{online?'Online':status?'Offline / stale':'Awaiting hardware data'}</Text>
 <Text style={{fontSize:12,color:'rgba(255,255,255,0.76)',marginTop:8}}>Last sensor report: {date(status?.updatedAt)}</Text></LinearGradient>
 <View style={{flexDirection:'row',justifyContent:'space-between',flexWrap:'wrap'}}>
 <Tile label="Driver alertness" value={!online?'No current data':status?.driverStatus||'Unknown'} danger={online&&status?.driverStatus==='drowsy'}/>
 <Tile label="Accident status" value={!online?'No current data':status?.accidentDetected===true?'Possible accident':status?.accidentDetected===false?'Not detected':'Unknown'} danger={online&&status?.accidentDetected===true}/>
 <Tile label="GPS data" value={!hasLoc?'Unavailable':freshLoc?'Updated':'Last known only'}/>
 <Tile label="Device label" value={vehicle.meta.deviceLabel||'Not assigned'}/>
 </View>
 <Card><SmallLabel>Vehicle GPS position</SmallLabel>
 <Text style={{fontSize:17,fontWeight:'900',color:c.navy}}>{hasLoc?`${location!.latitude!.toFixed(5)}, ${location!.longitude!.toFixed(5)}`:'No coordinates received'}</Text>
 <Text style={{fontSize:12,color:c.muted,marginTop:5}}>Last location update: {date(location?.updatedAt)}</Text>
 <ActionButton variant="secondary" title="Open map" onPress={()=>navigate('map')}/></Card>
 {role==='owner'?<Card><SmallLabel>Owner incident summary</SmallLabel>
 <Text style={{fontSize:20,fontWeight:'900',color:c.navy}}>{incidents.length} device events · {requests.filter(x=>x.status==='pending').length} open requests</Text>
 <ActionButton title="View incident history" variant="secondary" onPress={()=>navigate('alerts')}/></Card>:null}
 <ActionButton variant="danger" title="Request emergency assistance" onPress={()=>navigate('help')}/>
 <Text style={{fontSize:12,textAlign:'center',color:c.muted,marginTop:7,marginBottom:16}}>In-app request requires internet. It does not itself send SMS or dispatch responders.</Text>
 </View>;
}
