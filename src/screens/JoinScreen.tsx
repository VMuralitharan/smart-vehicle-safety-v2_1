import React,{useEffect,useState} from 'react';
import {Alert,Text,View} from 'react-native';
import {ActionButton,Card,Field,Heading,Info} from '../components/UI';
import {colors as c} from '../components/theme';
import {JoinScanner} from '../components/JoinScanner';
import {cancelJoin,previewVehicle,requestJoin,watchPendingJoin,watchValue} from '../lib/database';
import type {PendingJoin,Profile,PublicVehicle} from '../lib/types';
export function JoinScreen({uid,profile}:{uid:string;profile:Profile}){
 const [id,setId]=useState('');const [code,setCode]=useState('');const [preview,setPreview]=useState<PublicVehicle|null>(null);
 const [pending,setPending]=useState<PendingJoin|null>(null);const [requestStatus,setRequestStatus]=useState('pending');const [busy,setBusy]=useState(false); const [scan,setScan]=useState(false);
 useEffect(()=>watchPendingJoin(uid,setPending),[uid]);
 useEffect(()=>{if(!pending?.vehicleId)return;return watchValue<{status:string}>(`joinRequests/${pending.vehicleId}/${uid}`,v=>setRequestStatus(v?.status||'pending'));},[uid,pending?.vehicleId]);
 const find=async()=>{setPreview(null);setBusy(true);try{const vehicle=await previewVehicle(id);if(!vehicle)Alert.alert('Not found','Check the Bus ID displayed inside your bus.');else setPreview(vehicle);}catch(e:any){Alert.alert('Lookup failed',e?.message||'Try again.');}finally{setBusy(false);}};
 const join=async()=>{if(!code.trim()){Alert.alert('Join code required');return;}setBusy(true);
 try{await requestJoin(uid,profile,id,code);setCode('');Alert.alert('Request sent','The vehicle owner must approve you before you can view vehicle data.');}
 catch(e:any){Alert.alert('Unable to join',e?.message||'Check your join code.');}finally{setBusy(false);}};
 const cancel=()=>pending&&Alert.alert('Cancel request?','You may request to join again later.',[
 {text:'Keep',style:'cancel'},{text:'Cancel request',style:'destructive',onPress:async()=>{try{await cancelJoin(uid,pending.vehicleId);}catch(e:any){Alert.alert('Error',e?.message||'Try again.');}}}]);
 return <View><Heading title="Join your bus" subtitle="Get the Bus ID and join code from the driver or vehicle owner."/>
 {pending?<Card><Text style={{fontSize:19,fontWeight:'900',color:c.navy}}>{requestStatus==='rejected'?'Request declined':'Waiting for approval'}</Text>
 <Text style={{color:c.muted,marginTop:8}}>{requestStatus==='rejected'?'The owner declined your request. Cancel it to retry with a new joining code.':`Your request to join ${pending.plateNumber} is awaiting owner approval.`}</Text>
 <ActionButton variant="secondary" title="Cancel request" onPress={cancel}/></Card>:null}
 <Card><ActionButton title={scan?'Scanning QR code…':'Scan bus QR code'} variant="secondary" onPress={()=>setScan(!scan)}/>
 {scan?<JoinScanner onClose={()=>setScan(false)} onScanned={(vid,joinCode)=>{setId(vid);setCode(joinCode);setPreview(null);setScan(false);previewVehicle(vid).then(setPreview).catch(e=>Alert.alert('Lookup failed',e?.message||'Try again.'));}}/>:null}
 <Field label="Bus ID" value={id} onChangeText={v=>{setId(v.trim());setPreview(null);}} placeholder="Paste the Bus ID" autoCapitalize="none"/>
 <ActionButton title={busy?'Checking…':'Find bus'} disabled={busy||!id.trim()} onPress={find}/>
 {preview?<View style={{marginTop:14,padding:13,backgroundColor:c.bluePale,borderRadius:12}}>
 <Text style={{fontWeight:'900',fontSize:18,color:c.navy}}>{preview.plateNumber}</Text>
 <Text style={{color:c.text,marginTop:5}}>{preview.name} • {preview.route||'Route unavailable'}</Text>
 <Text style={{color:c.muted,fontSize:12,marginVertical:8}}>Confirm this is your bus before requesting access.</Text>
 <Field label="Join code" value={code} onChangeText={setCode} placeholder="Code shown inside the bus" autoCapitalize="characters"/>
 <ActionButton title={busy?'Sending…':'Request to join this bus'} disabled={busy||!code.trim()} onPress={join}/>
 </View>:null}</Card>
 <Info text="Bus ID and join code are separate from the hardware device ID. Joining requires owner approval. A passenger cannot edit vehicle data or emergency contacts."/>
 </View>;
}
