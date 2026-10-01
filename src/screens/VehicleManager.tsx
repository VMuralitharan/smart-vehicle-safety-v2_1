import React,{useEffect,useRef,useState} from 'react';
import {Alert,Pressable,Share,Text,View} from 'react-native';
import {ActionButton,Card,Field,Heading,Info} from '../components/UI';
import {colors as c} from '../components/theme';
import {JoinQR} from '../components/JoinQR';
import {approveJoin,editVehicle,importLegacyVehicles,rejectJoin,rotateInvite,watchInvite,watchJoinRequests,watchMembers,removeMember,countLegacyVehicles} from '../lib/database';
import type {JoinRequest,Vehicle} from '../lib/types';
import {isValidPhoneNumber} from '../lib/phone';
export function VehicleManager({uid,vehicle,onAddVehicle}:{uid:string;vehicle:Vehicle;onAddVehicle:()=>void}){
 const [name,setName]=useState(vehicle.meta.name),[plate,setPlate]=useState(vehicle.meta.plateNumber),
 [route,setRoute]=useState(vehicle.meta.route||''),[label,setLabel]=useState(vehicle.meta.deviceLabel||''),[driverPhone,setDriverPhone]=useState(vehicle.meta.driverPhone||'');
 const [code,setCode]=useState<string|null>(null),[requests,setRequests]=useState<JoinRequest[]>([]);
 const [members,setMembers]=useState<{uid:string;role:string}[]>([]),[busy,setBusy]=useState(false),[legacy,setLegacy]=useState(0),[editing,setEditing]=useState(false),[detailsOpen,setDetailsOpen]=useState(false);
 const mountedRef=useRef(true),savingRef=useRef(false),activeVehicleIdRef=useRef(vehicle.id);
 const loadSavedDetails=()=>{setName(vehicle.meta.name);setPlate(vehicle.meta.plateNumber);setRoute(vehicle.meta.route||'');setLabel(vehicle.meta.deviceLabel||'');setDriverPhone(vehicle.meta.driverPhone||'');};
 useEffect(()=>{mountedRef.current=true;return()=>{mountedRef.current=false;};},[]);
 useEffect(()=>{activeVehicleIdRef.current=vehicle.id;setEditing(false);setDetailsOpen(false);loadSavedDetails();},[vehicle.id]);
 useEffect(()=>{if(!editing)loadSavedDetails();},[vehicle.meta.name,vehicle.meta.plateNumber,vehicle.meta.route,vehicle.meta.deviceLabel,vehicle.meta.driverPhone]);
 useEffect(()=>{const a=watchInvite(vehicle.id,setCode);const b=watchJoinRequests(vehicle.id,setRequests);const d=watchMembers(vehicle.id,setMembers);return()=>{a();b();d();};},[vehicle.id]);
 useEffect(()=>{countLegacyVehicles(uid).then(setLegacy).catch(()=>{});},[uid]);
 const run=async(fn:()=>Promise<unknown>,success:string)=>{setBusy(true);try{await fn();Alert.alert('Saved',success);}catch(e:any){Alert.alert('Failed',e?.message||'Try again.');}finally{setBusy(false);}};
 const cancelEdit=()=>{if(busy)return;loadSavedDetails();setEditing(false);};
 const toggleDetails=()=>{if(busy)return;if(detailsOpen&&editing){loadSavedDetails();setEditing(false);}setDetailsOpen(value=>!value);};
 const saveDetails=async()=>{
  if(savingRef.current)return;
  if(!name.trim()||!plate.trim()){Alert.alert('Missing details','Enter the bus name and registration number.');return;}
  if(driverPhone.trim()&&!isValidPhoneNumber(driverPhone)){Alert.alert('Check driver phone','Enter a valid phone number, such as 0771234567 or +94771234567.');return;}
  const targetVehicleId=vehicle.id;
  const changes={name:name.trim(),plateNumber:plate.trim(),route:route.trim(),deviceLabel:label.trim(),driverPhone:driverPhone.trim()};
  savingRef.current=true;setBusy(true);
  try{
   await editVehicle(uid,targetVehicleId,changes);
   if(!mountedRef.current||activeVehicleIdRef.current!==targetVehicleId)return;
   setName(changes.name);setPlate(changes.plateNumber);setRoute(changes.route);setLabel(changes.deviceLabel);setDriverPhone(changes.driverPhone);
   setEditing(false);Alert.alert('Saved','Vehicle details updated.');
  }catch(e:any){
   if(mountedRef.current&&activeVehicleIdRef.current===targetVehicleId)Alert.alert('Unable to save vehicle details',e?.message||'Check your connection and try again.');
  }finally{
   savingRef.current=false;
   if(mountedRef.current&&activeVehicleIdRef.current===targetVehicleId)setBusy(false);
  }
 };
 return <View><Heading title="Manage vehicle" subtitle="Edit details, invite passengers and approve access."/>
 <ActionButton title="+ Add another vehicle" variant="secondary" disabled={busy} onPress={onAddVehicle}/>
 <Card><Pressable testID="toggle-vehicle-details" accessibilityRole="button" accessibilityState={{expanded:detailsOpen,disabled:busy}} disabled={busy} onPress={toggleDetails} style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:3}}>
 <View style={{flex:1,paddingRight:12}}><Text style={{color:c.navy,fontSize:17,fontWeight:'900'}}>Vehicle details</Text>
 <Text style={{color:c.muted,fontSize:12,marginTop:3}}>{vehicle.meta.name} · {vehicle.meta.plateNumber} · {detailsOpen?'Tap to shrink':'Tap to expand'}</Text></View>
 <Text style={{color:c.blue,fontWeight:'900',fontSize:25}}>{detailsOpen?'−':'+'}</Text>
 </Pressable>
 {detailsOpen?<View style={{marginTop:14}}>
 {editing?<><Field label="Bus name" value={name} onChangeText={setName}/><Field label="Registration number" value={plate} onChangeText={setPlate}/>
 <Field label="Route" value={route} onChangeText={setRoute}/><Field label="Device label (not paired)" value={label} onChangeText={setLabel}/>
 <Field label="Driver phone number" value={driverPhone} onChangeText={setDriverPhone} keyboardType="phone-pad" placeholder="0771234567 or +94771234567"/>
 {!driverPhone.trim()?<Text style={{color:c.red,fontSize:12,marginBottom:7}}>Driver phone number is not available. Please update the vehicle details.</Text>:null}
 <ActionButton title={busy?'Saving…':'Save changes'} disabled={busy||!name.trim()||!plate.trim()} onPress={saveDetails}/>
 <ActionButton title="Cancel" variant="secondary" disabled={busy} onPress={cancelEdit}/></>:<>
 <Text style={{color:c.blue,fontSize:12,fontWeight:'800'}}>BUS NAME</Text><Text style={{color:c.text,fontWeight:'800',marginTop:3}}>{name}</Text>
 <Text style={{color:c.blue,fontSize:12,fontWeight:'800',marginTop:12}}>REGISTRATION NUMBER</Text><Text style={{color:c.text,fontWeight:'800',marginTop:3}}>{plate}</Text>
 <Text style={{color:c.blue,fontSize:12,fontWeight:'800',marginTop:12}}>ROUTE</Text><Text style={{color:c.text,marginTop:3}}>{route||'Not set'}</Text>
 {label?<><Text style={{color:c.blue,fontSize:12,fontWeight:'800',marginTop:12}}>DEVICE LABEL</Text><Text style={{color:c.text,marginTop:3}}>{label}</Text></>:null}
 {driverPhone?<><Text style={{color:c.blue,fontSize:12,fontWeight:'800',marginTop:12}}>DRIVER PHONE NUMBER</Text><Text selectable style={{color:c.text,marginTop:3}}>{driverPhone}</Text></>:<Text style={{color:c.red,fontSize:12,marginTop:12}}>Driver phone number is not available. Please update the vehicle details.</Text>}
 <ActionButton title="Edit vehicle details" disabled={busy} onPress={()=>{loadSavedDetails();setEditing(true);setDetailsOpen(true);}}/>
 <ActionButton title="Collapse vehicle details" variant="secondary" disabled={busy} onPress={()=>setDetailsOpen(false)}/></>}
 </View>:null}</Card>
 <Card><Text style={{color:c.navy,fontSize:17,fontWeight:'900'}}>Passenger joining details</Text>
 <Text selectable style={{color:c.muted,marginTop:12}}>Bus ID:</Text><Text selectable style={{fontWeight:'900',color:c.text}}>{vehicle.id}</Text>
 <Text style={{color:c.muted,marginTop:12}}>Join code:</Text><Text selectable style={{fontWeight:'900',fontSize:24,letterSpacing:2,color:c.blue}}>{code||'Loading…'}</Text>
 {code?<JoinQR vehicleId={vehicle.id} code={code}/>:null}
 <Text style={{fontSize:12,color:c.muted,marginTop:7}}>Share these two values with passengers inside the bus. Each passenger must be approved before getting access.</Text>
 <ActionButton title="Share bus joining details" onPress={()=>Share.share({message:`Smart Vehicle Safety\nBus: ${vehicle.meta.plateNumber}\nRoute: ${vehicle.meta.route}\nBus ID: ${vehicle.id}\nJoin code: ${code||'Not available'}`})} disabled={!code}/>
 <ActionButton title="Rotate join code" variant="secondary" disabled={busy} onPress={()=>Alert.alert('Rotate join code?','The previous code will no longer work for new join requests.',[
 {text:'Cancel',style:'cancel'},{text:'Rotate',onPress:()=>run(()=>rotateInvite(vehicle.id),'A new joining code is active.')}])}/></Card>
 <Card><Text style={{color:c.navy,fontSize:17,fontWeight:'900',marginBottom:6}}>Join requests ({requests.length})</Text>
 {!requests.length?<Text style={{color:c.muted}}>No pending requests.</Text>:requests.map(item=><View key={item.id} style={{paddingVertical:10,borderBottomWidth:1,borderColor:c.border}}>
 <Text style={{color:c.text,fontWeight:'800'}}>{item.displayName||'Passenger'}</Text>
 <Text style={{color:c.muted,fontSize:12}}>UID: {item.id}</Text>
 <ActionButton title="Approve passenger" disabled={busy} onPress={()=>run(()=>approveJoin(vehicle.id,item.id),'Passenger may now see this bus.')}/>
 <ActionButton title="Reject" disabled={busy} variant="secondary" onPress={()=>run(()=>rejectJoin(vehicle.id,item.id),'Request rejected.')}/></View>)}</Card>
 <Card><Text style={{color:c.navy,fontSize:17,fontWeight:'900',marginBottom:6}}>Approved passengers ({members.length})</Text>
 {!members.length?<Text style={{color:c.muted}}>No passengers joined.</Text>:members.map(x=><View key={x.uid} style={{borderTopColor:c.border,borderTopWidth:1,paddingVertical:9}}>
 <Text selectable style={{fontSize:12,color:c.text}}>{x.uid}</Text>
 <ActionButton title="Remove access" variant="secondary" disabled={busy} onPress={()=>Alert.alert('Remove passenger access?','This user will no longer be able to access this bus.',[
 {text:'Cancel',style:'cancel'},{text:'Remove',onPress:()=>run(()=>removeMember(vehicle.id,x.uid),'Passenger access removed.')}])}/></View>)}</Card>
 {legacy>0?<Card><Text style={{fontWeight:'800',color:c.navy}}>Previous app data found</Text>
 <Text style={{color:c.muted,marginVertical:8}}>There are {legacy} vehicles in your old private app data. Import them once if they are missing above. Old records are preserved.</Text>
 <ActionButton title="Import old vehicles and contacts" disabled={busy} onPress={()=>Alert.alert('Import old records?','Run this only once. Repeating it creates duplicate bus records.',[
 {text:'Cancel',style:'cancel'},{text:'Import',onPress:()=>run(async()=>{const n=await importLegacyVehicles(uid);setLegacy(0);Alert.alert('Import complete',`${n} vehicles copied.`);},'Migration completed.')}])}/></Card>:null}
 <Info text="A device label is not secure pairing. Live GPS and sensor data require a separate authenticated hardware upload service; the app does not invent device readings."/>
 </View>;
}
